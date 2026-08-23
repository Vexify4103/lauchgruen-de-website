import { TournamentLink as Link } from "../TournamentLink";
import { auth } from "@/lib/auth";
import { computeGroupStandings, resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { checkDiscordMemberRole, isDiscordGuildMember } from "@/lib/discord";
import { listAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS, readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { getTournamentWheelState } from "@/lib/tournament-wheel";
import { getAdminVersions } from "@/lib/admin-version";
import { areTournamentApplicationsOpen } from "@/lib/tournament-application-deadline";
import { MatchAdminClient, type AdminMatch } from "./MatchAdminClient";
import { AuditLogPanel } from "./AuditLogPanel";
import type { CaptainRoleStatus } from "./DiscordSyncPanel";
import { DiscordControlCenter } from "./DiscordControlCenter";
import { TournamentModePanel } from "./TournamentModePanel";
import { WheelAdminClient } from "./WheelAdminClient";
import { getTournamentArchive } from "@/lib/tournament-next";
import { DiscordSignInButton } from "../DiscordSignInButton";
import { RefreshRanksButton } from "./applicants/RefreshRanksButton";

export default async function TournamentAdminPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
	const [settings, audit, azArchive] = isOwner ? await Promise.all([getTournamentSettings(), listAuditLog(), getTournamentArchive("az-2026")]) : [null, [], null];
	const isBlankTournament = settings?.activeTournament.id === "ultimate-bravery";
	const ctx = isOwner && !isBlankTournament ? await getTournamentContext() : null;
	const state = isOwner && ctx ? await readTournamentState(ctx.groupMatches) : null;
	const wheel = isOwner && !isBlankTournament ? await getTournamentWheelState() : null;
	const applicationsOpen = settings
		? areTournamentApplicationsOpen(settings.applicationsOpen, new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline, settings.applicationOpenAt)
		: false;

	let adminMatches: AdminMatch[] = [];
	let adminVersions: Record<string, number> = isOwner ? await getAdminVersions(["settings"]) : {};
	let tiebreakerGroups: Array<"A" | "B"> = [];
	if (state && ctx) {
		const matchesWithPools = new Set([
			...(wheel?.history.map((assignment) => assignment.matchId) ?? []),
			...(wheel?.currentAssignment ? [wheel.currentAssignment.matchId] : []),
		]);
		const standings = computeGroupStandings(state.matches, ctx.teams, ctx.groupMatches);
		tiebreakerGroups = (["A", "B"] as const).filter((group) => standings[group].some((standing) => standing.tiebreakerRequired));
		const resolved = resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
		adminMatches = [
			...ctx.groupMatches.map<AdminMatch>((m) => ({
				id: m.id,
				phase: "groups",
				group: m.group,
				round: m.round,
				teamA: m.teamA,
				teamB: m.teamB,
				status: (state.matches[m.id]?.status ?? m.status) as AdminMatch["status"],
				poolsDrawn: matchesWithPools.has(m.id),
			})),
			...resolved.map<AdminMatch>((m) => ({
				id: m.id,
				phase: "playoffs",
				round: m.round,
				teamA: m.teamALabel,
				teamB: m.teamBLabel,
				status: m.status as AdminMatch["status"],
				poolsDrawn: matchesWithPools.has(m.id),
			})),
		];
		adminVersions = await getAdminVersions(["settings", ...adminMatches.map((match) => `match:${match.id}`)]);
	}

	return (
		<div className="relative overflow-hidden px-5 py-8 sm:py-10">
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_12%_0%,rgba(190,242,100,0.1),transparent_34%),radial-gradient(circle_at_84%_8%,rgba(34,211,238,0.08),transparent_30%)]" />
			<section className="relative mx-auto w-full max-w-[96rem]">
				<header className="overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#08150e]/92 shadow-2xl shadow-black/30">
					<div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
						<div className="max-w-3xl">
							<div className="text-[10px] font-black uppercase tracking-[0.34em] text-lime-200/58">Owner Control Center</div>
							<h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-emerald-50 sm:text-6xl">
								Turnier steuern.
								<br />
								<span className="text-emerald-100/36">Ohne Umwege.</span>
							</h1>
							<p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100/56">
								Format, Bewerbungen, Roster und Live-Betrieb an einem Ort. Änderungen sind ausschließlich für die hinterlegten Owner-Accounts verfügbar.
							</p>
						</div>
						{settings ? <AdminStatusGrid settings={settings} applicationsOpen={applicationsOpen} /> : null}
					</div>
					{isOwner ? (
						<nav aria-label="Admin-Bereiche" className="grid border-t border-white/8 bg-black/14 sm:grid-cols-2 xl:grid-cols-4">
							<AdminAreaLink
								href="/tournament/admin/live"
								eyebrow="Operativer Betrieb"
								title="Live-Cockpit"
								detail="Matches, Scores und laufende Spiele"
								tone="red"
							/>
							<AdminAreaLink href="/tournament/admin/applicants" eyebrow="Teilnehmer" title="Bewerbungen" detail="Profile, Blacklist und Wunschgruppen" tone="cyan" />
							<AdminAreaLink href="/tournament/admin/roster" eyebrow="Teambau" title="Roster-Builder" detail="Rollen, Balance und Discord-Sync" tone="lime" />
							<AdminAreaLink href="/tournament/admin/status" eyebrow="Betrieb" title="Systemstatus" detail="APIs, Cache und Queue" tone="cyan" />
						</nav>
					) : null}
				</header>

				{isOwner ? (
					<>
						<div className="mt-8 flex items-center gap-3">
							<div>
								<div className="text-[10px] font-black uppercase tracking-[0.28em] text-lime-200/52">Konfiguration</div>
								<h2 className="mt-1 text-2xl font-black text-emerald-50">Turniersteuerung</h2>
							</div>
							<div className="h-px flex-1 bg-gradient-to-r from-lime-200/16 to-transparent" />
						</div>
						<div className="mt-4">{settings ? <TournamentModePanel initialSettings={settings} initialVersion={adminVersions.settings ?? 0} /> : null}</div>
						{isBlankTournament && settings ? (
							<div className="mt-5">
								<TeaserReadinessChecklist settings={settings} hasAzArchive={Boolean(azArchive)} />
							</div>
						) : null}
						{!isBlankTournament ? (
							<div className="mt-5">
								<ReadinessChecklist
									teams={ctx?.teams ?? []}
									matches={adminMatches}
									diagnostics={null}
									applicationsEnabled={applicationsOpen}
									hasActiveWheelDraw={Boolean(wheel?.currentAssignment)}
								/>
							</div>
						) : null}
						<div className="mt-5">
							<section className="grid min-w-0 gap-5 overflow-hidden rounded-[2rem] border border-cyan-200/14 bg-[linear-gradient(135deg,rgba(34,211,238,0.065),rgba(7,20,13,0.9)_46%)] p-5 shadow-xl shadow-black/22 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-start">
								<div className="max-w-2xl">
									<div className="text-[9px] font-black uppercase tracking-[0.26em] text-cyan-100/52">Riot-Datenbestand</div>
									<h2 className="mt-2 text-xl font-black text-emerald-50">Alle verknüpften Profile abgleichen</h2>
									<p className="mt-2 text-xs leading-6 text-emerald-100/48">
										Aktualisiert Riot-ID, Rang und Summoner-Level sämtlicher dauerhaft gespeicherter Konten. Vorhandene Bewerbungen und Roster-Namen werden
										automatisch mitgezogen.
									</p>
								</div>
								<div className="min-w-0 lg:justify-self-end">
									<RefreshRanksButton label="Alle Riot-Profile aktualisieren" confirmBulk scope="verified" />
								</div>
							</section>
						</div>
						<div className="mt-5">
							<DiscordControlCenter />
						</div>
					</>
				) : null}

				{isOwner && isBlankTournament ? null : (
					<div className="mt-8">
						{isOwner && state ? (
							<section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/24">
								{tiebreakerGroups.length > 0 ? (
									<div className="mb-5 rounded-2xl border border-amber-200/24 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">
										<strong>Tiebreaker erforderlich:</strong> {tiebreakerGroups.map((group) => `Gruppe ${group}`).join(", ")} ist nach allen Gruppenspielen
										nicht eindeutig entschieden. Das Playoff-Seeding bleibt bis zum zusätzlichen Entscheidungsspiel gesperrt.
									</div>
								) : null}
								<MatchAdminClient
									initialMatches={adminMatches}
									initialStored={state.matches}
									initialVersions={Object.fromEntries(adminMatches.map((match) => [match.id, adminVersions[`match:${match.id}`] ?? 0]))}
								/>
							</section>
						) : (
							<div className="rounded-2xl border border-amber-200/24 bg-amber-200/10 p-5 text-sm leading-7 text-amber-50">
								<p>Melde dich mit einem Owner-Discord-Account an, um Turniermatches zu bearbeiten.</p>
								<div className="mt-4">
									<DiscordSignInButton
										redirectTo="/tournament/admin"
										pendingLabel="Weiter zu Discord..."
										className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950 disabled:cursor-wait disabled:opacity-65"
									>
										Mit Discord anmelden
									</DiscordSignInButton>
								</div>
							</div>
						)}
					</div>
				)}

				{isOwner && wheel && !isBlankTournament ? (
					<div className="mt-8">
						<WheelAdminClient initialState={wheel} matches={adminMatches} />
					</div>
				) : null}

				{isOwner ? (
					<div className="mt-8">
						<AuditLogPanel key={audit[0]?.id ?? "empty"} initialEntries={audit} />
					</div>
				) : null}
			</section>
		</div>
	);
}

