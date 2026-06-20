import { notFound } from "next/navigation";
import Image from "next/image";
import { TournamentLink as Link } from "../../TournamentLink";
import { getChampionPools } from "@/lib/champion-pools";
import { getDraftState } from "@/lib/tournament-draft";
import { createDraftSequence, draftComplete } from "@/lib/tournament-draft-shared";
import { getMatchControlContext } from "@/lib/match-control";
import { formatGameDuration } from "@/lib/match-duration";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const [ctx, pools, draft] = await Promise.all([getMatchControlContext(), getChampionPools(), getDraftState(id)]);
	const match = ctx.matches.find((entry) => entry.id === id);
	if (!match) notFound();
	const sequence = createDraftSequence(bonusBanSideForMatch(match));
	const complete = draftComplete(draft, sequence);
	const byName = new Map(pools.flatMap((pool) => pool.champions).map((champion) => [champion.name, champion]));
	const bluePicks = draft.actions.filter((action) => action.side === "teamA" && action.kind === "pick");
	const redPicks = draft.actions.filter((action) => action.side === "teamB" && action.kind === "pick");
	const blueBans = draft.actions.filter((action) => action.side === "teamA" && action.kind === "ban");
	const redBans = draft.actions.filter((action) => action.side === "teamB" && action.kind === "ban");

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-6xl">
				<Link href="/tournament/live" className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/70 hover:text-lime-100">← Turnier-Zentrale</Link>
				<div className="mt-5 rounded-[2.4rem] border border-white/10 bg-gradient-to-br from-lime-200/[0.09] via-white/[0.04] to-cyan-300/[0.05] p-7 shadow-2xl shadow-black/28 sm:p-10">
					<div className="flex flex-wrap items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.24em] text-lime-200/62"><span>{match.phase === "groups" ? "Gruppenphase" : "Playoffs"} · {match.round}</span><span>{match.status}</span></div>
					<h1 className="mt-5 text-4xl font-black tracking-tight text-emerald-50 sm:text-6xl">{match.teamALabel} <span className="text-lime-200/54">vs</span> {match.teamBLabel}</h1>
					<div className="mt-6 grid gap-3 sm:grid-cols-3"><Stat label="Ergebnis" value={match.scoreA !== undefined && match.scoreB !== undefined ? `${match.scoreA} : ${match.scoreB}` : "Noch offen"} /><Stat label="Spielzeit" value={formatGameDuration(match.gameDurationSeconds) || "Noch offen"} /><Stat label="Draft" value={complete ? "Abgeschlossen" : `${draft.actions.length}/${sequence.length} Aktionen`} /></div>
				</div>

				<div className="mt-6 grid gap-5 lg:grid-cols-2">
					<TeamDraft title="Blue Side" team={match.blueSide === "teamA" ? match.teamALabel : match.teamBLabel} pool={match.blueSide === "teamA" ? match.poolAssignment?.teamAPool : match.poolAssignment?.teamBPool} picks={bluePicks} bans={blueBans} byName={byName} />
					<TeamDraft title="Red Side" team={match.blueSide === "teamA" ? match.teamBLabel : match.teamALabel} pool={match.blueSide === "teamA" ? match.poolAssignment?.teamBPool : match.poolAssignment?.teamAPool} picks={redPicks} bans={redBans} byName={byName} />
				</div>
				<div className="mt-6 flex flex-wrap gap-3">
					{match.poolAssignment ? <Link href={`/tournament/champ-select/${match.id}/spectate`} className="rounded-2xl bg-sky-300 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">Draft ansehen</Link> : null}
					<Link href="/tournament/schedule" className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Zeitplan</Link>
				</div>
			</section>
		</div>
	);
}

function TeamDraft({ title, team, pool, picks, bans, byName }: { title: string; team: string; pool?: string; picks: Array<{ champion: string }>; bans: Array<{ champion: string }>; byName: Map<string, { imageUrl: string }> }) {
	return <article className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"><div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/60">{title}</div><h2 className="mt-2 text-2xl font-black text-emerald-50">{team}</h2><p className="mt-2 text-sm font-bold text-emerald-100/60">{pool ? `Champion-Pool: ${compactPoolLabel(pool)}` : "Pool noch offen"}</p><DraftRow label="Picks" actions={picks} byName={byName} /><DraftRow label="Bans" actions={bans} byName={byName} banned /></article>;
}

function DraftRow({ label, actions, byName, banned = false }: { label: string; actions: Array<{ champion: string }>; byName: Map<string, { imageUrl: string }>; banned?: boolean }) {
	return <div className="mt-5"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/46">{label}</div><div className="mt-2 flex flex-wrap gap-2">{actions.length ? actions.map((action) => <div key={action.champion} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">{byName.get(action.champion)?.imageUrl ? <Image src={byName.get(action.champion)!.imageUrl} alt="" width={48} height={48} className="size-12 object-cover" /> : null}<span className="block max-w-20 truncate px-1 py-1 text-center text-[9px] font-black text-emerald-50">{action.champion}</span>{banned ? <span className="absolute inset-x-[-20%] top-5 h-0.5 -rotate-45 bg-red-200" /> : null}</div>) : <span className="text-sm font-bold text-emerald-100/42">Noch keine</span>}</div></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-black/18 p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/42">{label}</div><div className="mt-2 text-xl font-black text-lime-100">{value}</div></div>; }
