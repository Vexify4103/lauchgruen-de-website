import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { allowedChampionsForTurn, disallowedChampionMessage, resolveDraftChampionRules } from "@/lib/draft-champions";
import { getMatchControlContext } from "@/lib/match-control";
import { writeAuditLog } from "@/lib/tournament-audit";
import { writeTournamentEvent } from "@/lib/tournament-events";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import {
	answerDraftSwap,
	cancelDraftSwap,
	confirmDraftRoles,
	createDraftSequence,
	draftComplete,
	draftReady,
	draftRoleOrder,
	forceDraftReady,
	getDraftState,
	handleDraftTimeout,
	lockDraftAction,
	markDraftReady,
	nextDraftTurn,
	requestDraftSwap,
	resetDraftState,
	setDraftPendingSelection,
	setDraftRoleOrder,
	undoLastDraftAction,
	type DraftSide,
} from "@/lib/tournament-draft";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { upsertMatch } from "@/lib/tournament-storage";
import { draftForViewer, draftPicks, type TournamentDraftState } from "@/lib/tournament-draft-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `skip` locks "kein Ban" for the current ban turn.
const patchSchema = z.union([
	z.object({ matchId: z.string().trim().min(1), champion: z.string().trim().min(1) }),
	z.object({ matchId: z.string().trim().min(1), skip: z.literal(true) }),
]);

const postSchema = z.object({
	matchId: z.string().trim().min(1),
	action: z.enum(["ready", "timeout", "forceReady", "reset", "undo", "select", "roles", "confirmRoles", "requestSwap", "cancelSwap", "answerSwap"]),
	champion: z.string().trim().min(1).optional(),
	/** Role actions: the side's picks ordered Top, Jungle, Mid, Bot, Support. */
	order: z.array(z.string().trim().min(1)).length(5).optional(),
	/** Admins may arrange roles for either side; swap actions name the requesting side. */
	side: z.enum(["teamA", "teamB"]).optional(),
	/** requestSwap: index of the random pick in the draft actions. */
	actionIndex: z.number().int().min(0).max(40).optional(),
	/** answerSwap: accept or decline the open request. */
	accept: z.boolean().optional(),
});

