import { TournamentLink as Link } from "./TournamentLink";
import { applicationSteps, azLetterPools, pastTournamentWinners, playoffMatches, tournament } from "@/lib/tournament-data";
import { areTournamentApplicationsOpen } from "@/lib/tournament-application-deadline";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentSettings } from "@/lib/tournament-settings";

const formatSteps = [
	{
		number: "01",
		label: "Faire Teams",
		text: "Riot-Rang, Main Rolle und Wunschrollen helfen der Orga bei einer möglichst ausgeglichenen Einteilung.",
	},
	{
		number: "02",
		label: "Pool pro Match",
		text: "Das Glücksrad lost jedem Team einen eigenen A-Z Pool zu. Nur diese Champions dürfen gepickt werden.",
	},
	{
		number: "03",
		label: "Zweiter Spieltag",
		text: "Alle Teams ziehen ins Endbracket ein. Platzierung, Extra-Bans und Einstiegsrunde hängen von der Gruppe ab.",
	},
];

export default async function TournamentHomePage() {
	const [{ teams, groupMatches }, settings] = await Promise.all([getTournamentContext(), getTournamentSettings()]);
	const applicationsOpen = areTournamentApplicationsOpen(settings.applicationsOpen, new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline);

	return (
		<div className="px-5 py-8 sm:py-12">
			<section className="mx-auto w-full max-w-7xl">
				<div className="relative isolate overflow-hidden rounded-[2.5rem] border border-lime-200/14 bg-[#0a1a11]/92 shadow-2xl shadow-black/35">
					<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(163,230,53,0.12),transparent_28%),radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.08),transparent_30%)]" />
					<div className="relative grid lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
						<div className="flex flex-col justify-between p-7 sm:p-10 lg:p-12">
							<div>
								<div className="flex flex-wrap items-center gap-3">
									<span className="rounded-full border border-lime-200/20 bg-lime-200/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-lime-100/82">
										{tournament.season}
									</span>
									<span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.07] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/68">
										EUW · Community Turnier
									</span>
								</div>

								<h1 className="mt-8 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.055em] text-emerald-50 sm:text-6xl lg:text-[5.25rem]">
									Ein Buchstabe.
									<span className="block bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">Ein Champion-Pool.</span>
									Sehr viel Chaos.
								</h1>
								<p className="mt-6 max-w-2xl text-base leading-8 text-emerald-100/68 sm:text-lg">
									Zwei Abende League of Legends mit fair ausgelosten Teams, einem eigenen Champion-Pool pro Match und einem Endbracket, in dem jede
									Gruppenplatzierung zählt.
								</p>

								<div className="mt-8 flex flex-wrap gap-3">
									{applicationsOpen ? (
										<Link
											href="/tournament/apply"
											className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-6 py-4 text-sm font-black uppercase tracking-[0.17em] text-[#07110c] shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5"
										>
											Jetzt bewerben
										</Link>
									) : (
										<span className="cursor-not-allowed rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-4 text-sm font-black uppercase tracking-[0.17em] text-emerald-100/32">
											Bewerbungen geschlossen
										</span>
									)}
									<Link
										href="/tournament/schedule"
										className="rounded-2xl border border-white/14 bg-white/[0.045] px-6 py-4 text-sm font-black uppercase tracking-[0.17em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
									>
										Zeitplan
									</Link>
								</div>
							</div>

							<div className="mt-10 grid gap-2 border-t border-white/8 pt-5 sm:grid-cols-3">
								<HeroFact label="Format" value="Gruppen + Endbracket" />
								<HeroFact label="Bewerbungsschluss" value="18.06. · 20:00" />
								<HeroFact label="Teilnahme" value="Beide Spieltage" />
							</div>
						</div>

						<div className="relative overflow-hidden border-t border-white/8 bg-[#07140d]/72 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
							<div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border border-lime-200/10" />
							<div className="pointer-events-none absolute -right-12 -top-12 size-52 rounded-full border border-cyan-200/10" />

							<div className="relative flex h-full flex-col justify-between gap-7">
								<div>
									<div className="flex items-center justify-between gap-4">
										<span className="text-[10px] font-black uppercase tracking-[0.3em] text-lime-200/54">Kunterbuntes A-Z Turnier</span>
										<span className="size-2 rounded-full bg-lime-300 shadow-[0_0_18px_rgba(190,242,100,0.8)]" />
									</div>

									<div className="mt-8 rounded-[2rem] border border-lime-200/14 bg-[linear-gradient(145deg,rgba(190,242,100,0.1),rgba(34,211,238,0.04)_55%,rgba(0,0,0,0.2))] p-6 shadow-2xl shadow-black/20">
										<div className="flex items-end justify-between gap-4">
											<div>
												<div className="text-[5.4rem] font-black leading-none tracking-[-0.1em] text-lime-100 sm:text-[6.8rem]">
													A<span className="text-emerald-100/22">→</span>Z
												</div>
												<p className="mt-3 max-w-xs text-sm leading-6 text-emerald-100/58">
													Zwei Teams. Zwei gezogene Pools. Keine Wiederholung bis zum Reset am zweiten Spieltag.
												</p>
											</div>
											<div className="hidden size-20 shrink-0 place-items-center rounded-full border border-dashed border-lime-200/24 bg-lime-200/[0.05] text-center text-[9px] font-black uppercase tracking-[0.16em] text-lime-100/64 sm:grid">
												Pool
												<br />
												Draw
											</div>
										</div>

										<div className="mt-6 flex flex-wrap gap-2">
											{["A", "B–D", "E–G", "H–J", "K", "L–M"].map((pool) => (
												<span
													key={pool}
													className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-emerald-100/58"
												>
													{pool}
												</span>
											))}
											<span className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-emerald-100/34">
												+6
											</span>
										</div>
									</div>
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									<DateCard day="Freitag" date="19. Juni" time="18:00 CEST" />
									<DateCard day="Samstag" date="20. Juni" time="16:00 CEST" />
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
					<section className="h-full rounded-[2rem] border border-lime-200/12 bg-white/[0.04] p-6 shadow-xl shadow-black/20 sm:p-8">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">So funktioniert das Turnier</div>
						<div className="mt-6 grid gap-3 md:grid-cols-3">
							{formatSteps.map((step) => (
								<article key={step.number} className="rounded-[1.5rem] border border-white/8 bg-black/18 p-5">
									<div className="text-3xl font-black text-lime-200/28">{step.number}</div>
									<h2 className="mt-5 text-xl font-black text-emerald-50">{step.label}</h2>
									<p className="mt-3 text-sm leading-6 text-emerald-100/62">{step.text}</p>
								</article>
							))}
						</div>
					</section>

					<aside className="h-full rounded-[2rem] border border-cyan-200/12 bg-cyan-300/[0.045] p-6 shadow-xl shadow-black/20 sm:p-8">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/64">Bewerbung</div>
						<div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
							{applicationSteps.map((step, index) => (
								<div key={step} className="flex items-start gap-3">
									<span className="grid size-7 shrink-0 place-items-center rounded-lg border border-cyan-200/16 bg-cyan-300/8 text-[10px] font-black text-cyan-100">
										{index + 1}
									</span>
									<p className="pt-0.5 text-sm leading-6 text-emerald-100/66">{step}</p>
								</div>
							))}
						</div>
						<div className="mt-6 rounded-2xl border border-amber-200/16 bg-amber-200/[0.06] px-4 py-3 text-xs font-bold leading-5 text-amber-50/76">
							Verbindlich für beide Tage. Discord-Mitgliedschaft und ein verifizierter Riot-Account sind erforderlich.
						</div>
					</aside>
				</div>

				<div className="mt-5 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
					<section className="flex h-full flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/20">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/60">A-Z Pools</div>
						<h2 className="mt-3 text-3xl font-black tracking-tight text-emerald-50">Das Rad bestimmt dein Champion-Roster.</h2>
						<p className="mt-3 text-sm leading-7 text-emerald-100/64">
							Jeder Pool gilt nur für ein Team in einem Match. Gespielte Pools verschwinden bis zum Reset am zweiten Spieltag aus diesem Team-Rad.
						</p>
						<Link
							href="/tournament/pools"
							className="mt-auto w-fit rounded-xl border border-lime-200/22 bg-lime-200/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-lime-50 transition hover:border-lime-200/40"
						>
							Champions pro Pool
						</Link>
					</section>

					<section className="h-full rounded-[2rem] border border-lime-200/10 bg-[#0a1810]/82 p-5 shadow-xl shadow-black/20">
						<div className="grid h-full grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
							{azLetterPools.map((pool, index) => (
								<div
									key={pool}
									className="group rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-4 text-center transition hover:border-lime-200/24 hover:bg-lime-200/[0.07]"
								>
									<div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-100/32">Pool {String(index + 1).padStart(2, "0")}</div>
									<div className="mt-2 text-lg font-black text-lime-100">{pool}</div>
								</div>
							))}
						</div>
					</section>
				</div>

				<section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<DashboardCard href="/tournament/teams" label="Teams" value={teams.length.toString()} title="Rosters" text="Spieler, Rollen und OP.GG Multisearch." />
					<DashboardCard
						href="/tournament/groups"
						label="Gruppen"
						value={groupMatches.length.toString()}
						title="Matches"
						text="Hin- und Rückrunde in zwei Vierergruppen."
					/>
					<DashboardCard
						href="/tournament/playoffs"
						label="Playoffs"
						value={playoffMatches.length.toString()}
						title="Bracket-Spiele"
						text="Alle Teams spielen am Samstag weiter."
					/>
					<DashboardCard
						href="/tournament/winners"
						label="Hall of Fame"
						value={pastTournamentWinners.length.toString()}
						title="Champions"
						text="Sieger, Finalisten und Turniermomente."
					/>
				</section>
			</section>
		</div>
	);
}

function HeroFact({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/36">{label}</div>
			<div className="mt-1 text-sm font-black text-emerald-50">{value}</div>
		</div>
	);
}

function DateCard({ day, date, time }: { day: string; date: string; time: string }) {
	return (
		<div className="rounded-[1.4rem] border border-white/12 bg-[#07110c]/82 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
			<div className="text-[9px] font-black uppercase tracking-[0.22em] text-lime-200/58">{day}</div>
			<div className="mt-1 text-xl font-black text-emerald-50">{date}</div>
			<div className="mt-1 text-xs font-bold text-cyan-100/66">{time}</div>
		</div>
	);
}

function DashboardCard({ href, label, value, title, text }: { href: string; label: string; value: string; title: string; text: string }) {
	return (
		<Link
			href={href}
			className="group rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/18 transition hover:-translate-y-1 hover:border-lime-200/26"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200/58">{label}</div>
				<div className="text-3xl font-black text-lime-200/24">{value}</div>
			</div>
			<h2 className="mt-5 text-xl font-black text-emerald-50 group-hover:text-lime-100">{title}</h2>
			<p className="mt-2 text-sm leading-6 text-emerald-100/58">{text}</p>
		</Link>
	);
}
