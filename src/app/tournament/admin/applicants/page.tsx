import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { getTournamentSettings } from "@/lib/tournament-settings";
import {
	TOURNAMENT_OWNER_DISCORD_IDS,
	isEligibilityOverrideActive,
	listApplications,
	listBlacklistEntries,
	listEligibilityOverrides,
	listPreferenceGroups,
	type TournamentApplication,
	type TournamentEligibilityOverride,
} from "@/lib/tournament-storage";
import { DeleteApplicantButton } from "./DeleteApplicantButton";
import { EditApplicantForm } from "./EditApplicantForm";
import { RefreshRanksButton } from "./RefreshRanksButton";
import { BlacklistManager } from "./BlacklistManager";
import { EligibilityOverrideManager } from "./EligibilityOverrideManager";
import { PreferenceGroupManager } from "./PreferenceGroupManager";
import { getAdminVersions } from "@/lib/admin-version";

export const dynamic = "force-dynamic";

type BotPlayerLike = { discordId?: string; riotId?: string };
type BotTeam = { name: string; players?: BotPlayerLike[] };

/**
 * Reads bot_state.teams and returns a map of discordId → teamName for every
 * player currently on a team. Used to show "Assigned to X" badges.
 */
async function loadAssignmentMap(): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	try {
		const db = await getDb();
		const doc = await db.collection<{ _id: string; teams?: Record<string, BotTeam> }>("bot_state").findOne({ _id: "default" });
		const teams = doc?.teams ?? {};
		for (const team of Object.values(teams)) {
			for (const player of team.players ?? []) {
				if (player.discordId) map.set(player.discordId, team.name);
			}
		}
	} catch {
		// Quiet failure — page still renders without "assigned" data.
	}
	return map;
}

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleString("de-DE", {
			dateStyle: "medium",
			timeStyle: "short",
		});
	} catch {
		return iso;
	}
}

function opggUrl(riotId: string): string {
	return `https://www.op.gg/summoners/euw/${encodeURIComponent(riotId.replace("#", "-"))}`;
}

export default async function ApplicantsPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

	// The admin layout already gates access; this only guards direct renders.
	if (!isOwner) redirect("/tournament/admin");

	const [applications, assignedByDiscordId, blacklistEntries, eligibilityOverrides, preferenceGroups, settings] = await Promise.all([
		listApplications(),
		loadAssignmentMap(),
		listBlacklistEntries(),
		listEligibilityOverrides(),
		listPreferenceGroups(),
		getTournamentSettings(),
	]);
	const groupByDiscordId = new Map(preferenceGroups.flatMap((group) => group.memberDiscordIds.map((memberDiscordId) => [memberDiscordId, group.code] as const)));
	const versions = await getAdminVersions(["blacklist", "eligibility-overrides", "preference-groups", ...applications.map((app) => `application:${app.id}`)]);
	const activeEligibilityOverrides = eligibilityOverrides.filter((entry) => isEligibilityOverrideActive(entry, settings.activeTournament.id));

	// Newest-first
	const sorted = [...applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

	const assignedCount = sorted.filter((a) => assignedByDiscordId.has(a.discordId)).length;
	const unassignedCount = sorted.length - assignedCount;

	return (
		<>
			<div className="admin-stat-grid">
				<article>
					<span>Bewerbungen</span>
					<strong>{sorted.length}</strong>
					<small>insgesamt eingegangen</small>
				</article>
				<article>
					<span>Zugewiesen</span>
					<strong>{assignedCount}</strong>
					<small>in einem Team</small>
				</article>
				<article>
					<span>Offen</span>
					<strong>{unassignedCount}</strong>
					<small>noch ohne Team</small>
				</article>
			</div>
			<section className="admin-panel">
				<div className="admin-panel-head">
					<div>
						<span>Riot-Daten</span>
						<h2>Spielerdaten abgleichen</h2>
					</div>
					<RefreshRanksButton label="Alle Spielerdaten aktualisieren" confirmBulk />
				</div>
				<p className="text-sm leading-6 text-[var(--muted)]">
					Aktualisiert Rang, Level und Riot-ID aller Bewerber. Läuft im Hintergrund und respektiert Riots Rate-Limits.
				</p>
			</section>

			<BlacklistManager initialEntries={blacklistEntries} initialVersion={versions.blacklist ?? 0} />

			<EligibilityOverrideManager
				initialEntries={eligibilityOverrides}
				initialVersion={versions["eligibility-overrides"] ?? 0}
				activeTournamentId={settings.activeTournament.id}
				activeTournamentName={settings.activeTournament.name}
			/>

			<PreferenceGroupManager
				mode={settings.wishGroupMode ?? "team"}
				applicants={sorted.map((app) => ({
					discordId: app.discordId,
					displayName: app.displayName,
					discordHandle: app.discordHandle,
					riotId: app.riotId,
					groupCode: groupByDiscordId.get(app.discordId) ?? null,
				}))}
				groups={preferenceGroups.map((group) => ({
					code: group.code,
					memberDiscordIds: group.memberDiscordIds,
				}))}
				initialVersion={versions["preference-groups"] ?? 0}
			/>

			<section className="admin-panel mt-8" aria-labelledby="applications-title">
				<div className="admin-panel-head">
					<div>
						<span>Teilnehmer</span>
						<h2 id="applications-title">Alle Bewerbungen</h2>
					</div>
					<b>{sorted.length}</b>
				</div>
				{sorted.length === 0 ? (
					<div className="attention-clear">
						<p>Noch keine Bewerbungen eingegangen.</p>
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{sorted.map((app) => (
							<ApplicantCard
								key={app.id}
								app={app}
								assignedTo={assignedByDiscordId.get(app.discordId) ?? null}
								eligibilityOverride={
									activeEligibilityOverrides.find(
										(entry) => entry.discordId === app.discordId || (entry.riotId && entry.riotId === app.riotId.trim().toLowerCase())
									) ?? null
								}
								version={versions[`application:${app.id}`] ?? 0}
							/>
						))}
					</div>
				)}
			</section>
		</>
	);
}

