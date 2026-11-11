import { notFound } from "next/navigation";
import Image from "next/image";
import type { ReactNode } from "react";
import { TournamentLink as Link } from "../../TournamentLink";
import { getChampionPools } from "@/lib/champion-pools";
import { getDraftState } from "@/lib/tournament-draft";
import { DRAFT_ROLE_LABELS, DRAFT_ROLES, createDraftSequence, draftComplete, draftHasRoles, draftRoleOrder } from "@/lib/tournament-draft-shared";
import { listReplays } from "@/lib/tournament-replays";
import { getReplayAssets } from "@/lib/replay-assets";
import { ReplayScoreboard } from "@/components/ReplayScoreboard";
import { RoleIcon } from "@/components/RoleIcon";
import { teamColor } from "@/lib/team-tag";
import { getMatchControlContext } from "@/lib/match-control";
import { formatGameDuration } from "@/lib/match-duration";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { auth } from "@/lib/auth";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { hideUltimateBraveryBuild, listUltimateBraveryRolls } from "@/lib/ultimate-bravery";
import { listUltimateBraveryTestSlots, ULTIMATE_BRAVERY_TEST_MATCH_ID } from "@/lib/ultimate-bravery-test";
import { resolveUltimateBraveryMatchPlayers } from "@/lib/ultimate-bravery-match";
import { getUltimateBraveryDraftStatus } from "@/lib/ultimate-bravery-state";
import { UltimateBraveryMatch } from "./UltimateBraveryMatch";
import { UltimateBraveryTestLobby } from "./UltimateBraveryTestLobby";
import { DiscordSignInButton } from "../../DiscordSignInButton";
import { usesFearless, usesUltimateBravery } from "@/lib/tournament-kind";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const [settings, session] = await Promise.all([getTournamentSettings(), auth()]);
	const currentDiscordId = session?.user?.discordId;
	if (id === ULTIMATE_BRAVERY_TEST_MATCH_ID) {
		if (!currentDiscordId) {
			return (
				<UltimateBraveryPage title="Team Alpha vs Team Bravo" subtitle="5v5-Proberaum · Discord-Anmeldung erforderlich">
					<div className="mt-6 rounded-[2rem] border border-cyan-200/16 bg-cyan-300/[0.055] p-6 text-center">
						<p className="text-sm font-bold leading-6 text-emerald-100/64">
							Melde dich mit Discord an, damit genau ein Testplatz und genau ein Roll deinem Account zugeordnet werden.
						</p>
						<DiscordSignInButton
							redirectTo="/tournament/matches/ub-test"
							pendingLabel="Discord wird geöffnet…"
							className="mt-4 rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
						>
							Mit Discord anmelden
						</DiscordSignInButton>
					</div>
				</UltimateBraveryPage>
			);
		}
		const [rolls, slots, players] = await Promise.all([listUltimateBraveryRolls(id), listUltimateBraveryTestSlots(), resolveUltimateBraveryMatchPlayers(id)]);
		if (!players) notFound();
		const isTestOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(currentDiscordId);
		const viewer = players.find((player) => player.discordId === currentDiscordId);
		const simulatedViewer = viewer ?? (isTestOwner ? players.find((player) => player.discordId) : undefined);
		const draftStatus = getUltimateBraveryDraftStatus(players, rolls);
		const { allLocked } = draftStatus;
		const visibleRolls = rolls
			.filter((roll) => simulatedViewer && (allLocked || roll.teamName === simulatedViewer.teamName))
			.map((roll) => (roll.teamName === simulatedViewer?.teamName ? roll : hideUltimateBraveryBuild(roll)));
		return (
			<UltimateBraveryPage title="Team Alpha vs Team Bravo" subtitle="Swiss-Probe · echter 5v5-Test">
				<UltimateBraveryTestLobby
					key={slots.map((slot) => `${slot.slotId}:${slot.discordId ?? "-"}`).join("|")}
					initial={{
						slots,
						currentSlotId: slots.find((slot) => slot.discordId === currentDiscordId)?.slotId ?? null,
						claimedCount: slots.filter((slot) => slot.discordId).length,
						ready: slots.every((slot) => slot.discordId),
						isAdmin: TOURNAMENT_OWNER_DISCORD_IDS.has(currentDiscordId),
					}}
				/>
				{simulatedViewer && slots.every((slot) => slot.discordId) ? (
					<UltimateBraveryMatch
						matchId={id}
						players={players}
						initialRolls={visibleRolls}
						currentDiscordId={currentDiscordId}
						viewerTeam={simulatedViewer.teamName}
						initialAllLocked={allLocked}
						initialLockedCount={draftStatus.lockedCount}
						rerollLimit={settings.structure.rerollsPerPlayer}
						testMode
						testOwner={isTestOwner}
						initialPerspectiveDiscordId={simulatedViewer.discordId}
					/>
				) : viewer ? (
					<div className="mt-6 rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.06] px-6 py-5 text-center text-sm font-bold text-amber-50/76">
						Der 5v5-Test startet, sobald alle zehn Plätze belegt sind.
					</div>
				) : null}
			</UltimateBraveryPage>
		);
	}
	const [ctx, pools, draft] = await Promise.all([getMatchControlContext(), getChampionPools(), getDraftState(id)]);
	const match = ctx.matches.find((entry) => entry.id === id);
	if (!match) notFound();
	if (usesUltimateBravery(settings.activeTournament)) {
		const [rolls, players] = await Promise.all([listUltimateBraveryRolls(id), resolveUltimateBraveryMatchPlayers(id)]);
		if (!players) notFound();
		const viewerTeam = players.find((player) => player.discordId === currentDiscordId)?.teamName;
		if (!viewerTeam && !TOURNAMENT_OWNER_DISCORD_IDS.has(currentDiscordId ?? "")) notFound();
		const effectiveViewerTeam = viewerTeam ?? players[0]?.teamName ?? "";
		const draftStatus = getUltimateBraveryDraftStatus(players, rolls);
		const { allLocked } = draftStatus;
		const visibleRolls = rolls
			.filter((roll) => allLocked || roll.teamName === effectiveViewerTeam)
			.map((roll) => (roll.teamName === effectiveViewerTeam ? roll : hideUltimateBraveryBuild(roll)));
		const rollsOpen = match.status === "Pending" || match.status === "Live" || match.status === "Finished";
		return (
			<UltimateBraveryPage
				title={`${match.teamALabel} vs ${match.teamBLabel}`}
				subtitle={`Ultimate Bravery · ${match.round}${match.bestOf > 1 ? ` · Spiel ${Math.min(match.games.length + 1, match.bestOf)} (Bo${match.bestOf}, ${match.scoreA ?? 0}:${match.scoreB ?? 0})` : ""}`}
			>
				{rollsOpen ? (
					<UltimateBraveryMatch
						matchId={id}
						players={players}
						initialRolls={visibleRolls}
						currentDiscordId={currentDiscordId}
						viewerTeam={effectiveViewerTeam}
						initialAllLocked={allLocked}
						initialLockedCount={draftStatus.lockedCount}
						rerollLimit={settings.structure.rerollsPerPlayer}
						readOnly={match.status === "Finished"}
					/>
				) : (
					<div className="mt-6 rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.06] px-6 py-5 text-center text-sm font-bold leading-6 text-amber-50/76">
						Die Paarung steht fest. Die Turnierleitung gibt die Rolls kurz vor dem Match im Admin-Control-Room frei.
					</div>
				)}
			</UltimateBraveryPage>
		);
	}
	const sequence = createDraftSequence(bonusBanSideForMatch(match, settings.activeTournament));
	const fearless = usesFearless(settings.activeTournament);
	const complete = draftComplete(draft, sequence);
	const byName = new Map(pools.flatMap((pool) => pool.champions).map((champion) => [champion.name, champion]));
	const withRoles = draftHasRoles(draft);
	const sides = (["teamA", "teamB"] as const).map((key): SideView => {
		const name = key === "teamA" ? match.teamAName : match.teamBName;
		const index = name ? ctx.teams.findIndex((team) => team.name === name) : -1;
		const team = index >= 0 ? ctx.teams[index] : null;
		return {
			key,
			label: key === "teamA" ? match.teamALabel : match.teamBLabel,
			tag: (key === "teamA" ? match.teamATag : match.teamBTag) ?? team?.tag ?? null,
			color: index >= 0 ? teamColor(index) : "var(--muted)",
			teamId: team?.id ?? null,
			won: Boolean(match.winner && match.winner === name),
			blue: match.blueSide === key,
		};
	});
	const sideOf = (key: "teamA" | "teamB") => sides[key === "teamA" ? 0 : 1];
	const draftSide = (key: "teamA" | "teamB") => ({
		...sideOf(key),
		picks: draftRoleOrder(draft, key).map((champion, index) => ({ champion, role: withRoles ? DRAFT_ROLES[index] : null })),
		bans: draft.actions.filter((action) => action.side === key && action.kind === "ban"),
		pool: key === "teamA" ? match.poolAssignment?.teamAPool : match.poolAssignment?.teamBPool,
	});
	const blueKey = match.blueSide;
	const redKey = blueKey === "teamA" ? "teamB" : "teamA";
	const scored = match.scoreA !== undefined && match.scoreB !== undefined;
	const spectate =
		Boolean(match.poolAssignment) || (fearless && match.status !== "Scheduled" && match.status !== "Locked" && (match.status !== "Finished" || draft.actions.length > 0));
	// Scoreboards only for replays the staff confirmed; pending or rejected uploads stay private.
	const [replays, assets] = match.games.length || match.status === "Finished" ? await Promise.all([listReplays(match.id), getReplayAssets()]) : [[], null];
	const appliedReplay = (gameNumber: number) => replays.find((replay) => replay.gameNumber === gameNumber && replay.status === "applied") ?? null;
	const currentDraftLabel = match.status === "Finished" ? "Letzter Draft" : match.games.length ? `Draft · Spiel ${match.games.length + 1}` : "Draft";

	return (
		<section className="page-section compact-top">
			<Link href="/tournament/schedule" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
				← Zeitplan
			</Link>

			<header className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-7">
				<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
					<span>
						{match.phase === "play-in" ? match.round : `${match.phase === "groups" ? "Tag 1" : "Playoffs"} · ${match.round}`}
						{match.bestOf > 1 ? ` · Bo${match.bestOf}` : ""}
						{match.time ? ` · ${match.time}` : ""}
					</span>
					<StatusPill status={match.status} />
				</div>
				<div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
					<TeamHeading side={sides[0]} align="left" />
					<div className="text-center">
						<div className="font-display text-4xl font-semibold tabular-nums sm:text-6xl">
							{scored ? (
								<>
									<span className={sides[0].won ? "text-[var(--accent)]" : ""}>{match.scoreA}</span>
									<span className="px-2 text-[var(--muted)]">:</span>
									<span className={sides[1].won ? "text-[var(--accent)]" : ""}>{match.scoreB}</span>
								</>
							) : (
								<span className="text-2xl text-[var(--muted)] sm:text-3xl">vs</span>
							)}
						</div>
						{match.gameDurationSeconds ? <div className="mt-1 text-xs text-[var(--muted)] tabular-nums">{formatGameDuration(match.gameDurationSeconds)}</div> : null}
					</div>
					<TeamHeading side={sides[1]} align="right" />
				</div>
				{spectate ? (
					<div className="mt-6 flex justify-center">
						<Link href={`/tournament/champ-select/${match.id}/spectate`} className="button primary small">
							{match.status === "Pending" ? "Draft live ansehen" : "Draft ansehen"}
						</Link>
					</div>
				) : null}
			</header>

			{!match.games.length && match.status === "Finished" && (match.teamAChampions?.length || match.teamBChampions?.length) ? (
				<div className="mt-6 grid gap-2 sm:grid-cols-2">
					<ChampionStrip label={sides[0].tag ?? match.teamALabel} champions={match.teamAChampions ?? []} byName={byName} won={sides[0].won} />
					<ChampionStrip label={sides[1].tag ?? match.teamBLabel} champions={match.teamBChampions ?? []} byName={byName} won={sides[1].won} />
				</div>
			) : null}
			{!match.games.length && appliedReplay(1) ? (
				<details className="mt-3">
					<summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--text)]">Scoreboard</summary>
					<div className="mt-3">
						<ReplayScoreboard
							summary={appliedReplay(1)!.summary}
							assets={assets}
							blueTeamName={sideOf(appliedReplay(1)!.evaluation.blueTeam ?? match.blueSide).label}
							redTeamName={sideOf((appliedReplay(1)!.evaluation.blueTeam ?? match.blueSide) === "teamA" ? "teamB" : "teamA").label}
						/>
					</div>
				</details>
			) : null}
			{match.games.length ? (
				<section className="mt-6" aria-labelledby="games-title">
					<h2 id="games-title" className="m-0 text-lg font-semibold">
						{match.bestOf > 1 ? "Spiele der Serie" : "Spiel"}
					</h2>
					<ol className="mt-3 grid list-none gap-3 p-0">
						{match.games.map((game) => {
							const replay = appliedReplay(game.number);
							const winner = sideOf(game.winner);
							const replayBlue = replay?.evaluation.blueTeam ?? game.blueSide ?? match.blueSide;
							return (
								<li key={game.number} className="rounded-[16px] border border-[var(--line)] bg-[var(--panel)] p-4">
									<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
										<span className="font-semibold">Spiel {game.number}</span>
										<span className="text-[var(--muted)]">
											Sieg <strong style={{ color: winner.color }}>{winner.tag ?? winner.label}</strong>
											{game.durationSeconds !== undefined ? <span className="tabular-nums"> · {formatGameDuration(game.durationSeconds)}</span> : null}
										</span>
									</div>
									<div className="mt-3 grid gap-2 sm:grid-cols-2">
										<ChampionStrip
											label={sides[0].tag ?? match.teamALabel}
											champions={game.teamAChampions ?? []}
											byName={byName}
											won={game.winner === "teamA"}
										/>
										<ChampionStrip
											label={sides[1].tag ?? match.teamBLabel}
											champions={game.teamBChampions ?? []}
											byName={byName}
											won={game.winner === "teamB"}
										/>
									</div>
									{replay ? (
										<details className="mt-3">
											<summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--text)]">Scoreboard</summary>
											<div className="mt-3">
												<ReplayScoreboard
													summary={replay.summary}
													assets={assets}
													blueTeamName={sideOf(replayBlue).label}
													redTeamName={sideOf(replayBlue === "teamA" ? "teamB" : "teamA").label}
												/>
											</div>
										</details>
									) : null}
								</li>
							);
						})}
					</ol>
				</section>
			) : null}

			{draft.actions.length || match.status === "Pending" || match.status === "Live" ? (
				<section className="mt-6" aria-labelledby="draft-title">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 id="draft-title" className="m-0 text-lg font-semibold">
							{currentDraftLabel}
						</h2>
						<span className="text-sm text-[var(--muted)]">
							{complete ? "Abgeschlossen" : `${draft.actions.length}/${sequence.length} Aktionen`}
							{fearless ? " · Fearless" : ""}
						</span>
					</div>
					<div className="mt-3 grid gap-3 lg:grid-cols-2">
						<DraftColumn side={draftSide(blueKey)} sideLabel="Blue Side" byName={byName} fearless={fearless} />
						<DraftColumn side={draftSide(redKey)} sideLabel="Red Side" byName={byName} fearless={fearless} />
					</div>
				</section>
			) : match.status === "Scheduled" || match.status === "Locked" ? (
				<p className="mt-6 text-sm text-[var(--muted)]">Der Draft startet, sobald die Turnierleitung das Match freigibt.</p>
			) : null}
		</section>
	);
}

