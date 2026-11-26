/**
 * Win Challenge admin (owners only).
 * GET:  full state incl. Discord ids, join codes, payouts and the last events.
 * POST: { action: save-challenge | team-correct | team-remove | team-assign | team-unassign | participant-remove | end | payout-set | payout-reassign, ... }
 */
import { z } from "zod";
import { writeAuditLog } from "@/lib/tournament-audit";
import { currentUser, handleWinError, winError, winJson } from "@/lib/winchallenge/http";
import {
	assignToTeam,
	correctTeam,
	endChallenge,
	getCurrentChallenge,
	getTeam,
	listEvents,
	listParticipants,
	listPayouts,
	leaveTeam,
	listTeams,
	reassignPayout,
	removeParticipant,
	removeTeam,
	saveChallenge,
	setPayoutStatus,
} from "@/lib/winchallenge/store";
import { gamePlayMs } from "@/lib/winchallenge/actions";
import { twitchIdentities } from "@/lib/winchallenge/live";
import { subChannelOf } from "@/lib/winchallenge/subs";
import { elapsedMs } from "@/lib/winchallenge/timer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_CHANNEL = (process.env.WINCHALLENGE_FALLBACK_CHANNEL ?? "lauchgruen").trim().toLowerCase();

async function requireOwner() {
	const user = await currentUser();
	if (!user) return { error: winError(401, "Bitte mit Discord anmelden.") } as const;
	if (!user.isOwner) return { error: winError(403, "Nicht berechtigt.") } as const;
	return { user } as const;
}

export async function GET() {
	const gate = await requireOwner();
	if ("error" in gate) return gate.error;
	try {
		const challenge = await getCurrentChallenge();
		if (!challenge) return winJson({ serverNow: Date.now(), challenge: null, teams: [], participants: [], payouts: [], events: [], fallbackChannel: FALLBACK_CHANNEL });
		const now = Date.now();
		const playNow = challenge.endedAt ? Math.min(now, new Date(challenge.endedAt).getTime()) : now;
		const [teams, participants, payouts, events] = await Promise.all([
			listTeams(challenge.id),
			listParticipants(challenge.id),
			listPayouts(challenge.id),
			listEvents(challenge.id, { limit: 200 }),
		]);
		return winJson({
			serverNow: now,
			challenge,
			teams: teams.map((team) => ({
				...team,
				elapsedMs: elapsedMs(team, now, challenge),
				playMs: Object.fromEntries(challenge.games.map((game) => [game.id, gamePlayMs(team, game.id, playNow)])),
			})),
			participants: participants.map((participant) => ({ ...participant, subChannel: subChannelOf(participant, participants, FALLBACK_CHANNEL) })),
			payouts,
			events,
			fallbackChannel: FALLBACK_CHANNEL,
		});
	} catch (error) {
		return handleWinError(error, "Admin-Daten konnten nicht geladen werden.");
	}
}

const gameSchema = z.object({
	id: z
		.string()
		.trim()
		.min(1)
		.max(60)
		.regex(/^[a-z0-9-]+$/, "Spiel-ID: nur a-z, 0-9 und -"),
	title: z.string().trim().min(1).max(80),
	goal: z.string().trim().min(1).max(200),
	type: z.enum(["check", "counter"]),
	target: z.number().int().min(1).max(100000).optional(),
	icon: z.string().trim().max(300).optional(),
	note: z.string().trim().max(300).optional(),
});

const reason = z.string().trim().min(3, "Bitte einen Grund angeben.").max(300);
const teamStatus = z.enum(["forming", "ready", "running", "paused", "finished", "gave-up"]);

