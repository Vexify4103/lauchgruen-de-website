import { TournamentLink as Link } from "../TournamentLink";
import { headers } from "next/headers";
import { auth, signIn } from "@/lib/auth";
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
import { DiscordSyncPanel, type CaptainRoleStatus } from "./DiscordSyncPanel";
import { NicknameSyncButton } from "./NicknameSyncButton";
import { TournamentModePanel } from "./TournamentModePanel";
import { WheelAdminClient } from "./WheelAdminClient";

export default async function TournamentAdminPage() {
	const host = (await headers()).get("host")?.toLowerCase() ?? "";
	const isLocalSubdomain = host.endsWith(".localhost:3000") && host !== "localhost:3000";
	const session = await auth();
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));
	const ctx = isOwner ? await getTournamentContext() : null;
	const state = isOwner && ctx ? await readTournamentState(ctx.groupMatches) : null;
	const wheel = isOwner ? await getTournamentWheelState() : null;
	const settings = isOwner ? await getTournamentSettings() : null;
	const applicationsOpen = settings ? areTournamentApplicationsOpen(settings.applicationsOpen, new Date(), settings.applicationDeadlineOverride, settings.applicationDeadline) : false;
	const audit = isOwner ? await listAuditLog(5) : [];

	let adminMatches: AdminMatch[] = [];
	let adminVersions: Record<string, number> = {};
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
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="max-w-3xl">
						<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Owner-Panel</div>
						<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Live-Match-Steuerung.</h1>
						<p className="mt-4 text-sm leading-7 text-emerald-100/68">
							Nur die Discord-Accounts von lethalfluff und lauchgruen können Match-Status, Scores und Sieger bearbeiten.
						</p>
					</div>
					{isOwner ? (
						<div className="flex flex-wrap items-start gap-2">
							<Link
								href="/tournament/admin/live"
								className="rounded-2xl border border-red-300/24 bg-red-500/12 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-100 transition hover:border-red-300/40"
							>
								Live-Cockpit →
							</Link>
							<Link
								href="/tournament/admin/applicants"
								className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
							>
								Bewerbungen →
							</Link>
							<Link
								href="/tournament/admin/roster"
								className="rounded-2xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-950 shadow-xl shadow-lime-300/20 transition hover:-translate-y-0.5"
							>
								Roster-Builder →
							</Link>
							<NicknameSyncButton />
						</div>
					) : null}
				</div>

				{isOwner && wheel ? (
					<>
						<div className="mt-8 grid gap-5 xl:grid-cols-2">
							{settings ? <TournamentModePanel initialSettings={settings} initialVersion={adminVersions.settings ?? 0} /> : null}
							<DiscordSyncPanel statuses={[]} />
						</div>
						<div className="mt-8">
							<ReadinessChecklist
								teams={ctx?.teams ?? []}
								matches={adminMatches}
								diagnostics={null}
								applicationsEnabled={applicationsOpen}
								hasActiveWheelDraw={Boolean(wheel.currentAssignment)}
							/>
						</div>
					</>
				) : null}

				<div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
					{isOwner && state ? (
						<>
							{tiebreakerGroups.length > 0 ? (
								<div className="mb-5 rounded-2xl border border-amber-200/24 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">
									<strong>Tiebreaker erforderlich:</strong> {tiebreakerGroups.map((group) => `Gruppe ${group}`).join(", ")} ist nach allen Gruppenspielen nicht
									eindeutig entschieden. Das Playoff-Seeding bleibt bis zum zusätzlichen Entscheidungsspiel gesperrt.
								</div>
							) : null}
							<MatchAdminClient
								initialMatches={adminMatches}
								initialStored={state.matches}
								initialVersions={Object.fromEntries(adminMatches.map((match) => [match.id, adminVersions[`match:${match.id}`] ?? 0]))}
							/>
						</>
					) : (
						<div className="rounded-2xl border border-amber-200/24 bg-amber-200/10 p-5 text-sm leading-7 text-amber-50">
							<p>Melde dich mit einem Owner-Discord-Account an, um Turniermatches zu bearbeiten.</p>
							{isLocalSubdomain ? (
								<Link
									href="http://localhost:3000/tournament/admin"
									className="mt-4 inline-flex rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950"
								>
									Auf localhost weitermachen
								</Link>
							) : (
								<form
									className="mt-4"
									action={async () => {
										"use server";
										await signIn("discord", { redirectTo: "/tournament/admin" });
									}}
								>
									<button className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950">
										Mit Discord anmelden
									</button>
								</form>
							)}
						</div>
					)}
				</div>

				{isOwner && wheel ? (
					<div className="mt-8">
						<WheelAdminClient initialState={wheel} matches={adminMatches} />
					</div>
				) : null}

				{isOwner ? (
					<div className="mt-8">
						<AuditLogPanel initialEntries={audit} />
					</div>
				) : null}
			</section>
		</div>
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