export async function GET(request: Request) {
	const matchId = new URL(request.url).searchParams.get("matchId")?.trim();
	if (!matchId) {
		return NextResponse.json({ message: "matchId fehlt." }, { status: 400 });
	}
	const session = await auth();
	const discordId = session?.user?.discordId;
	const draft = await shownDraft(await getDraftState(matchId), discordId ?? null, Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)));
	// serverNow lets each browser correct its own clock, so all timers count down together.
	return NextResponse.json({ draft, serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}

/** Hides role orders the viewer may not see yet: own side for captains, everything for admins, nothing for others. */
async function shownDraft(draft: TournamentDraftState, discordId: string | null, isOwner: boolean): Promise<TournamentDraftState> {
	if (isOwner || !draft.roles || draft.rolesFinalizedAt) return draft;
	let side: DraftSide | null = null;
	if (discordId) {
		const ctx = await getMatchControlContext();
		const match = ctx.matches.find((entry) => entry.id === draft.matchId);
		if (match) side = captainDraftSideForUser(ctx.teams, match, discordId);
	}
	return draftForViewer(draft, side);
}

export async function POST(request: Request) {
	const settings = await getTournamentSettings();
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}
	const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);
	if (!settings.draftEnabled && !isOwner) {
		return NextResponse.json({ message: "Champ Select ist aktuell pausiert." }, { status: 423 });
	}

	const body = await request.json().catch(() => null);
	const parsed = postSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Draft-Aktion." }, { status: 400 });
	}

	if (parsed.data.action === "reset" || parsed.data.action === "undo" || parsed.data.action === "forceReady") {
		if (!isOwner) {
			return NextResponse.json({ message: "Nur Admins dürfen Draft Overrides nutzen." }, { status: 403 });
		}
		try {
			const updatedBy = session.user.discordHandle ?? discordId;
			const draft =
				parsed.data.action === "reset"
					? await resetDraftState({
							matchId: parsed.data.matchId,
							resetBy: updatedBy,
							reason: "Draft wurde von einem Admin zurückgesetzt.",
						})
					: parsed.data.action === "undo"
						? await undoLastDraftAction({ matchId: parsed.data.matchId, updatedBy })
						: await forceDraftReady({ matchId: parsed.data.matchId, readyBy: updatedBy });
			await writeAuditLog({
				action: `draft.${parsed.data.action}`,
				targetType: "draft",
				targetId: parsed.data.matchId,
				summary: `Draft ${parsed.data.action} by admin.`,
				actorDiscordId: discordId,
				actorLabel: updatedBy,
			});
			await writeTournamentEvent({
				type: `draft.${parsed.data.action}`,
				targetType: "draft",
				targetId: parsed.data.matchId,
				createdBy: updatedBy,
			});
			if (parsed.data.action === "reset") {
				await upsertMatch(parsed.data.matchId, {
					id: parsed.data.matchId,
					status: "Scheduled",
					teamAChampions: undefined,
					teamBChampions: undefined,
					updatedAt: new Date().toISOString(),
				});
			} else {
				await syncMatchStatusFromDraft({
					matchId: parsed.data.matchId,
					draft,
					actor: updatedBy,
				});
			}
			return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Draft Override fehlgeschlagen." }, { status: 400 });
		}
	}

	if (parsed.data.action === "timeout") {
		const ctx = await getMatchControlContext();
		const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
		try {
			const extraBanSide = match ? bonusBanSideForMatch(match, settings.activeTournament) : null;
			const turn = nextDraftTurn(await getDraftState(parsed.data.matchId), createDraftSequence(extraBanSide));
			const rules = match && turn?.kind === "pick" ? await resolveDraftChampionRules(settings, ctx.matches, match) : null;
			const draft = await handleDraftTimeout({
				matchId: parsed.data.matchId,
				triggeredBy: session.user.discordHandle ?? discordId,
				extraBanSide,
				allowedPicks: rules?.open && turn ? allowedChampionsForTurn(rules, turn) : [],
			});
			await writeTournamentEvent({
				type: "draft.timeout",
				targetType: "draft",
				targetId: parsed.data.matchId,
				createdBy: session.user.discordHandle ?? discordId,
			});
			await syncMatchStatusFromDraft({
				matchId: parsed.data.matchId,
				draft,
				extraBanSide: match ? bonusBanSideForMatch(match, settings.activeTournament) : null,
				actor: session.user.discordHandle ?? discordId,
			});
			return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Timeout konnte nicht verarbeitet werden." }, { status: 400 });
		}
	}

	const ctx = await getMatchControlContext();
	const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
	if (!match) {
		return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	}

	if (parsed.data.action === "roles" || parsed.data.action === "confirmRoles") {
		const side = isOwner && parsed.data.side ? parsed.data.side : captainDraftSideForUser(ctx.teams, match, discordId);
		if (!side) {
			return NextResponse.json({ message: "Nur Captains dieses Matches können Rollen festlegen." }, { status: 403 });
		}
		if (parsed.data.action === "roles" && !parsed.data.order) {
			return NextResponse.json({ message: "Rollenreihenfolge fehlt." }, { status: 400 });
		}
		const actor = session.user.discordHandle ?? discordId;
		const extraBanSide = bonusBanSideForMatch(match, settings.activeTournament);
		try {
			const draft =
				parsed.data.action === "roles"
					? await setDraftRoleOrder({ matchId: match.id, side, order: parsed.data.order ?? [], updatedBy: actor, extraBanSide })
					: await confirmDraftRoles({ matchId: match.id, side, order: parsed.data.order, confirmedBy: actor, extraBanSide });
			if (parsed.data.action === "confirmRoles") {
				await writeTournamentEvent({ type: "draft.roles_confirmed", targetType: "draft", targetId: match.id, createdBy: actor, payload: { side } });
				await syncMatchStatusFromDraft({ matchId: match.id, draft, extraBanSide, actor });
			}
			return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Rollen konnten nicht gespeichert werden." }, { status: 400 });
		}
	}

	if (parsed.data.action === "requestSwap" || parsed.data.action === "cancelSwap" || parsed.data.action === "answerSwap") {
		const captainSide = captainDraftSideForUser(ctx.teams, match, discordId);
		const ownSide = isOwner && parsed.data.side ? parsed.data.side : captainSide;
		// Answers come from the other captain, so the requesting side is the opponent of the answering captain.
		const requestSide =
			parsed.data.action === "answerSwap" ? (isOwner && parsed.data.side ? parsed.data.side : captainSide && (captainSide === "teamA" ? "teamB" : "teamA")) : ownSide;
		if (!requestSide) {
			return NextResponse.json({ message: "Nur Captains dieses Matches können Tausch-Anfragen nutzen." }, { status: 403 });
		}
		const actor = session.user.discordHandle ?? discordId;
		const extraBanSide = bonusBanSideForMatch(match, settings.activeTournament);
		try {
			if (parsed.data.action === "requestSwap") {
				if (parsed.data.actionIndex === undefined || !parsed.data.champion) {
					return NextResponse.json({ message: "Pick oder Champion fehlt." }, { status: 400 });
				}
				const rules = await resolveDraftChampionRules(settings, ctx.matches, match);
				if (!rules.open) return NextResponse.json({ message: rules.closedReason }, { status: 400 });
				const draft = await requestDraftSwap({
					matchId: match.id,
					side: requestSide,
					actionIndex: parsed.data.actionIndex,
					champion: parsed.data.champion,
					allowedPicks: allowedChampionsForTurn(rules, { side: requestSide, kind: "pick" }),
					requestedBy: actor,
					extraBanSide,
				});
				const request = draft.swapRequests?.[requestSide];
				await writeTournamentEvent({
					type: "draft.swap_requested",
					targetType: "draft",
					targetId: match.id,
					createdBy: actor,
					payload: { side: requestSide, from: request?.from, champion: request?.champion },
				});
				return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
			}
			if (parsed.data.action === "cancelSwap") {
				const draft = await cancelDraftSwap({ matchId: match.id, side: requestSide, cancelledBy: actor, extraBanSide });
				await writeTournamentEvent({ type: "draft.swap_cancelled", targetType: "draft", targetId: match.id, createdBy: actor, payload: { side: requestSide } });
				return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
			}
			if (parsed.data.accept === undefined) {
				return NextResponse.json({ message: "Antwort fehlt." }, { status: 400 });
			}
			const { draft, outcome, request } = await answerDraftSwap({ matchId: match.id, side: requestSide, accept: parsed.data.accept, decidedBy: actor, extraBanSide });
			await writeAuditLog({
				action: `draft.swap_${outcome}`,
				targetType: "draft",
				targetId: match.id,
				summary: `Swap ${request.from} -> ${request.champion}: ${outcome}.`,
				actorDiscordId: discordId,
				actorLabel: actor,
				metadata: { side: requestSide, from: request.from, champion: request.champion, outcome },
			});
			await writeTournamentEvent({
				type: `draft.swap_${outcome}`,
				targetType: "draft",
				targetId: match.id,
				createdBy: actor,
				payload: { side: requestSide, from: request.from, champion: request.champion },
			});
			if (outcome === "accepted") await syncMatchStatusFromDraft({ matchId: match.id, draft, extraBanSide, actor });
			if (outcome === "stale") {
				return NextResponse.json({
					draft: await shownDraft(draft, discordId, isOwner),
					message: `${request.champion} wurde inzwischen gepickt oder gebannt. Die Anfrage ist verfallen.`,
				});
			}
			return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Tausch konnte nicht verarbeitet werden." }, { status: 400 });
		}
	}

	if (parsed.data.action === "select") {
		if (!parsed.data.champion) {
			return NextResponse.json({ message: "Champion fehlt." }, { status: 400 });
		}
		const [rules, currentDraft] = await Promise.all([resolveDraftChampionRules(settings, ctx.matches, match), getDraftState(parsed.data.matchId)]);
		if (!rules.open) {
			return NextResponse.json({ message: rules.closedReason }, { status: 400 });
		}
		const extraBanSide = bonusBanSideForMatch(match, settings.activeTournament);
		const sequence = createDraftSequence(extraBanSide);
		const turn = nextDraftTurn(currentDraft, sequence);
		if (!turn) {
			return NextResponse.json({ message: "Draft ist bereits abgeschlossen." }, { status: 400 });
		}

		const teamName = teamNameForDraftSide(match, turn.side);
		const team = ctx.teams.find((entry) => entry.name === teamName);
		if (!isOwner && (!team || team.captainRef?.discordId !== discordId)) {
			return NextResponse.json({ message: "Nur der Captain des aktuellen Teams darf Champion-Hover senden." }, { status: 403 });
		}

		if (!allowedChampionsForTurn(rules, turn).has(parsed.data.champion)) {
			return NextResponse.json({ message: disallowedChampionMessage(rules, turn, parsed.data.champion) }, { status: 400 });
		}

		try {
			const draft = await setDraftPendingSelection({
				matchId: parsed.data.matchId,
				side: turn.side,
				kind: turn.kind,
				champion: parsed.data.champion,
				selectedBy: session.user.discordHandle ?? discordId,
				extraBanSide,
			});
			await writeTournamentEvent({
				type: "draft.selection_pending",
				targetType: "draft",
				targetId: parsed.data.matchId,
				createdBy: session.user.discordHandle ?? discordId,
				payload: {
					side: turn.side,
					kind: turn.kind,
					champion: parsed.data.champion,
				},
			});
			return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
		} catch (error) {
			return NextResponse.json({ message: error instanceof Error ? error.message : "Champion-Hover konnte nicht gespeichert werden." }, { status: 400 });
		}
	}

	const side = captainDraftSideForUser(ctx.teams, match, discordId);
	if (!side) {
		return NextResponse.json({ message: "Nur Captains dieses Matches können ready klicken." }, { status: 403 });
	}
	const readyRules = await resolveDraftChampionRules(settings, ctx.matches, match);
	if (!readyRules.open) {
		return NextResponse.json({ message: readyRules.closedReason }, { status: 409 });
	}

	try {
		const draft = await markDraftReady({
			matchId: parsed.data.matchId,
			side,
			readyBy: session.user.discordHandle ?? discordId,
		});
		await writeTournamentEvent({
			type: "draft.ready",
			targetType: "draft",
			targetId: parsed.data.matchId,
			createdBy: session.user.discordHandle ?? discordId,
			payload: { side },
		});
		await syncMatchStatusFromDraft({
			matchId: parsed.data.matchId,
			draft,
			extraBanSide: bonusBanSideForMatch(match, settings.activeTournament),
			actor: session.user.discordHandle ?? discordId,
		});
		return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Ready konnte nicht gespeichert werden." }, { status: 400 });
	}
}

