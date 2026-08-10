import { TournamentLink as Link } from "../../TournamentLink";
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
import { DiscordSignInButton } from "../../DiscordSignInButton";

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

	if (!isOwner) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-amber-200/24 bg-amber-200/10 p-6 text-sm leading-7 text-amber-50">
					<p>Melde dich mit einem Owner-Discord-Account an, um Bewerbungen einzusehen.</p>
					<div className="mt-4">
						<DiscordSignInButton
							redirectTo="/tournament/admin/applicants"
							pendingLabel="Weiter zu Discord..."
							className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950 disabled:cursor-wait disabled:opacity-65"
						>
							Mit Discord anmelden
						</DiscordSignInButton>
					</div>
				</section>
			</div>
		);
	}

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
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="max-w-3xl">
						<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Bewerbungen</div>
						<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Eingereichte Anmeldungen.</h1>
					</div>
					<Link
						href="/tournament/admin"
						className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
					>
						← Zurück zum Admin
					</Link>
				</div>

				<div className="mt-6 flex flex-wrap gap-3">
					<StatPill label="Gesamt" value={sorted.length.toString()} tone="neutral" />
					<StatPill label="Zugewiesen" value={assignedCount.toString()} tone="ok" />
					<StatPill label="Offen" value={unassignedCount.toString()} tone="warn" />
					<RefreshRanksButton label="Alle Spielerdaten aktualisieren" confirmBulk />
				</div>

				<BlacklistManager initialEntries={blacklistEntries} initialVersion={versions.blacklist ?? 0} />

				<EligibilityOverrideManager
					initialEntries={eligibilityOverrides}
					initialVersion={versions["eligibility-overrides"] ?? 0}
					activeTournamentId={settings.activeTournament.id}
					activeTournamentName={settings.activeTournament.name}
				/>

				<PreferenceGroupManager
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

				{sorted.length === 0 ? (
					<div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 text-sm leading-7 text-emerald-100/68">Noch keine Bewerbungen eingegangen.</div>
				) : (
					<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
		</div>
	);
}

function StatPill({ label, value, tone }: { label: string; value: string; tone: "neutral" | "ok" | "warn" }) {
	const tones = {
		neutral: "border-white/12 bg-white/[0.04] text-emerald-100",
		ok: "border-lime-200/30 bg-lime-200/10 text-lime-50",
		warn: "border-amber-200/30 bg-amber-200/12 text-amber-100",
	} as const;
	return (
		<div className={`flex items-baseline gap-2 rounded-2xl border px-4 py-2 ${tones[tone]}`}>
			<span className="text-xl font-black">{value}</span>
			<span className="text-[10px] font-black uppercase tracking-[0.22em] opacity-72">{label}</span>
		</div>
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
		<article className="flex flex-col gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
			<header className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-lg font-black text-emerald-50">{app.discordUsername ? `@${app.discordUsername}` : app.discordHandle}</div>
					<div className="mt-1 flex flex-wrap items-center gap-2">
						<div className="min-w-0 truncate text-xs text-lime-200/72">{app.riotId}</div>
						<a
							href={opggUrl(app.riotId)}
							target="_blank"
							rel="noreferrer"
							className="shrink-0 rounded-lg border border-white/12 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/68 transition hover:border-lime-200/34 hover:text-lime-100"
						>
							OP.GG
						</a>
					</div>
				</div>
				<div className="flex shrink-0 items-start gap-2">
					{assignedTo ? (
						<span
							title={`Zugewiesen zu ${assignedTo}`}
							className="rounded-full border border-lime-200/30 bg-lime-200/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-lime-50"
						>
							✓ {assignedTo}
						</span>
					) : (
						<span className="rounded-full border border-amber-200/30 bg-amber-200/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100">
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
					<div className="mb-1 flex items-center justify-between gap-2 rounded-xl border border-cyan-200/18 bg-cyan-200/[0.07] px-3 py-2 text-cyan-50">
						<span className="font-black">Mindestlevel freigegeben</span>
						<span className="rounded-full border border-cyan-100/18 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]">
							{eligibilityOverride.kind === "regular" ? "Dauergast" : "Ausnahme"}
						</span>
					</div>
				) : null}
				<Row label="Anzeigename">{app.displayName}</Row>
				<Row label="Aktueller Rang">
					<span className="flex flex-wrap items-center gap-2">
						<span>{app.currentRankAuto ?? <span className="italic text-emerald-100/40">Unranked</span>}</span>
						<RefreshRanksButton applicationId={app.id} label="Profil aktualisieren" />
					</span>
				</Row>
				<Row label="Account-Level">{app.summonerLevel ?? <span className="italic text-amber-100/50">erneut verifizieren</span>}</Row>
				<Row label="Main Rolle">{app.mainRole ?? <span className="italic text-emerald-100/40">nicht angegeben</span>}</Row>
			</div>

			<EditApplicantForm app={app} initialVersion={version} />

			<div>
				<div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">Wunschrollen</div>
				<div className="mt-1.5 flex flex-wrap gap-1">
					{app.preferredRoles.length === 0 ? (
						<span className="text-xs italic text-emerald-100/40">keine angegeben</span>
					) : (
						app.preferredRoles.map((r, index) => (
							<span
								key={r}
								className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/72"
							>
								#{index + 1} · {r}
							</span>
						))
					)}
				</div>
			</div>

			{app.notes ? (
				<div>
					<div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">Notizen</div>
					<p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/22 p-3 text-xs leading-5 text-emerald-100/72">
						{app.notes}
					</p>
				</div>
			) : null}

			<footer className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-[10px] text-emerald-100/40">
				<span title={`Discord-ID ${app.discordId}`}>Eingegangen {formatDate(app.createdAt)}</span>
				{app.createdAt !== app.updatedAt ? <span>Bearbeitet {formatDate(app.updatedAt)}</span> : null}
			</footer>
		</article>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
			<span className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">{label}</span>
			<span className="truncate font-bold text-emerald-50">{children}</span>
		</div>
	);
}
