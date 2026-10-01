import { playoffFormatLabel } from "@/lib/tournament-format";
import { TOURNAMENT_KIND_LABELS, type TournamentKind } from "@/lib/tournament-kind";
import type { TournamentMode } from "@/lib/tournament-mode";
import type { TournamentSettings } from "@/lib/tournament-settings";

/**
 * Public copy for the active tournament: hero, subnavigation and rulebook.
 * Everything that differs between tournament kinds lives here so pages stay generic.
 */

export type HeroTone = "live" | "accent" | "amber" | "muted";

export type TournamentHeroData = {
	name: string;
	kind: TournamentKind;
	eyebrow: { label: string; tone: HeroTone };
	tagline: string;
	pills: string[];
	side: {
		value: string;
		unit: string;
		note?: string;
		cta?: { href: string; label: string; tone: "primary" | "live" | "ghost" };
	};
};

export type TournamentSubnavItem = { href: string; label: string; live?: boolean };

export type RulebookEntry = { title: string; text: string };

const MODE_LABELS: Record<TournamentMode, { label: string; tone: HeroTone }> = {
	teaser: { label: "Ankündigung", tone: "accent" },
	registration: { label: "Anmeldung offen", tone: "accent" },
	preparation: { label: "Vorbereitung", tone: "amber" },
	live: { label: "Live", tone: "live" },
	paused: { label: "Pausiert", tone: "muted" },
	finished: { label: "Abgeschlossen", tone: "amber" },
};

export function tournamentModeLabel(mode: TournamentMode) {
	return MODE_LABELS[mode];
}

const TAGLINES: Record<TournamentKind, string> = {
	fearless: "Jeder Champion zählt nur einmal. Was euer Team gespielt hat, ist für den Rest des Turniers gesperrt, also plant euren Pool mit Weitblick.",
	"ultimate-bravery": "Zufälliger Champion, zufälliger Build, zufällige Runen und Summoner Spells. Jeder Spieler würfelt seine Vorgabe direkt auf der Match-Seite.",
	az: "Das Glücksrad lost jedem Team pro Match einen eigenen A-Z-Pool zu. Nur diese Champions dürfen gepickt werden.",
};

