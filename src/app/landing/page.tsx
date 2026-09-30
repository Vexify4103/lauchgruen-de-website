import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/SiteFooter";
import { ApexHeader } from "@/components/site/ApexHeader";
import Link from "next/link";
import { normalizeTwitchLogin } from "@/lib/community-overlay-config";
import { getSiteUrls } from "@/lib/site-urls";
import { LiveStatus } from "./LiveStatus";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { formatTournamentDay } from "@/lib/tournament-presentation";
import type { TournamentKind } from "@/lib/tournament-kind";

const TOURNAMENT_TEASERS: Record<TournamentKind, string> = {
	fearless: "Jeder Champion zählt nur einmal. Zwei Abende, an denen euer Champion-Pool mit jeder Runde kleiner wird.",
	"ultimate-bravery": "Zufällige Champions, zufällige Builds und zwei Abende, an denen ein guter Plan vermutlich trotzdem nicht schadet.",
	az: "Ein Buchstabe, ein Champion-Pool und sehr viel Chaos.",
};
import { RecentClips } from "./RecentClips";

const TWITCH_LOGIN = "lauchgruen";
const TWITCH_URL = `https://twitch.tv/${TWITCH_LOGIN}`;
const QUIZ_ENABLED = process.env.QUIZ_ENABLED !== "false";

const STREAM_GAMES = [
	{ index: "01", name: "League of Legends", detail: "Ranked · Community Cups" },
	{ index: "02", name: "Teamfight Tactics", detail: "Sets · Meta · Grind" },
	{ index: "03", name: "Chess", detail: "Blitz · Puzzle · Chat" },
];