const schema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("save-challenge"),
		name: z.string().trim().min(2).max(80),
		startAt: z.string().datetime({ offset: true }),
		signupOpen: z.boolean(),
		split: z.tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100)]),
		games: z.array(gameSchema).min(1).max(60),
		status: z.enum(["draft", "open"]).optional(),
	}),
	z.object({
		action: z.literal("team-correct"),
		teamId: z.string().min(1),
		reason,
		adjustMs: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional(),
		status: teamStatus.optional(),
		name: z.string().trim().min(2).max(40).optional(),
		progress: z.record(z.string(), z.object({ count: z.number().int().min(0).max(1_000_000), tries: z.number().int().min(0).max(1_000_000), done: z.boolean() })).optional(),
	}),
	z.object({ action: z.literal("team-remove"), teamId: z.string().min(1), reason }),
	z.object({
		action: z.literal("team-assign"),
		participantId: z.string().min(1),
		teamId: z.string().min(1).optional(),
		partnerId: z.string().min(1).optional(),
		name: z.string().trim().max(40).optional(),
	}),
	z.object({ action: z.literal("team-unassign"), participantId: z.string().min(1), reason }),
	z.object({ action: z.literal("participant-remove"), participantId: z.string().min(1), reason }),
	z.object({ action: z.literal("end"), confirm: z.literal("BEENDEN") }),
	z.object({ action: z.literal("payout-set"), payoutId: z.string().min(1), status: z.enum(["open", "paid", "confirmed"]) }),
	z.object({ action: z.literal("payout-reassign"), payoutId: z.string().min(1), recipientId: z.string().min(1) }),
]);