export async function PATCH(request: Request) {
	const settings = await getTournamentSettings();
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	}
	const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);
	if (!settings.draftEnabled && !isOwner) {
		return NextResponse.json({ message: "Champ Select ist aktuell pausiert." }, { status: 423 });
	}

	const body = await request.json().catch(() => null);
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Draft-Daten." }, { status: 400 });
	}

	const [ctx, currentDraft] = await Promise.all([getMatchControlContext(), getDraftState(parsed.data.matchId)]);
	const match = ctx.matches.find((entry) => entry.id === parsed.data.matchId);
	if (!match) {
		return NextResponse.json({ message: "Match nicht gefunden." }, { status: 404 });
	}
	const rules = await resolveDraftChampionRules(settings, ctx.matches, match);
	if (!rules.open) {
		return NextResponse.json({ message: rules.closedReason }, { status: 400 });
	}

	const extraBanSide = bonusBanSideForMatch(match, settings.activeTournament);
	const sequence = createDraftSequence(extraBanSide);
	const turn = nextDraftTurn(currentDraft, sequence);
	if (!turn) {
		return NextResponse.json({ message: "Draft ist bereits abgeschlossen." }, { status: 400 });
	}

	const teamName = teamNameForDraftSide(match, turn.side);
	const team = ctx.teams.find((entry) => entry.name === teamName);
	if (!isOwner && (!team || team.captainRef?.discordId !== discordId)) {
		return NextResponse.json({ message: "Nur der Captain des aktuellen Teams darf diesen Turn locken." }, { status: 403 });
	}

	const champion = "champion" in parsed.data ? parsed.data.champion : null;
	if (champion === null && turn.kind !== "ban") {
		return NextResponse.json({ message: "Nur Bans können ausgelassen werden." }, { status: 400 });
	}
	if (champion !== null && !allowedChampionsForTurn(rules, turn).has(champion)) {
		return NextResponse.json({ message: disallowedChampionMessage(rules, turn, champion) }, { status: 400 });
	}

	try {
		const draft = await lockDraftAction({
			matchId: parsed.data.matchId,
			side: turn.side,
			kind: turn.kind,
			champion,
			lockedBy: session.user.discordHandle ?? discordId,
			extraBanSide,
		});
		await writeAuditLog({
			action: isOwner ? "draft.admin_lock" : "draft.lock",
			targetType: "draft",
			targetId: parsed.data.matchId,
			summary: champion === null ? "ban skipped." : `${turn.kind} locked: ${champion}.`,
			actorDiscordId: discordId,
			actorLabel: session.user.discordHandle ?? discordId,
			metadata: { side: turn.side, kind: turn.kind, champion, skipped: champion === null },
		});
		await writeTournamentEvent({
			type: turn.kind === "ban" ? "draft.ban_locked" : "draft.pick_locked",
			targetType: "draft",
			targetId: parsed.data.matchId,
			createdBy: session.user.discordHandle ?? discordId,
			payload: { side: turn.side, kind: turn.kind, champion, skipped: champion === null },
		});
		await syncMatchStatusFromDraft({
			matchId: parsed.data.matchId,
			draft,
			extraBanSide,
			actor: session.user.discordHandle ?? discordId,
		});
		return NextResponse.json({ draft: await shownDraft(draft, discordId, isOwner) });
	} catch (error) {
		return NextResponse.json({ message: error instanceof Error ? error.message : "Draft konnte nicht gespeichert werden." }, { status: 400 });
	}
}

