import { TournamentLink as Link } from "../TournamentLink";
import { redirect } from "next/navigation";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { getMatchControlContext } from "@/lib/match-control";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { TournamentLiveRefresh } from "@/components/TournamentLiveRefresh";

export const dynamic = "force-dynamic";

export default async function TournamentLivePage() {
	if ((await getTournamentSettings()).activeTournament.mode === "teaser") redirect("/tournament/archive/az-2026");
	const ctx = await getMatchControlContext();
	const playable = ctx.matches.filter((match) => match.teamAName && match.teamBName);
	const live = playable.filter((match) => match.status === "Live" || match.status === "Pending");
	const next = playable.filter((match) => match.status === "Scheduled").slice(0, 6);

	return (
		<div className="px-5 py-10 sm:py-14">
			<TournamentLiveRefresh />
			<section className="mx-auto w-full max-w-7xl">
				<div className="rounded-[2.4rem] border border-red-300/18 bg-gradient-to-br from-red-500/10 via-emerald-400/[0.07] to-cyan-300/[0.06] p-7 shadow-2xl shadow-black/30 sm:p-10">
					<div className="inline-flex items-center gap-2 rounded-full border border-red-300/24 bg-red-500/12 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-red-100">
						<span className="size-2 animate-pulse rounded-full bg-red-300" /> Turnier-Zentrale
					</div>
					<h1 className="mt-6 text-5xl font-black tracking-tight text-emerald-50 sm:text-6xl">Was läuft gerade?</h1>
					<p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100/68">Aktive Drafts, parallele Matches und die nächsten Begegnungen. Aktualisiert sich automatisch.</p>
				</div>

				<section className="mt-7">
					<h2 className="text-xs font-black uppercase tracking-[0.28em] text-red-100/72">Jetzt aktiv</h2>
					<div className="mt-4 grid gap-4 lg:grid-cols-2">
						{live.length ? live.map((match) => <LiveMatchCard key={match.id} match={match} active />) : <Empty text="Gerade läuft kein Match. Die nächsten Begegnungen erscheinen darunter." />}
					</div>
				</section>

				<section className="mt-9">
					<h2 className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Als Nächstes</h2>
					<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{next.map((match) => <LiveMatchCard key={match.id} match={match} />)}
					</div>
				</section>
			</section>
		</div>
	);
}

function LiveMatchCard({ match, active = false }: { match: Awaited<ReturnType<typeof getMatchControlContext>>["matches"][number]; active?: boolean }) {
	return (
		<article className={`rounded-[1.8rem] border p-5 shadow-xl shadow-black/20 ${active ? "border-red-300/28 bg-red-500/[0.08]" : "border-white/10 bg-white/[0.045]"}`}>
			<div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/54">
				<span>{match.round}</span><span>{match.status}</span>
			</div>
			<h3 className="mt-4 text-2xl font-black text-emerald-50">{match.teamALabel} <span className="text-lime-200/54">vs</span> {match.teamBLabel}</h3>
			{match.poolAssignment ? <p className="mt-3 text-sm font-bold text-lime-100/76">Pools: {compactPoolLabel(match.poolAssignment.teamAPool)} gegen {compactPoolLabel(match.poolAssignment.teamBPool)}</p> : <p className="mt-3 text-sm font-bold text-emerald-100/46">Pools noch offen</p>}
			<div className="mt-5 flex flex-wrap gap-2">
				<Link href={`/tournament/matches/${match.id}`} className="rounded-xl border border-white/12 bg-black/18 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-100 hover:text-lime-100">Match-Details</Link>
				{match.poolAssignment ? <Link href={`/tournament/champ-select/${match.id}/spectate`} className="rounded-xl border border-sky-200/20 bg-sky-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-sky-100">Draft ansehen</Link> : null}
			</div>
		</article>
	);
}

function Empty({ text }: { text: string }) {
	return <div className="rounded-[1.8rem] border border-white/10 bg-black/18 p-5 text-sm font-bold text-emerald-100/52">{text}</div>;
}
