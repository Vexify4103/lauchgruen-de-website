import { TournamentLink as Link } from "../TournamentLink";
import { redirect } from "next/navigation";
import { TournamentCodeBox } from "@/components/TournamentCodeBox";
import { codeVisibleFor, currentGameNumber, getTournamentCode, tournamentCodeMode } from "@/lib/riot-tournament";
import { captainPortalOpen } from "@/lib/tournament-mode";
import { auth } from "@/lib/auth";
import { getChampionPools } from "@/lib/champion-pools";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { CopyDraftSpectatorLinkButton } from "./CopyDraftSpectatorLinkButton";
import { RenameTeamForm } from "./RenameTeamForm";
import { TransferCaptainCard } from "./TransferCaptainCard";
import { CaptainMatchActions } from "./CaptainMatchActions";
import { ReplayUpload } from "./ReplayUpload";
import { DiscordSignInButton } from "../DiscordSignInButton";

function opggMultiSearchUrl(riotIds: string[]) {
	const uniqueIds = [...new Set(riotIds.filter(Boolean))];
	const params = new URLSearchParams({
		summoners: uniqueIds.length > 0 ? `${uniqueIds.join(", ")},` : "",
	});
	return `https://op.gg/lol/multisearch/euw?${params.toString()}`;
}

