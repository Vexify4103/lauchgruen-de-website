import { TournamentLink as Link } from "../TournamentLink";
import { headers } from "next/headers";
import { auth, signIn, signOut } from "@/lib/auth";
import { DISCORD_INVITE_URL, isDiscordGuildMember } from "@/lib/discord";
import {
	areTournamentApplicationsOpen,
	formatTournamentApplicationDeadlineLabel,
	formatTournamentApplicationOpenLabel,
	isTournamentApplicationDeadlinePassed,
	isTournamentApplicationOpenDateReached,
} from "@/lib/tournament-application-deadline";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { findApplicationByDiscordId, getVerifiedAccount, updateVerifiedSummonerLevel } from "@/lib/tournament-storage";
import { getSummonerByPuuid } from "@/lib/riot";
import { ApplicationForm } from "./ApplicationForm";

const rules = [
	"Bewerbungsschluss ist der auf der Webseite angegebene Zeitpunkt.",
	"Du meldest dich verbindlich für den angekündigten Turniertermin an.",
	"Champion, Items, Runen und Summoner Spells werden pro Spieler und Match zufällig über die Webseite bestimmt.",
	"Dein League-Account sollte mindestens 150 Champions besitzen, damit Ultimate Bravery fair spielbar bleibt.",
	"Jeder Spieler hat pro Match 2 garantierte Rerolls. Wenn danach weiterhin kein besessener Champion dabei ist, kann der Captain eine Ausnahme bei der Orga anfragen.",
	"Deine Riot-Verifizierung, dein Account-Level, deine Main Rolle und Wunschrollen werden für Teilnahme und Team-Balancing genutzt.",
	"Kein toxisches Verhalten, kein Trashtalk gegen Gegner oder Teammates, kein absichtliches Feeden, kein Account-Sharing, kein Scripting und kein Wettbewerbsbetrug.",
	"Wenn es Probleme gibt, meldet sie bitte ruhig an die Orga oder später über das Feedback-Formular.",
	"Wenn du zeitlich unsicher bist, schreib es bitte direkt in die Notizen.",
];

