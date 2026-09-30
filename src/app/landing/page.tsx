import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteShell } from "@/components/site/SiteShell";
import { PageIntro } from "@/components/site/PageIntro";
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
		<SiteShell apexUrl={siteUrls.apex} tournamentUrl={siteUrls.tournament} brand="stream">
			<section id="live" className="page-section home-hero home-reveal">
				<div className="home-hero-copy">
					<p className="eyebrow">
						<i aria-hidden="true" /> Stream & Community
					</p>
					<h1>
						Gute Games.<span>Leichtes Chaos.</span>
					</h1>
					<p>Luca streamt, veranstaltet Community-Turniere und lässt den Chat gelegentlich bessere Entscheidungen treffen.</p>
					<div className="home-actions">
						<a href={TWITCH_URL} target="_blank" rel="noreferrer" className="button primary">
							Zu Twitch <span aria-hidden="true">↗</span>
						</a>
						<Link href={siteUrls.tournament} className="button ghost">
							Turnier ansehen <span aria-hidden="true">→</span>
						</Link>
					</div>
					<div className="home-games" aria-label="Spiele im Stream">
						{STREAM_GAMES.map((game) => (
							<span key={game.name}>{game.name}</span>
						))}
					</div>
				</div>
				<div className="relative min-w-0">
					{previewLogin ? (
						<span className="status-chip mb-3" data-tone="amber">
							Lokale Vorschau · @{previewLogin}
						</span>
					) : null}
					<LiveStatus login={liveStatusLogin} />
				</div>
			</section>

			<section id="projekte" className="page-section soft-section home-reveal">
				<PageIntro as="h2" compact={false} kicker="Aktuell bei Lauchgruen" title="Mitmachen statt nur zuschauen.">
					Community-Turniere, Quizshows und kostenlose Tools für deinen eigenen Stream. Hier geht es weiter.
				</PageIntro>
				<div className="home-projects">
					<Link href={siteUrls.tournament} className="home-project featured">
						<div>
							<p className="panel-kicker">{tournamentLabel}</p>
							<h2>{tournament.name}</h2>
							<p>{TOURNAMENT_TEASERS[tournament.kind]}</p>
							<ul className="tournament-pills">
								<li>{tournamentDays.length ? tournamentDays.join(" & ") : "Termin folgt"}</li>
								<li>Community-Turnier</li>
							</ul>
						</div>
						<div className="home-project-footer">
							<span>{tournament.mode === "registration" ? "Ansehen und bewerben" : tournament.mode === "finished" ? "Ergebnisse ansehen" : "Turnier ansehen"}</span>
							<span aria-hidden="true">→</span>
						</div>
					</Link>
					<div className="home-project-stack">
						{QUIZ_ENABLED ? (
							<Link href={siteUrls.quiz} className="home-project">
								<div>
									<p className="panel-kicker">Quizshow</p>
									<h2>Buzzer an.</h2>
									<p>Die nächste Runde Wissen, Halbwissen und sehr schnelle Buzzer.</p>
								</div>
								<div className="home-project-footer">
									<span>Zur Quizshow</span>
									<span aria-hidden="true">→</span>
								</div>
							</Link>
						) : (
							<div className="home-project">
								<div>
									<p className="panel-kicker">Quizshow · pausiert</p>
									<h2>Buzzer gerade aus.</h2>
									<p>Die nächste Show wird hier wieder freigeschaltet.</p>
								</div>
							</div>
						)}
						<Link href="/overlay" className="home-project">
							<div>
								<p className="panel-kicker">Kostenlose OBS-Tools</p>
								<h2>Dein League HUD.</h2>
								<p>Rang, Session und Matchhistorie als eigene OBS-Browserquelle.</p>
							</div>
							<div className="home-project-footer">
								<span>Overlay gestalten</span>
								<span aria-hidden="true">→</span>
							</div>
						</Link>
					</div>
				</div>
			</section>

			<section id="clips" className="page-section home-reveal">
				<PageIntro
					as="h2"
					compact={false}
					kicker="Frisch & beliebt"
					title="Was der Chat behalten wollte."
					aside={
						<Link href="/clips" className="button ghost small">
							Alle Clips <span aria-hidden="true">→</span>
						</Link>
					}
				>
					Neue Highlights der letzten 30 Tage. Falls es gerade ruhiger war, rücken die beliebtesten Klassiker nach.
				</PageIntro>
				<RecentClips login={TWITCH_LOGIN} count={6} />
			</section>

			<section className="page-section soft-section home-community">
				<div>
					<p className="eyebrow">
						<i aria-hidden="true" /> Die Homebase
					</p>
					<h2 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Der nächste gute Abend beginnt im Chat.</h2>
					<p className="mt-5 max-w-xl leading-7 text-[var(--muted)]">Folgen, Benachrichtigung an und beim nächsten Stream einfach dazukommen.</p>
				</div>
				<a href={TWITCH_URL} target="_blank" rel="noreferrer" className="button primary">
					Auf Twitch folgen <span aria-hidden="true">↗</span>
				</a>
			</section>
		</SiteShell>
	);
}
