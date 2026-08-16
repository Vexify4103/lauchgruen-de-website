import { TournamentLink as Link } from "../TournamentLink";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { DISCORD_INVITE_URL, isDiscordGuildMember } from "@/lib/discord";
import { findTeamByName, getMatchControlContext } from "@/lib/match-control";
import {
	getVerifiedAccount,
	getPreferenceGroupForDiscordId,
	getTwitchLink,
	listApplications,
	TOURNAMENT_PREFERENCE_GROUP_LIMIT,
	TOURNAMENT_OWNER_DISCORD_IDS,
} from "@/lib/tournament-storage";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { PreferenceGroupCard } from "./PreferenceGroupCard";
import { RiotVerificationCard } from "./RiotVerificationCard";
import { TwitchLinkCard } from "./TwitchLinkCard";
import { DiscordSignInButton } from "../DiscordSignInButton";
import { AccountLogoutButton } from "./AccountLogoutButton";
import { TournamentDmPreferenceCard } from "./TournamentDmPreferenceCard";
import { getSiteUrls } from "@/lib/site-urls";
import { isTournamentHost } from "@/lib/tournament-url";
import { formatTournamentApplicationDeadlineLabel, isTournamentApplicationDeadlinePassed } from "@/lib/tournament-application-deadline";
import { WithdrawApplicationButton } from "./WithdrawApplicationButton";

