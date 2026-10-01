import { TournamentLink as Link } from "../TournamentLink";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DISCORD_INVITE_URL, isDiscordGuildMember } from "@/lib/discord";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import { getVerifiedAccount, getPreferenceGroupForDiscordId, getTwitchLink, listApplications, TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { normalizeWishGroupMode, wishGroupLimit } from "@/lib/preference-group-settings";
import { PreferenceGroupCard } from "./PreferenceGroupCard";
import { RiotVerificationCard } from "./RiotVerificationCard";
import { TwitchLinkCard } from "./TwitchLinkCard";
import { DiscordSignInButton } from "../DiscordSignInButton";
import { AccountLogoutButton } from "./AccountLogoutButton";
import { TournamentDmPreferenceCard } from "./TournamentDmPreferenceCard";
import { getSiteUrls } from "@/lib/site-urls";
import { isTournamentHost } from "@/lib/tournament-url";
import { areTournamentApplicationsOpen, formatTournamentApplicationDeadlineLabel, isTournamentApplicationDeadlinePassed } from "@/lib/tournament-application-deadline";
import { WithdrawApplicationButton } from "./WithdrawApplicationButton";
import { usesUltimateBravery } from "@/lib/tournament-kind";
import { DiscordMark } from "@/components/BrandMarks";

export const metadata: Metadata = {
	title: "Mein Lauchgruen-Konto",
	description: "Verwalte Discord, Riot, Twitch, Community-Overlays und deine Turnierteilnahmen.",
};

const MODE_LABELS: Record<string, string> = {
	teaser: "Ankündigung",
	registration: "Anmeldung geöffnet",
	preparation: "Vorbereitung",
	live: "Turnier läuft",
	paused: "Turnier pausiert",
	finished: "Turnier abgeschlossen",
};

const MATCH_STATUS_LABELS: Record<string, string> = { Scheduled: "Geplant", Pending: "Champ Select", Live: "Live", Finished: "Beendet", Locked: "Offen" };

export default async function TournamentMePage({ searchParams }: { searchParams: Promise<{ twitch?: string; from?: string }> }) {
	const [requestHeaders, params] = await Promise.all([headers(), searchParams]);
	const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
	const siteUrls = getSiteUrls(host);
	if (isTournamentHost(host)) {
		const destination = new URL("/me", siteUrls.apex);
		if (params.twitch) destination.searchParams.set("twitch", params.twitch);
		if (params.from) destination.searchParams.set("from", params.from);
		redirect(destination.toString());
	}
	const tournamentHref = (path: string) => `${siteUrls.tournament}${path}`;
	const source = params.from === "overlay" || params.from === "tournament" || params.from === "main" ? params.from : "main";
	const returnTarget =
		source === "overlay"
			? { href: `${siteUrls.apex}/overlay`, label: "Zurück zum Overlay" }
			: source === "tournament"
				? { href: siteUrls.tournament, label: "Zurück zum Turnier" }
				: { href: siteUrls.apex, label: "Zurück zur Hauptseite" };
	const accountUrl = `${siteUrls.apex}/me?from=${source}`;
	const session = await auth();
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

	if (!discordId) {
		return (
			<main className="account-page">
				<section className="account-gate">
					<div className="discord-glyph">
						<DiscordMark />
					</div>
					<p className="eyebrow">
						<i />
						Dein Lauchgruen-Konto
					</p>
					<h1>Ein Login für alles.</h1>
					<p>Melde dich mit Discord an, um Bewerbung, Riot-Verifizierung, Twitch, Wunschgruppe und Teamzuweisung an einem Ort zu verwalten.</p>
					<DiscordSignInButton redirectTo={accountUrl} pendingLabel="Weiter zu Discord…" className="button primary">
						Mit Discord anmelden
					</DiscordSignInButton>
				</section>
			</main>
		);
	}

	const [verified, applications, member, ctx, preferenceGroup, twitchLink, settings] = await Promise.all([
		getVerifiedAccount(discordId),
		listApplications(),
		isDiscordGuildMember(discordId),
		getMatchControlContext(),
		getPreferenceGroupForDiscordId(discordId),
		getTwitchLink(discordId),
		getTournamentSettings(),
	]);
	const isUltimateBravery = usesUltimateBravery(settings.activeTournament);
	const discordAvatarUrl = session.user.discordAvatar ?? "https://cdn.discordapp.com/embed/avatars/0.png";
	const discordHandle = session.user.discordHandle ?? discordId;
	const application = applications.find((entry) => entry.discordId === discordId) ?? null;
	const now = new Date();
	const applicationsOpen = areTournamentApplicationsOpen(
		settings.applicationsOpen,
		now,
		settings.applicationDeadlineOverride,
		settings.applicationDeadline,
		settings.applicationOpenAt
	);
	const applicationDeadlinePassed = isTournamentApplicationDeadlinePassed(now, settings.applicationDeadlineOverride, settings.applicationDeadline);
	const applicationDeadlineLabel = formatTournamentApplicationDeadlineLabel(settings.applicationDeadline);
	const team =
		ctx.teams.find((entry) => entry.players.some((player) => player.riotId.toLowerCase() === application?.riotId.toLowerCase()) || entry.captainRef?.discordId === discordId) ??
		null;
	const isCaptain = team?.captainRef?.discordId === discordId;
	const matches = team ? ctx.matches.filter((match) => match.teamAName === team.name || match.teamBName === team.name) : [];
	const nextMatch = matches.find((match) => match.status === "Live") ?? matches.find((match) => match.status !== "Finished") ?? null;
	const matchAccessReady = nextMatch?.status === "Live" || nextMatch?.status === "Pending";
	const isTeamA = nextMatch?.teamAName === team?.name;
	const opponent = nextMatch ? findTeamByName(ctx.teams, isTeamA ? nextMatch.teamBName : nextMatch.teamAName) : null;
	const pool = nextMatch?.poolAssignment ? (isTeamA ? nextMatch.poolAssignment.teamAPool : nextMatch.poolAssignment.teamBPool) : null;
	const finishedMatches = matches.filter((match) => match.status === "Finished" && match.winner);
	const playerWins = finishedMatches.filter((match) => match.winner === team?.name).length;
	const visibleMatches = [...matches.filter((match) => match.status !== "Finished"), ...finishedMatches.slice().reverse()].slice(0, 6);

	const checks = [
		{ label: "Discord angemeldet", ok: true, detail: discordHandle },
		{ label: "Auf dem Server", ok: member !== false, detail: member === false ? "Bitte dem Discord beitreten" : "Mitgliedschaft erkannt" },
		{ label: "Riot verifiziert", ok: Boolean(verified), detail: verified?.riotId ?? "Noch kein Riot-Account verifiziert" },
		{ label: "Bewerbung gespeichert", ok: Boolean(application), detail: application ? `Anzeigename: ${application.displayName}` : "Noch keine Bewerbung" },
		{ label: "Team zugewiesen", ok: Boolean(team), detail: team?.name ?? "Noch kein Team" },
	];
	const readyCount = checks.filter((check) => check.ok).length;

	return (
		<main className="account-page">
			<div className="account-crumbs">
				<a href={returnTarget.href}>← {returnTarget.label}</a>
				<nav aria-label="Lauchgruen-Bereiche">
					<a href={siteUrls.apex}>Hauptseite</a>
					<a href={`${siteUrls.apex}/overlay`}>Overlay</a>
					<a href={siteUrls.tournament}>Turnier</a>
				</nav>
			</div>

			<section className="account-hero">
				<div className="large-avatar">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={discordAvatarUrl} width={86} height={86} alt={`Discord-Profilbild von ${discordHandle}`} />
				</div>
				<div className="min-w-0">
					<p className="eyebrow">
						<i />
						Dein Lauchgruen-Konto
					</p>
					<h1>{application?.displayName ?? discordHandle}</h1>
					<div className="account-hero-meta">
						<span>
							Discord <strong>@{discordHandle}</strong>
						</span>
						<span>
							Riot <strong>{verified?.riotId ?? "nicht verifiziert"}</strong>
						</span>
						<span>
							{settings.activeTournament.name} · <strong>{MODE_LABELS[settings.activeTournament.mode] ?? settings.activeTournament.mode}</strong>
						</span>
					</div>
				</div>
				<div className="account-hero-actions">
					{isOwner ? (
						<Link className="button primary" href={tournamentHref("/admin")}>
							Admin öffnen
						</Link>
					) : null}
					<AccountLogoutButton returnUrl={returnTarget.href} label="Abmelden" className="button ghost" />
				</div>
			</section>

			{member === false ? (
				<a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="account-message mt-4 block" data-tone="warn">
					Du bist noch nicht auf dem Lauchgruen-Discord. Tritt bei, damit dich Teams und Bot erreichen können ↗
				</a>
			) : null}

			<section className="account-grid">
				<div className="account-main">
					{nextMatch ? (
						<section className="match-call" data-ready={matchAccessReady} aria-labelledby="match-call-title">
							<div className="min-w-0">
								<span className="match-call-status">
									<i />
									{matchAccessReady ? (isUltimateBravery ? "Rolls sind freigegeben" : "Champ Select ist freigegeben") : "Nächstes Match steht fest"}
								</span>
								<small>
									{nextMatch.round} · {nextMatch.time}
									{nextMatch.bestOf > 1 ? ` · Bo${nextMatch.bestOf}` : ""}
									{!isUltimateBravery && pool ? ` · Pool ${compactPoolLabel(pool)}` : ""}
								</small>
								<h2 id="match-call-title">
									{team?.name} <span>vs</span> {opponent?.name ?? (isTeamA ? nextMatch.teamBLabel : nextMatch.teamALabel)}
								</h2>
								<p>
									{matchAccessReady
										? isUltimateBravery
											? "Dein persönlicher Roll wartet. Öffne jetzt die Match-Seite und bestätige Champion, Build, Runen und Summoner Spells."
											: isCaptain
												? "Der Champ Select ist geöffnet. Als Captain lockst du Picks und Bans für dein Team; gesperrte Fearless-Champions sind dort ausgegraut."
												: "Der Champ Select ist geöffnet. Dein Captain draftet, du kannst live zuschauen und dich im Voice abstimmen."
										: "Die Paarung steht. Sobald die Turnierleitung das Match freigibt, wird dieser Bereich grün und der Startknopf erscheint."}
								</p>
							</div>
							<div className="match-call-actions">
								{isUltimateBravery ? (
									<Link className={`button ${matchAccessReady ? "primary" : "ghost"}`} href={tournamentHref(`/matches/${nextMatch.id}`)}>
										{matchAccessReady ? "Roll öffnen" : "Match-Seite öffnen"}
									</Link>
								) : pool || matchAccessReady ? (
									<Link className="button primary" href={tournamentHref(isCaptain ? `/champ-select/${nextMatch.id}` : `/champ-select/${nextMatch.id}/spectate`)}>
										Champ Select öffnen
									</Link>
								) : (
									<Link className="button ghost" href={tournamentHref(`/matches/${nextMatch.id}`)}>
										Match-Seite öffnen
									</Link>
								)}
								{isCaptain ? (
									<Link className="button ghost" href={tournamentHref("/captain")}>
										Captain Portal
									</Link>
								) : null}
							</div>
						</section>
					) : null}

					<section className="account-section" aria-labelledby="identities-title">
						<div className="account-section-head">
							<div>
								<span>Verbundene Konten</span>
								<h2 id="identities-title">Dein Game-Pass</h2>
							</div>
							<small>Discord bleibt dein Login. Riot und Twitch verknüpfst du einmal für alle Turniere und Overlays.</small>
						</div>
						<div className="connection-grid">
							<article className="connection-card connected discord">
								<span>
									<DiscordMark />
								</span>
								<div>
									<small>Login-Konto</small>
									<h3>Discord</h3>
									<p>
										@{discordHandle} · {member === false ? "nicht auf dem Server" : "Servermitglied"}
									</p>
								</div>
								{member === false ? (
									<a className="connection-action" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
										Server beitreten ↗
									</a>
								) : (
									<b className="connection-badge">Verbunden ✓</b>
								)}
							</article>
							<RiotVerificationCard
								verified={
									verified
										? {
												riotId: verified.riotId,
												currentRankAuto: verified.currentRankAuto,
												summonerLevel: verified.summonerLevel,
												verifiedAt: verified.verifiedAt,
											}
										: null
								}
								disconnectBlockedReason={
									application && applicationDeadlinePassed
										? "Nach Bewerbungsschluss bleibt der verifizierte Riot-Account mit deiner verbindlichen Bewerbung verknüpft. Für Änderungen wende dich bitte an das Orga-Team."
										: null
								}
							/>
							<TwitchLinkCard initialLink={twitchLink} status={params.twitch} isOwner={isOwner} verifiedRiotId={verified?.riotId ?? null} returnSource={source} />
						</div>
						<p className="account-note">
							Die Riot-Verknüpfung prüfst du über ein League-Profilicon; wir fragen nie nach deinem Riot-Passwort. Twitch kannst du jederzeit wieder trennen.
						</p>
					</section>

					<section className="account-section" aria-labelledby="queue-title">
						<div className="account-section-head">
							<div>
								<span>Turnier</span>
								<h2 id="queue-title">Deine Queue</h2>
							</div>
							<small>
								{applicationDeadlinePassed
									? `Bewerbungsschluss war am ${applicationDeadlineLabel}.`
									: `Bewerbungen und Rücknahmen sind bis ${applicationDeadlineLabel} möglich.`}
							</small>
						</div>
						<div className="my-tournaments">
							{application ? (
								<article>
									<span>{MODE_LABELS[settings.activeTournament.mode] ?? settings.activeTournament.mode}</span>
									<h3>{settings.activeTournament.name}</h3>
									<p>
										{application.preferredRoles.length ? application.preferredRoles.join(" / ") : application.mainRole} · {team?.name ?? "Noch kein Team"}
									</p>
									<div className="queue-card-actions">
										<TournamentDmPreferenceCard initialEnabled={application.discordDmOptIn !== false} />
										<Link className="queue-action" href={tournamentHref("")}>
											Turnier ansehen <span aria-hidden="true">↗</span>
										</Link>
										{applicationsOpen ? (
											<Link className="queue-action is-primary" href={tournamentHref("/apply")}>
												Bewerbung bearbeiten <span aria-hidden="true">↗</span>
											</Link>
										) : null}
										{applicationDeadlinePassed ? (
											<span className="queue-note">Rücknahme nur über das Orga-Team</span>
										) : (
											<WithdrawApplicationButton deadlineLabel={applicationDeadlineLabel} buttonClassName="queue-action is-danger" />
										)}
										<b className={`check-status ${team ? "" : "is-pending"}`}>{team ? `Team ${team.name}` : "Teamzuteilung offen"}</b>
									</div>
								</article>
							) : (
								<div className="account-empty">
									<h3>{applicationsOpen ? "Noch keine Bewerbung" : "Gerade keine offene Anmeldung"}</h3>
									<p>
										{applicationsOpen
											? `Die Anmeldung für ${settings.activeTournament.name} ist geöffnet. Mit Riot-Verifizierung bist du in wenigen Minuten dabei.`
											: "Die Anmeldung startet, sobald Termin und Format feststehen. Verknüpfe Riot schon jetzt, dann geht es später schneller."}
									</p>
									{applicationsOpen ? (
										<Link className="button primary small" href={tournamentHref("/apply")}>
											Jetzt bewerben
										</Link>
									) : (
										<Link className="button ghost small" href={tournamentHref("")}>
											Zum Turnier
										</Link>
									)}
								</div>
							)}
						</div>
					</section>

					<PreferenceGroupCard
						mode={normalizeWishGroupMode(settings.wishGroupMode)}
						registrationOpen={applicationsOpen}
						hasApplication={Boolean(application)}
						initialGroup={
							preferenceGroup
								? { code: preferenceGroup.code, memberCount: preferenceGroup.memberDiscordIds.length, maxMembers: wishGroupLimit(settings.wishGroupMode) }
								: null
						}
					/>

					{isCaptain && team ? (
						<section className="account-section captain-portal" aria-labelledby="captain-title">
							<div className="account-section-head">
								<div>
									<span>Captain</span>
									<h2 id="captain-title">{team.name}</h2>
								</div>
								<small>Captain-Rechte gelten nur für dein eigenes Team.</small>
							</div>
							<div className="captain-portal-body">
								<p>Teamname anpassen, vor dem Match einchecken und Ergebnisse melden: Alles dafür findest du im Captain Portal.</p>
								<Link className="button primary" href={tournamentHref("/captain")}>
									Captain Portal öffnen
								</Link>
							</div>
						</section>
					) : null}

					<section className="account-section" aria-labelledby="matches-title">
						<div className="account-section-head">
							<div>
								<span>Match Desk</span>
								<h2 id="matches-title">Deine Matches</h2>
							</div>
							<small>Die Turnierleitung trägt die offiziellen Ergebnisse ein.</small>
						</div>
						{team ? (
							<>
								<dl className="account-stats">
									<div>
										<dt>Gespielt</dt>
										<dd>{finishedMatches.length}</dd>
									</div>
									<div>
										<dt>Siege</dt>
										<dd>{playerWins}</dd>
									</div>
									<div>
										<dt>Bilanz</dt>
										<dd>
											{playerWins}–{finishedMatches.length - playerWins}
										</dd>
									</div>
								</dl>
								<div className="my-match-list">
									{visibleMatches.map((match) => {
										const scored = match.scoreA !== undefined && match.scoreB !== undefined;
										return (
											<Link key={match.id} href={tournamentHref(`/matches/${match.id}`)}>
												<header>
													<span>
														{match.round}
														{match.bestOf > 1 ? ` · Bo${match.bestOf}` : ""}
													</span>
													<b>{MATCH_STATUS_LABELS[match.status] ?? match.status}</b>
												</header>
												<div className="match-score-line">
													<strong data-won={match.winner === match.teamAName}>{match.teamALabel}</strong>
													<em>{scored ? `${match.scoreA} : ${match.scoreB}` : "vs"}</em>
													<strong data-won={match.winner === match.teamBName}>{match.teamBLabel}</strong>
												</div>
											</Link>
										);
									})}
									{!visibleMatches.length ? <p className="account-note">Sobald eure Paarungen feststehen, erscheinen sie hier.</p> : null}
								</div>
							</>
						) : (
							<p className="account-note">Matches erscheinen, sobald dir ein Team zugeteilt wurde.</p>
						)}
					</section>
				</div>

				<aside className="account-side" aria-label="Kontostatus">
					<div>
						<div className="account-side-kicker">
							Startklar
							<b>
								{readyCount}/{checks.length}
							</b>
						</div>
						<h2>{readyCount === checks.length ? "Alles bereit." : "Fast geschafft."}</h2>
						<ul className="account-checklist">
							{checks.map((check) => (
								<li key={check.label} data-ok={check.ok}>
									<span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
									<div className="min-w-0">
										<strong>{check.label}</strong>
										<small title={check.detail}>{check.detail}</small>
									</div>
								</li>
							))}
						</ul>
					</div>
					<div>
						<div className="account-side-kicker">
							Team
							{isCaptain ? <b>Captain</b> : null}
						</div>
						<h2>{team?.name ?? "Noch kein Team"}</h2>
						{team ? (
							<ul className="account-roster">
								{team.players.map((player) => (
									<li key={player.riotId}>
										<strong title={player.riotId}>{player.name}</strong>
										<small>{player.role}</small>
									</li>
								))}
							</ul>
						) : (
							<p className="account-note">Sobald die Turnierleitung die Rosters veröffentlicht, siehst du hier dein Team.</p>
						)}
					</div>
				</aside>
			</section>
		</main>
	);
}
