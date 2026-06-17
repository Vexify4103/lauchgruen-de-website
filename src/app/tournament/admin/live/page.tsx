import { TournamentLink as Link } from "../../TournamentLink";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getDraftState } from "@/lib/tournament-draft";
import { createDraftSequence, draftComplete, draftReady } from "@/lib/tournament-draft-shared";
import { bonusBanSideForMatch } from "@/lib/tournament-rules";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { compactPoolLabel } from "@/lib/tournament-wheel-shared";
import { getMatchControlContext } from "@/lib/match-control";

export default async function AdminLiveDashboardPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		redirect("/tournament/admin");
	}

	const [ctx, settings] = await Promise.all([getMatchControlContext(), getTournamentSettings()]);
	const playable = ctx.matches.filter((match) => match.teamAName && match.teamBName);
	const live = playable.filter((match) => match.status === "Live");
	const open = playable.filter((match) => match.status !== "Finished");
	const next = getNextMatches(open.filter((match) => match.status !== "Live"));
	const missingScores = playable.filter((match) => match.status === "Finished" && (match.scoreA === undefined || match.scoreB === undefined));
	const activeDrafts = await Promise.all(
		live.map(async (match) => {
			const draft = await getDraftState(match.id);
			const sequence = createDraftSequence(bonusBanSideForMatch(match));
			return {
				match,
				draftReady: draftReady(draft),
				draftComplete: draftComplete(draft, sequence),
				actions: draft.actions.length,
				total: sequence.length,
			};
		})
	);

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="max-w-3xl">
						<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Admin Live-Cockpit</div>
						<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Was braucht jetzt Aufmerksamkeit?</h1>
						<p className="mt-4 text-sm leading-7 text-emerald-100/68">
							Eine reduzierte Turniertag-Ansicht: aktive Matches, Draft-Status, fehlende Scores, nächste Matches und OBS-Hinweise.
						</p>
					</div>
					<Link
						href="/tournament/admin"
						className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
					>
						Zurück zum Admin
					</Link>
				</div>

				<div className="mt-8 grid gap-4 md:grid-cols-4">
					<Metric label="Turniermodus" value={settings.tournamentLive ? "Live" : "Vorbereitung"} tone={settings.tournamentLive ? "red" : "amber"} />
					<Metric label="Aktive Matches" value={String(live.length)} tone={live.length > 0 ? "red" : "green"} />
					<Metric label="Offene Matches" value={String(open.length)} />
					<Metric label="Fehlende Scores" value={String(missingScores.length)} tone={missingScores.length > 0 ? "amber" : "green"} />
				</div>

				<div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
					<div className="grid gap-6">
						<Panel title="Aktive Matches">
							{activeDrafts.length === 0 ? (
								<Empty text="Gerade ist kein Match live." />
							) : (
								<div className="grid gap-3">
									{activeDrafts.map(({ match, draftReady: ready, draftComplete: complete, actions, total }) => (
										<MatchCard
											key={match.id}
											match={match}
											href={`/tournament/admin/matches/${match.id}`}
											badges={[
												match.poolAssignment
													? `Pools ${compactPoolLabel(match.poolAssignment.teamAPool)} vs ${compactPoolLabel(match.poolAssignment.teamBPool)}`
													: "Pools fehlen",
												ready ? "Captains ready" : "Wartet auf Captains",
												complete ? "Draft fertig" : `Draft ${actions}/${total}`,
											]}
										/>
									))}
								</div>
							)}
						</Panel>

						<Panel title="Nächste Matches">
							{next.length === 0 ? (
								<Empty text="Keine nächsten Matches gefunden." />
							) : (
								<div className="grid gap-3 md:grid-cols-2">
									{next.map((match) => (
										<MatchCard
											key={match.id}
											match={match}
											href={`/tournament/admin/matches/${match.id}`}
											badges={[match.poolAssignment ? "Pools gezogen" : "Pools offen", match.status ?? "Scheduled"]}
										/>
									))}
								</div>
							)}
						</Panel>
					</div>

					<aside className="grid content-start gap-6">
						<Panel title="Score-Aufgaben">
							{missingScores.length === 0 ? (
								<Empty text="Keine fertigen Matches ohne Score." />
							) : (
								<div className="grid gap-2">
									{missingScores.map((match) => (
										<Link
											key={match.id}
											href={`/tournament/admin/matches/${match.id}`}
											className="rounded-2xl border border-amber-200/18 bg-amber-200/8 p-3 text-sm font-bold text-amber-50/86 hover:border-amber-200/34"
										>
											{match.teamALabel} vs {match.teamBLabel}
										</Link>
									))}
								</div>
							)}
						</Panel>

						<Panel title="OBS">
							<p className="text-sm leading-6 text-emerald-100/62">
								Team-Overlays lesen `/api/tournament/obs?team=TEAM_ID` und zeigen auch den aktuellen Pool, sobald er gezogen wurde.
							</p>
							<Link
								href="/obs/tournament"
								className="mt-4 inline-flex rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-cyan-50/82"
							>
								OBS-Seite öffnen
							</Link>
						</Panel>
					</aside>
				</div>
			</section>
		</div>
	);
}

function getNextMatches(matches: Awaited<ReturnType<typeof getMatchControlContext>>["matches"]) {
	const groupMatches = matches.filter((match) => match.phase === "groups");
	if (groupMatches.length === 0) return matches.slice(0, 4);

	const groupA = groupMatches.filter((match) => match.id.startsWith("a-")).slice(0, 2);
	const groupB = groupMatches.filter((match) => match.id.startsWith("b-")).slice(0, 2);

	return [0, 1].flatMap((index) => [groupA[index], groupB[index]]).filter((match): match is (typeof matches)[number] => Boolean(match));
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/24">
			<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">{title}</div>
			<div className="mt-4">{children}</div>
		</section>
	);
}

function MatchCard({ match, href, badges }: { match: Awaited<ReturnType<typeof getMatchControlContext>>["matches"][number]; href: string; badges: string[] }) {
	return (
		<Link href={href} className="block rounded-2xl border border-white/10 bg-black/18 p-4 transition hover:-translate-y-0.5 hover:border-lime-200/28">
			<div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/58">
				{match.round} · {match.time} · {match.id}
			</div>
			<div className="mt-2 text-xl font-black text-emerald-50">
				{match.teamALabel} vs {match.teamBLabel}
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{badges.map((badge) => (
					<span
						key={badge}
						className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/56"
					>
						{badge}
					</span>
				))}
			</div>
		</Link>
	);
}

function Metric({ label, value, tone = "green" }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
	const toneClass = {
		green: "border-lime-200/18 bg-lime-200/8 text-lime-100",
		amber: "border-amber-200/18 bg-amber-200/8 text-amber-100",
		red: "border-red-300/28 bg-red-500/12 text-red-100",
	}[tone];
	return (
		<div className={`rounded-2xl border p-4 ${toneClass}`}>
			<div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">{label}</div>
			<div className="mt-2 text-3xl font-black">{value}</div>
		</div>
	);
}

function Empty({ text }: { text: string }) {
	return <div className="rounded-2xl border border-white/8 bg-black/18 p-4 text-sm font-bold text-emerald-100/48">{text}</div>;
}
