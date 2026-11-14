import Image from "next/image";
import { RoleIcon } from "@/components/RoleIcon";
import { DRAFT_ROLE_LABELS } from "@/lib/tournament-draft-shared";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";

/* Shared by the match detail page and the public team history. */

export type SideView = {
	key: "teamA" | "teamB";
	label: string;
	tag: string | null;
	color: string;
	teamId: string | null;
	won: boolean;
	blue: boolean;
};

const STATUS: Record<string, { label: string; tone?: "live" | "ok" }> = {
	Locked: { label: "Wartet auf Teams" },
	Scheduled: { label: "Geplant" },
	Pending: { label: "Draft läuft", tone: "live" },
	Live: { label: "Live", tone: "live" },
	Finished: { label: "Beendet", tone: "ok" },
};

export function StatusPill({ status }: { status: string }) {
	const entry = STATUS[status] ?? { label: status };
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
				entry.tone === "live"
					? "border-[color-mix(in_srgb,var(--live)_40%,transparent)] text-[var(--live)]"
					: entry.tone === "ok"
						? "border-[var(--line)] text-[var(--accent)]"
						: "border-[var(--line)] text-[var(--muted)]"
			}`}
		>
			{entry.tone === "live" ? <i aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--live)] motion-reduce:animate-none" /> : null}
			{entry.label}
		</span>
	);
}

export function ChampionStrip({ label, champions, byName, won }: { label: string; champions: string[]; byName: Map<string, { imageUrl: string }>; won: boolean }) {
	return (
		<div className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2">
			<span className={`w-14 shrink-0 truncate font-mono text-xs font-bold ${won ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{label}</span>
			<div className="flex flex-wrap gap-1">
				{champions.length ? (
					champions.map((champion) => (
						<span key={champion} title={champion} className="relative size-8 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-soft)]">
							{byName.get(champion)?.imageUrl ? <Image src={byName.get(champion)!.imageUrl} alt={champion} fill sizes="2rem" className="object-cover" /> : null}
						</span>
					))
				) : (
					<span className="text-xs text-[var(--muted)]">Keine Picks erfasst</span>
				)}
			</div>
		</div>
	);
}

export function DraftColumn({
	side,
	sideLabel,
	byName,
	fearless,
}: {
	side: SideView & { picks: Array<{ champion: string; role: string | null }>; bans: Array<{ champion: string; skipped?: boolean }>; pool?: string };
	sideLabel: string;
	byName: Map<string, { imageUrl: string }>;
	fearless: boolean;
}) {
	return (
		<article className="rounded-[16px] border border-[var(--line)] bg-[var(--panel)] p-4" style={{ borderTop: `3px solid ${side.color}` }}>
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="!m-0 truncate !text-base">{side.label}</h3>
				<span className="text-xs text-[var(--muted)]">{sideLabel}</span>
			</div>
			{!fearless && side.pool ? <p className="mt-1 text-xs text-[var(--muted)]">Pool {compactPoolLabel(side.pool)}</p> : null}
			<ul className="mt-3 grid list-none gap-1.5 p-0">
				{side.picks.length ? (
					side.picks.map((pick) => (
						<li key={pick.champion} className="flex items-center gap-3 rounded-[10px] bg-[var(--bg-soft)] px-2 py-1.5">
							<span className="relative size-9 shrink-0 overflow-hidden rounded-md">
								{byName.get(pick.champion)?.imageUrl ? (
									<Image src={byName.get(pick.champion)!.imageUrl} alt="" fill sizes="2.25rem" className="object-cover" />
								) : null}
							</span>
							<span className="min-w-0 flex-1 truncate text-sm font-medium">{pick.champion}</span>
							{pick.role ? (
								<span className="text-[var(--muted)]" title={DRAFT_ROLE_LABELS[pick.role as keyof typeof DRAFT_ROLE_LABELS]}>
									<RoleIcon role={pick.role} className="size-4" />
								</span>
							) : null}
						</li>
					))
				) : (
					<li className="text-sm text-[var(--muted)]">Noch keine Picks</li>
				)}
			</ul>
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-xs text-[var(--muted)]">Bans</span>
				{side.bans.length ? (
					side.bans.map((ban, index) =>
						ban.skipped ? (
							<span
								key={`skip-${index}`}
								title="Kein Ban"
								className="grid size-7 place-items-center rounded-md border border-dashed border-[var(--line)] text-[10px] text-[var(--muted)]"
							>
								–
							</span>
						) : (
							<span key={ban.champion} title={ban.champion} className="relative size-7 overflow-hidden rounded-md border border-[var(--line)] opacity-60 grayscale">
								{byName.get(ban.champion)?.imageUrl ? (
									<Image src={byName.get(ban.champion)!.imageUrl} alt={`Ban ${ban.champion}`} fill sizes="1.75rem" className="object-cover" />
								) : null}
							</span>
						)
					)
				) : (
					<span className="text-xs text-[var(--muted)]">Noch keine</span>
				)}
			</div>
		</article>
	);
}