function AdminStatusGrid({ settings, applicationsOpen }: { settings: Awaited<ReturnType<typeof getTournamentSettings>>; applicationsOpen: boolean }) {
	const modeLabels = { teaser: "Ankündigung", registration: "Anmeldung", preparation: "Vorbereitung", live: "Live", paused: "Pausiert" } as const;
	const dayOne = settings.ultimateBravery.dayOneFormat === "swiss" ? "Swiss" : settings.ultimateBravery.dayOneFormat === "groups" ? "Gruppen" : "Offen";
	const dayTwo = settings.ultimateBravery.format === "double-elimination" ? "Double" : settings.ultimateBravery.format === "single-elimination" ? "Single" : "Offen";
	return (
		<div className="grid min-w-[17rem] grid-cols-2 gap-2">
			<AdminStatusCell label="Modus" value={modeLabels[settings.activeTournament.mode]} tone={settings.activeTournament.mode === "live" ? "red" : "lime"} />
			<AdminStatusCell label="Bewerbungen" value={applicationsOpen ? "Offen" : "Geschlossen"} tone={applicationsOpen ? "cyan" : "neutral"} />
			<AdminStatusCell label="Tag 1" value={dayOne} tone={dayOne === "Offen" ? "amber" : "neutral"} />
			<AdminStatusCell label="Tag 2" value={dayTwo} tone={dayTwo === "Offen" ? "amber" : "neutral"} />
		</div>
	);
}

