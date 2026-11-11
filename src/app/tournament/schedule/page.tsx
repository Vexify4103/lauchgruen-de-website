import { TournamentLink as Link } from "../TournamentLink";
import { redirect } from "next/navigation";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { resolvePlayoffMatches } from "@/lib/bracket-resolver";
import { readTournamentState } from "@/lib/tournament-storage";
import { getTournamentContext } from "@/lib/tournament-runtime";
import { compactPoolLabel, getTournamentWheelState } from "@/lib/tournament-wheel";
import type { WheelMatchAssignment } from "@/lib/tournament-wheel-shared";
import { playoffRollingTime } from "@/lib/tournament-schedule";
import { getTournamentLiveStreams } from "@/lib/tournament-live-streams";
import { TournamentLiveRefresh } from "@/components/TournamentLiveRefresh";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { getMatchControlContext } from "@/lib/match-control";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { seriesLabel, stageLabel } from "@/lib/tournament-presentation";
import { usesFearless, usesFlexibleEngine, usesPoolWheel } from "@/lib/tournament-kind";
import { PageIntro } from "@/components/site/PageIntro";
import { ScheduleBoard, type ScheduleDay } from "./ScheduleBoard";

type ScheduleMatch = {
	id: string;
	day: string;
	phase: string;
	round: string;
	time: string;
	teamA: string;
	teamB: string;
	tagA?: string | null;
	tagB?: string | null;
	resolvedA: boolean;
	resolvedB: boolean;
	scoreA?: number;
	scoreB?: number;
	status: string;
	isCasted?: boolean;
	pool: WheelMatchAssignment | null;
};

const PLAYOFF_ORDER = [
	"ub-r1-1",
	"ub-r1-2",
	"ub-r1-3",
	"ub-r1-4",
	"ub-r2-1",
	"ub-r2-2",
	"lb-r1",
	"lb-r1-1",
	"lb-r1-2",
	"lb-r2-1",
	"lb-r2-2",
	"ub-f",
	"lb-sf",
	"lb-r3",
	"lb-f",
	"gf",
] as const;

