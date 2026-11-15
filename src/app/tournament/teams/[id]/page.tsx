import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TournamentLink as Link } from "../../TournamentLink";
import { getChampionPools } from "@/lib/champion-pools";
import { getDraftState } from "@/lib/tournament-draft";
import { DRAFT_ROLES, draftForViewer, draftRoleOrder, draftSideHasRoles } from "@/lib/tournament-draft-shared";
import { listReplays, type TournamentReplay } from "@/lib/tournament-replays";
import { getReplayAssets } from "@/lib/replay-assets";
import { ReplayScoreboard } from "@/components/ReplayScoreboard";
import { teamColor } from "@/lib/team-tag";
import { getMatchControlContext, type ControlMatch } from "@/lib/match-control";
import { formatGameDuration } from "@/lib/match-duration";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { getRosterPublicationStatus } from "@/lib/roster";
import { usesFearless, usesUltimateBravery } from "@/lib/tournament-kind";
import type { ReplaySummary } from "@/lib/rofl";
import type { TournamentTeam } from "@/lib/tournament-data";
import { ChampionStrip, DraftColumn, StatusPill, type SideView } from "../../matches/MatchParts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Accepts the public team id and, for old links, the storage key. */
function findTeam(teams: TournamentTeam[], selector: string) {
	const decoded = decodeURIComponent(selector);
	return teams.find((team) => team.id === decoded) ?? teams.find((team) => team.storageKey === decoded) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
	const { id } = await params;
	const [ctx, publication] = await Promise.all([getMatchControlContext(), getRosterPublicationStatus()]);
	const team = publication.published ? findTeam(ctx.teams, id) : null;
	return team
		? { title: `${team.name} · Turnierverlauf`, description: `Matches, Drafts und Scoreboards von ${team.name} im aktuellen Lauchgruen-Turnier.` }
		: { title: "Team nicht gefunden" };
}

