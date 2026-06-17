import type { Metadata } from "next";
import { pastTournamentWinners, tournament } from "@/lib/tournament-data";
import { TournamentLink as Link } from "../TournamentLink";

export const metadata: Metadata = {
	title: "Hall of Fame | Lauchgruen Turnier",
	description: "Vergangene Lauchgruen Turniersieger, Finalisten und besondere Turniermomente.",
};

const placementLabel = {
	Champion: "Champion",
	Finalist: "Finalist",
	Third: "Dritter Platz",
} as const;

export default function TournamentWinnersPage() {
	const champions = pastTournamentWinners.filter((entry) => entry.placement === "Champion");
	const podium = pastTournamentWinners.filter((entry) => entry.placement !== "Champion");

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="overflow-hidden rounded-[2.4rem] border border-amber-200/16 bg-gradient-to-br from-amber-200/12 via-lime-300/8 to-cyan-300/8 p-6 shadow-2xl shadow-black/30 sm:p-8 lg:p-10">
					<div className="inline-flex rounded-full border border-amber-200/24 bg-amber-200/10 px-4 py-2 text-xs font-black uppercase tracking-[0.32em] text-amber-100/84">
						Hall of Fame
					</div>
					<h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.94] tracking-tight text-emerald-50 sm:text-6xl">Die Lauchgruen Turnier-Champions.</h1>
					<div className="mt-8 grid gap-3 sm:grid-cols-3">
						<Stat label="Turniere" value={String(new Set(pastTournamentWinners.map((entry) => entry.season)).size)} />
						<Stat label="Champions" value={String(champions.length)} />
						<Stat label="Aktuell" value={tournament.season} />
					</div>
				</div>

				{pastTournamentWinners.length === 0 ? (
					<div className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-black/20 sm:p-8">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Noch keine abgeschlossenen Turniere</div>
						<h2 className="mt-3 text-3xl font-black text-emerald-50">Der erste Eintrag wartet auf den Gewinner von {tournament.season}.</h2>
						<div className="mt-6 flex flex-wrap gap-3">
							<Link
								href="/tournament/playoffs"
								className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/20 transition hover:-translate-y-0.5"
							>
								Bracket ansehen
							</Link>
							<Link
								href="/tournament/teams"
								className="rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
							>
								Teams ansehen
							</Link>
						</div>
					</div>
				) : (
					<div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
						<section className="grid gap-4">
							{champions.map((entry) => (
								<WinnerCard key={entry.id} entry={entry} featured />
							))}
						</section>

						<aside className="grid content-start gap-4">
							{podium.map((entry) => (
								<WinnerCard key={entry.id} entry={entry} />
							))}
						</aside>
					</div>
				)}
			</section>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-3xl border border-white/10 bg-black/18 p-5">
			<div className="text-xs font-black uppercase tracking-[0.26em] text-amber-100/58">{label}</div>
			<div className="mt-3 text-lg font-black text-emerald-50">{value}</div>
		</div>
	);
}

function WinnerCard({ entry, featured = false }: { entry: (typeof pastTournamentWinners)[number]; featured?: boolean }) {
	return (
		<article className={`overflow-hidden rounded-[2rem] border bg-white/[0.045] shadow-xl shadow-black/20 ${featured ? "border-amber-200/24" : "border-white/10"}`}>
			<div className="border-b border-white/10 bg-gradient-to-r from-amber-200/12 via-lime-300/8 to-transparent p-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<span className="rounded-full border border-amber-200/24 bg-amber-200/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
						{placementLabel[entry.placement]}
					</span>
					<span className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/46">{entry.date}</span>
				</div>
				<h2 className="mt-4 text-3xl font-black text-emerald-50">{entry.teamName}</h2>
				<p className="mt-2 text-sm font-bold text-lime-100/70">
					{entry.tournamentName} · {entry.season}
				</p>
			</div>

			<div className="p-5">
				<div className="grid gap-3 sm:grid-cols-2">
					<Info label="Spiel" value={entry.game} />
					<Info label="Format" value={entry.format} />
					{entry.captain ? <Info label="Captain" value={entry.captain} /> : null}
				</div>

				<div className="mt-5">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/58">Roster</div>
					<div className="mt-3 flex flex-wrap gap-2">
						{entry.roster.map((player) => (
							<span key={player} className="rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-sm font-bold text-emerald-100/78">
								{player}
							</span>
						))}
					</div>
				</div>

				{entry.note ? <p className="mt-5 rounded-2xl border border-lime-200/12 bg-lime-200/[0.055] p-4 text-sm leading-7 text-emerald-100/70">{entry.note}</p> : null}
			</div>
		</article>
	);
}

function Info({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-white/8 bg-black/16 p-4">
			<div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/42">{label}</div>
			<div className="mt-2 text-sm font-black text-emerald-50">{value}</div>
		</div>
	);
}