export default async function TournamentSchedulePage({ searchParams }: { searchParams: Promise<{ twitchPreview?: string }> }) {
	const settings = await getTournamentSettings();
	const live = settings.activeTournament.mode === "live";
	const finished = settings.activeTournament.mode === "finished";
	// The flexible engine shows the planned schedule before the start, like /stage and /playoffs.
	if (!live && settings.activeTournament.mode !== "finished" && !usesFlexibleEngine(settings.activeTournament)) {
		redirect("/tournament/archive/az-2026");
	}
	const previewRequested = (await searchParams).twitchPreview === "1";
	const session = previewRequested ? await auth() : null;
	const previewEnabled = Boolean(session?.user?.discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(session.user.discordId));
	const ctx = await getTournamentContext();
	const [state, wheel] = await Promise.all([readTournamentState(ctx.groupMatches), getTournamentWheelState()]);
	const control = usesFlexibleEngine(settings.activeTournament) ? await getMatchControlContext() : null;
	const playoffs = control ? [] : resolvePlayoffMatches(state.matches, ctx.teams, ctx.groupMatches);
	const poolFor = (matchId: string) =>
		wheel.currentAssignment?.matchId === matchId ? wheel.currentAssignment : (wheel.history.find((entry) => entry.matchId === matchId) ?? null);

	const friday = (
		control
			? control.matches
					.filter((match) => match.phase === "groups" || match.phase === "play-in")
					.map((match) => ({
						id: match.id,
						day: formatScheduleDay(settings.structure.startAt, "Spieltag 1"),
						phase: match.phase === "play-in" ? "Play-in" : (stageLabel(settings.structure) ?? "Tag 1"),
						round: match.round,
						time: match.time,
						teamA: match.teamALabel,
						teamB: match.teamBLabel,
						tagA: match.teamATag,
						tagB: match.teamBTag,
						resolvedA: Boolean(match.teamAName),
						resolvedB: Boolean(match.teamBName),
						scoreA: match.scoreA,
						scoreB: match.scoreB,
						status: match.status,
						isCasted: Boolean(match.isCasted),
						pool: match.poolAssignment,
					}))
			: ctx.groupMatches.map((match) => ({
					id: match.id,
					day: "Freitag, 19.06.",
					phase: "Gruppenphase",
					round: match.round,
					time: match.time,
					teamA: match.teamA,
					teamB: match.teamB,
					resolvedA: true,
					resolvedB: true,
					scoreA: state.matches[match.id]?.scoreA,
					scoreB: state.matches[match.id]?.scoreB,
					status: state.matches[match.id]?.status ?? match.status,
					isCasted: Boolean(state.matches[match.id]?.isCasted),
					pool: poolFor(match.id),
				}))
	).sort(compareGroupMatches);

	const saturday = (
		control
			? control.matches
					.filter((match) => match.phase === "playoffs" && match.teamAName && match.teamBName)
					.map((match) => ({
						id: match.id,
						day: formatScheduleDay(settings.structure.dayTwoStartAt, "Spieltag 2"),
						phase: "Playoffs",
						round: match.round,
						time: match.time,
						teamA: match.teamALabel,
						teamB: match.teamBLabel,
						tagA: match.teamATag,
						tagB: match.teamBTag,
						resolvedA: Boolean(match.teamAName),
						resolvedB: Boolean(match.teamBName),
						scoreA: match.scoreA,
						scoreB: match.scoreB,
						status: match.status,
						isCasted: Boolean(match.isCasted),
						pool: match.poolAssignment,
					}))
			: playoffs.map((match) => ({
					id: match.id,
					day: "Samstag, 20.06.",
					phase: "Playoffs",
					round: match.round,
					time: match.time,
					teamA: match.teamALabel,
					teamB: match.teamBLabel,
					resolvedA: Boolean(match.teamAName),
					resolvedB: Boolean(match.teamBName),
					scoreA: match.scoreA,
					scoreB: match.scoreB,
					status: match.status,
					isCasted: Boolean(state.matches[match.id]?.isCasted),
					pool: poolFor(match.id),
				}))
	).sort((a, b) =>
		// Generated brackets already come in playing order; only the fixed A-Z bracket needs sorting.
		control ? 0 : PLAYOFF_ORDER.indexOf(a.id as (typeof PLAYOFF_ORDER)[number]) - PLAYOFF_ORDER.indexOf(b.id as (typeof PLAYOFF_ORDER)[number])
	);
	const ownerTeam = previewEnabled ? (ctx.teams.find((team) => team.players.some((player) => player.discordId === session?.user?.discordId)) ?? null) : null;
	const previewMatch =
		previewEnabled && ownerTeam
			? ([...friday, ...saturday].find((match) => match.status !== "Finished" && (match.teamA === ownerTeam.name || match.teamB === ownerTeam.name)) ?? null)
			: null;
	const liveStreams = live
		? await getTournamentLiveStreams(
				ctx.teams,
				[...friday, ...saturday].filter((match) => match.status === "Live" || match.id === previewMatch?.id).flatMap((match) => [match.teamA, match.teamB]),
				{ previewOffline: previewEnabled }
			)
		: [];

	const fearlessDraft = usesFearless(settings.activeTournament);
	const sections = [
		{
			title: `Spieltag 1 · ${formatScheduleDay(settings.structure.startAt, "Termin folgt")}`,
			description: usesFlexibleEngine(settings.activeTournament)
				? friday.length
					? `${stageLabel(settings.structure) ?? "Tag 1"} · ${friday.length} Matches aktuell angesetzt.`
					: `${stageLabel(settings.structure) ?? "Tag 1"} · Paarungen folgen durch die Turnierleitung.`
				: "Gruppenphase ab 18:00 Uhr CEST · 12 Matches pro Gruppe · 6 pro Team.",
			batches: groupScheduleBatches(friday),
			emptyText:
				settings.structure.dayOneFormat === "swiss" || settings.structure.dayOneFormat === "swiss-elimination"
					? "Die erste Swiss-Runde wurde noch nicht ausgelost. Sobald eine Paarung gezogen wurde, erscheint sie automatisch hier."
					: "Für den ersten Spieltag wurden noch keine konkreten Paarungen veröffentlicht.",
		},
		{
			title: `Spieltag 2 · ${formatScheduleDay(settings.structure.dayTwoStartAt, "Termin folgt")}`,
			description: usesFlexibleEngine(settings.activeTournament)
				? `${settings.structure.advanceTeamCount} Teams · ${playoffFormatLabel(settings.structure.format) ?? "Playoffs"} · ${seriesLabel(settings.structure)}${
						settings.structure.format === "double-elimination" || settings.structure.format === "double-elimination-light"
							? settings.structure.grandFinalReset
								? " · Grand Final mit Bracket Reset."
								: " · Grand Final ohne Bracket Reset."
							: "."
					}`
				: "Alle 8 Teams starten ab 16:00 Uhr CEST im Double-Elimination-Bracket.",
			batches: playoffScheduleBatches(saturday),
			emptyText:
				"Die Playoff-Paarungen werden erst nach den finalen Seeds aus Spieltag 1 in den Zeitplan übernommen. Den vollständigen TBD-Weg siehst du bereits im Bracket.",
		},
	];

	const toRow = (match: ScheduleMatch) => {
		const isPreview = match.id === previewMatch?.id;
		const hasTeams = match.resolvedA && match.resolvedB;
		const poolWheel = usesPoolWheel(settings.activeTournament);
		return {
			id: match.id,
			round: match.round,
			time: match.time,
			teamA: match.teamA,
			teamB: match.teamB,
			tagA: match.tagA,
			tagB: match.tagB,
			resolvedA: match.resolvedA,
			resolvedB: match.resolvedB,
			scoreA: match.scoreA,
			scoreB: match.scoreB,
			status: match.status,
			isCasted: match.isCasted,
			preview: isPreview,
			note: match.pool ? `Pools ${compactPoolLabel(match.pool.teamAPool)} · ${compactPoolLabel(match.pool.teamBPool)}` : poolWheel && hasTeams ? "Pools noch offen" : null,
			draftHref:
				(poolWheel && match.pool) || (fearlessDraft && ["Pending", "Live", "Finished"].includes(match.status)) ? `/tournament/champ-select/${match.id}/spectate` : null,
			streams: match.status === "Live" || isPreview ? liveStreams.filter((stream) => stream.teamName === match.teamA || stream.teamName === match.teamB) : [],
		};
	};
	const days: ScheduleDay[] = sections.map((section) => ({
		title: section.title,
		description: section.description,
		emptyText: section.emptyText,
		batches: section.batches.map((batch) => ({ label: batch.label, time: batch.matches[0]?.time, matches: batch.matches.map(toRow) })),
	}));
	const teamChips = [...ctx.teams]
		.map((team) => ({ name: team.name, tag: team.tag ?? team.name.slice(0, 4).toUpperCase() }))
		.sort((a, b) => a.tag.localeCompare(b.tag));

	return (
		<>
			{live ? <TournamentLiveRefresh /> : null}
			<section className="page-section compact-top">
				{previewEnabled ? (
					<div className="alert mb-6 flex flex-wrap items-center justify-between gap-3">
						<span>Admin-Vorschau: Verbundene Offline-Kanäle werden testweise angezeigt.</span>
						<div className="flex flex-wrap gap-2">
							<Link href="/tournament/teams?twitchPreview=1" className="button ghost small">
								Bei Teams testen
							</Link>
							<Link href="/tournament/schedule" className="button ghost small">
								Vorschau beenden
							</Link>
						</div>
					</div>
				) : null}
				<PageIntro kicker={finished ? "Ergebnisse" : "Zeitplan"} title={finished ? "Alle Ergebnisse." : "Wann wird was gespielt?"}>
					Richtzeiten: Matches einer Runde laufen parallel, Verzögerungen verschieben die folgenden Runden.
				</PageIntro>

				<div className="mt-8">
					<ScheduleBoard days={days} teams={teamChips} />
				</div>
			</section>
		</>
	);
}