/** Public tournament history of one team: every match with result, draft and confirmed replay scoreboard. */
export default async function TeamHistoryPage({ params }: Params) {
	const { id } = await params;
	const [settings, publication, ctx, pools] = await Promise.all([getTournamentSettings(), getRosterPublicationStatus(), getMatchControlContext(), getChampionPools()]);
	// Unpublished rosters stay private, exactly like the /teams overview.
	if (!publication.published) notFound();
	const team = findTeam(ctx.teams, id);
	if (!team) notFound();
	if (team.id !== decodeURIComponent(id)) redirect(`/tournament/teams/${encodeURIComponent(team.id)}`);

	const fearless = usesFearless(settings.activeTournament);
	const draftsShown = !usesUltimateBravery(settings.activeTournament);
	const teamIndex = ctx.teams.findIndex((entry) => entry.id === team.id);
	const color = teamColor(teamIndex);
	const byName = new Map(pools.flatMap((pool) => pool.champions).map((champion) => [champion.name, champion]));
	const matches = ctx.matches.filter((match) => match.teamAName === team.name || match.teamBName === team.name);
	const finished = matches.filter((match) => match.status === "Finished");
	const wins = finished.filter((match) => match.winner === team.name).length;
	const ordered = [...matches.filter((match) => match.status !== "Finished"), ...finished.slice().reverse()];

	// Only finished matches load their draft and replays: running drafts stay on the spectate page.
	const details = new Map(
		await Promise.all(
			finished.map(async (match) => {
				const [draft, replays] = await Promise.all([draftsShown ? getDraftState(match.id) : Promise.resolve(null), listReplays(match.id)]);
				return [match.id, { draft, replays: replays.filter((replay) => replay.status === "applied") }] as const;
			})
		)
	);
	const assets = finished.length ? await getReplayAssets() : null;
	const captainName = team.players.find((player) => player.riotId === team.captainRef?.riotId)?.name ?? team.captain ?? "–";

	return (
		<section className="page-section compact-top">
			<Link href="/tournament/teams" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
				← Alle Teams
			</Link>

			<header className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-7" style={{ borderTop: `3px solid ${color}` }}>
				<div className="flex flex-wrap items-center gap-3">
					<span
						className="grid h-11 min-w-14 place-items-center rounded-lg px-2 font-mono text-sm font-bold tracking-wide"
						style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)` }}
					>
						{team.tag ?? "—"}
					</span>
					<div className="min-w-0">
						<h1 className="!m-0 break-words !text-3xl !leading-tight sm:!text-4xl">{team.name}</h1>
						<p className="mt-1 text-sm text-[var(--muted)]">{settings.activeTournament.name}</p>
					</div>
				</div>
				<dl className="mt-6 grid grid-cols-3 gap-3">
					<Stat label="Gespielt" value={String(finished.length)} />
					<Stat label="Bilanz" value={`${wins}–${finished.length - wins}`} />
					<Stat label="Captain" value={captainName} />
				</dl>
				<ul className="mt-6 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
					{team.players.map((player) => (
						<li key={player.riotId} className="flex min-w-0 items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] px-3 py-2">
							<span className="min-w-0">
								<span className="block truncate text-sm font-medium">{player.name}</span>
								<span className="block truncate font-mono text-xs text-[var(--muted)]">{player.riotId}</span>
							</span>
							<span className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">
								<span>{player.role}</span>
								<a href={player.opggUrl} target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
									OP.GG
								</a>
							</span>
						</li>
					))}
				</ul>
			</header>

			<section className="mt-8" aria-labelledby="history-title">
				<h2 id="history-title" className="m-0 text-lg font-semibold">
					Turnierverlauf
				</h2>
				{ordered.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Für dieses Team ist noch kein Match angesetzt.</p> : null}
				<ol className="mt-3 grid list-none gap-4 p-0">
					{ordered.map((match) => (
						<MatchEntry
							key={match.id}
							match={match}
							team={team}
							teams={ctx.teams}
							detail={details.get(match.id) ?? null}
							assets={assets}
							byName={byName}
							fearless={fearless}
						/>
					))}
				</ol>
			</section>
		</section>
	);
}

type Detail = { draft: Awaited<ReturnType<typeof getDraftState>> | null; replays: TournamentReplay[] };
type Assets = Awaited<ReturnType<typeof getReplayAssets>> | null;

function MatchEntry({
	match,
	team,
	teams,
	detail,
	assets,
	byName,
	fearless,
}: {
	match: ControlMatch;
	team: TournamentTeam;
	teams: TournamentTeam[];
	detail: Detail | null;
	assets: Assets;
	byName: Map<string, { imageUrl: string }>;
	fearless: boolean;
}) {
	const ownKey = match.teamAName === team.name ? "teamA" : "teamB";
	const opponentName = ownKey === "teamA" ? match.teamBName : match.teamAName;
	const opponentLabel = ownKey === "teamA" ? match.teamBLabel : match.teamALabel;
	const opponent = opponentName ? (teams.find((entry) => entry.name === opponentName) ?? null) : null;
	// Stored as team A : team B; shown from this team's side.
	const own = ownKey === "teamA" ? match.scoreA : match.scoreB;
	const theirs = ownKey === "teamA" ? match.scoreB : match.scoreA;
	const result = match.status === "Finished" && match.winner ? (match.winner === team.name ? "Sieg" : "Niederlage") : null;
	const side = (key: "teamA" | "teamB"): SideView => {
		const name = key === "teamA" ? match.teamAName : match.teamBName;
		const index = name ? teams.findIndex((entry) => entry.name === name) : -1;
		return {
			key,
			label: key === "teamA" ? match.teamALabel : match.teamBLabel,
			tag: (key === "teamA" ? match.teamATag : match.teamBTag) ?? teams[index]?.tag ?? null,
			color: index >= 0 ? teamColor(index) : "var(--muted)",
			teamId: teams[index]?.id ?? null,
			won: Boolean(match.winner && match.winner === name),
			blue: match.blueSide === key,
		};
	};
	// Public page: role orders stay hidden until both teams confirmed.
	const draft = detail?.draft ? draftForViewer(detail.draft, null) : null;
	const draftSide = (key: "teamA" | "teamB") => ({
		...side(key),
		picks: draft ? draftRoleOrder(draft, key).map((champion, index) => ({ champion, role: draftSideHasRoles(draft, key) ? DRAFT_ROLES[index] : null })) : [],
		bans: draft ? draft.actions.filter((action) => action.side === key && action.kind === "ban") : [],
	});
	const blueKey = match.blueSide;
	const redKey = blueKey === "teamA" ? "teamB" : "teamA";
	const replayFor = (gameNumber: number) => detail?.replays.find((replay) => replay.gameNumber === gameNumber) ?? null;
	const firstReplay = replayFor(1);
	const firstBlue = firstReplay?.evaluation.blueTeam ?? match.blueSide;
	const running = match.status === "Pending" || match.status === "Live";

	return (
		<li className="rounded-[16px] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
				<span>
					{match.round}
					{match.bestOf > 1 ? ` · Bo${match.bestOf}` : ""}
					{match.time ? ` · ${match.time}` : ""}
				</span>
				<StatusPill status={match.status} />
			</div>
			<div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
				<h3 className="!m-0 min-w-0 !text-xl !leading-tight">
					<span className="text-[var(--muted)]">vs </span>
					{opponent ? (
						<Link href={`/tournament/teams/${encodeURIComponent(opponent.id)}`} className="hover:text-[var(--accent)]">
							{opponent.name}
						</Link>
					) : (
						opponentLabel
					)}
				</h3>
				{own !== undefined && theirs !== undefined && match.status === "Finished" ? (
					<span className={`font-display text-2xl font-semibold tabular-nums ${result === "Sieg" ? "text-[var(--accent)]" : ""}`}>
						{own}:{theirs}
						{result ? <span className="ml-2 text-sm font-medium">{result}</span> : null}
					</span>
				) : null}
			</div>
			{match.gameDurationSeconds ? <p className="mt-1 text-xs text-[var(--muted)] tabular-nums">Spielzeit {formatGameDuration(match.gameDurationSeconds)}</p> : null}

			{running ? (
				<div className="mt-4 flex flex-wrap gap-3">
					<Link href={`/tournament/champ-select/${match.id}/spectate`} className="button primary small">
						{match.status === "Pending" ? "Draft live ansehen" : "Draft ansehen"}
					</Link>
				</div>
			) : null}

			{match.status === "Finished" && match.games.length ? (
				<ol className="mt-4 grid list-none gap-3 p-0">
					{match.games.map((game) => {
						const replay = replayFor(game.number);
						const replayBlue = replay?.evaluation.blueTeam ?? game.blueSide ?? match.blueSide;
						return (
							<li key={game.number} className="grid gap-2">
								<span className="text-sm font-semibold">Spiel {game.number}</span>
								<div className="grid gap-2 sm:grid-cols-2">
									<ChampionStrip
										label={side("teamA").tag ?? match.teamALabel}
										champions={game.teamAChampions ?? []}
										byName={byName}
										won={game.winner === "teamA"}
									/>
									<ChampionStrip
										label={side("teamB").tag ?? match.teamBLabel}
										champions={game.teamBChampions ?? []}
										byName={byName}
										won={game.winner === "teamB"}
									/>
								</div>
								{replay ? (
									<Scoreboard replay={replay} assets={assets} blue={side(replayBlue).label} red={side(replayBlue === "teamA" ? "teamB" : "teamA").label} />
								) : null}
							</li>
						);
					})}
				</ol>
			) : null}

			{match.status === "Finished" && !match.games.length ? (
				<>
					{draft && draft.actions.length ? (
						<div className="mt-4 grid gap-3 lg:grid-cols-2">
							<DraftColumn side={draftSide(blueKey)} sideLabel="Blue Side" byName={byName} fearless={fearless} />
							<DraftColumn side={draftSide(redKey)} sideLabel="Red Side" byName={byName} fearless={fearless} />
						</div>
					) : match.teamAChampions?.length || match.teamBChampions?.length ? (
						<div className="mt-4 grid gap-2 sm:grid-cols-2">
							<ChampionStrip label={side("teamA").tag ?? match.teamALabel} champions={match.teamAChampions ?? []} byName={byName} won={side("teamA").won} />
							<ChampionStrip label={side("teamB").tag ?? match.teamBLabel} champions={match.teamBChampions ?? []} byName={byName} won={side("teamB").won} />
						</div>
					) : null}
					{firstReplay ? (
						<Scoreboard replay={firstReplay} assets={assets} blue={side(firstBlue).label} red={side(firstBlue === "teamA" ? "teamB" : "teamA").label} />
					) : null}
				</>
			) : null}

			<div className="mt-4">
				<Link href={`/tournament/matches/${match.id}`} className="text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline">
					Match-Seite öffnen
				</Link>
			</div>
		</li>
	);
}

/** Puuids are not needed for the view and stay out of the public page. */
function publicSummary(summary: ReplaySummary): ReplaySummary {
	return { ...summary, players: summary.players.map((player) => ({ ...player, puuid: "" })) };
}

function Scoreboard({ replay, assets, blue, red }: { replay: TournamentReplay; assets: Assets; blue: string; red: string }) {
	return (
		<details className="mt-3">
			<summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--text)]">Scoreboard aus dem Replay</summary>
			<div className="mt-3">
				<ReplayScoreboard summary={publicSummary(replay.summary)} assets={assets} blueTeamName={blue} redTeamName={red} />
			</div>
		</details>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-[12px] border border-[var(--line)] p-3 sm:p-4">
			<dt className="text-xs text-[var(--muted)]">{label}</dt>
			<dd className="mt-1 truncate text-base font-semibold sm:text-xl">{value}</dd>
		</div>
	);
}