export default async function CaptainPortalPage() {
	if (!captainPortalOpen((await getTournamentSettings()).activeTournament.mode)) redirect("/tournament");
	const session = await auth();
	const discordId = session?.user?.discordId;

	if (!discordId) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto w-full max-w-3xl rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-6">
					<h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Captain-Portal</h1>
					<p className="mt-3 text-sm leading-6 text-[var(--muted)]">Melde dich mit Discord an, damit wir dein Captain-Team erkennen.</p>
					<div className="mt-5">
						<DiscordSignInButton
							redirectTo="/tournament/captain"
							pendingLabel="Weiter zu Discord…"
							className="rounded-[10px] bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-65"
						>
							Mit Discord anmelden
						</DiscordSignInButton>
					</div>
				</section>
			</div>
		);
	}

	const [ctx, pools, settings] = await Promise.all([getMatchControlContext(), getChampionPools(), getTournamentSettings()]);
	const team = ctx.teams.find((entry) => entry.captainRef?.discordId === discordId);
	if (!team) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto w-full max-w-3xl rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-6">
					<span className="tally" data-tone="warn">
						Kein Captain-Team
					</span>
					<h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">Du bist noch kein Captain</h1>
					<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
						Dein Discord-Account ist aktuell keinem Team als Captain zugeordnet. Wenn das falsch ist, bitte im Orga-Team melden.
					</p>
				</section>
			</div>
		);
	}

	const matches = ctx.matches.filter((match) => match.teamAName === team.name || match.teamBName === team.name);
	const nextMatch = matches.find((match) => match.status === "Live") ?? matches.find((match) => match.status !== "Finished") ?? matches[0] ?? null;
	const isTeamA = nextMatch?.teamAName === team.name;
	const draftPerspective = nextMatch?.blueSide === (isTeamA ? "teamA" : "teamB") ? "blue" : "red";
	const assignedPool = nextMatch?.poolAssignment ? (isTeamA ? nextMatch.poolAssignment.teamAPool : nextMatch.poolAssignment.teamBPool) : null;
	const allowedPool = assignedPool ? pools.find((pool) => pool.pool === assignedPool) : null;
	const opponent = nextMatch ? findTeamByName(ctx.teams, isTeamA ? nextMatch.teamBName : nextMatch.teamAName) : null;
	const codeMode = tournamentCodeMode();
	const tournamentCode = codeMode.enabled && nextMatch && codeVisibleFor(nextMatch) ? await getTournamentCode(settings, nextMatch.id, currentGameNumber(nextMatch)) : null;

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="grid content-start gap-6">
					<header>
						<p className="text-sm text-[var(--muted)]">Captain-Portal</p>
						<h1 className="mt-1 text-4xl font-semibold tracking-tight text-[var(--text)]">{team.name}</h1>
					</header>

					{nextMatch ? (
						<section aria-labelledby="next-match-title" className="rounded-[16px] border border-[var(--line-strong)] bg-[var(--panel-solid)] p-6">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="text-sm text-[var(--muted)]">
									{nextMatch.status === "Finished" ? "Letztes Match" : "Nächstes Match"} · <span className="font-mono">{nextMatch.id}</span>
								</p>
								<span
									className="tally"
									data-tone={nextMatch.status === "Live" || nextMatch.status === "Pending" ? "live" : nextMatch.status === "Finished" ? "ok" : undefined}
								>
									{STATUS_LABELS[nextMatch.status ?? "Scheduled"] ?? nextMatch.status}
								</span>
							</div>
							<h2 id="next-match-title" className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">
								{team.name} <span className="font-normal text-[var(--muted)]">vs</span> {opponent?.name ?? (isTeamA ? nextMatch.teamBLabel : nextMatch.teamALabel)}
							</h2>
							<dl className="mt-5 grid grid-cols-3 gap-3">
								<InfoTile
									label="Score"
									value={nextMatch.scoreA !== undefined && nextMatch.scoreB !== undefined ? `${nextMatch.scoreA}:${nextMatch.scoreB}` : "–"}
								/>
								<InfoTile label="Eure Seite" value={draftPerspective === "blue" ? "Blau" : "Rot"} />
								<InfoTile label="Euer Pool" value={assignedPool ? compactPoolLabel(assignedPool) : "–"} />
							</dl>
							<div className="mt-5 flex flex-wrap items-center gap-3">
								{settings.draftEnabled ? (
									<Link
										href={`/tournament/champ-select/${nextMatch.id}`}
										className="rounded-[10px] bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)]"
									>
										Zum Champ Select
									</Link>
								) : (
									<span aria-disabled="true" className="cursor-not-allowed rounded-[10px] border border-[var(--line)] px-5 py-3 text-sm text-[var(--muted)]">
										Champ Select pausiert
									</span>
								)}
								<CopyDraftSpectatorLinkButton matchId={nextMatch.id} perspective={draftPerspective} disabled={!settings.draftEnabled} />
								<span className="flex gap-4 text-sm">
									<a
										href={opggMultiSearchUrl(team.players.map((player) => player.scoutRiotId ?? player.riotId))}
										target="_blank"
										rel="noreferrer"
										className="text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
									>
										Team auf OP.GG
									</a>
									{opponent ? (
										<a
											href={opggMultiSearchUrl(opponent.players.map((player) => player.scoutRiotId ?? player.riotId))}
											target="_blank"
											rel="noreferrer"
											className="text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
										>
											Gegner auf OP.GG
										</a>
									) : null}
								</span>
							</div>
							{codeMode.enabled && codeVisibleFor(nextMatch) ? (
								<div className="mt-5">
									<TournamentCodeBox code={tournamentCode?.code ?? null} gameNumber={currentGameNumber(nextMatch)} stub={codeMode.stub} matchId={nextMatch.id} />
								</div>
							) : null}
							<CaptainMatchActions matchId={nextMatch.id} teamName={team.name} />
							{nextMatch.teamAName && nextMatch.teamBName && nextMatch.status !== "Finished" ? (
								<ReplayUpload matchId={nextMatch.id} teamAName={nextMatch.teamAName} teamBName={nextMatch.teamBName} />
							) : null}
						</section>
					) : (
						<p className="rounded-[16px] border border-[var(--line)] p-6 text-sm text-[var(--muted)]">Für dein Team ist noch kein Match angesetzt.</p>
					)}

					{allowedPool ? (
						<section aria-labelledby="pool-title" className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-5">
							<h2 id="pool-title" className="text-lg font-semibold text-[var(--text)]">
								Erlaubte Champions · Pool {allowedPool.label}
							</h2>
							<ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
								{allowedPool.champions.map((champion) => (
									<li key={champion.id} className="rounded-[8px] border border-[var(--line)] px-3 py-1 text-sm text-[var(--text)]">
										{champion.name}
									</li>
								))}
							</ul>
						</section>
					) : null}

					<div className="grid gap-6 xl:grid-cols-2">
						<RenameTeamForm teamKey={team.storageKey ?? team.name.trim().toLowerCase()} initialName={team.name} initialTag={team.tag ?? ""} />
						<TransferCaptainCard
							teamKey={team.storageKey ?? team.name.trim().toLowerCase()}
							candidates={team.players
								.filter((player) => Boolean(player.discordId) && player.discordId !== discordId)
								.map((player) => ({
									discordId: player.discordId!,
									name: player.name,
									riotId: player.riotId,
									role: player.role,
								}))}
						/>
					</div>
				</div>

				<aside aria-labelledby="roster-title" className="content-start self-start rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-5">
					<h2 id="roster-title" className="text-lg font-semibold text-[var(--text)]">
						Roster
					</h2>
					<ul className="mt-4 grid list-none gap-1 p-0">
						{team.players.map((player) => (
							<li key={player.riotId} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-3 border-t border-[var(--line)] py-2.5 first:border-t-0">
								<span className="text-xs text-[var(--muted)]">{player.role}</span>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium text-[var(--text)]">{player.name}</span>
									<span className="block truncate font-mono text-xs text-[var(--muted)]" title={player.riotId}>{player.playingAccountApproved ? "Spielaccount: " : ""}{player.riotId}</span>
									{player.verified === false && !player.playingAccountApproved ? (
										<span className="tally mt-1" data-tone="warn">
											Nicht verifiziert
										</span>
									) : null}
								</span>
							</li>
						))}
					</ul>
				</aside>
			</section>
		</div>
	);
}

const STATUS_LABELS: Record<string, string> = {
	Scheduled: "Geplant",
	Locked: "Gesperrt",
	Pending: "Draft läuft",
	Live: "Live",
	Finished: "Beendet",
};

function InfoTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-[12px] border border-[var(--line)] p-3 sm:p-4">
			<dt className="text-xs text-[var(--muted)]">{label}</dt>
			<dd className="mt-1 truncate text-base font-semibold text-[var(--text)] sm:text-xl">{value}</dd>
		</div>
	);
}
