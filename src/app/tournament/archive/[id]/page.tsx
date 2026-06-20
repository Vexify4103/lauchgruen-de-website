import { notFound } from "next/navigation";
import { BracketTree } from "@/components/BracketTree";
import { compactPoolLabel } from "@/lib/tournament-wheel";
import { getTournamentArchive, type TournamentArchive, type TournamentArchiveSnapshot } from "@/lib/tournament-next";
import { TournamentLink as Link } from "../../TournamentLink";

type ArchiveView = "overview" | "teams" | "groups" | "playoffs" | "pools";
const views: Array<{ id: ArchiveView; label: string }> = [
	{ id: "overview", label: "Übersicht" },
	{ id: "teams", label: "Teams" },
	{ id: "groups", label: "Gruppen" },
	{ id: "playoffs", label: "Playoffs" },
	{ id: "pools", label: "Pools & Drafts" },
];
type Snapshot = TournamentArchiveSnapshot;

export default async function TournamentArchivePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
	const [{ id }, query] = await Promise.all([params, searchParams]);
	const archive = await getTournamentArchive(id);
	if (!archive) notFound();
	const snapshot = archive.snapshot;
	const view = views.some((entry) => entry.id === query.view) ? (query.view as ArchiveView) : "overview";

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="rounded-[2.4rem] border border-amber-200/18 bg-gradient-to-br from-amber-200/12 via-lime-300/8 to-cyan-300/8 p-6 shadow-2xl shadow-black/30 sm:p-8">
					<div className="flex flex-wrap items-start justify-between gap-5">
						<div>
							<div className="text-xs font-black uppercase tracking-[0.3em] text-amber-100/78">Turnier-Archiv</div>
							<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">{archive.title}</h1>
							<p className="mt-3 text-sm font-bold text-lime-100/72">{archive.season} · {archive.dateLabel} · {archive.format}</p>
						</div>
						<Link href="/tournament/winners" className="rounded-2xl border border-white/14 bg-black/18 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Archiv & Hall of Fame</Link>
					</div>
					<div className="mt-6 flex flex-wrap gap-2">
						{views.map((entry) => (
							<Link
								key={entry.id}
								href={`/tournament/archive/${archive.id}${entry.id === "overview" ? "" : `?view=${entry.id}`}`}
								className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${view === entry.id ? "bg-amber-200 text-emerald-950" : "border border-white/12 bg-white/[0.04] text-emerald-100/72"}`}
							>
								{entry.label}
							</Link>
						))}
					</div>
				</div>

				{view === "overview" ? <Overview archive={archive} hasSnapshot={Boolean(snapshot)} /> : null}
				{view === "teams" && snapshot ? <Teams teams={snapshot.teams} /> : null}
				{view === "groups" && snapshot ? <Groups snapshot={snapshot} /> : null}
				{view === "playoffs" && snapshot ? <Playoffs matches={snapshot.playoffs} /> : null}
				{view === "pools" && snapshot ? <Pools snapshot={snapshot} /> : null}
				{view !== "overview" && !snapshot ? <MissingSnapshot /> : null}
			</section>
		</div>
	);
}

function Overview({ archive, hasSnapshot }: { archive: TournamentArchive; hasSnapshot: boolean }) {
	return (
		<div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
			<article className="rounded-[2rem] border border-amber-200/18 bg-white/[0.045] p-6 shadow-xl shadow-black/20">
				<div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/72">Champion</div>
				<h2 className="mt-3 text-4xl font-black text-emerald-50">{archive.championTeam}</h2>
				{archive.finalistTeam ? <p className="mt-2 text-sm font-bold text-emerald-100/62">Finale gegen {archive.finalistTeam}</p> : null}
				<div className="mt-6 flex flex-wrap gap-2">{archive.championRoster.map((player) => <span key={player} className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-sm font-bold text-emerald-100/78">{player}</span>)}</div>
				{archive.note ? <p className="mt-6 rounded-2xl border border-lime-200/14 bg-lime-200/[0.06] p-4 text-sm leading-7 text-emerald-100/72">{archive.note}</p> : null}
			</article>
			<article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/20">
				<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Archivstatus</div>
				<h2 className="mt-3 text-2xl font-black text-emerald-50">{hasSnapshot ? "Vollständiger Snapshot gesichert" : "Hall-of-Fame-Eintrag"}</h2>
				<p className="mt-3 text-sm leading-7 text-emerald-100/62">{hasSnapshot ? "Teams, Gruppen, Bracket, Pool-Ziehungen und Drafts zeigen den gespeicherten Turnierstand und ändern sich nicht mehr." : "Für diesen älteren Eintrag wurden noch keine vollständigen Matchdaten archiviert."}</p>
				{archive.vodUrl ? <a href={archive.vodUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950">VOD ansehen</a> : null}
			</article>
		</div>
	);
}

function Teams({ teams }: { teams: Snapshot["teams"] }) {
	return <div className="mt-6 grid gap-4 md:grid-cols-2">{teams.map((team) => <article key={team.id} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"><div className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/62">Gruppe {team.group} · Seed {team.seed}</div><h2 className="mt-2 text-2xl font-black text-emerald-50">{team.name}</h2><p className="mt-1 text-sm font-bold text-emerald-100/56">Captain: {team.captain}</p><div className="mt-4 grid gap-2">{team.players.map((player) => <div key={player.riotId} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/18 px-3 py-2"><span className="font-bold text-emerald-50">{player.name}</span><span className="text-xs font-black uppercase tracking-[0.14em] text-lime-100/70">{player.role}</span></div>)}</div></article>)}</div>;
}

function Groups({ snapshot }: { snapshot: Snapshot }) {
	return <div className="mt-6 grid gap-5 lg:grid-cols-2">{(["A", "B"] as const).map((group) => <article key={group} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"><h2 className="text-2xl font-black text-lime-100">Gruppe {group}</h2><div className="mt-4 grid gap-2">{snapshot.standings[group].map((standing) => <div key={standing.team.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/18 px-3 py-2"><span className="font-black text-emerald-50">#{standing.rank} {standing.team.name}</span><span className="text-sm font-black text-lime-100">{standing.wins}-{standing.losses}</span></div>)}</div><div className="mt-5 grid gap-2">{snapshot.groupMatches.filter((match) => match.group === group).map((match) => { const score = snapshot.matches[match.id]; return <div key={match.id} className="flex items-center justify-between gap-3 text-sm text-emerald-100/70"><span className="truncate">{match.teamA} vs {match.teamB}</span><strong>{score?.scoreA ?? "–"}:{score?.scoreB ?? "–"}</strong></div>; })}</div></article>)}</div>;
}

function Playoffs({ matches }: { matches: Snapshot["playoffs"] }) {
	return <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/20 sm:p-5"><BracketTree matches={matches} /></div>;
}

function Pools({ snapshot }: { snapshot: Snapshot }) {
	return <div className="mt-6 grid gap-5 lg:grid-cols-2"><article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5"><h2 className="text-2xl font-black text-emerald-50">Gezogene Pools</h2><div className="mt-4 grid gap-2">{snapshot.wheel.history.map((entry) => <div key={`${entry.matchId}-${entry.spunAt}`} className="rounded-xl border border-white/8 bg-black/18 p-3 text-sm"><strong className="text-lime-100">{entry.matchId}</strong><span className="ml-2 text-emerald-100/68">{entry.teamAName}: {compactPoolLabel(entry.teamAPool)} · {entry.teamBName}: {compactPoolLabel(entry.teamBPool)}</span></div>)}</div></article><article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5"><h2 className="text-2xl font-black text-emerald-50">Draft-Historie</h2><div className="mt-4 grid gap-2">{snapshot.drafts.map((draft) => <details key={draft.matchId} className="rounded-xl border border-white/8 bg-black/18 p-3"><summary className="cursor-pointer font-black text-lime-100">{draft.matchId} · {draft.actions.length} Aktionen</summary><div className="mt-3 flex flex-wrap gap-2">{draft.actions.map((action, index) => <span key={`${action.champion}-${index}`} className="rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1 text-xs font-bold text-emerald-100/72">{action.side === "teamA" ? "A" : "B"} {action.kind === "ban" ? "Ban" : "Pick"}: {action.champion}</span>)}</div></details>)}</div></article></div>;
}

function MissingSnapshot() { return <div className="mt-6 rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.06] p-6 text-sm leading-7 text-amber-50">Für diesen älteren Hall-of-Fame-Eintrag existiert noch kein vollständiger Turnier-Snapshot.</div>; }