function AdminStatusCell({ label, value, tone }: { label: string; value: string; tone: "lime" | "cyan" | "red" | "amber" | "neutral" }) {
	const tones = {
		lime: "border-lime-200/18 bg-lime-200/[0.07] text-lime-50",
		cyan: "border-cyan-200/18 bg-cyan-300/[0.07] text-cyan-50",
		red: "border-red-300/20 bg-red-500/[0.08] text-red-50",
		amber: "border-amber-200/20 bg-amber-200/[0.08] text-amber-50",
		neutral: "border-white/9 bg-black/20 text-emerald-50",
	};
	return (
		<div className={`rounded-2xl border px-3 py-2.5 ${tones[tone]}`}>
			<div className="text-[8px] font-black uppercase tracking-[0.18em] opacity-45">{label}</div>
			<div className="mt-1 truncate text-xs font-black">{value}</div>
		</div>
	);
}

function AdminAreaLink({ href, eyebrow, title, detail, tone }: { href: string; eyebrow: string; title: string; detail: string; tone: "red" | "cyan" | "lime" }) {
	const accents = {
		red: "group-hover:text-red-100 group-hover:bg-red-400",
		cyan: "group-hover:text-cyan-100 group-hover:bg-cyan-300",
		lime: "group-hover:text-lime-100 group-hover:bg-lime-300",
	};
	return (
		<Link
			href={href}
			className="group flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4 transition hover:bg-white/[0.035] last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
		>
			<div>
				<div className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-100/32">{eyebrow}</div>
				<div className="mt-1 text-base font-black text-emerald-50">{title}</div>
				<div className="mt-0.5 text-[10px] font-bold text-emerald-100/38">{detail}</div>
			</div>
			<span
				className={`grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-sm font-black text-emerald-100/46 transition ${accents[tone]}`}
			>
				→
			</span>
		</Link>
	);
}