export default async function ApplyPage() {
	const settings = await getTournamentSettings();
	if (settings.activeTournament.mode !== "registration") {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto w-full max-w-3xl rounded-[2.2rem] border border-cyan-200/16 bg-cyan-300/[0.06] p-6 shadow-2xl shadow-black/25 sm:p-8">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-cyan-100/70">Ultimate Bravery</div>
					<h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-50">Die Bewerbung öffnet später.</h1>
					<p className="mt-4 text-sm leading-7 text-emerald-100/72">
						Ultimate Bravery wird gerade vorbereitet. Deine Discord-Anmeldung und Riot-Verifizierung bleiben für die spätere Bewerbung erhalten. Den finalen Termin
						veröffentlicht die Orga, sobald er bestätigt ist.
					</p>
					<Link
						href="/tournament"
						className="mt-6 inline-flex rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
					>
						Zurück zur Übersicht
					</Link>
				</section>
			</div>
		);
	}
	const deadlineLabel = formatTournamentApplicationDeadlineLabel(settings.applicationDeadline);
	const now = new Date();
	const openReached = isTournamentApplicationOpenDateReached(now, settings.applicationOpenAt);
	const deadlinePassed = isTournamentApplicationDeadlinePassed(now, settings.applicationDeadlineOverride, settings.applicationDeadline);
	const applicationsOpen = areTournamentApplicationsOpen(
		settings.applicationsOpen,
		new Date(),
		settings.applicationDeadlineOverride,
		settings.applicationDeadline,
		settings.applicationOpenAt
	);
	if (!applicationsOpen) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto w-full max-w-3xl rounded-[2.2rem] border border-amber-200/16 bg-amber-200/[0.06] p-6 shadow-2xl shadow-black/25 sm:p-8">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-amber-100/70">Bewerbungen geschlossen</div>
					<h1 className="mt-4 text-4xl font-black tracking-tight text-amber-50">
						{!openReached ? "Die Bewerbung öffnet bald." : deadlinePassed ? "Der Bewerbungsschluss ist vorbei." : "Bewerbungen öffnen in Kürze wieder."}
					</h1>
					<p className="mt-4 text-sm leading-7 text-emerald-100/72">
						{!openReached
							? `Die Anmeldung öffnet am ${formatTournamentApplicationOpenLabel(settings.applicationOpenAt)}. Du kannst Discord und Riot später hier verbinden.`
							: deadlinePassed
								? `Die Anmeldung war bis ${deadlineLabel} möglich. Bei dringenden Rückfragen melde dich bitte direkt beim Orga-Team im Discord.`
								: "Die Ultimate-Bravery-Anmeldung öffnet wieder, sobald die Orga den nächsten Bewerbungszeitraum freigibt."}
					</p>
					<Link
						href="/tournament"
						className="mt-6 inline-flex rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
					>
						Zurück zur Übersicht
					</Link>
				</section>
			</div>
		);
	}

	const host = (await headers()).get("host")?.toLowerCase() ?? "";
	const isLocalSubdomain = host.endsWith(".localhost:3000") && host !== "localhost:3000";
	const localAuthUrl = "http://localhost:3000/tournament/apply";
	const session = await auth();
	const discordIdentity =
		session?.user?.discordId && session.user.discordHandle
			? {
					id: session.user.discordId,
					handle: session.user.discordHandle,
				}
			: null;
	const liveGuildMember = discordIdentity ? await isDiscordGuildMember(discordIdentity.id) : null;
	const isGuildMember = liveGuildMember ?? session?.user.discordInGuild ?? !process.env.DISCORD_GUILD_ID;
	const [verifiedAccountResult, existingApplication] = discordIdentity
		? await Promise.all([getVerifiedAccount(discordIdentity.id), findApplicationByDiscordId(discordIdentity.id)])
		: [null, null];
	let verifiedAccount = verifiedAccountResult;
	if (discordIdentity && verifiedAccount && verifiedAccount.summonerLevel === undefined) {
		try {
			const summoner = await getSummonerByPuuid(verifiedAccount.puuid);
			await updateVerifiedSummonerLevel(discordIdentity.id, summoner.summonerLevel);
			verifiedAccount = { ...verifiedAccount, summonerLevel: summoner.summonerLevel };
		} catch (error) {
			console.warn("[tournament-apply] Summoner-Level konnte nicht automatisch ergänzt werden.", error);
		}
	}
	const initialVerified = verifiedAccount
		? {
				riotId: verifiedAccount.riotId,
				puuid: verifiedAccount.puuid,
				currentRankAuto: verifiedAccount.currentRankAuto,
				summonerLevel: verifiedAccount.summonerLevel,
				verifiedAt: verifiedAccount.verifiedAt,
			}
		: null;

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.86fr_1.14fr]">
				<aside className="grid content-start gap-4">
					<div className="rounded-[2rem] border border-lime-200/14 bg-white/[0.045] p-6">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Bewerbung</div>
						<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50">Bei Ultimate Bravery verbindlich mitspielen.</h1>
						<p className="mt-4 text-sm leading-7 text-emerald-100/70">
							Wir brauchen deine Angaben, um faire Teams zu bauen und das Bracket zu planen. Bitte trag direkt ein, wenn du beim angekündigten Termin unsicher bist.
						</p>
						<div className="mt-5 rounded-2xl border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-sm font-black text-amber-50">
							{settings.applicationDeadlineOverride
								? "Notfall-Bewerbungen sind aktuell wieder geöffnet."
								: `Bewerbungszeitraum: ${formatTournamentApplicationOpenLabel(settings.applicationOpenAt)} bis ${deadlineLabel}`}
						</div>
					</div>

					<div className="rounded-[2rem] border border-amber-200/14 bg-amber-200/[0.06] p-6">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/70">Anmeldung</div>
						<div className="mt-4 grid gap-3">
							{discordIdentity ? (
								<div className="rounded-2xl border border-lime-200/20 bg-lime-200/10 px-5 py-4">
									<div className="text-xs font-black uppercase tracking-[0.2em] text-lime-100/62">Discord verbunden</div>
									<div className="mt-2 font-black text-lime-50">{discordIdentity.handle}</div>
									<form
										className="mt-3"
										action={async () => {
											"use server";
											await signOut({ redirectTo: "/tournament/apply" });
										}}
									>
										<button
											type="submit"
											className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100/62 underline decoration-lime-200/30 underline-offset-4 hover:text-lime-100"
										>
											Trennen
										</button>
									</form>
								</div>
							) : isLocalSubdomain ? (
								<Link
									href={localAuthUrl}
									className="rounded-2xl border border-lime-200/20 bg-lime-200/10 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-lime-50 transition hover:border-lime-200/40"
								>
									Auf localhost anmelden
								</Link>
							) : (
								<form
									action={async () => {
										"use server";
										await signIn("discord", { redirectTo: "/tournament/apply" });
									}}
								>
									<button
										type="submit"
										className="w-full rounded-2xl border border-white/10 bg-black/24 px-5 py-4 text-left text-sm font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
									>
										Mit Discord anmelden
									</button>
								</form>
							)}
						</div>
						<p className="mt-4 text-xs leading-6 text-emerald-100/58">
							Discord identifiziert die Bewerbung, die Riot-Verifizierung läuft direkt im Formular über das Wechseln deines League-Profilicons.
						</p>
					</div>

					<div id="rules" className="rounded-[2rem] border border-white/10 bg-black/18 p-6">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Regeln (Vorschau)</div>
						<div className="mt-4 grid gap-3">
							{rules.map((rule) => (
								<p key={rule} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-sm leading-6 text-emerald-100/72">
									{rule}
								</p>
							))}
						</div>
					</div>
				</aside>

				<div className="rounded-[2.2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/25 sm:p-7">
					<ApplicationForm
						discordIdentity={discordIdentity}
						isGuildMember={isGuildMember}
						discordInviteUrl={DISCORD_INVITE_URL}
						initialVerified={initialVerified}
						initialApplication={existingApplication}
						minimumSummonerLevel={settings.ultimateBravery.minimumSummonerLevel}
						announcedDate={formatUltimateBraveryDates(settings.ultimateBravery.startAt, settings.ultimateBravery.dayTwoStartAt)}
					/>
				</div>
			</section>
		</div>
	);
}

function formatUltimateBraveryDates(startAt: string | null, dayTwoStartAt: string | null) {
	const formatter = new Intl.DateTimeFormat("de-DE", {
		weekday: "long",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/Berlin",
	});
	const dates = [startAt, dayTwoStartAt].filter((date): date is string => Boolean(date)).map((date) => formatter.format(new Date(date)));
	return dates.length ? `${dates.join(" und ")}. Bitte mindestens 20 Minuten vorher im Voice-Call sein.` : "Termin wird noch angekündigt";
}