async function syncMatchStatusFromDraft({
	matchId,
	draft,
	extraBanSide,
	actor,
}: {
	matchId: string;
	draft: Awaited<ReturnType<typeof getDraftState>>;
	extraBanSide?: DraftSide | null;
	actor?: string;
}) {
	const ctx = await getMatchControlContext();
	const match = ctx.matches.find((entry) => entry.id === matchId);
	if (!match || match.status === "Finished") return;

	const sequence = createDraftSequence(extraBanSide ?? bonusBanSideForMatch(match, (await getTournamentSettings()).activeTournament));
	const complete = draftComplete(draft, sequence);
	const nextStatus = complete ? "Live" : draftReady(draft) || draft.actions.length > 0 || draft.pendingSelection ? "Pending" : null;

	// Stored Top → Support once roles are arranged, so match pages and overlays show the lanes.
	// Role orders stay secret until both teams confirmed; before that the public match shows the pick order.
	const bluePicks = draft.rolesFinalizedAt ? draftRoleOrder(draft, "teamA") : draftPicks(draft, "teamA");
	const redPicks = draft.rolesFinalizedAt ? draftRoleOrder(draft, "teamB") : draftPicks(draft, "teamB");
	const championPatch = complete
		? match.blueSide === "teamA"
			? { teamAChampions: bluePicks, teamBChampions: redPicks }
			: { teamAChampions: redPicks, teamBChampions: bluePicks }
		: { teamAChampions: undefined, teamBChampions: undefined };

	if (!nextStatus) {
		await upsertMatch(matchId, {
			id: matchId,
			teamAName: match.teamAName ?? undefined,
			teamBName: match.teamBName ?? undefined,
			...championPatch,
			updatedAt: new Date().toISOString(),
		});
		return;
	}

	await upsertMatch(matchId, {
		id: matchId,
		teamAName: match.teamAName ?? undefined,
		teamBName: match.teamBName ?? undefined,
		status: nextStatus,
		...championPatch,
		updatedAt: new Date().toISOString(),
	});
	if (match.status === nextStatus) return;

	await writeTournamentEvent({
		type: "match.status_auto",
		targetType: "match",
		targetId: matchId,
		createdBy: actor,
		payload: {
			status: nextStatus,
			reason: nextStatus === "Live" ? "draft_completed" : "draft_in_progress",
		},
	});
}

function captainDraftSideForUser(
	teams: Awaited<ReturnType<typeof getMatchControlContext>>["teams"],
	match: {
		blueSide: "teamA" | "teamB";
		teamAName: string | null;
		teamBName: string | null;
	},
	discordId: string
): DraftSide | null {
	const blueName = match.blueSide === "teamA" ? match.teamAName : match.teamBName;
	const redName = match.blueSide === "teamA" ? match.teamBName : match.teamAName;
	const blueTeam = teams.find((entry) => entry.name === blueName);
	const redTeam = teams.find((entry) => entry.name === redName);
	if (blueTeam?.captainRef?.discordId === discordId) return "teamA";
	if (redTeam?.captainRef?.discordId === discordId) return "teamB";
	return null;
}

function teamNameForDraftSide(match: { blueSide: "teamA" | "teamB"; teamAName: string | null; teamBName: string | null }, side: DraftSide) {
	const blueName = match.blueSide === "teamA" ? match.teamAName : match.teamBName;
	const redName = match.blueSide === "teamA" ? match.teamBName : match.teamAName;
	return side === "teamA" ? blueName : redName;
}