function TeaserReadinessChecklist({ settings, hasAzArchive }: { settings: Awaited<ReturnType<typeof getTournamentSettings>>; hasAzArchive: boolean }) {
	const config = settings.ultimateBravery;
	const formatDecided = config.dayOneFormat !== "undecided" && config.format !== "undecided";
	const openAt = settings.applicationOpenAt ? new Date(settings.applicationOpenAt).getTime() : Number.NaN;
	const deadline = new Date(settings.applicationDeadline).getTime();
	const applicationWindowConfigured = Number.isFinite(openAt) && Number.isFinite(deadline) && openAt < deadline;
	const dayOne =
		config.dayOneFormat === "swiss"
			? `Swiss Stage · ${config.swissRounds} Runden`
			: config.dayOneFormat === "groups"
				? `${config.groupCount} ${config.groupCount === 1 ? "Gruppe" : "Gruppen"} · ${config.groupRoundRobinLegs === 2 ? "Hin- und Rückrunde" : "einmal gegeneinander"}`
				: "noch nicht entschieden";
	const playoffs = config.format === "double-elimination" ? "Double Elimination" : config.format === "single-elimination" ? "Single Elimination" : "noch nicht entschieden";
	const checks = [
		{
			label: "A-Z-Archiv",
			detail: hasAzArchive ? "Das vergangene Turnier ist öffentlich archiviert." : "Der öffentliche A-Z-Snapshot fehlt.",
			state: hasAzArchive ? "done" : "open",
		},
		{
			label: "Ultimate Bravery",
			detail: "Das aktive Turnier ist auf Ultimate Bravery eingestellt.",
			state: settings.activeTournament.id === "ultimate-bravery" ? "done" : "open",
		},
		{
			label: "Format & Regeln",
			detail: `${config.teamCount} Teams · Tag 1: ${dayOne} · Tag 2: ${playoffs} mit ${config.advanceTeamCount} Teams · BO1.`,
			state: formatDecided ? "done" : "open",
		},
		{
			label: "Bewerbungszeitraum",
			detail: applicationWindowConfigured ? "Start und Ende sind gültig konfiguriert." : "Bewerbungsstart oder Frist fehlen beziehungsweise sind ungültig.",
			state: applicationWindowConfigured ? "done" : "open",
		},
	];

	return (
		<section className="overflow-hidden rounded-[2rem] border border-cyan-200/14 bg-[#08160f]/82 shadow-xl shadow-black/22">
			<div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.06] to-transparent px-5 py-4">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.26em] text-cyan-100/52">Planungsstatus</div>
					<h2 className="mt-1 text-xl font-black text-emerald-50">Vorbereitungs-Check</h2>
				</div>
				<p className="max-w-2xl text-xs leading-5 text-emerald-100/46">Die Checks aktualisieren sich automatisch anhand der gespeicherten Turnierdaten.</p>
			</div>
			<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
				{checks.map((check) => (
					<div
						key={check.label}
						className={`rounded-2xl border p-4 ${check.state === "done" ? "border-lime-200/24 bg-lime-200/10" : "border-amber-200/24 bg-amber-200/9"}`}
					>
						<div className="flex items-center gap-2">
							<span
								className={`grid size-6 place-items-center rounded-full text-xs font-black ${check.state === "done" ? "bg-lime-200 text-emerald-950" : "bg-amber-200 text-amber-950"}`}
							>
								{check.state === "done" ? "✓" : "!"}
							</span>
							<span className={`text-[9px] font-black uppercase tracking-[0.18em] ${check.state === "done" ? "text-lime-100/72" : "text-amber-100/72"}`}>
								{check.state === "done" ? "Erledigt" : "Offen"}
							</span>
						</div>
						<div className="mt-3 text-sm font-black text-emerald-50">{check.label}</div>
						<div className="mt-1 text-xs leading-5 text-emerald-100/50">{check.detail}</div>
					</div>
				))}
			</div>
		</section>
	);
}