export async function POST(request: Request) {
	const gate = await requireOwner();
	if ("error" in gate) return gate.error;
	const { user } = gate;
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return winError(400, parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
	const input = parsed.data;
	const audit = (action: string, targetId: string, summary: string, metadata?: Record<string, unknown>) =>
		writeAuditLog({ action: `winchallenge.${action}`, targetType: "winchallenge", targetId, summary, actorDiscordId: user.discordId, actorLabel: user.name, metadata }).catch(
			(error) => console.error("[winchallenge] audit failed", error)
		);

	try {
		const challenge = await getCurrentChallenge();

		if (input.action === "save-challenge") {
			const ids = new Set(input.games.map((game) => game.id));
			if (ids.size !== input.games.length) return winError(400, "Spiel-IDs müssen eindeutig sein.");
			if (input.games.some((game) => game.type === "counter" && !game.target)) return winError(400, "Zähler-Spiele brauchen ein Ziel.");
			if (input.split[0] + input.split[1] + input.split[2] !== 100) return winError(400, "Die Aufteilung muss 100 % ergeben.");
			if (challenge && challenge.status !== "draft" && challenge.status !== "open") return winError(400, "Die Challenge ist beendet.");
			if (challenge && input.status === "draft" && challenge.status === "open") return winError(400, "Eine offene Challenge kann nicht zurück in den Entwurf.");
			const saved = await saveChallenge(
				{ name: input.name, startAt: new Date(input.startAt).toISOString(), signupOpen: input.signupOpen, split: input.split, games: input.games, status: input.status },
				challenge?.id
			);
			await audit("save", saved.id, `Challenge "${saved.name}" gespeichert`, { status: saved.status, games: saved.games.length });
			return winJson({ ok: true, challenge: saved });
		}

		if (!challenge) return winError(404, "Aktuell gibt es keine Challenge.");

		if (input.action === "team-correct") {
			const existing = await getTeam(input.teamId);
			if (!existing || existing.challengeId !== challenge.id) return winError(404, "Team nicht gefunden.");
			const team = await correctTeam({
				teamId: input.teamId,
				challenge,
				reason: input.reason,
				actor: user.name,
				correction: { adjustMs: input.adjustMs, status: input.status, name: input.name, progress: input.progress },
			});
			await audit("team-correct", team.id, `Team "${team.name}" korrigiert: ${input.reason}`);
			return winJson({ ok: true, team });
		}
		if (input.action === "team-remove") {
			const team = await getTeam(input.teamId);
			if (!team || team.challengeId !== challenge.id) return winError(404, "Team nicht gefunden.");
			await removeTeam({ team, actor: user.name, reason: input.reason });
			await audit("team-remove", team.id, `Team "${team.name}" entfernt: ${input.reason}`);
			return winJson({ ok: true });
		}
		if (input.action === "team-assign") {
			const everyone = await listParticipants(challenge.id);
			const participant = everyone.find((entry) => entry.id === input.participantId);
			if (!participant) return winError(404, "Spieler nicht gefunden.");
			let team;
			if (input.teamId) {
				const target = await getTeam(input.teamId);
				if (!target || target.challengeId !== challenge.id) return winError(404, "Team nicht gefunden.");
				team = await assignToTeam({ challenge, participant, team: target, actor: user.name });
			} else {
				const partner = everyone.find((entry) => entry.id === input.partnerId);
				if (!partner) return winError(400, "Bitte einen Partner oder ein wartendes Team wählen.");
				const { names } = await twitchIdentities([participant, partner]);
				const fallbackName = `${names.get(participant.id) ?? participant.twitchLogin} & ${names.get(partner.id) ?? partner.twitchLogin}`.slice(0, 40);
				team = await assignToTeam({
					challenge,
					participant,
					partner,
					name: input.name || fallbackName,
					actor: user.name,
				});
			}
			await audit("team-assign", team.id, `${participant.discordName} ins Team "${team.name}" gesetzt`);
			return winJson({ ok: true, team });
		}
		if (input.action === "team-unassign") {
			const participant = (await listParticipants(challenge.id)).find((entry) => entry.id === input.participantId);
			if (!participant) return winError(404, "Spieler nicht gefunden.");
			if (!participant.teamId) return winError(400, `${participant.discordName} ist in keinem Team.`);
			await leaveTeam({ participant, actor: user.name });
			await audit("team-unassign", participant.id, `${participant.discordName} aus Team genommen: ${input.reason}`);
			return winJson({ ok: true });
		}
		if (input.action === "participant-remove") {
			const participant = (await listParticipants(challenge.id)).find((entry) => entry.id === input.participantId);
			if (!participant) return winError(404, "Teilnehmer nicht gefunden.");
			await removeParticipant({ participant, actor: user.name, reason: input.reason });
			await audit("participant-remove", participant.id, `${participant.discordName} entfernt: ${input.reason}`);
			return winJson({ ok: true });
		}
		if (input.action === "end") {
			if (challenge.status !== "open" && challenge.status !== "ended") return winError(400, "Nur eine offene Challenge kann beendet werden.");
			const payouts = await endChallenge({ challenge, actor: user.name, channelFallback: FALLBACK_CHANNEL });
			await audit("end", challenge.id, `Challenge "${challenge.name}" beendet, ${payouts.length} Subs offen`);
			return winJson({ ok: true, payouts: payouts.length });
		}
		if (input.action === "payout-set") {
			const updated = await setPayoutStatus({ payoutId: input.payoutId, challengeId: challenge.id, status: input.status, actor: user.name });
			if (!updated) return winError(404, "Eintrag nicht gefunden.");
			return winJson({ ok: true, status: updated.status });
		}
		const payout = (await listPayouts(challenge.id)).find((entry) => entry.id === input.payoutId);
		if (!payout) return winError(404, "Eintrag nicht gefunden.");
		const everyone = await listParticipants(challenge.id);
		const recipient = everyone.find((entry) => entry.id === input.recipientId);
		if (!recipient) return winError(404, "Empfänger nicht gefunden.");
		if (recipient.id === payout.payerId) return winError(400, "Niemand beschenkt sich selbst.");
		await reassignPayout({
			payoutId: payout.id,
			challengeId: challenge.id,
			recipientId: recipient.id,
			channel: subChannelOf(recipient, everyone, FALLBACK_CHANNEL),
			actor: user.name,
		});
		await audit("payout-reassign", payout.id, `Sub neu zugeteilt an ${recipient.discordName}`);
		return winJson({ ok: true });
	} catch (error) {
		return handleWinError(error, "Admin-Aktion fehlgeschlagen.");
	}
}