export const metadata: Metadata = {
	title: { absolute: "Lauchgruen · Stream, Turniere und Shows" },
	description: "Der Stream-Hub für Lauchgruen: Twitch, Community-Turniere, Quizshows und kostenlose OBS-Tools.",
};

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const [requestHeaders, rawSearchParams, settings] = await Promise.all([headers(), searchParams, getTournamentSettings()]);
	const tournament = settings.activeTournament;
	const tournamentDays = [formatTournamentDay(settings.ultimateBravery.startAt, false), formatTournamentDay(settings.ultimateBravery.dayTwoStartAt, false)].filter(Boolean);
	const tournamentLabel =
		tournament.mode === "live" ? "Community-Turnier · jetzt live" : tournament.mode === "finished" ? "Letztes Community-Turnier" : "Nächstes Community-Turnier";
	const siteUrls = getSiteUrls(requestHeaders.get("host"));
	const requestedPreview = Array.isArray(rawSearchParams.previewTwitch) ? rawSearchParams.previewTwitch[0] : rawSearchParams.previewTwitch;
	const previewLogin = process.env.NODE_ENV === "development" ? normalizeTwitchLogin(requestedPreview ?? "") : "";
	const liveStatusLogin = previewLogin || TWITCH_LOGIN;

	return (
		<div className="relative min-h-screen overflow-hidden bg-[#020b07] text-emerald-50">
			<a href="#main-content" className="skip-link">
				Zum Inhalt
			</a>
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_4%,rgba(163,230,53,0.12),transparent_29%),radial-gradient(circle_at_92%_26%,rgba(34,211,238,0.09),transparent_27%),linear-gradient(155deg,#020b07_0%,#04140c_48%,#020906_100%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]"
			/>

			<ApexHeader apexUrl={siteUrls.apex} tournamentUrl={siteUrls.tournament} brand="stream" />

			<main id="main-content" tabIndex={-1} className="relative z-10 mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-5 py-6 sm:px-8 sm:py-10 lg:gap-12">
				<section id="live" className="landing-reveal grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1.14fr)_minmax(25rem,0.86fr)]">
					<div className="relative isolate flex min-h-[32rem] overflow-hidden rounded-[2.6rem] border border-lime-100/13 bg-[linear-gradient(145deg,#0a2013_0%,#06160e_52%,#05120f_100%)] p-7 shadow-2xl shadow-black/35 sm:p-10 lg:p-12">
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(190,242,100,0.15),transparent_27%),radial-gradient(circle_at_76%_92%,rgba(34,211,238,0.1),transparent_31%)]"
						/>
						<div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-80 rounded-full border border-lime-100/[0.07]" />
						<div aria-hidden className="pointer-events-none absolute -right-3 top-8 size-52 rounded-full border border-cyan-100/[0.06]" />
						<div aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-1 w-2/3 bg-gradient-to-r from-lime-300 via-emerald-300 to-transparent" />

						<div className="relative flex w-full flex-col">
							<div className="flex items-center justify-between gap-4">
								<span className="inline-flex items-center gap-2 rounded-full border border-lime-200/18 bg-lime-200/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.27em] text-lime-100/72">
									<span className="size-1.5 rounded-full bg-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.65)]" /> Stream · Community
								</span>
								<span className="font-mono text-[9px] font-black tracking-[0.22em] text-emerald-100/25">LG / 2026</span>
							</div>

							<div className="my-auto py-10">
								<div className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-100/48">League · TFT · Chess</div>
								<h1 className="mt-5 max-w-[10ch] text-5xl font-black leading-[0.92] tracking-[-0.058em] text-emerald-50 sm:text-6xl xl:text-[5.35rem]">
									Gute Games.
									<span className="block bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">Leichtes Chaos.</span>
								</h1>
								<p className="mt-6 max-w-[34rem] text-base leading-8 text-emerald-100/58">
									Luca streamt, veranstaltet Community-Turniere und lässt den Chat gelegentlich bessere Entscheidungen treffen.
								</p>
							</div>

							<div className="flex flex-col gap-4 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex flex-wrap gap-3">
									<a
										href={TWITCH_URL}
										target="_blank"
										rel="noreferrer"
										className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#06110b] shadow-lg shadow-lime-300/12 transition hover:-translate-y-0.5"
									>
										Zu Twitch
									</a>
									<Link
										href={siteUrls.tournament}
										className="rounded-xl border border-white/12 bg-white/[0.035] px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
									>
										Turnier ansehen
									</Link>
								</div>
								<span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-100/30">Auf Twitch keine Runde verpassen</span>
							</div>
						</div>
					</div>

					<div className="relative min-h-0">
						{previewLogin ? (
							<div className="pointer-events-none absolute -top-3 right-5 z-20 rounded-full border border-amber-100/25 bg-amber-200/90 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-amber-950 shadow-lg">
								Lokale Vorschau · @{previewLogin}
							</div>
						) : null}
						<LiveStatus login={liveStatusLogin} />
					</div>
				</section>

				<section id="projekte" className="landing-reveal landing-delay-1 scroll-mt-24">
					<SectionHeading
						kicker="Aktuell bei Lauchgruen"
						title="Mitmachen statt nur zuschauen."
						text={`${tournament.name} ist das aktuelle Community-Turnier. Wer selbst streamt, findet darunter außerdem das kostenlose League-Overlay.`}
					/>

					<div className="mt-7 grid gap-4 lg:grid-cols-12">
						<Link
							href={siteUrls.tournament}
							className="group relative isolate min-h-[27rem] overflow-hidden rounded-[2.2rem] border border-lime-200/16 bg-[#091c11] p-7 shadow-xl shadow-black/25 transition hover:-translate-y-1 hover:border-lime-200/32 sm:p-9 lg:col-span-7"
						>
							<div
								aria-hidden
								className="pointer-events-none absolute -bottom-16 -right-8 text-[12rem] font-black leading-none tracking-[-0.12em] text-lime-100/[0.035]"
							>
								GG
							</div>
							<div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(163,230,53,0.16),transparent_30%),linear-gradient(145deg,rgba(190,242,100,0.07),transparent_48%)]" />
							<div className="relative flex h-full flex-col justify-between">
								<div>
									<div className="flex items-center justify-between gap-3">
										<span className="text-[9px] font-black uppercase tracking-[0.3em] text-lime-200/58">{tournamentLabel}</span>
										<span className="rounded-full border border-lime-200/18 bg-lime-200/[0.07] px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-lime-100/65">
											{tournamentDays.length ? tournamentDays.join(" & ") : "Termin folgt"}
										</span>
									</div>
									<h2 className="mt-7 max-w-[11ch] text-balance font-display text-5xl font-bold leading-[0.92] tracking-[-0.05em] sm:text-6xl">
										{tournament.name}.
									</h2>
									<p className="mt-5 max-w-xl text-sm leading-7 text-emerald-100/60">{TOURNAMENT_TEASERS[tournament.kind]}</p>
								</div>
								<div className="mt-9 flex items-center justify-between border-t border-white/8 pt-5">
									<span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/45">
										{tournament.mode === "registration" ? "Turnier ansehen und bewerben" : "Turnier ansehen"}
									</span>
									<span className="grid size-11 place-items-center rounded-full border border-lime-200/20 bg-lime-200/[0.08] text-xl text-lime-100 transition group-hover:translate-x-1">
										→
									</span>
								</div>
							</div>
						</Link>

						<div className="grid gap-4 lg:col-span-5">
							{QUIZ_ENABLED ? (
								<Link
									href={siteUrls.quiz}
									className="group relative overflow-hidden rounded-[2.2rem] border border-amber-200/16 bg-[#171509] p-7 shadow-xl shadow-black/25 transition hover:-translate-y-1 hover:border-amber-200/32"
								>
									<div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.13),transparent_30%)]" />
									<div className="relative">
										<div className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-100/58">Quizshow</div>
										<div className="mt-4 flex items-end justify-between gap-4">
											<div>
												<h2 className="text-3xl font-black tracking-[-0.035em] text-amber-50">Buzzer an.</h2>
												<p className="mt-2 text-sm leading-6 text-amber-50/50">Die nächste Runde Wissen, Halbwissen und sehr schnelle Buzzer.</p>
											</div>
											<span className="text-xl text-amber-100 transition group-hover:translate-x-1">→</span>
										</div>
									</div>
								</Link>
							) : (
								<div className="relative overflow-hidden rounded-[2.2rem] border border-white/8 bg-white/[0.025] p-7 opacity-55">
									<div className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-100/45">Quizshow · pausiert</div>
									<h2 className="mt-4 text-3xl font-black tracking-[-0.035em]">Buzzer gerade aus.</h2>
									<p className="mt-2 text-sm leading-6 text-emerald-100/45">Die nächste Show wird hier wieder freigeschaltet.</p>
								</div>
							)}

							<Link
								href="/overlay"
								className="group relative overflow-hidden rounded-[2.2rem] border border-cyan-200/14 bg-[#07171a] p-7 shadow-xl shadow-black/25 transition hover:-translate-y-1 hover:border-cyan-200/30"
							>
								<div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_20%,rgba(34,211,238,0.14),transparent_32%)]" />
								<div className="relative">
									<div className="text-[9px] font-black uppercase tracking-[0.3em] text-cyan-100/58">Kostenloses Stream-Tool</div>
									<div className="mt-4 flex items-end justify-between gap-4">
										<div>
											<h2 className="text-3xl font-black tracking-[-0.035em] text-cyan-50">Dein League HUD.</h2>
											<p className="mt-2 text-sm leading-6 text-cyan-50/50">Rang, Session und Matchhistorie als eigene OBS-Quelle.</p>
										</div>
										<span className="text-xl text-cyan-100 transition group-hover:translate-x-1">→</span>
									</div>
								</div>
							</Link>
						</div>
					</div>
				</section>

				<section className="landing-reveal landing-delay-2 overflow-hidden rounded-[2rem] border border-white/9 bg-black/18">
					<div className="grid lg:grid-cols-[16rem_1fr]">
						<div className="flex items-center border-b border-white/8 px-6 py-5 lg:border-b-0 lg:border-r">
							<div>
								<div className="text-[9px] font-black uppercase tracking-[0.3em] text-lime-200/48">Im Stream</div>
								<div className="mt-1 text-xl font-black">Die Rotation</div>
							</div>
						</div>
						<div className="grid divide-y divide-white/8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
							{STREAM_GAMES.map((game) => (
								<div key={game.name} className="flex items-start gap-4 px-6 py-5">
									<span className="font-mono text-[10px] font-black text-lime-200/35">{game.index}</span>
									<div>
										<div className="font-black text-emerald-50">{game.name}</div>
										<div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-100/35">{game.detail}</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				<section id="clips" className="landing-reveal landing-delay-3 scroll-mt-24">
					<SectionHeading
						kicker="Frisch & beliebt"
						title="Clips, die der Chat behalten wollte."
						text="Neue Highlights der letzten 30 Tage. Falls es gerade ruhiger war, rücken die beliebtesten Klassiker nach."
						action={
							<Link
								href="/clips"
								className="rounded-2xl border border-white/12 bg-white/[0.035] px-4 py-3 text-[10px] font-black uppercase tracking-[0.19em] text-emerald-100/70 transition hover:border-lime-200/28 hover:text-lime-100"
							>
								Alle Clips
							</Link>
						}
					/>
					<div className="mt-7">
						<RecentClips login={TWITCH_LOGIN} count={6} />
					</div>
				</section>

				<section className="landing-reveal landing-delay-3 relative overflow-hidden rounded-[2.3rem] border border-lime-200/13 bg-[linear-gradient(125deg,rgba(190,242,100,0.1),rgba(5,46,26,0.62)_48%,rgba(34,211,238,0.07))] p-7 sm:p-10">
					<div aria-hidden className="absolute -right-12 -top-20 size-64 rounded-full border border-lime-100/8" />
					<div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.3em] text-lime-200/56">Die Homebase</div>
							<h2 className="mt-4 max-w-2xl text-4xl font-black leading-[0.95] tracking-[-0.045em] sm:text-5xl">Der nächste gute Abend beginnt im Chat.</h2>
							<p className="mt-4 max-w-xl text-sm leading-7 text-emerald-100/58">Folgen, Benachrichtigung an und beim nächsten Stream einfach dazukommen.</p>
						</div>
						<a
							href={TWITCH_URL}
							target="_blank"
							rel="noreferrer"
							className="shrink-0 rounded-2xl bg-emerald-50 px-6 py-4 text-xs font-black uppercase tracking-[0.18em] text-[#06110b] transition hover:-translate-y-0.5 hover:bg-lime-100"
						>
							Auf Twitch folgen
						</a>
					</div>
				</section>
			</main>

			<SiteFooter apexUrl={siteUrls.apex} tournamentUrl={siteUrls.tournament} />

			<style>{`
				@keyframes landing-reveal {
					from { opacity: 0; transform: translateY(18px); }
					to { opacity: 1; transform: translateY(0); }
				}
				.landing-reveal { animation: landing-reveal 700ms cubic-bezier(.2,.8,.2,1) both; }
				.landing-delay-1 { animation-delay: 90ms; }
				.landing-delay-2 { animation-delay: 160ms; }
				.landing-delay-3 { animation-delay: 230ms; }
				@media (prefers-reduced-motion: reduce) {
					.landing-reveal { animation: none; }
				}
			`}</style>
		</div>
	);
}

function SectionHeading({ kicker, title, text, action }: { kicker: string; title: string; text: string; action?: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<div className="text-[9px] font-black uppercase tracking-[0.32em] text-lime-200/54">{kicker}</div>
				<h2 className="mt-3 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-5xl">{title}</h2>
			</div>
			<div className="flex max-w-xl flex-col items-start gap-4 sm:items-end">
				<p className="text-sm leading-7 text-emerald-100/52 sm:text-right">{text}</p>
				{action}
			</div>
		</div>
	);
}
