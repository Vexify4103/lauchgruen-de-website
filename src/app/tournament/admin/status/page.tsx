import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSystemStatus } from "@/lib/system-status";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { TournamentLink as Link } from "../../TournamentLink";

export const dynamic = "force-dynamic";

export default async function AdminSystemStatusPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) redirect("/tournament/admin");
	const status = await getSystemStatus();

	return (
		<>
			<div className="admin-panel-head">
				<p className="text-sm text-[var(--muted)]">
					Interne Zustände ohne Secrets. Stand {new Date(status.checkedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}.
				</p>
				<Link href="/tournament/admin/status" className="button primary small">
					Neu prüfen
				</Link>
			</div>

			<section className="mb-[18px] grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatusCard title="MongoDB" ok={status.mongo.ok} value={`${status.mongo.latencyMs} ms`} detail={status.mongo.message} />
				<StatusCard
					title="Riot Overlay"
					ok={status.riot.availableKeys > 0}
					value={`${status.riot.availableKeys}/${status.riot.configuredKeys} Keys`}
					detail={`${status.riot.requestsLastTwoMinutes} Requests in 2 Minuten · ${status.riot.blockedKeys} blockiert`}
				/>
				<StatusCard title="Twitch" ok={status.twitch.configured} value={status.twitch.configured ? "Konfiguriert" : "Fehlt"} detail="App-Zugang für Status und Sessions" />
				<StatusCard
					title="Discord"
					ok={status.discordConfigured && status.discord.failed === 0}
					value={`${status.discord.queued} wartet · ${status.discord.running} läuft`}
					detail={`${status.discord.failed} fehlgeschlagen · Worker ${status.discord.workerLeaseActive ? "aktiv" : "bereit"}`}
				/>
			</section>

			<section className="admin-panel">
				<div className="admin-panel-head !mb-0">
					<div>
						<span>Community Overlays</span>
						<h2>Cache und externe Fehler</h2>
					</div>
					<span className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
						{status.overlays.inFlightSnapshots} laufende Requests
					</span>
				</div>
				<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<Metric label="Cache-Treffer" value={status.overlays.hits} />
					<Metric label="Zusammengeführt" value={status.overlays.deduplicated} />
					<Metric label="Stale-Fallbacks" value={status.overlays.staleFallbacks} />
					<Metric label="Snapshot-Fehler" value={status.overlays.errors} />
					<Metric label="Snapshots im Cache" value={status.overlays.snapshotCacheEntries} />
					<Metric label="Account-Cache" value={status.overlays.accountCacheEntries} />
					<Metric label="Rang-Cache" value={status.overlays.rankCacheEntries} />
					<Metric label="Match-ID-Cache" value={status.overlays.matchIdCacheEntries} />
				</div>
				<div
					className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${status.overlays.lastError ? "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-[var(--amber)]" : "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--muted)]"}`}
				>
					{status.overlays.lastError
						? `Letzter Fehler (${status.overlays.lastErrorAt ? new Date(status.overlays.lastErrorAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "unbekannt"}): ${status.overlays.lastError}`
						: "Seit dem letzten Serverstart wurde kein Community-Overlay-Fehler erfasst."}
				</div>
			</section>
		</>
	);
}

function StatusCard({ title, ok, value, detail }: { title: string; ok: boolean; value: string; detail: string }) {
	return (
		<article className={`rounded-[12px] border p-4 ${ok ? "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)]"}`}>
			<div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
				<span className={`size-2 rounded-full ${ok ? "bg-[var(--accent)]" : "bg-[var(--amber)]"}`} />
				{title}
			</div>
			<div className="mt-3 text-xl font-semibold text-[var(--text)]">{value}</div>
			<p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>
		</article>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-3">
			<div className="text-xs font-semibold text-[var(--muted)]">{label}</div>
			<div className="mt-1 font-mono text-xl font-semibold text-[var(--text)]">{value}</div>
		</div>
	);
}
