import { describeSideSelection, describeStructurePlan, describeTiebreakers, playoffRuleBullets } from "@/lib/tournament-structure";
import { tournamentKind, type TournamentKind } from "@/lib/tournament-kind";
import { fearlessCapacity } from "@/lib/fearless-capacity";
import type { TournamentSettings } from "@/lib/tournament-settings";

type RuleSection = { title: string; text: string; list?: string[]; footer?: string; kinds?: TournamentKind[] };

export const RULEBOOK_REVISION = "2026-11-12";
export const RULE_CATEGORIES = [
	{ id: "teilnahme", title: "Teilnahme & Accounts" },
	{ id: "format-draft", title: "Turnierformat & Draft" },
	{ id: "matchablauf", title: "Matchablauf & Ergebnisse" },
	{ id: "fairplay", title: "Fairplay & Turnierleitung" },
	{ id: "streams-zuschauer", title: "Streaming & Zuschauer" },
	{ id: "oeffentlichkeit", title: "Öffentliche Darstellung" },
] as const;

// Stable IDs are independent of display numbers and the tournament's format-specific rules.
const RULE_ORDER = [
	["Verbindliche Anmeldung", "anmeldung", "Verbindliche Anmeldung", "teilnahme"],
	["Discord und Riot-Account", "accounts", "Discord und Riot-Account", "teilnahme"],
	["Account-Änderungen", "spielaccounts", "Account-Änderungen und Spielaccounts", "teilnahme"],
	["Rückzug, Forfeit und Team-Balance", "wunschgruppen", "Wunschgruppen, Team-Balance und Rückzug", "teilnahme"],
	["Substitutes und Teamänderungen", "ersatzspieler", "Ersatzspieler und Teamänderungen", "teilnahme"],
	["Turnierformat", "turnierformat", "Turnierformat und Spieltage", "format-draft"],
	["Bracket und Seeding", "seeding", "Seeding und Paarungen", "format-draft"],
	["Fearless:", "fearless", "Fearless und Champion-Sperren", "format-draft"],
	["Champ Select auf der Website", "champ-select", "Champ Select auf der Website", "format-draft"],
	["Falsche Picks im Spiel", "draft-abweichungen", "Abweichungen vom bestätigten Draft", "format-draft"],
	["Ultimate-Bravery-Rolls", "bravery-rolls", "Ultimate-Bravery-Rolls", "format-draft"],
	["Reroll-Ausnahmen und Captains", "rerolls", "Reroll-Ausnahmen und Captains", "format-draft"],
	["Falsche Runen oder Items", "build-abweichungen", "Falsche Runen oder Items", "format-draft"],
	["Pünktlichkeit", "spielbereitschaft", "Spielbereitschaft und Pünktlichkeit", "matchablauf"],
	["Lobby und Seitenwahl", "seitenwahl", "Lobby-Erstellung und Seitenwahl", "matchablauf"],
	["Pausen während des Spiels", "pausen", "Pausen und technische Probleme", "matchablauf"],
	["Remake", "remake", "Neustarts und Remakes", "matchablauf"],
	["Ergebnismeldung", "ergebnisse", "Replay-Upload und Ergebnisbestätigung", "matchablauf"],
	["Verhalten", "verhalten", "Verhalten und Fairplay", "fairplay"],
	["Coaching und Zuschauer", "coaching", "Coaching und externe Informationen", "fairplay"],
	["Admin-Entscheidungen", "orga", "Orga-Entscheidungen und Regelverstöße", "fairplay"],
	["Spectator Delay", "zuschauer", "Zuschauerplätze und Spectator Delay", "streams-zuschauer"],
	["Streaming", "streaming", "Streaming-Vorgaben für Teilnehmer", "streams-zuschauer"],
	["Twitch-Streams", "twitch", "Freiwillige Twitch-Verknüpfung", "streams-zuschauer"],
	["Öffentliche Darstellung", "turnierdaten", "Veröffentlichung von Turnierdaten", "oeffentlichkeit"],
] as const;