function ReadinessChecklist({
	teams,
	matches,
	diagnostics,
	applicationsEnabled,
	hasActiveWheelDraw,
}: {
	teams: NonNullable<Awaited<ReturnType<typeof getTournamentContext>>>["teams"];
	matches: AdminMatch[];
	diagnostics: ReadinessDiagnostics | null;
	applicationsEnabled: boolean;
	hasActiveWheelDraw: boolean;
}) {
	const playableMatches = matches.filter((match) => !/^(seed|winner|loser|tbd|-)($| )/i.test(match.teamA) && !/^(seed|winner|loser|tbd|-)($| )/i.test(match.teamB));
	const checks = [
		{
			label: "Teams angelegt",
			ok: teams.length >= 2,
			detail: `${teams.length} Team${teams.length === 1 ? "" : "s"}`,
		},
		{
			label: "Roster vollständig",
			ok: teams.length > 0 && teams.every((team) => team.players.filter((player) => player.role !== "Sub").length >= 5),
			detail: "Mindestens 5 Starter pro Team",
		},
		{
			label: "Captains gesetzt",
			ok: teams.length > 0 && teams.every((team) => !!team.captainRef),
			detail: `${teams.filter((team) => !!team.captainRef).length}/${teams.length}`,
		},
		{
			label: "Discord-Rollen verknüpft",
			ok: teams.length > 0 && teams.every((team) => !!team.discordRoleId),
			detail: `${teams.filter((team) => !!team.discordRoleId).length}/${teams.length}`,
		},
		{
			label: "Matches spielbar",
			ok: playableMatches.length > 0,
			detail: `${playableMatches.length} aufgelöste Matches`,
		},
		{
			label: "Bewerbungen geschlossen",
			ok: !applicationsEnabled,
			detail: applicationsEnabled ? "Noch offen" : "Geschlossen",
		},
		{
			label: "Wheel bereit",
			ok: !hasActiveWheelDraw,
			detail: hasActiveWheelDraw ? "Offener Draw vorhanden" : "Kein offener Draw",
		},
	];
	if (diagnostics) {
		checks.push(
			{
				label: "Captain roles synced",
				ok: diagnostics?.captainRoleStatus.ok ?? false,
				detail: diagnostics?.captainRoleStatus.detail ?? "Nicht geprüft",
			},
			{
				label: "Pools vorbereitet",
				ok: (diagnostics?.missingPools.length ?? 1) === 0,
				detail: diagnostics?.missingPools.length ? `${diagnostics.missingPools.length} Live-Match(es) ohne Pool` : "Alle Live-Matches haben Pools",
			}
		);
	}
	const warnings = diagnostics?.warnings ?? [];

	return (
		<div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Tournament Readiness</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Startklar-Checkliste</h2>
				</div>
				<div className="rounded-2xl border border-white/10 bg-black/18 px-4 py-2 text-sm font-black text-lime-100">
					{checks.filter((check) => check.ok).length}/{checks.length} OK
				</div>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{checks.map((check) => (
					<div key={check.label} className={`rounded-2xl border p-4 ${check.ok ? "border-lime-200/18 bg-lime-200/8" : "border-amber-200/18 bg-amber-200/8"}`}>
						<div className={`text-[10px] font-black uppercase tracking-[0.2em] ${check.ok ? "text-lime-100/70" : "text-amber-100/70"}`}>
							{check.ok ? "OK" : "Offen"}
						</div>
						<div className="mt-1 text-sm font-black text-emerald-50">{check.label}</div>
						<div className="mt-1 text-xs text-emerald-100/48">{check.detail}</div>
					</div>
				))}
			</div>
			{warnings.length > 0 ? (
				<div className="mt-5 rounded-2xl border border-amber-200/18 bg-amber-200/8 p-4">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-amber-100/70">Admin-Warnungen</div>
					<div className="mt-3 grid gap-2">
						{warnings.map((warning) => (
							<div key={warning} className="rounded-xl border border-white/8 bg-black/18 px-3 py-2 text-sm font-bold text-amber-50/82">
								{warning}
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

type ReadinessDiagnostics = {
	captainRoleStatus: {
		ok: boolean;
		detail: string;
	};
	captainRoleDetails: CaptainRoleStatus[];
	missingCaptains: string[];
	missingPools: string[];
	warnings: string[];
};

// Kept only for the future full-readiness endpoint; do not call this during /admin render.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function buildReadinessDiagnostics(
	ctx: Awaited<ReturnType<typeof getTournamentContext>>,
	state: Awaited<ReturnType<typeof readTournamentState>>,
	wheel: Awaited<ReturnType<typeof getTournamentWheelState>>
): Promise<ReadinessDiagnostics> {
	const warnings: string[] = [];
	const missingCaptains = ctx.teams.filter((team) => !team.captainRef).map((team) => team.name);

	const captainIds = ctx.teams.map((team) => team.captainRef?.discordId).filter((discordId): discordId is string => !!discordId);
	const roleId = process.env.DISCORD_CAPTAINS_ROLE_ID?.trim();
	const roleChecks = [];
	for (const team of ctx.teams.filter((entry) => entry.captainRef?.discordId)) {
		roleChecks.push({
			teamName: team.name,
			captainLabel: team.captainRef?.riotId ?? team.captain ?? "Captain",
			discordId: team.captainRef?.discordId ?? "",
			result: await checkDiscordMemberRole({ discordId: team.captainRef?.discordId ?? "", roleId }),
		});
	}
	const failedRoleChecks = roleChecks.filter((entry) => entry.result.status !== "synced");
	for (const entry of failedRoleChecks) {
		warnings.push(`Captain ${entry.discordId}: ${entry.result.message}`);
	}

	for (const team of ctx.teams) {
		const starters = team.players.filter((player) => player.role !== "Sub");
		if (starters.length < 5) {
			warnings.push(`${team.name}: nur ${starters.length}/5 Starter gesetzt.`);
		}
		if (!team.group || !team.seed) {
			warnings.push(`${team.name}: Gruppe oder Seed fehlt.`);
		}
	}

	const riotOwners = new Map<string, string[]>();
	for (const team of ctx.teams) {
		for (const player of team.players) {
			const key = player.riotId.toLowerCase();
			riotOwners.set(key, [...(riotOwners.get(key) ?? []), team.name]);
		}
	}
	for (const [riotId, owners] of riotOwners) {
		if (owners.length > 1) {
			warnings.push(`Duplicate Riot ID ${riotId}: ${owners.join(", ")}.`);
		}
	}

	const applicationByRiot = new Map(state.applications.map((application) => [application.riotId.toLowerCase(), application]));
	const playerDiscordIds = [
		...new Set(
			ctx.teams
				.flatMap((team) => team.players)
				.map((player) => applicationByRiot.get(player.riotId.toLowerCase())?.discordId)
				.filter((discordId): discordId is string => !!discordId)
		),
	];
	const membershipChecks = await Promise.all(
		playerDiscordIds.map(async (discordId) => ({
			discordId,
			member: await isDiscordGuildMember(discordId),
		}))
	);
	for (const entry of membershipChecks.filter((check) => check.member === false)) {
		warnings.push(`Discord-Mitgliedschaft fehlt: ${entry.discordId}.`);
	}
	if (membershipChecks.some((entry) => entry.member === null)) {
		warnings.push("Discord-Mitgliedschaften konnten nicht vollständig geprüft werden.");
	}

	const poolAssignments = new Set([...wheel.history.map((entry) => entry.matchId), ...(wheel.currentAssignment ? [wheel.currentAssignment.matchId] : [])]);
	const missingPools = Object.values(state.matches)
		.filter((match) => match.status === "Live")
		.filter((match) => !poolAssignments.has(match.id))
		.map((match) => match.id);

	return {
		captainRoleStatus: {
			ok: captainIds.length > 0 && failedRoleChecks.length === 0,
			detail:
				captainIds.length === 0
					? "Keine Captains gesetzt"
					: failedRoleChecks.length === 0
						? "Captain roles synced"
						: `${failedRoleChecks.length}/${captainIds.length} Problem(e)`,
		},
		captainRoleDetails: roleChecks.map((entry) => ({
			teamName: entry.teamName,
			captainLabel: entry.captainLabel,
			discordId: entry.discordId,
			status: entry.result.status,
			message: entry.result.message,
		})),
		missingCaptains,
		missingPools,
		warnings,
	};
}
