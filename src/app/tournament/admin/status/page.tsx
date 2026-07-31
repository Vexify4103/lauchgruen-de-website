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
		<div className="mx-auto w-full max-w-6xl px-5 py-10">
			<header className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-cyan-200/14 bg-[#08160f]/90 p-6 shadow-2xl shadow-black/25">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-100/55">Betriebsdiagnose</div>
					<h1 className="mt-2 text-4xl font-black text-emerald-50">Systemstatus</h1>
					<p className="mt-2 text-sm text-emerald-100/52">Interne Zustände ohne Secrets. Stand {new Date(status.checkedAt).toLocaleString("de-DE")}.</p>
				</div>
				<div className="flex gap-2">
					<Link href="/tournament/admin/status" className="rounded-xl bg-cyan-200 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-cyan-950">Neu prüfen</Link>
					<Link href="/tournament/admin" className="rounded-xl border border-white/12 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-100">Zurück</Link>
				</div>
			</header>

			<section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatusCard title="MongoDB" ok={status.mongo.ok} value={`${status.mongo.latencyMs} ms`} detail={status.mongo.message} />
				<StatusCard title="Riot Overlay" ok={status.riot.availableKeys > 0} value={`${status.riot.availableKeys}/${status.riot.configuredKeys} Keys`} detail={`${status.riot.requestsLastTwoMinutes} Requests in 2 Minuten · ${status.riot.blockedKeys} blockiert`} />
				<StatusCard title="Twitch" ok={status.twitch.configured} value={status.twitch.configured ? "Konfiguriert" : "Fehlt"} detail="App-Zugang für Status und Sessions" />
				<StatusCard title="Discord" ok={status.discordConfigured && status.discord.failed === 0} value={`${status.discord.queued} wartet · ${status.discord.running} läuft`} detail={`${status.discord.failed} fehlgeschlagen · Worker ${status.discord.workerLeaseActive ? "aktiv" : "bereit"}`} />
			</section>

			<section className="mt-5 rounded-[2rem] border border-white/10 bg-[#08150e]/88 p-5 shadow-xl shadow-black/20">
				<div className="flex items-end justify-between gap-3">
					<div><div className="text-[9px] font-black uppercase tracking-[0.24em] text-lime-200/52">Community Overlays</div><h2 className="mt-1 text-2xl font-black">Cache und externe Fehler</h2></div>
					<span className="rounded-full border border-white/10 px-3 py-1.5 text-[9px] font-black text-emerald-100/50">{status.overlays.inFlightSnapshots} laufende Requests</span>
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
				<div className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${status.overlays.lastError ? "border-amber-200/18 bg-amber-200/[0.07] text-amber-50" : "border-lime-200/14 bg-lime-200/[0.05] text-lime-50/65"}`}>
					{status.overlays.lastError ? `Letzter Fehler (${status.overlays.lastErrorAt ? new Date(status.overlays.lastErrorAt).toLocaleString("de-DE") : "unbekannt"}): ${status.overlays.lastError}` : "Seit dem letzten Serverstart wurde kein Community-Overlay-Fehler erfasst."}
				</div>
			</section>
		</div>
	);
}

function StatusCard({ title, ok, value, detail }: { title: string; ok: boolean; value: string; detail: string }) {
	return <article className={`rounded-2xl border p-4 ${ok ? "border-lime-200/18 bg-lime-200/[0.07]" : "border-amber-200/20 bg-amber-200/[0.08]"}`}><div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-100/45"><span className={`size-2 rounded-full ${ok ? "bg-lime-300" : "bg-amber-300"}`} />{title}</div><div className="mt-3 text-xl font-black text-emerald-50">{value}</div><p className="mt-1 text-[10px] leading-5 text-emerald-100/48">{detail}</p></article>;
}

function Metric({ label, value }: { label: string; value: number }) {
	return <div className="rounded-xl border border-white/8 bg-black/18 px-3 py-3"><div className="text-[8px] font-black uppercase tracking-[0.15em] text-emerald-100/35">{label}</div><div className="mt-1 font-mono text-xl font-black text-cyan-50">{value}</div></div>;
}