export type NumberedRule = RuleSection & { id: string; number: number; categoryId: string };
export type RuleCategory = { id: string; title: string; rules: NumberedRule[] };

export function getRuleCategories(settings: TournamentSettings): RuleCategory[] {
	const rules = getDefaultRuleSections(settings);
	return RULE_CATEGORIES.map((category) => ({ ...category, rules: rules.filter((rule) => rule.categoryId === category.id) })).filter((category) => category.rules.length > 0);
}

/** Uses exactly the heading syntax supported by TournamentMarkdown; duplicate titles stay unique. */
export function getCustomRuleHeadings(markdown: string) {
	const used = new Set<string>();
	return markdown
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.flatMap((line) => {
			const match = /^(#{1,3})\s+(.+)$/.exec(line);
			if (!match) return [];
			const title = match[2].replace(/[*_~`]/g, "");
			const plainTitle = title.replace(/^\d+[.)]\s*/, "");
			const slug =
				plainTitle
					.toLowerCase()
					.replace(/ß/g, "ss")
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "") || "abschnitt";
			const categoryId = match[1].length === 1 ? RULE_CATEGORIES.find((category) => category.title === plainTitle)?.id : undefined;
			const base = categoryId ?? RULE_ORDER.find(([source, , title]) => source === plainTitle || title === plainTitle)?.[1] ?? `regel-${slug}`;
			let id: string = base;
			for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
			used.add(id);
			return [{ id, title, level: match[1].length }];
		});
}

export function getCustomRuleCategories(markdown: string) {
	const categories: { id: string; title: string; rules: ReturnType<typeof getCustomRuleHeadings> }[] = [];
	for (const heading of getCustomRuleHeadings(markdown)) {
		if (heading.level === 1) categories.push({ id: heading.id, title: heading.title, rules: [] });
		else {
			if (!categories.length) categories.push({ id: "eigene-regeln", title: "Eigene Turnierregeln", rules: [] });
			categories.at(-1)!.rules.push(heading);
		}
	}
	return categories;
}

const ruleSections: RuleSection[] = [
	{
		title: "Twitch-Streams",
		text: "Die Verknüpfung eines Twitch-Kanals ist freiwillig. Wenn die öffentliche Anzeige aktiviert ist, kann ein tatsächlich laufender Stream während eines Live-Matches im Zeitplan und bei den Teams verlinkt werden.",
	},
	{
		title: "Verbindliche Anmeldung",
		text: "Bewerbungsstart, Bewerbungsschluss und Turniertermine werden auf der Übersicht und im Bewerbungsformular veröffentlicht. Mit dem Absenden meldest du dich verbindlich für die angekündigten Termine an und bist mindestens 20 Minuten vor Start im Voice-Call. Wenn du unsicher bist, musst du das in den Notizen angeben oder dem Orga-Team frühzeitig schreiben. Wer ohne vorherige Abmeldung nicht erscheint, kann vom nächsten Turnier ausgeschlossen werden.",
	},
	{
		title: "Discord und Riot-Account",
		text: "Teilnahme ist nur mit Discord-Login, Mitgliedschaft im Lauchgruen-Discord und verifiziertem Riot-Account möglich.",
		list: [
			"Du darfst nur mit deinem eigenen Riot-Account teilnehmen",
			"Account-Sharing ist verboten",
			"Smurf-Verschleierung oder falsche Angaben können zum Ausschluss führen",
			"Das Orga-Team kann bei Verdachtsfällen eine Verifizierung verlangen",
		],
	},
	{
		title: "Verhalten",
		text: "Das Turnier ist ein Spaß- und Community-Event. Alle Teilnehmer behandeln Teammates, Gegner, Zuschauer und Admins respektvoll. Trashtalk, Herabwürdigung oder öffentliches Bloßstellen anderer Teams oder einzelner Spieler ist nicht erlaubt.",
		list: [
			"Keine Beleidigungen oder Belästigungen",
			"Keine rassistischen, antisemitischen, sexistischen oder sonstigen diskriminierenden Äußerungen oder Darstellungen",
			"Kein Trashtalk gegen Gegner, Teammates, Zuschauer oder Orga",
			"Keine Schuldzuweisungen, öffentlichen Flaming-Diskussionen oder persönlichen Angriffe nach Games",
			"Kein absichtliches Feeden oder Griefing",
			"Kein Cheating oder Scripting",
			"Keine bewusste Ausnutzung von Bugs und keine gefälschten oder manipulierten Nachweise gegenüber der Orga",
			"Kein Stream-Sniping",
			"Keine unsportlichen Manipulationen des Turnierablaufs",
		],
		footer: "Wenn es Probleme gibt, meldet sie ruhig und sachlich an die Orga oder später über das Feedback-Formular. Verstöße können je nach Schwere mit Verwarnungen, Matchverlusten oder Ausschluss geahndet werden.",
	},
	{
		title: "Account-Änderungen",
		text: "Die bei der Bewerbung angegebene Riot-ID muss korrekt sein. Änderungen nach der Anmeldung müssen dem Orga-Team vor Turnierbeginn mitgeteilt werden.",
	},
	{
		title: "Fearless: gespielte Champions sind gesperrt",
		kinds: ["fearless"],
		text: "Ein Champion gilt als gespielt, sobald er im abgeschlossenen Draft eines Matches für dein Team gepickt wurde. Diesen Champion kann dein Team für den Rest des Turniers nicht mehr picken.",
		list: [
			"Die Sperre gilt ab dem Match, in dem der Champion gepickt wurde, bis zum Ende des Turniers inklusive Playoffs",
			"Bans verbrauchen keine Champions",
			"Ist die Option „Gegner-Champions sperren“ aktiv, darfst du zusätzlich nichts picken, was dein aktueller Gegner im Turnier bereits gespielt hat",
			"Die aktuelle Liste jedes Teams steht jederzeit öffentlich auf der Fearless-Seite",
		],
		footer: "Welche Variante gilt, steht auf der Turnierübersicht und im Champ Select.",
	},
	{
		title: "Champ Select auf der Website",
		kinds: ["fearless", "az"],
		text: "Picks und Bans laufen ausschließlich über den Website-Champ-Select. Nur Captains können dort locken; die Turnierleitung gibt jedes Match frei.",
		list: [
			"Beide Captains klicken zuerst Ready, danach läuft der Draft automatisch",
			"Draft-Reihenfolge wie im Turnier-Draft: 3 Bans pro Team, 3 Picks pro Team, 2 weitere Bans pro Team, dann die letzten 2 Picks pro Team",
			"Jeder Turn dauert 30 Sekunden; ein ausgewählter Champion wird bei Ablauf automatisch gelockt",
			"Läuft ein Ban ohne Auswahl ab, verfällt er (kein Ban). Läuft ein Pick ohne Auswahl ab, wird ein zufälliger erlaubter Champion gepickt",
			"Nach dem letzten Pick ordnen beide Captains ihre Champions den Lanes zu und bestätigen die Rollen; nach 30 Sekunden gilt die aktuelle Zuordnung",
			"Im Client wird exakt der Website-Draft übernommen",
		],
	},
	{
		title: "Falsche Picks im Spiel",
		kinds: ["fearless", "az"],
		text: "Der gespeicherte Website-Draft einschließlich Champion-Rollenzuordnung ist verbindlich. Bei einem falschen, gesperrten oder falsch zugeordneten Champion muss der Captain sofort Gegner und Orga informieren.",
		list: [
			"Wird der Fehler im Client-Champ-Select erkannt, wird dieser sofort unterbrochen. Nach dem Laden wird das Spiel unverzüglich mit /pause angehalten.",
			"Ein früher Auswahl- oder Übertragungsfehler kann vor dem verbindlichen Spielbeginn (siehe Remake-Regel) nach Freigabe durch die Orga korrigiert werden. Technische Probleme müssen benannt und nach Möglichkeit belegt werden.",
			"Niemand startet das Spiel eigenmächtig neu. Maßgeblich bleibt der Website-Draft; ein Neustart erlaubt keinen neuen Draft und setzt keine Fearless-Sperren zurück.",
			"Auch nach verbindlichem Spielbeginn bleiben falsche oder unerlaubte Champions meldepflichtig. Die Orga entscheidet über Fortsetzung, Neustart, Niederlage oder weitere Sanktionen; eine automatische Dreiminuten-Ausnahme gibt es nicht.",
		],
	},
	{
		title: "Ultimate-Bravery-Rolls",
		kinds: ["ultimate-bravery"],
		text: "Jeder Spieler würfelt auf der Match-Seite Champion, Item-Build, Runen und Summoner Spells. Pro Spieler und Match sind 2 Rerolls garantiert. Der final bestätigte Roll wird serverseitig gespeichert und ist verbindlich.",
		list: [
			"Jungle erhält garantiert Smite und ein Jungle-Startitem",
			"Support erhält garantiert ein Support-Startitem",
			"Der restliche Build und die übrigen Vorgaben werden zufällig aus gültigen Riot-Daten erzeugt",
		],
	},
	{
		title: "Reroll-Ausnahmen und Captains",
		kinds: ["ultimate-bravery"],
		text: "Die 2 normalen Rerolls pro Spieler und Match sind garantiert. Eine zusätzliche Ausnahme ist nur möglich, wenn nach diesen Rerolls weiterhin kein besessener Champion dabei ist.",
		list: [
			"Der Captain beantragt die Ausnahme mit einer nachvollziehbaren Begründung",
			"Die Orga genehmigt oder verwirft den Antrag",
			"Missbrauch kann als automatische Niederlage oder Regelverstoß gewertet werden",
		],
	},
	{
		title: "Falsche Runen oder Items",
		kinds: ["ultimate-bravery"],
		text: "Abweichungen vom gespeicherten Ultimate-Bravery-Roll müssen sofort gemeldet werden. Ein Fehler darf nicht verschwiegen oder spielerisch ausgenutzt werden.",
		list: [
			"Falsches Item in einem gecasteten Match: Das Spiel wird pausiert und das falsche Item muss sofort verkauft werden. Fortgesetzt wird erst nach Freigabe durch die Orga.",
			"Falsche Runen bei Spielbeginn: Das Match wird neu gestartet (Remake).",
			"Falsches Item in einem nicht gecasteten Match: Das Spiel wird pausiert und das falsche Item muss sofort verkauft werden.",
			"Wird ein falsches Item in einem nicht gecasteten Match erst nach Spielende durch die Orga festgestellt, wird das Match als Niederlage für das betreffende Team gewertet.",
		],
		footer: "In Zweifelsfällen entscheidet die Orga, ob das Item tatsächlich vom verbindlichen Roll abweicht und wie das laufende Match sicher fortgesetzt wird.",
	},
	{
		title: "Spectator Delay",
		text: "In Turnier-Lobbys darf kein zusätzlicher Spectator Delay aktiviert werden. Die Spiele müssen nur für Caster und das Orga-Team live verfolgbar sein.",
	},
	{
		title: "Coaching und Zuschauer",
		text: "Während laufender Spiele einschließlich technischer Pausen dürfen Teilnehmer keine externen spielrelevanten Informationen erhalten oder weitergeben.",
		list: [
			"Kein Live-Coaching und keine spielrelevanten Ansagen durch Trainer, Zuschauer oder andere Personen außerhalb des aktiven Lineups",
			"Keine Weitergabe von gegnerischen Positionen, Cooldowns oder anderen Informationen aus einer Zuschauerperspektive",
			"Aktive Spieler dürfen laufende Übertragungen ihres Matches weder ansehen noch anhören oder sich über deren Chat informieren lassen. Das gilt auch für den Cast und gegnerische Streams.",
			"Zuschauerplätze werden nur nach Freigabe durch die Orga genutzt; die Spectator-Regel bleibt verbindlich.",
		],
	},
	{
		title: "Lobby und Seitenwahl",
		text: "Nach jedem Match kommen alle Captains in den Captain-Call. Das Recht der Seitenwahl richtet sich nach der Turnierphase; die Orga hält die gewählte Seite auf der Match-Seite fest.",
		list: [
			"Der Captain mit Seitenwahl entscheidet zwischen Blue Side und Red Side",
			"Wenn die Website einen Turniercode bereitstellt, treten die Spieler über diesen Code der Lobby bei. Andernfalls erstellt der Blue-Side-Captain die Lobby, lädt seine Spieler sowie den gegnerischen Captain ein; dieser lädt anschließend sein Team ein.",
			"Vor Spielbeginn prüfen beide Captains das Lineup anhand der auf der Website angezeigten Spielaccounts. Von der Orga freigegebene Ersatzaccounts sind dabei die maßgeblichen Accounts für dieses Turnier.",
		],
		footer: "Das Orga-Team kann bei Problemen eine Lobby neu erstellen lassen oder die Lobby-Erstellung selbst übernehmen.",
	},
	{
		title: "Pünktlichkeit",
		text: "Teams müssen zum von der Orga bestätigten Matchbeginn spielbereit sein. Die Toleranz beträgt 10 Minuten ab diesem Zeitpunkt. Danach kann ausschließlich die Orga ein Forfeit zugunsten des wartenden Teams verhängen.",
		list: [
			"Spielbereit bedeutet: fünf zugelassene Spieler im vorgesehenen Voice-Channel, die auf der Website angezeigten Spielaccounts verfügbar, der League-Client aktuell und der Captain erreichbar sowie bereit für Champ Select und Lobby.",
			"Beim Rolling Schedule sind angezeigte Uhrzeiten Schätzungen. Verzögert sich die vorherige Runde oder eine von der Orga vorgesehene Pause, gilt der anschließend bestätigte Matchbeginn; daraus entsteht keine Verspätung des wartenden Teams.",
			"Absehbare Verspätungen werden sofort gemeldet. Ein noch nicht installiertes Update oder ein fehlender Account-Zugang begründen keine automatische Verlängerung.",
		],
	},
	{
		title: "Rückzug, Forfeit und Team-Balance",
		text: "Wunschgruppen mit bis zu fünf Personen sind nicht garantiert. Das Orga-Team darf Gruppen aus Fairness- und Balancing-Gründen teilweise oder vollständig aufteilen. Wer nach der finalen Teamzuteilung nicht mehr antreten möchte, muss das dem Orga-Team so früh wie möglich mitteilen.",
		list: [
			"Wenn ein Team wegen Rückzug, fehlenden Spielern oder verweigerter Teilnahme nicht spielbereit ist, kann das Orga-Team einzelne Matches als Forfeit werten",
			"Ein Forfeit kann als Niederlage für das betroffene Team und als Sieg für den Gegner eingetragen werden",
			"Teams melden fehlende Gegner oder Spielunfähigkeit an die Orga; sie dürfen einen Forfeit nicht selbst erklären oder eigenmächtig das Match als gewonnen melden",
			"Ein ungespieltes Match benötigt keine Replay. Es darf weder eine erfundene Replay noch eine fiktive Spielzeit eingereicht werden; die Orga dokumentiert den Forfeit ohne eine gespielte Partie vorzutäuschen",
			"Wenn der Turnierablauf sonst gefährdet ist, darf das Orga-Team Ersatzspieler einsetzen oder Teams kurzfristig anpassen",
			"Diskussionen über Wunschgruppen oder Teamzuteilung begründen keinen Anspruch auf Neuverteilung",
		],
		footer: "Ziel ist, dass das Turnier für alle Teams fair und planbar bleibt.",
	},
	{
		title: "Pausen während des Spiels",
		text: "Bei Disconnects, erheblichen technischen Problemen oder wichtigen Notfällen darf mit /pause pausiert werden. Jedes Team hat pro Spiel insgesamt 10 Minuten technische Pausenzeit, nicht 10 Minuten pro Spieler oder Vorfall.",
		list: [
			"Der Captain nennt den Grund sofort im Spielchat und informiert die Orga. Dauer und weitere Unterbrechungen werden nachvollziehbar festgehalten.",
			"Pausen dürfen nicht für taktische Besprechungen missbraucht werden",
			"Vor der Fortsetzung bestätigen beide Captains, dass ihre Teams bereit sind. Es wird nicht überraschend oder gegen eine noch offene technische Meldung unpausiert.",
			"Ist das Zeitbudget erschöpft, entscheidet die Orga über Fortsetzung, Verlängerung oder weitere Maßnahmen. Kein Team erzwingt eigenmächtig die Fortsetzung oder einen Forfeit.",
		],
	},
	{
		title: "Remake",
		text: "Ein früher Neustart und ein bereits verbindlich begonnenes Spiel werden unterschieden. Jeder Neustart benötigt die ausdrückliche Freigabe der Orga; ein Disconnect allein begründet keinen automatischen Remake-Anspruch.",
		list: [
			"Als verbindlich begonnen (Game of Record) gilt das Spiel, sobald Spieler beider Teams einander sehen, ein Angriff oder eine Fähigkeit gegen Vasallen, Jungle-Monster, Gebäude oder Gegner eingesetzt wird, der gegnerische Jungle betreten oder dort Sicht beziehungsweise eine Fähigkeit platziert wird, oder die Spielzeit 02:00 erreicht. Der erste dieser Zeitpunkte zählt.",
			"Vor diesem Zeitpunkt können früh gemeldete Auswahl-, Tausch- oder technische Startprobleme nach Prüfung durch die Orga einen Neustart rechtfertigen. Das ist kein Freibrief für nachträgliche Draft-Anpassungen.",
			"Nach verbindlichem Spielbeginn werden Disconnects und technische Probleme zunächst über die Pausenregel behandelt. Ein Neustart bleibt eine begründete Orga-Ausnahme; Regelverstöße werden dadurch nicht automatisch hinfällig.",
			"Bei einem genehmigten Neustart bleiben Website-Draft, Picks, Bans und Champion-Rollenzuordnung verbindlich. Bestehende Fearless-Sperren werden weder gelöscht noch durch den Neustart umgangen.",
			"Bei einem Serverabbruch oder großflächigen Ausfällen informieren die Captains sofort die Orga und sichern verfügbare Nachweise. Nur die Orga entscheidet über Neustart, Neuansetzung oder Spielwertung; einzelne Verbindungsprobleme sind nicht automatisch ein Serverausfall.",
		],
		footer: "Wiederholte oder selbst verschuldete technische Probleme begründen keinen automatischen Anspruch auf einen Neustart. Weder die Teams noch die Remake-Funktion im Client ersetzen die Entscheidung der Orga.",
	},
	{
		title: "Turnierformat",
		text: "Alle Matches werden als Best of 1 gespielt. Der erste Spieltag ist die Gruppenphase. Am zweiten Spieltag finden die Playoffs im Double-Elimination-Bracket statt.",
		list: [
			"Eine Niederlage im Upper Bracket führt ins Lower Bracket",
			"Eine Niederlage im Lower Bracket beendet das Turnier",
			"Der finale Ablauf wird vor Turnierbeginn veröffentlicht",
		],
	},
	{
		title: "Ergebnismeldung",
		text: "Der Captain des Siegerteams reicht die .rofl-Replay zeitnah nach Spielende über das Captain-Portal beim richtigen Match ein. Bei Bedarf kann auch der gegnerische Captain die Replay einreichen. Ein Discord-Ergebnis-Channel wird dafür nicht verwendet.",
		list: [
			"Die Replay wird im League-Client heruntergeladen und über „Replay hochladen“ dem richtigen Match und Spiel zugeordnet. Pro gespieltem Spiel wird eine passende Replay benötigt; keine Datei eines anderen Matches oder bereits gewerteten Spiels verwenden.",
			"Beide Captains bewahren ihre Original-Replay bis zum Abschluss des Turniers und aller offenen Streitfälle auf.",
			"Der Upload prüft unter anderem Teilnehmer, Champions, Seiten, Spielzeit und Ergebnis. Eine erfolgreiche technische Prüfung ersetzt nicht die Ergebnisbestätigung durch die Orga.",
			"Bei fehlenden, abgelehnten oder nicht hochladbaren Replays wird die Orga sofort kontaktiert. Eine technische Warnung oder ein Uploadproblem ist nicht automatisch ein Regelverstoß oder eine Niederlage; bei Bedarf werden zusätzliche Nachweise angefordert.",
			"Streitfälle werden unverzüglich mit konkreten Angaben zur Situation und möglichst Spielzeit, Screenshots oder Clips an die Orga gemeldet. Nicht eigenmächtig neu spielen oder ein anderes Ergebnis eintragen.",
			"Forfeits trägt ausschließlich die Orga ein. Für ein ungespieltes Match wird keine Replay und keine erfundene Spielzeit verlangt.",
		],
	},
	{
		title: "Bracket und Seeding",
		text: "Die Orga veröffentlicht die anfängliche Setzliste beziehungsweise die Auslosung der ersten Paarungen vor dem Start der jeweiligen Phase. Spätere Paarungen und Platzierungen ergeben sich aus den Ergebnissen und dem veröffentlichten Turnierformat; eine erste Setzliste ist nicht automatisch die Playoff-Reihenfolge.",
		list: [
			"Bei Swiss werden die folgenden Runden nach den geltenden Swiss-Losregeln erstellt. Die Playoff-Seeds ergeben sich aus der Vorrunde und den dafür veröffentlichten Platzierungs- und Tiebreaker-Regeln.",
			"Bei anderen Formaten gelten die auf der Turnierübersicht veröffentlichten Regeln zur Qualifikation und Setzung; ohne Vorrunde veröffentlicht die Orga die direkte Playoff-Setzliste.",
			"Korrekturen aufgrund fehlerhafter Ergebnisse oder einer falschen Zuordnung werden durch die Orga mit nachvollziehbarer Begründung dokumentiert. Ergebnisse werden nicht ohne sachlichen Grund nachträglich umsortiert.",
		],
		footer: "Bis zur finalen Veröffentlichung begründet ein Arbeitsstand keinen Anspruch auf eine bestimmte Paarung. Streitfälle werden an die Orga gemeldet.",
	},
	{
		title: "Streaming",
		text: "Wer das Turnier streamt, erfüllt mindestens eine der folgenden Bedingungen:",
		list: [
			"@lauchgruen wird im Streamtitel erwähnt",
			"Ein automatischer Bot postet mindestens 1× pro Stunde einen Shoutout an Lauchgruen im Chat",
			"Eine angepinnte Chatnachricht mit @lauchgruen ist während des gesamten Streams sichtbar",
		],
		footer: "Das Turnier lebt von der Community. Ein kleines Dankeschön an die Veranstalter ist gerne gesehen.",
	},
	{
		title: "Substitutes und Teamänderungen",
		text: "Das Orga-Team darf Ersatzspieler eintragen, Rollen ändern oder Teams anpassen, wenn das für Fairness, Ablauf oder Notfälle nötig ist.",
		footer: "Historische Matchdaten und Turnierergebnisse bleiben dabei möglichst nachvollziehbar erhalten.",
	},
	{
		title: "Öffentliche Darstellung",
		text: "Teamname, Roster, Riot-ID, Rollen, Scores, Drafts beziehungsweise Rolls und Turnierstatus können auf der Website, in OBS-Overlays, Discord-Embeds oder im Stream sichtbar sein.",
	},
	{
		title: "Admin-Entscheidungen",
		text: "Das Orga-Team entscheidet über Streitfälle, technische Probleme, Regelverstöße, Remakes, Ergebnis-Korrekturen und Disqualifikationen.",
		footer: "Ziel ist ein fairer, transparenter und entspannter Ablauf für alle Beteiligten.",
	},
];

/** Match variant: every pick of a team's games locks for that team. Series scope resets per match. */
function matchFearlessSection(settings: TournamentSettings): RuleSection {
	const series = settings.fearless.scope === "series";
	const capacity = fearlessCapacity(settings.structure, settings.fearless);
	return {
		title: series ? "Match-Fearless: alles aus eurer Serie ist gesperrt" : "Match-Fearless: alles aus euren Spielen ist gesperrt",
		kinds: ["fearless"],
		text: series
			? "Ein Champion gilt als gespielt, sobald er im abgeschlossenen Draft eines Spiels gepickt wurde. Innerhalb einer Serie sind für beide Teams alle Champions gesperrt, die in einem früheren Spiel dieser Serie gepickt wurden, egal von welchem Team. Im nächsten Match beginnt es neu."
			: "Ein Champion gilt als gespielt, sobald er im abgeschlossenen Draft eines Spiels gepickt wurde. Gesperrt sind für dein Team alle Champions aus deinen Spielen: die Picks deines Teams und die Picks jedes Gegners, gegen den ihr gespielt habt. Die Sperren gelten für das ganze Turnier, nicht nur für eine Serie.",
		list: series
			? ["Bans verbrauchen keine Champions", "Die aktuelle Liste jedes Teams steht jederzeit öffentlich auf der Fearless-Seite"]
			: [
					"Nach A gegen B sind alle zehn gepickten Champions für A und für B bis zum Ende des Turniers gesperrt",
					"Die Sperren bleiben über alle Runden, beide Turniertage und die Playoffs bestehen und werden nie zurückgesetzt",
					"Champions aus Spielen anderer Teams bleiben für euch frei",
					"Bans verbrauchen keine Champions",
					"Die aktuelle Liste jedes Teams steht jederzeit öffentlich auf der Fearless-Seite",
				],
		footer: series
			? undefined
			: `Die Champions reichen: Selbst im längsten Fall (${capacity.games} Spiele) sind vor dem letzten Spiel höchstens ${capacity.lockedBeforeLastGame} von etwa ${capacity.championPool} Champions gesperrt. Nach allen Bans und Picks bleiben für den letzten Pick noch mindestens ${capacity.leftForLastPick} Champions. Eng wird es vor allem auf der Bot-Lane, also plant euren Pool breit.`,
	};
}

export function getDefaultRuleSections(settings: TournamentSettings): NumberedRule[] {
	const config = settings.structure;
	const kind = tournamentKind(settings.activeTournament);
	const ordered = RULE_ORDER.flatMap(([source, id, title, categoryId]) => {
		const section = ruleSections.find((rule) => rule.title.startsWith(source));
		return section && (!section.kinds || section.kinds.includes(kind)) ? [{ section, id, title, categoryId }] : [];
	});
	const displayedRuleSections = ordered.map(({ section, id, title, categoryId }, index) => {
		let resolved = section;
		if (section.title.startsWith("Fearless:") && settings.fearless?.variant === "match") resolved = matchFearlessSection(settings);
		if (section.title === "Lobby und Seitenwahl") resolved = { ...section, text: `${section.text} ${describeSideSelection(config)}` };
		if (section.title === "Turnierformat")
			resolved = {
				...section,
				text: `${describeStructurePlan(config).join(" ")} Platzierungen in Tabellen: ${describeTiebreakers(config.tiebreakers)}.${config.dayOneFormat === "swiss" || config.dayOneFormat === "swiss-elimination" ? " Swiss-Runden werden innerhalb derselben Bilanz gelost; bereits gespielte Paarungen entstehen nicht erneut." : ""}`,
				list: playoffRuleBullets(config),
			};
		return { ...resolved, id, title, categoryId, number: index + 1 };
	});
	return displayedRuleSections;
}

export function getDefaultRulesMarkdown(settings: TournamentSettings): string {
	return getRuleCategories(settings)
		.map((category) =>
			[
				`# ${category.title}`,
				...category.rules.map((section) =>
					[`## ${section.number}. ${section.title}`, section.text, section.list?.map((item) => `- ${item}`).join("\n"), section.footer].filter(Boolean).join("\n\n")
				),
			].join("\n\n")
		)
		.join("\n\n");
}