export function formatTournamentDay(value: string | null, withTime = true): string | null {
	if (!value) return null;
	return new Intl.DateTimeFormat("de-DE", {
		weekday: "short",
		day: "2-digit",
		month: "2-digit",
		...(withTime ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
		timeZone: "Europe/Berlin",
	}).format(new Date(value));
}

export function stageLabel(structure: TournamentSettings["ultimateBravery"]): string | null {
	switch (structure.dayOneFormat) {
		case "swiss":
			return "Swiss Stage";
		case "swiss-elimination":
			return "Swiss mit Ausscheiden";
		case "groups":
			return structure.groupCount === 1 ? "Gruppenphase" : `${structure.groupCount} Gruppen`;
		case "gsl":
			return `${structure.groupCount} GSL-Gruppen`;
		case "none":
			return "Setzliste";
		case "undecided":
			return null;
	}
}

/** "Best of 1", or the split when stages differ ("Bo1 · Finale Bo3"). */
export function seriesLabel(structure: TournamentSettings["ultimateBravery"]): string {
	const { dayOne, playoffs, finals } = structure.bestOf;
	if (dayOne === playoffs && playoffs === finals) return `Best of ${dayOne}`;
	if (dayOne === playoffs) return `Bo${dayOne} · Finale Bo${finals}`;
	return `Tag 1 Bo${dayOne} · Playoffs Bo${playoffs}${finals !== playoffs ? ` · Finale Bo${finals}` : ""}`;
}

export function buildTournamentHero(input: { settings: TournamentSettings; teamCount: number; applicationsOpen: boolean; championTeamName?: string | null }): TournamentHeroData {
	const { settings, teamCount, applicationsOpen } = input;
	const active = settings.activeTournament;
	const structure = settings.ultimateBravery;
	const days = [formatTournamentDay(structure.startAt), formatTournamentDay(structure.dayTwoStartAt)].filter((day): day is string => Boolean(day));
	const pills = [
		...(days.length ? days : ["Termin folgt"]),
		stageLabel(structure),
		structure.playInTeamCount > 0 ? "Play-in" : null,
		playoffFormatLabel(structure.format),
		seriesLabel(structure),
		TOURNAMENT_KIND_LABELS[active.kind],
		active.kind === "fearless" ? (settings.fearless.lockOpponentChampions ? "Eigene + gegnerische Picks gesperrt" : "Eigene Picks gesperrt") : null,
		`Level ${structure.minimumSummonerLevel}+`,
	].filter((pill): pill is string => Boolean(pill));

	const cta: TournamentHeroData["side"]["cta"] =
		active.mode === "live"
			? { href: "/tournament/live", label: "Live-Zentrale", tone: "live" }
			: applicationsOpen
				? { href: "/tournament/apply", label: "Jetzt bewerben", tone: "primary" }
				: active.mode === "finished"
					? { href: "/tournament/playoffs", label: "Finales Bracket", tone: "ghost" }
					: undefined;

	const mode = MODE_LABELS[active.mode];
	return {
		name: active.name,
		kind: active.kind,
		eyebrow: { label: registrationLabel(settings, applicationsOpen) ?? mode.label, tone: mode.tone },
		tagline: active.mode === "finished" && input.championTeamName ? `${input.championTeamName} gewinnt ${active.name}.` : TAGLINES[active.kind],
		pills,
		side: {
			value: String(teamCount > 0 ? teamCount : structure.teamCount),
			unit: teamCount > 0 ? "Teams" : "Teams geplant",
			note: active.mode === "finished" ? undefined : applicationsOpen ? "Bewerbungen sind offen" : active.mode === "live" ? "Matches laufen" : undefined,
			cta,
		},
	};
}

function registrationLabel(settings: TournamentSettings, applicationsOpen: boolean): string | null {
	if (settings.activeTournament.mode !== "registration" || applicationsOpen) return null;
	const opensAt = settings.applicationOpenAt ? new Date(settings.applicationOpenAt) : null;
	if (opensAt && opensAt.getTime() > Date.now()) return `Anmeldung ab ${formatTournamentDay(settings.applicationOpenAt, false)}`;
	return "Anmeldung geschlossen";
}

export function buildTournamentSubnav(input: { settings: TournamentSettings; rosterPublished: boolean; isCaptain: boolean }): TournamentSubnavItem[] {
	const { settings, rosterPublished, isCaptain } = input;
	const active = settings.activeTournament;
	const structure = settings.ultimateBravery;
	const running = active.mode === "live" || active.mode === "paused" || active.mode === "finished";
	const items: Array<TournamentSubnavItem | null> = [
		{ href: "/tournament", label: active.mode === "finished" ? "Champion" : "Übersicht" },
		active.mode === "live" ? { href: "/tournament/live", label: "Live", live: true } : null,
		rosterPublished ? { href: "/tournament/teams", label: "Teams" } : null,
		structure.dayOneFormat !== "undecided" ? { href: "/tournament/stage", label: stageLabel(structure) ?? "Stage" } : null,
		structure.format !== "undecided" ? { href: "/tournament/playoffs", label: "Bracket" } : null,
		running ? { href: "/tournament/schedule", label: active.mode === "finished" ? "Ergebnisse" : "Zeitplan" } : null,
		active.kind === "fearless" && rosterPublished ? { href: "/tournament/fearless", label: "Fearless" } : null,
		active.kind === "az" && running ? { href: "/tournament/pools", label: "Pools" } : null,
		active.mode === "live" && isCaptain ? { href: "/tournament/captain", label: "Captain" } : null,
	];
	return items.filter((item): item is TournamentSubnavItem => Boolean(item));
}

export function buildRulebook(settings: TournamentSettings): RulebookEntry[] {
	const structure = settings.ultimateBravery;
	const days = [formatTournamentDay(structure.startAt, false), formatTournamentDay(structure.dayTwoStartAt, false)].filter(Boolean);
	const common: RulebookEntry[] = [
		structure.bestOf.dayOne === 1 && structure.bestOf.playoffs === 1 && structure.bestOf.finals === 1
			? { title: "Alle Spiele Best of 1", text: "Jedes Match ist ein einzelnes Spiel. Ergebnisse zählen direkt für den weiteren Turnierverlauf." }
			: {
					title: seriesLabel(structure),
					text: "Serien gewinnt, wer zuerst die nötigen Spiele gewinnt. Nach jedem Spiel startet der Champ Select neu; die Seitenwahl folgt der Turnierregel.",
				},
		{
			title: days.length ? `Beide Tage einplanen · ${days.join(" & ")}` : "Beide Turniertage einplanen",
			text: "Mit der Bewerbung meldest du dich verbindlich für alle Spieltage an. Bitte sei 20 Minuten vor Start im Voice-Call.",
		},
		{
			title: `Account-Level ${structure.minimumSummonerLevel}+`,
			text: "Das Mindestlevel reduziert offensichtliche Wegwerf-Accounts, ist aber kein vollständiger Smurf-Schutz.",
		},
	];
	switch (settings.activeTournament.kind) {
		case "fearless":
			return [
				...common,
				{
					title: "Fearless: gespielte Champions sind gesperrt",
					text:
						(settings.fearless.scope === "series"
							? "Jeder Champion, den dein Team in einer Serie gespielt hat, ist für die restlichen Spiele dieser Serie gesperrt; im nächsten Match beginnt es neu."
							: "Jeder Champion, den dein Team im Turnier gespielt hat, ist für den Rest des Turniers für dein Team gesperrt.") +
						(settings.fearless.lockOpponentChampions
							? " Zusätzlich darfst du nichts picken, was dein aktueller Gegner bereits gespielt hat."
							: " Was andere Teams spielen, bleibt für euch frei."),
				},
				{
					title: "Champ Select auf der Website",
					text: "Captains draften im Website-Champ-Select: 3 Bans pro Team, 30 Sekunden pro Turn. Gesperrte Champions sind dort automatisch ausgegraut.",
				},
				{
					title: "Breiter Champion-Pool",
					text: "Fearless verbraucht Champions schnell. Je mehr Champions euer Team besitzt und spielen kann, desto besser kommt ihr durch die späten Runden.",
				},
			];
		case "ultimate-bravery":
			return [
				...common,
				{ title: "Mindestens 150 Champions", text: "Dein League-Account sollte mindestens 150 Champions besitzen, damit Ultimate Bravery fair spielbar bleibt." },
				{
					title: `${structure.rerollsPerPlayer} Rerolls pro Match`,
					text: `Jeder Spieler hat ${structure.rerollsPerPlayer} garantierte Rerolls. Weitere Ausnahmen laufen nur über Captain und Orga.`,
				},
			];
		case "az":
			return [...common, { title: "Pool pro Match", text: "Das Glücksrad lost jedem Team einen eigenen A-Z-Pool zu. Nur diese Champions dürfen gepickt werden." }];
	}
}
