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
import { wishGroupLimit } from "@/lib/preference-group-settings";
import { DiscordSignInButton } from "../DiscordSignInButton";
import { DiscordMark } from "@/components/BrandMarks";
import { AccountLogoutButton } from "../me/AccountLogoutButton";
import { ApplicationJourney, ApplicationProgressProvider } from "./ApplicationProgress";

export default async function ApplyPage() {
	const settings = await getTournamentSettings();
	const tournamentName = settings.activeTournament.name;
	const participationChecklist = [
		{ title: "Discord & Riot verbinden", text: "Tritt dem Lauchgruen Discord bei und verifiziere deinen eigenen Riot-Account direkt im Formular." },
		{
			title: `Account-Level ${settings.ultimateBravery.minimumSummonerLevel}+`,
			text: `Dein League-Account muss mindestens Level ${settings.ultimateBravery.minimumSummonerLevel} haben. Falls die Orga dir eine Ausnahme bestätigt hat, wird diese bei der Bewerbung berücksichtigt.`,
		},
		{
			title: "Zeit fürs Turnier einplanen",
			text: "Bestätige deine Verfügbarkeit für die angekündigten Spieltage und sei jeweils 20 Minuten vor Beginn im vorgesehenen Voice-Channel.",
		},
		{
			title: "Deine Angaben aktuell halten",
			text: "Gib deine Rollen, Verfügbarkeit und gegebenenfalls Competitive-Erfahrung ehrlich an. Änderungen kannst du während der Anmeldung im Formular speichern.",
		},
		{
			title: "Regeln lesen & fair bleiben",
			text: "Lies vor deiner Bewerbung das aktuelle Regelwerk. Respektiere Mitspieler, Gegner und Orga; bei Problemen hilft dir das Orga-Team im Discord.",
		},
	];
	const deadlineLabel = formatTournamentApplicationDeadlineLabel(settings.applicationDeadline);
	const now = new Date();
	const openReached = isTournamentApplicationOpenDateReached(now, settings.applicationOpenAt);
	const deadlinePassed = isTournamentApplicationDeadlinePassed(now, settings.applicationDeadlineOverride, settings.applicationDeadline);
	const applicationsOpen = areTournamentApplicationsOpen(
		settings.applicationsOpen,
		now,
		settings.applicationDeadlineOverride,
		settings.applicationDeadline,
		settings.applicationOpenAt
	);
	if (settings.activeTournament.mode !== "registration" && !applicationsOpen) {
		return (
			<div className="application-page page-section">
				<section className="content-panel application-empty">
					<div className="panel-kicker">{tournamentName}</div>
					<h1 className="application-title">Die Bewerbung öffnet später.</h1>
					<p className="mt-4 text-sm leading-7 text-emerald-100/72">
						{tournamentName} wird gerade vorbereitet. Deine Discord-Anmeldung und Riot-Verifizierung bleiben für die spätere Bewerbung erhalten. Den finalen Termin
						veröffentlicht die Orga, sobald er bestätigt ist.
					</p>
					<Link href="/tournament" className="button secondary mt-6">
						Zurück zur Übersicht
					</Link>
				</section>
			</div>
		);
	}
	if (!applicationsOpen) {
		return (
			<div className="application-page page-section">
				<section className="content-panel application-empty">
					<div className="panel-kicker">Bewerbungen geschlossen</div>
					<h1 className="application-title">
						{!openReached ? "Die Bewerbung öffnet bald." : deadlinePassed ? "Der Bewerbungsschluss ist vorbei." : "Bewerbungen öffnen in Kürze wieder."}
					</h1>
					<p className="mt-4 text-sm leading-7 text-emerald-100/72">
						{!openReached
							? `Die Anmeldung öffnet am ${formatTournamentApplicationOpenLabel(settings.applicationOpenAt)}. Du kannst Discord und Riot später hier verbinden.`
							: deadlinePassed
								? `Die Anmeldung war bis ${deadlineLabel} möglich. Bei dringenden Rückfragen melde dich bitte direkt beim Orga-Team im Discord.`
								: `Die Anmeldung für ${tournamentName} öffnet wieder, sobald die Orga den nächsten Bewerbungszeitraum freigibt.`}
					</p>
					<Link href="/tournament" className="button secondary mt-6">
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
		<div className="application-page page-section">
			<header className="application-intro">
				<div>
					<p className="eyebrow">
						<i aria-hidden="true" />
						Dein Platz im Turnier
					</p>
					<h1 className="application-title">
						Gemeinsam spielen.
						<br />
						<span>Jetzt bewerben.</span>
					</h1>
					<p className="application-lead">{tournamentName} · Deine Community. Dein Team. Dein nächstes Match.</p>
				</div>
				<div className="application-deadline">
					<span className="panel-kicker">{settings.applicationDeadlineOverride ? "Sonderfreigabe aktiv" : "Bewerbungsschluss"}</span>
					<strong>{settings.applicationDeadlineOverride ? "Bewerbungen wieder geöffnet" : deadlineLabel}</strong>
					<Link href="/tournament/terms">
						Turnierregeln lesen <span aria-hidden="true">↗</span>
					</Link>
				</div>
			</header>
			<ApplicationProgressProvider
				initialProgress={{ discordConnected: Boolean(discordIdentity), riotVerified: Boolean(initialVerified), submitted: Boolean(existingApplication) }}
			>
				<section className="application-layout" aria-label="Turnierbewerbung">
					<aside className="application-sidebar">
						<div className="content-panel tight">
							<div className="panel-kicker">Bevor es losgeht</div>
							<h2>Fair spielen. Verbindlich dabei sein.</h2>
							<p className="mt-4 text-sm leading-7 text-emerald-100/70">
								Wir brauchen deine Angaben, um faire Teams zu bauen und das Bracket zu planen. Bitte trag direkt ein, wenn du beim angekündigten Termin unsicher
								bist.
							</p>
							<div className="application-note mt-5">
								{settings.applicationDeadlineOverride
									? "Notfall-Bewerbungen sind aktuell wieder geöffnet."
									: `Bewerbungszeitraum: ${formatTournamentApplicationOpenLabel(settings.applicationOpenAt)} bis ${deadlineLabel}`}
							</div>
						</div>

						<div className="content-panel tight">
							<div className="panel-kicker">Dein Weg ins Turnier</div>
							<ApplicationJourney />
							<div className="mt-4 grid gap-3">
								{discordIdentity ? (
									<div className="rounded-2xl border border-lime-200/20 bg-lime-200/10 px-5 py-4">
										<div className="text-xs font-black uppercase tracking-[0.2em] text-lime-100/62">Dein Discord-Konto</div>
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

						<details id="rules" className="content-panel tight application-rules">
							<summary>
								Regeln & Teilnahme auf einen Blick <span aria-hidden="true">+</span>
							</summary>
							<p className="mt-4 text-sm leading-6 text-[var(--muted)]">
								Das brauchst du für deine Bewerbung. Die vollständigen, aktuellen Spielregeln findest du im Regelwerk.
							</p>
							<ul className="mt-4 grid gap-3">
								{participationChecklist.map((item) => (
									<li key={item.title} className="rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] p-4">
										<h3 className="font-display text-sm font-bold text-[var(--text)]">{item.title}</h3>
										<p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.text}</p>
									</li>
								))}
							</ul>
							<Link href="/tournament/terms" className="button secondary mt-4">
								Vollständiges Regelwerk
							</Link>
						</details>
					</aside>

					<div className="content-panel application-form-panel">
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
								preferenceGroupLimit={wishGroupLimit(settings.wishGroupMode)}
							/>
						) : (
							<div className="application-login">
								<div className="text-xs font-black uppercase tracking-[0.28em] text-indigo-100/62">Deine Bewerbung beginnt hier</div>
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
									<DiscordSignInButton redirectTo="/tournament/apply" pendingLabel="Weiter zu Discord…" className="button application-discord-button">
										<DiscordMark className="h-4 w-auto" />
										Mit Discord anmelden
									</DiscordSignInButton>
									<p className="mt-3 text-xs leading-5 text-emerald-100/46">Nach der Anmeldung kommst du automatisch auf diese Seite zurück.</p>
								</div>
							</div>
						)}
					</div>
				</section>
			</ApplicationProgressProvider>
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