type SideView = {
	key: "teamA" | "teamB";
	label: string;
	tag: string | null;
	color: string;
	teamId: string | null;
	won: boolean;
	blue: boolean;
};

const STATUS: Record<string, { label: string; tone?: "live" | "ok" }> = {
	Locked: { label: "Wartet auf Teams" },
	Scheduled: { label: "Geplant" },
	Pending: { label: "Draft läuft", tone: "live" },
	Live: { label: "Live", tone: "live" },
	Finished: { label: "Beendet", tone: "ok" },
};

function StatusPill({ status }: { status: string }) {
	const entry = STATUS[status] ?? { label: status };
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
				entry.tone === "live"
					? "border-[color-mix(in_srgb,var(--live)_40%,transparent)] text-[var(--live)]"
					: entry.tone === "ok"
						? "border-[var(--line)] text-[var(--accent)]"
						: "border-[var(--line)] text-[var(--muted)]"
			}`}
		>
			{entry.tone === "live" ? <i aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--live)] motion-reduce:animate-none" /> : null}
			{entry.label}
		</span>
	);
}

function TeamHeading({ side, align }: { side: SideView; align: "left" | "right" }) {
	const name = (
		<h2 className="!m-0 line-clamp-2 !text-base !leading-tight break-words sm:line-clamp-1 sm:!text-3xl" title={side.label}>
			{side.label}
		</h2>
	);
	return (
		<div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
			<span
				className="hidden h-11 min-w-14 shrink-0 place-items-center rounded-lg px-2 font-mono text-sm font-bold tracking-wide sm:grid"
				style={{
					color: side.color,
					background: `color-mix(in srgb, ${side.color} 16%, transparent)`,
					border: `1px solid color-mix(in srgb, ${side.color} 40%, transparent)`,
				}}
			>
				{side.tag ?? "—"}
			</span>
			<div className="min-w-0">
				{side.teamId ? (
					<Link href={`/tournament/teams#team-${side.teamId}`} className="block min-w-0 hover:text-[var(--accent)]">
						{name}
					</Link>
				) : (
					name
				)}
				<div className="mt-1 text-xs text-[var(--muted)]">
					<span style={{ color: side.blue ? "var(--draft-blue, #6aa8ff)" : "var(--draft-red, #ff6a6a)" }}>{side.blue ? "Blue Side" : "Red Side"}</span>
					{side.won ? <span className="text-[var(--accent)]"> · Sieger</span> : null}
				</div>
			</div>
		</div>
	);
}