function ApplicantCard({
	app,
	assignedTo,
	eligibilityOverride,
	version,
}: {
	app: TournamentApplication;
	assignedTo: string | null;
	eligibilityOverride: TournamentEligibilityOverride | null;
	version: number;
}) {
	return (
		<article className="flex flex-col gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--admin-step)] p-5">
			<header className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-lg font-semibold text-[var(--text)]">{app.discordUsername ? `@${app.discordUsername}` : app.discordHandle}</div>
					<div className="mt-1 flex flex-wrap items-center gap-2">
						<div className="min-w-0 truncate text-xs text-[var(--accent)]">{app.riotId}</div>
						<a
							href={opggUrl(app.riotId)}
							target="_blank"
							rel="noreferrer"
							className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--admin-inset)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
						>
							OP.GG
						</a>
					</div>
				</div>
				<div className="flex shrink-0 items-start gap-2">
					{assignedTo ? (
						<span
							title={`Zugewiesen zu ${assignedTo}`}
							className="tally rounded-full border border-[var(--line)] px-3 py-1"
							data-tone="ok"
						>
							{assignedTo}
						</span>
					) : (
						<span className="rounded-full border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--amber)]">
							Offen
						</span>
					)}
					<DeleteApplicantButton
						discordId={app.discordId}
						applicationId={app.id}
						initialVersion={version}
						label={app.discordUsername ? `@${app.discordUsername}` : app.discordHandle}
					/>
				</div>
			</header>

			<div className="grid gap-2 text-xs">
				{eligibilityOverride ? (
					<div className="mb-1 flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-3 py-2 text-[var(--text)]">
						<span className="font-semibold">Mindestlevel freigegeben</span>
						<span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-semibold">
							{eligibilityOverride.kind === "regular" ? "Dauergast" : "Ausnahme"}
						</span>
					</div>
				) : null}
				<Row label="Anzeigename">{app.displayName}</Row>
				<Row label="Aktueller Rang">
					<span className="flex flex-wrap items-center gap-2">
						<span>{app.currentRankAuto ?? <span className="italic text-[var(--muted)]">Unranked</span>}</span>
						<RefreshRanksButton applicationId={app.id} label="Profil aktualisieren" />
					</span>
				</Row>
				<Row label="Account-Level">{app.summonerLevel ?? <span className="italic text-[var(--muted)]">erneut verifizieren</span>}</Row>
				<Row label="Main Rolle">{app.mainRole ?? <span className="italic text-[var(--muted)]">nicht angegeben</span>}</Row>
			</div>

			<EditApplicantForm app={app} initialVersion={version} />

			<div>
				<div className="text-xs font-semibold text-[var(--muted)]">Wunschrollen</div>
				<div className="mt-1.5 flex flex-wrap gap-1">
					{app.preferredRoles.length === 0 ? (
						<span className="text-xs italic text-[var(--muted)]">keine angegeben</span>
					) : (
						app.preferredRoles.map((r, index) => (
							<span
								key={r}
								className="rounded-full border border-[var(--line)] bg-[var(--admin-step)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]"
							>
								#{index + 1} · {r}
							</span>
						))
					)}
				</div>
			</div>

			{app.hasCompetitiveExperience ? (
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Competitive-Erfahrung</div>
					<p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3 text-xs leading-5 text-[var(--muted)]">
						{app.competitiveExperience || "Erfahrung angegeben, aber keine Beschreibung hinterlegt."}
					</p>
				</div>
			) : null}

			{app.notes ? (
				<div>
					<div className="text-xs font-semibold text-[var(--muted)]">Notizen</div>
					<p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] p-3 text-xs leading-5 text-[var(--muted)]">
						{app.notes}
					</p>
				</div>
			) : null}

			<footer className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
				<span title={`Discord-ID ${app.discordId}`}>Eingegangen {formatDate(app.createdAt)}</span>
				{app.createdAt !== app.updatedAt ? <span>Bearbeitet {formatDate(app.updatedAt)}</span> : null}
			</footer>
		</article>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
			<span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
			<span className="truncate font-medium text-[var(--text)]">{children}</span>
		</div>
	);
}
