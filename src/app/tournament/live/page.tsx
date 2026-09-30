import { TournamentLink as Link } from "../TournamentLink";
import { redirect } from "next/navigation";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { getMatchControlContext, type ControlMatch } from "@/lib/match-control";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { TournamentLiveRefresh } from "@/components/TournamentLiveRefresh";
import { tournamentKind, usesFlexibleEngine, type TournamentKind } from "@/lib/tournament-kind";
import { PageIntro } from "@/components/site/PageIntro";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = { Pending: "Champ Select", Live: "Im Spiel", Scheduled: "Geplant", Finished: "Beendet", Locked: "Offen" };

export default async function TournamentLivePage() {
	const settings = await getTournamentSettings();
	if (settings.activeTournament.mode !== "live") {
		redirect(usesFlexibleEngine(settings.activeTournament) ? "/tournament" : "/tournament/archive/az-2026");
	}
	const kind = tournamentKind(settings.activeTournament);
	const ctx = await getMatchControlContext();
	const playable = ctx.matches.filter((match) => match.teamAName && match.teamBName);
	const live = playable.filter((match) => match.status === "Live" || match.status === "Pending");
	const next = playable.filter((match) => match.status === "Scheduled").slice(0, 6);

	return (
		<section className="page-section compact-top">
			<TournamentLiveRefresh />
			<PageIntro kicker="Live-Zentrale" title="Was läuft gerade?">
				{kind === "ultimate-bravery"
					? "Aktive Rolls, parallele Matches und die nächsten ausgelosten Begegnungen."
					: "Laufende Drafts, parallele Matches und die nächsten Begegnungen."}{" "}
				Die Seite aktualisiert sich automatisch.
			</PageIntro>

			<h2 className="filter-label">
				<span>Jetzt aktiv</span>
				<i>{live.length}</i>
			</h2>
			<div className="grid gap-4 lg:grid-cols-2">
				{live.length ? (
					live.map((match) => <LiveMatchCard key={match.id} match={match} active kind={kind} />)
				) : (
					<div className="empty-state min-h-40 lg:col-span-2">
						<p>Gerade läuft kein Match. Die nächsten Begegnungen erscheinen darunter.</p>
					</div>
				)}
			</div>

			<h2 className="filter-label past">
				<span>Als Nächstes</span>
				<i>{next.length}</i>
			</h2>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{next.map((match) => (
					<LiveMatchCard key={match.id} match={match} kind={kind} />
				))}
			</div>
		</section>
	);
}

function LiveMatchCard({ match, active = false, kind }: { match: ControlMatch; active?: boolean; kind: TournamentKind }) {
	const draftOpen = kind === "az" ? Boolean(match.poolAssignment) : kind === "fearless" && match.status !== "Scheduled";
	return (
		<article className={`content-panel tight ${active ? "border-[color-mix(in_srgb,var(--live)_40%,var(--line))]" : ""}`}>
			<div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
				<span>{match.round}</span>
				<span className={active ? "text-[#ffb4ad]" : undefined}>{STATUS_LABELS[match.status] ?? match.status}</span>
			</div>
			<h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">
				{match.teamALabel} <span className="text-[var(--muted)]">vs</span> {match.teamBLabel}
			</h3>
			{match.poolAssignment ? (
				<p className="mt-2 text-sm font-bold text-[var(--accent)]">
					Pools: {compactPoolLabel(match.poolAssignment.teamAPool)} gegen {compactPoolLabel(match.poolAssignment.teamBPool)}
				</p>
			) : kind === "az" ? (
				<p className="mt-2 text-sm text-[var(--muted)]">Pools noch offen</p>
			) : null}
			<div className="mt-5 flex flex-wrap gap-2">
				<Link href={`/tournament/matches/${match.id}`} className="button ghost small">
					Match-Details
				</Link>
				{draftOpen ? (
					<Link href={`/tournament/champ-select/${match.id}/spectate`} className="button ghost small">
						Draft ansehen
					</Link>
				) : null}
			</div>
		</article>
	);
}