function ChampionStrip({ label, champions, byName, won }: { label: string; champions: string[]; byName: Map<string, { imageUrl: string }>; won: boolean }) {
	return (
		<div className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2">
			<span className={`w-14 shrink-0 truncate font-mono text-xs font-bold ${won ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{label}</span>
			<div className="flex flex-wrap gap-1">
				{champions.length ? (
					champions.map((champion) => (
						<span key={champion} title={champion} className="relative size-8 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-soft)]">
							{byName.get(champion)?.imageUrl ? <Image src={byName.get(champion)!.imageUrl} alt={champion} fill sizes="2rem" className="object-cover" /> : null}
						</span>
					))
				) : (
					<span className="text-xs text-[var(--muted)]">Keine Picks erfasst</span>
				)}
			</div>
		</div>
	);
}

function DraftColumn({
	side,
	sideLabel,
	byName,
	fearless,
}: {
	side: SideView & { picks: Array<{ champion: string; role: string | null }>; bans: Array<{ champion: string; skipped?: boolean }>; pool?: string };
	sideLabel: string;
	byName: Map<string, { imageUrl: string }>;
	fearless: boolean;
}) {
	return (
		<article className="rounded-[16px] border border-[var(--line)] bg-[var(--panel)] p-4" style={{ borderTop: `3px solid ${side.color}` }}>
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="!m-0 truncate !text-base">{side.label}</h3>
				<span className="text-xs text-[var(--muted)]">{sideLabel}</span>
			</div>
			{!fearless && side.pool ? <p className="mt-1 text-xs text-[var(--muted)]">Pool {compactPoolLabel(side.pool)}</p> : null}
			<ul className="mt-3 grid list-none gap-1.5 p-0">
				{side.picks.length ? (
					side.picks.map((pick) => (
						<li key={pick.champion} className="flex items-center gap-3 rounded-[10px] bg-[var(--bg-soft)] px-2 py-1.5">
							<span className="relative size-9 shrink-0 overflow-hidden rounded-md">
								{byName.get(pick.champion)?.imageUrl ? (
									<Image src={byName.get(pick.champion)!.imageUrl} alt="" fill sizes="2.25rem" className="object-cover" />
								) : null}
							</span>
							<span className="min-w-0 flex-1 truncate text-sm font-medium">{pick.champion}</span>
							{pick.role ? (
								<span className="text-[var(--muted)]" title={DRAFT_ROLE_LABELS[pick.role as keyof typeof DRAFT_ROLE_LABELS]}>
									<RoleIcon role={pick.role} className="size-4" />
								</span>
							) : null}
						</li>
					))
				) : (
					<li className="text-sm text-[var(--muted)]">Noch keine Picks</li>
				)}
			</ul>
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-xs text-[var(--muted)]">Bans</span>
				{side.bans.length ? (
					side.bans.map((ban, index) =>
						ban.skipped ? (
							<span
								key={`skip-${index}`}
								title="Kein Ban"
								className="grid size-7 place-items-center rounded-md border border-dashed border-[var(--line)] text-[10px] text-[var(--muted)]"
							>
								–
							</span>
						) : (
							<span key={ban.champion} title={ban.champion} className="relative size-7 overflow-hidden rounded-md border border-[var(--line)] opacity-60 grayscale">
								{byName.get(ban.champion)?.imageUrl ? (
									<Image src={byName.get(ban.champion)!.imageUrl} alt={`Ban ${ban.champion}`} fill sizes="1.75rem" className="object-cover" />
								) : null}
							</span>
						)
					)
				) : (
					<span className="text-xs text-[var(--muted)]">Noch keine</span>
				)}
			</div>
		</article>
	);
}

function UltimateBraveryPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<Link href="/tournament" className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/70 hover:text-lime-100">
					← Turnierübersicht
				</Link>
				<div className="mt-5 rounded-[2.4rem] border border-white/10 bg-gradient-to-br from-cyan-200/[0.09] via-white/[0.04] to-lime-300/[0.05] p-7 shadow-2xl shadow-black/28 sm:p-10">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/62">{subtitle}</div>
					<h1 className="mt-5 text-4xl font-black tracking-tight text-emerald-50 sm:text-6xl">{title}</h1>
					<p className="mt-4 text-sm font-bold text-emerald-100/58">Jeder Spieler würfelt und bestätigt selbst. Die Build-Reihenfolge gilt von links nach rechts.</p>
				</div>
				{children}
			</section>
		</div>
	);
}
