import { TournamentLink as Link } from "../TournamentLink";
import { auth } from "@/lib/auth";
import { DISCORD_INVITE_URL, isDiscordGuildMember } from "@/lib/discord";
import {
	areTournamentApplicationsOpen,
	formatTournamentApplicationDeadlineLabel,
	formatTournamentApplicationOpenLabel,
	isTournamentApplicationDeadlinePassed,
	isTournamentApplicationOpenDateReached,
} from "@/lib/tournament-application-deadline";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { findApplicationByDiscordId, findEligibilityOverrideMatch, getVerifiedAccount, updateVerifiedSummonerLevel } from "@/lib/tournament-storage";
import { getSummonerByPuuid } from "@/lib/riot";
import { ApplicationForm } from "./ApplicationForm";
import { DiscordSignInButton } from "../DiscordSignInButton";
import { AccountLogoutButton } from "../me/AccountLogoutButton";

const rules = [
	"Bewerbungsschluss ist der auf der Webseite angegebene Zeitpunkt.",
	"Du meldest dich verbindlich für den angekündigten Turniertermin an.",
	"Champion, Items, Runen und Summoner Spells werden pro Spieler und Match zufällig über die Webseite bestimmt.",
	"Dein League-Account sollte mindestens 150 Champions besitzen, damit Ultimate Bravery fair spielbar bleibt.",
	"Jeder Spieler hat pro Match 2 garantierte Rerolls. Wenn danach weiterhin kein besessener Champion dabei ist, kann der Captain eine Ausnahme bei der Orga anfragen.",
	"Deine Riot-Verifizierung, dein Account-Level, deine Main Rolle und die Reihenfolge deiner Wunschrollen werden für Teilnahme und Team-Balancing genutzt.",
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
	const eligibilityOverride =
		discordIdentity && verifiedAccount
			? await findEligibilityOverrideMatch({
					discordId: discordIdentity.id,
					riotId: verifiedAccount.riotId,
					tournamentId: settings.activeTournament.id,
					requirement: "minimum-summoner-level",
				})
			: null;
	if (discordIdentity && verifiedAccount && verifiedAccount.summonerLevel === undefined && !eligibilityOverride) {
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
									<div className="text-xs font-black uppercase tracking-[0.2em] text-lime-100/62">Schritt 1 von 3 · abgeschlossen</div>
									<div className="mt-2 font-black text-lime-50">Discord verbunden</div>
									<div className="mt-1 text-sm font-bold text-lime-50/72">{discordIdentity.handle}</div>
									<div className="mt-3">
										<AccountLogoutButton
											returnUrl="/tournament/apply"
											label="Trennen"
											pendingLabel="Wird getrennt …"
											className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100/62 underline decoration-lime-200/30 underline-offset-4 hover:text-lime-100 disabled:cursor-wait disabled:opacity-55"
										/>
									</div>
								</div>
							) : (
								<div className="rounded-2xl border border-indigo-200/18 bg-indigo-300/[0.07] px-5 py-4">
									<div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-100/62">Schritt 1 von 3</div>
									<div className="mt-2 font-black text-indigo-50">Discord noch nicht verbunden</div>
									<p className="mt-2 text-xs leading-5 text-emerald-100/58">Die Anmeldung startest du direkt im Bewerbungsbereich.</p>
								</div>
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
					{discordIdentity ? (
						<ApplicationForm
							discordIdentity={discordIdentity}
							isGuildMember={isGuildMember}
							discordInviteUrl={DISCORD_INVITE_URL}
							initialVerified={initialVerified}
							initialApplication={existingApplication}
							minimumSummonerLevel={settings.ultimateBravery.minimumSummonerLevel}
							minimumLevelOverrideKind={eligibilityOverride?.kind ?? null}
							announcedDate={formatUltimateBraveryDates(settings.ultimateBravery.startAt, settings.ultimateBravery.dayTwoStartAt)}
							applicationDeadlineLabel={deadlineLabel}
						/>
					) : (
						<div className="flex min-h-[34rem] flex-col justify-center rounded-[1.8rem] border border-indigo-200/16 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.16),transparent_42%),linear-gradient(145deg,rgba(99,102,241,0.09),rgba(0,0,0,0.12))] p-6 sm:p-9">
							<div className="grid size-16 place-items-center rounded-[1.35rem] border border-indigo-200/25 bg-indigo-300/14 text-indigo-100 shadow-[0_0_42px_rgba(129,140,248,0.16)]">
								<DiscordIcon />
							</div>
							<div className="mt-7 text-xs font-black uppercase tracking-[0.28em] text-indigo-100/62">Deine Bewerbung beginnt hier</div>
							<h2 className="mt-3 max-w-xl text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">Mit Discord anmelden und direkt weitermachen.</h2>
							<p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100/68">
								Wir verknüpfen deine Bewerbung eindeutig mit deinem Discord-Account und prüfen anschließend deine Server-Mitgliedschaft. Danach kannst du hier
								deinen Riot-Account verifizieren und das Formular ausfüllen.
							</p>

							<div className="mt-7 grid gap-3 sm:grid-cols-3">
								<LoginStep number="01" label="Discord verbinden" />
								<LoginStep number="02" label="Riot-ID verifizieren" />
								<LoginStep number="03" label="Bewerbung senden" />
							</div>

							<div className="mt-7">
								<DiscordSignInButton
									redirectTo="/tournament/apply"
									pendingLabel="Weiter zu Discord..."
									className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-300 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-indigo-950 shadow-lg shadow-indigo-500/15 transition hover:-translate-y-0.5 hover:bg-indigo-200 disabled:cursor-wait disabled:opacity-65 sm:w-auto"
								>
									<DiscordIcon small />
									Mit Discord anmelden
								</DiscordSignInButton>
								<p className="mt-3 text-xs leading-5 text-emerald-100/46">Nach der Anmeldung kommst du automatisch auf diese Seite zurück.</p>
							</div>
						</div>
					)}
				</div>
			</section>
		</div>
	);
}

function LoginStep({ number, label }: { number: string; label: string }) {
	return (
		<div className="rounded-2xl border border-white/9 bg-black/18 px-4 py-3">
			<div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200/48">{number}</div>
			<div className="mt-1 text-xs font-black text-emerald-50/82">{label}</div>
		</div>
	);
}

function DiscordIcon({ small = false }: { small?: boolean }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={small ? "size-5" : "size-8"} fill="currentColor">
			<path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 2.854a.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.12 13.12 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.55-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
		</svg>
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