export const metadata: Metadata = {
	title: "Mein Lauchgruen-Konto",
	description: "Verwalte Discord, Riot, Twitch, Community-Overlays und deine Turnierteilnahmen.",
};

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
			<Shell>
				<section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-lime-200/12 bg-white/[0.045] p-6">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Mein Status</div>
					<h1 className="mt-3 text-3xl font-black text-emerald-50">Bitte mit Discord anmelden.</h1>
					<p className="mt-3 text-sm leading-7 text-emerald-100/64">
						Danach zeigen wir dir, ob deine Bewerbung, Discord-Mitgliedschaft, Riot-Verifizierung und Teamzuweisung bereit sind.
					</p>
					<div className="mt-5">
						<DiscordSignInButton
							redirectTo={accountUrl}
							pendingLabel="Weiter zu Discord..."
							className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 disabled:cursor-wait disabled:opacity-65"
						>
							Mit Discord anmelden
						</DiscordSignInButton>
					</div>
				</section>
			</Shell>
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
	const twitchStatus = params.twitch;
	const isUltimateBravery = settings.activeTournament.id === "ultimate-bravery";
	const discordAvatarUrl = session.user.discordAvatar ?? "https://cdn.discordapp.com/embed/avatars/0.png";
	const application = applications.find((entry) => entry.discordId === discordId) ?? null;
	const applicationDeadlinePassed = isTournamentApplicationDeadlinePassed(new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline);
	const applicationDeadlineLabel = formatTournamentApplicationDeadlineLabel(settings.applicationDeadline);
	const team =
		ctx.teams.find((entry) => entry.players.some((player) => player.riotId.toLowerCase() === application?.riotId.toLowerCase()) || entry.captainRef?.discordId === discordId) ??
		null;
	const isCaptain = team?.captainRef?.discordId === discordId;
	const matches = team ? ctx.matches.filter((match) => match.teamAName === team.name || match.teamBName === team.name) : [];
	const nextMatch = matches.find((match) => match.status === "Live") ?? matches.find((match) => match.status !== "Finished") ?? null;
	const isTeamA = nextMatch?.teamAName === team?.name;
	const opponent = nextMatch ? findTeamByName(ctx.teams, isTeamA ? nextMatch.teamBName : nextMatch.teamAName) : null;
	const pool = nextMatch?.poolAssignment ? (isTeamA ? nextMatch.poolAssignment.teamAPool : nextMatch.poolAssignment.teamBPool) : null;
	const finishedMatches = matches.filter((match) => match.status === "Finished" && match.scoreA !== undefined && match.scoreB !== undefined);
	const playerWins = finishedMatches.filter((match) =>
		match.teamAName === team?.name ? (match.scoreA ?? 0) > (match.scoreB ?? 0) : (match.scoreB ?? 0) > (match.scoreA ?? 0)
	).length;
	const accountChecksComplete = [true, member !== false, Boolean(verified), Boolean(application)].filter(Boolean).length;
	const tournamentModeLabel =
		settings.activeTournament.mode === "registration"
			? "Anmeldung geöffnet"
			: settings.activeTournament.mode === "live"
				? "Turnier läuft"
				: settings.activeTournament.mode === "paused"
					? "Turnier pausiert"
					: settings.activeTournament.mode === "preparation"
						? "Vorbereitung"
						: "Ankündigung";

	const checks = [
		{
			label: "Discord angemeldet",
			ok: true,
			detail: session.user.discordHandle ?? discordId,
		},
		{
			label: "Auf dem Server",
			ok: member !== false,
			detail: member === false ? "Bitte dem Discord beitreten" : "Mitgliedschaft erkannt",
		},
		{
			label: "Riot verifiziert",
			ok: Boolean(verified),
			detail: verified?.riotId ?? "Noch kein Riot-Account verifiziert",
		},
		{
			label: "Bewerbung gespeichert",
			ok: Boolean(application),
			detail: application ? `Anzeigename: ${application.displayName}` : "Noch keine Bewerbung",
		},
		{
			label: "Team zugewiesen",
			ok: Boolean(team),
			detail: team?.name ?? "Noch kein Team",
		},
		{
			label: "Captain",
			ok: Boolean(isCaptain),
			detail: isCaptain ? "Du bist Captain" : "Kein Captain-Status",
		},
	];

	return (
		<Shell>
			<section className="mx-auto w-full max-w-6xl">
				<div className="grid gap-6">
					<nav
						aria-label="Kontobereich verlassen"
						className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/9 bg-black/18 p-2.5 shadow-lg shadow-black/15"
					>
						<a href={returnTarget.href} className="rounded-xl bg-white/[0.06] px-4 py-2.5 text-xs font-black text-emerald-50 transition hover:bg-white/[0.1]">
							← {returnTarget.label}
						</a>
						<div className="flex flex-wrap gap-1.5">
							<a
								href={siteUrls.apex}
								className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/55 transition hover:bg-white/[0.05] hover:text-lime-100"
							>
								Hauptseite
							</a>
							<a
								href={`${siteUrls.apex}/overlay`}
								className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/55 transition hover:bg-white/[0.05] hover:text-cyan-100"
							>
								Overlay
							</a>
							<a
								href={siteUrls.tournament}
								className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/55 transition hover:bg-white/[0.05] hover:text-lime-100"
							>
								Turnier
							</a>
						</div>
					</nav>
					<div className="relative overflow-hidden rounded-[2.4rem] border border-lime-200/12 bg-gradient-to-br from-lime-200/14 via-emerald-400/8 to-cyan-400/10 shadow-2xl shadow-black/24">
						<div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-cyan-300/10 blur-3xl" />
						<div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
							<div className="size-20 overflow-hidden rounded-[1.6rem] border border-lime-200/30 bg-[#09160d] shadow-lg shadow-lime-300/10">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={discordAvatarUrl} alt={`Discord-Profilbild von ${session.user.discordHandle ?? "dir"}`} className="size-full object-cover" />
							</div>
							<div className="min-w-0">
								<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Mein Lauchgruen-Konto</div>
								<h1 className="mt-2 truncate text-4xl font-black tracking-tight text-emerald-50">
									{application?.displayName ?? session.user.discordHandle ?? "Teilnehmer"}
								</h1>
								<p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-100/68">
									Deine zentrale Stelle für Discord, Riot, Twitch, Community-Overlays und Turnierteilnahmen.
								</p>
								<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-emerald-100/58">
									<span>
										Discord: <strong className="text-emerald-50">{session.user.discordHandle ?? discordId}</strong>
									</span>
									<span>
										Riot: <strong className="text-emerald-50">{verified?.riotId ?? "nicht verifiziert"}</strong>
									</span>
									{verified?.summonerLevel ? (
										<span>
											Level <strong className="text-emerald-50">{verified.summonerLevel}</strong>
										</span>
									) : null}
								</div>
							</div>
							<div className="rounded-2xl border border-cyan-200/18 bg-cyan-300/[0.08] px-4 py-3 text-center sm:text-right">
								<div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/60">Ultimate Bravery</div>
								<div className="mt-1 text-sm font-black text-cyan-50">{tournamentModeLabel}</div>
							</div>
						</div>
						<div className="relative border-t border-white/8 bg-black/10 px-6 py-4 sm:px-8">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="text-sm font-bold text-emerald-100/64">
									{application
										? "Deine Bewerbung ist hinterlegt. Duo und Twitch kannst du unten jederzeit verwalten."
										: settings.activeTournament.mode === "registration"
											? "Die Anmeldung ist geöffnet. Vervollständige jetzt dein Turnierprofil."
											: "Die Anmeldung startet, sobald Termin und Format feststehen."}
								</p>
								{!application && settings.activeTournament.mode === "registration" ? (
									<Link
										href={tournamentHref("/apply")}
										className="rounded-xl bg-lime-200 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/20"
									>
										Jetzt bewerben
									</Link>
								) : null}
							</div>
						</div>
						<div className="relative flex flex-wrap gap-3 px-6 py-5 sm:px-8">
							{isOwner ? (
								<Link
									href={tournamentHref("/admin")}
									className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-200 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-lg shadow-lime-300/20 transition hover:-translate-y-0.5"
								>
									Admin öffnen
								</Link>
							) : null}
							<AccountLogoutButton returnUrl={returnTarget.href} />
						</div>
					</div>

					<section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/18 sm:p-6">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Konto-Fortschritt</div>
								<h2 className="mt-2 text-2xl font-black text-emerald-50">Alles Wichtige auf einen Blick.</h2>
							</div>
							<div className="rounded-2xl border border-lime-200/18 bg-lime-200/8 px-4 py-2 text-sm font-black text-lime-100">{accountChecksComplete}/4 bereit</div>
						</div>
						<div className="relative mt-5 grid gap-0 overflow-hidden rounded-[1.5rem] border border-white/9 bg-black/16 sm:grid-cols-2">
							{checks.slice(0, 4).map((check) => (
								<div
									key={check.label}
									className="flex items-center gap-4 border-b border-white/8 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
								>
									<span
										className={`grid size-9 shrink-0 place-items-center rounded-full border text-xs font-black ${check.ok ? "border-lime-200/24 bg-lime-200/12 text-lime-100" : "border-amber-200/24 bg-amber-200/10 text-amber-100"}`}
									>
										{check.ok ? "✓" : "!"}
									</span>
									<div className="min-w-0">
										<div className="text-sm font-black text-emerald-50">{check.label}</div>
										<div className="mt-0.5 truncate text-xs text-emerald-100/50">{check.detail}</div>
									</div>
								</div>
							))}
						</div>
					</section>

					<div className="grid gap-6">
						{application ? <TournamentDmPreferenceCard initialEnabled={application.discordDmOptIn !== false} /> : null}
						{application ? (
							<section className="rounded-[2rem] border border-rose-300/14 bg-rose-400/[0.045] p-5 shadow-xl shadow-black/16 sm:p-6">
								<div className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/64">Turnierteilnahme</div>
								<h2 className="mt-2 text-xl font-black text-emerald-50">Deine Bewerbung verwalten</h2>
								<p className="mt-2 text-sm leading-6 text-emerald-100/58">
									{applicationDeadlinePassed
										? `Der Bewerbungsschluss am ${applicationDeadlineLabel} ist vorbei. Eine Rücknahme ist jetzt nur noch über das Orga-Team möglich.`
										: `Du kannst deine Bewerbung bis ${applicationDeadlineLabel} selbst zurückziehen. Deine verknüpften Konten bleiben dabei erhalten.`}
								</p>
								{!applicationDeadlinePassed ? <WithdrawApplicationButton deadlineLabel={applicationDeadlineLabel} className="mt-4 sm:justify-self-start" /> : null}
							</section>
						) : null}
						<PreferenceGroupCard
							hasApplication={Boolean(application)}
							initialGroup={
								preferenceGroup
									? {
											code: preferenceGroup.code,
											memberCount: preferenceGroup.memberDiscordIds.length,
											maxMembers: TOURNAMENT_PREFERENCE_GROUP_LIMIT,
										}
									: null
							}
						/>
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
									? "Nach Bewerbungsschluss bleibt der verifizierte Riot-Account mit deiner verbindlichen Bewerbung verknüpft. Bitte wende dich für Änderungen an das Orga-Team."
									: null
							}
						/>
						<TwitchLinkCard initialLink={twitchLink} status={twitchStatus} isOwner={isOwner} verifiedRiotId={verified?.riotId ?? null} returnSource={source} />
					</div>

					{nextMatch ? (
						<div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
							<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Nächstes Match · {nextMatch.id}</div>
							<h2 className="mt-2 text-3xl font-black text-emerald-50">
								{team?.name} vs {opponent?.name ?? (isTeamA ? nextMatch.teamBLabel : nextMatch.teamALabel)}
							</h2>
							<div className="mt-4 grid gap-3 sm:grid-cols-3">
								<Info label="Status" value={nextMatch.status ?? "Scheduled"} />
								<Info label="Zeit" value={`${nextMatch.round} · ${nextMatch.time}`} />
								<Info
									label={isUltimateBravery ? "Dein Roll" : "Dein Pool"}
									value={isUltimateBravery ? "Auf der Match-Seite" : pool ? compactPoolLabel(pool) : "Noch offen"}
								/>
							</div>
							<div className="mt-5 flex flex-wrap gap-2">
								{isUltimateBravery ? (
									<Link
										href={tournamentHref(`/matches/${nextMatch.id}`)}
										className="rounded-2xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
									>
										Match & Roll öffnen
									</Link>
								) : pool ? (
									<Link
										href={tournamentHref(`/champ-select/${nextMatch.id}/spectate`)}
										className="rounded-2xl border border-sky-200/20 bg-sky-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-sky-50/82"
									>
										Spectator Draft
									</Link>
								) : null}
								{isCaptain && !isUltimateBravery ? (
									<Link
										href={tournamentHref("/captain")}
										className="rounded-2xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950"
									>
										Captain Portal
									</Link>
								) : null}
							</div>
						</div>
					) : null}

					{team ? (
						<div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
							<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Deine Turnierhistorie</div>
							<div className="mt-4 grid gap-3 sm:grid-cols-3">
								<Info label="Matches" value={String(finishedMatches.length)} />
								<Info label="Siege" value={String(playerWins)} />
								<Info label="Bilanz" value={`${playerWins}-${finishedMatches.length - playerWins}`} />
							</div>
							{finishedMatches.length ? (
								<div className="mt-4 grid gap-2">
									{finishedMatches
										.slice()
										.reverse()
										.slice(0, 5)
										.map((match) => (
											<Link
												key={match.id}
												href={tournamentHref(`/matches/${match.id}`)}
												className="rounded-xl border border-white/8 bg-black/18 px-3 py-2 text-sm font-bold text-emerald-100/72 hover:text-lime-100"
											>
												{match.teamALabel} {match.scoreA}:{match.scoreB} {match.teamBLabel}
											</Link>
										))}
								</div>
							) : (
								<p className="mt-4 text-sm text-emerald-100/48">Sobald eure ersten Ergebnisse feststehen, erscheint hier deine Bilanz.</p>
							)}
						</div>
					) : null}
				</div>

				<aside className="mt-6 grid content-start gap-4">
					{member === false ? (
						<a
							href={DISCORD_INVITE_URL}
							target="_blank"
							rel="noreferrer"
							className="rounded-[2rem] border border-amber-200/18 bg-amber-200/10 p-5 text-sm font-black text-amber-50 shadow-xl shadow-black/20"
						>
							Discord beitreten, um fortzufahren
						</a>
					) : null}
					<div className="rounded-[2rem] border border-white/10 bg-black/18 p-5 shadow-xl shadow-black/24">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Team</div>
						{team ? (
							<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								<h2 className="text-2xl font-black text-emerald-50">{team.name}</h2>
								{team.players.map((player) => (
									<div key={player.riotId} className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
										<div className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200/58">{player.role}</div>
										<div className="mt-1 truncate text-sm font-black text-emerald-50">{player.name}</div>
										<div className="truncate text-xs text-emerald-100/46">{player.riotId}</div>
									</div>
								))}
							</div>
						) : (
							<p className="mt-3 text-sm leading-6 text-emerald-100/56">Noch kein Team zugewiesen. Sobald das Orga-Team Rosters baut, erscheint es hier.</p>
						)}
					</div>
				</aside>
			</section>
		</Shell>
	);
}

function Shell({ children }: { children: ReactNode }) {
	return <div className="px-5 py-10 sm:py-14">{children}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-white/10 bg-black/18 p-4">
			<div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/42">{label}</div>
			<div className="mt-1 text-lg font-black text-lime-100">{value}</div>
		</div>
	);
}