function compareGroupMatches(a: ScheduleMatch, b: ScheduleMatch) {
	const aParts = /^([a-p])-r(\d+)-(\d+)$/.exec(a.id);
	const bParts = /^([a-p])-r(\d+)-(\d+)$/.exec(b.id);
	if (!aParts || !bParts) return a.id.localeCompare(b.id);
	return Number(aParts[2]) - Number(bParts[2]) || Number(aParts[3]) - Number(bParts[3]) || aParts[1].localeCompare(bParts[1]);
}

function groupScheduleBatches(matches: ScheduleMatch[]) {
	const batches = new Map<string, ScheduleMatch[]>();
	for (const match of matches) {
		const parts = /^[a-p]-r(\d+)-(\d+)$/.exec(match.id);
		const label = parts ? `Gruppenrunde ${parts[1]}` : match.round;
		batches.set(label, [...(batches.get(label) ?? []), match]);
	}
	return [...batches.entries()].map(([label, entries]) => ({
		label,
		matches: entries,
	}));
}

function playoffScheduleBatches(matches: ScheduleMatch[]) {
	const ids = new Set(matches.map((match) => match.id));
	const definitions = ids.has("ub-r1-3")
		? [
				{ label: "Upper Runde 1", ids: ["ub-r1-1", "ub-r1-2", "ub-r1-3", "ub-r1-4"] },
				{ label: "Lower Runde 1 und Upper-Halbfinals", ids: ["lb-r1-1", "lb-r1-2", "ub-r2-1", "ub-r2-2"] },
				{ label: "Lower Runde 2", ids: ["lb-r2-1", "lb-r2-2"] },
				{ label: "Upper Final und Lower-Halbfinale", ids: ["ub-f", "lb-r3"] },
				{ label: "Lower Final", ids: ["lb-f"] },
				{ label: "Grand Final", ids: ["gf"] },
			]
		: ids.has("lb-r2-1")
			? [
					{ label: "Upper Runde 1", ids: ["ub-r1-1", "ub-r1-2"] },
					{ label: "Lower Runde 1 und Upper-Halbfinals", ids: ["lb-r1-1", "lb-r1-2", "ub-r2-1", "ub-r2-2"] },
					{ label: "Upper Final und Lower Runde 2", ids: ["ub-f", "lb-r2-1", "lb-r2-2"] },
					{ label: "Lower-Halbfinale", ids: ["lb-r3", "lb-sf"] },
					{ label: "Lower Final", ids: ["lb-f"] },
					{ label: "Grand Final", ids: ["gf"] },
				]
			: ids.has("lb-r1-1")
				? [
						{ label: "Upper-Halbfinals", ids: ["ub-r2-1", "ub-r2-2"] },
						{ label: "Lower Runde 1", ids: ["lb-r1-1", "lb-r1-2"] },
						{ label: "Upper Final und Lower-Halbfinale", ids: ["ub-f", "lb-r3"] },
						{ label: "Lower Final", ids: ["lb-f"] },
						{ label: "Grand Final", ids: ["gf"] },
					]
				: [
						{ label: "Upper-Halbfinals", ids: ["ub-r2-1", "ub-r2-2"] },
						{ label: "Upper Final und Lower Runde 1", ids: ["ub-f", "lb-r1"] },
						{ label: "Lower Final", ids: ["lb-f"] },
						{ label: "Grand Final", ids: ["gf"] },
					];
	const byId = new Map(matches.map((match) => [match.id, match]));
	return definitions
		.map((definition, index) => ({
			label: definition.label,
			matches: definition.ids
				.map((id) => byId.get(id))
				.filter((match): match is ScheduleMatch => Boolean(match))
				.map((match) => ({ ...match, time: playoffRollingTime(index) })),
		}))
		.filter((batch) => batch.matches.length > 0);
}

function formatScheduleDay(value: string | null, fallback: string) {
	if (!value) return fallback;
	return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value));
}

