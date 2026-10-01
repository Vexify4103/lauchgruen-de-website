import { describeStructurePlan, describeTiebreakers, playoffRuleBullets } from "@/lib/tournament-structure";
import { tournamentKind, type TournamentKind } from "@/lib/tournament-kind";
import type { TournamentSettings } from "@/lib/tournament-settings";

type RuleSection = { title: string; text: string; list?: string[]; footer?: string; kinds?: TournamentKind[] };

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
			"Kein Trashtalk gegen Gegner, Teammates, Zuschauer oder Orga",
			"Keine Schuldzuweisungen, öffentlichen Flaming-Diskussionen oder persönlichen Angriffe nach Games",
			"Kein absichtliches Feeden oder Griefing",
			"Kein Cheating oder Scripting",
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
			"Jeder Turn dauert 30 Sekunden; ein ausgewählter Champion wird bei Ablauf automatisch gelockt",
			"Läuft ein Turn ohne Auswahl ab, wird der Draft zurückgesetzt",
			"Im Client wird exakt der Website-Draft übernommen",
		],
	},
	{
		title: "Falsche Picks im Spiel",
		kinds: ["fearless", "az"],
		text: "Abweichungen vom gespeicherten Website-Draft müssen sofort gemeldet werden.",
		list: [
			"Vor Minute 3 wird das Match mit dem korrekten Draft neu gestartet",
			"Wird ein falscher oder gesperrter Champion erst später bemerkt, entscheidet die Orga über Remake oder Niederlage des betreffenden Teams",
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
		text: "Während laufender Spiele dürfen keine externen spielrelevanten Informationen an Teilnehmer weitergegeben werden.",
		list: ["Kein Live-Coaching während des Spiels", "Keine Informationen durch Zuschauer", "Keine Weitergabe von gegnerischen Positionen oder Cooldowns"],
	},
	{
		title: "Lobby und Seitenwahl",
		text: "Nach jedem Match kommen alle Captains in den Captain-Call. Für jedes kommende Match wird per Münzwurf bestimmt, welches Team die Seitenwahl erhält.",
		list: [
			"Der Captain mit Seitenwahl entscheidet zwischen Blue Side und Red Side",
			"Der Blue-Side-Captain erstellt die Lobby",
			"Der Blue-Side-Captain lädt seine eigenen Spieler und den Captain des gegnerischen Teams ein",
			"Der gegnerische Captain lädt anschließend seine Spieler ein",
		],
		footer: "Das Orga-Team kann bei Problemen eine Lobby neu erstellen lassen oder die Lobby-Erstellung selbst übernehmen.",
	},
	{
		title: "Pünktlichkeit",
		text: "Teams müssen spätestens 10 Minuten nach dem geplanten Match-Start vollständig im Voice-Channel bereitstehen. Ist ein Team nach Ablauf dieser Frist nicht vollständig anwesend, kann das Orga-Team ein Forfeit zugunsten des wartenden Teams verhängen.",
	},
	{
		title: "Rückzug, Forfeit und Team-Balance",
		text: "Wunschgruppen mit bis zu fünf Personen sind nicht garantiert. Das Orga-Team darf Gruppen aus Fairness- und Balancing-Gründen teilweise oder vollständig aufteilen. Wer nach der finalen Teamzuteilung nicht mehr antreten möchte, muss das dem Orga-Team so früh wie möglich mitteilen.",
		list: [
			"Wenn ein Team wegen Rückzug, fehlenden Spielern oder verweigerter Teilnahme nicht spielbereit ist, kann das Orga-Team einzelne Matches als Forfeit werten",
			"Ein Forfeit kann als Niederlage für das betroffene Team und als Sieg für den Gegner eingetragen werden",
			"Wenn der Turnierablauf sonst gefährdet ist, darf das Orga-Team Ersatzspieler einsetzen oder Teams kurzfristig anpassen",
			"Diskussionen über Wunschgruppen oder Teamzuteilung begründen keinen Anspruch auf Neuverteilung",
		],
		footer: "Ziel ist, dass das Turnier für alle Teams fair und planbar bleibt.",
	},
	{
		title: "Pausen während des Spiels",
		text: "Pausen dürfen ausschließlich bei technischen Problemen oder wichtigen Notfällen genutzt werden.",
		list: [
			"Der Grund der Pause muss sofort mitgeteilt werden",
			"Pausen dürfen nicht für taktische Besprechungen missbraucht werden",
			"Das Orga-Team kann Pausen beenden oder verlängern",
		],
	},
	{
		title: "Remake",
		text: "Ein Remake kann beantragt werden, wenn ein Spieler innerhalb der ersten 3 Minuten disconnected und nicht rechtzeitig reconnecten kann.",
		footer: "Der Remake muss vom Orga-Team genehmigt werden. Wiederholte oder selbst verschuldete technische Probleme begründen keinen automatischen Anspruch auf ein Remake.",
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
		text: "Der Captain des Sieger-Teams meldet das Ergebnis unmittelbar nach Spielende im offiziellen Turnier-Channel im Discord.",
		list: ["Screenshot des Endbildschirms beifügen", "Spielzeit im Format mm:ss angeben", "Ergebnis zeitnah melden", "Bei Streitfällen beide Screenshots bereithalten"],
	},
	{
		title: "Bracket und Seeding",
		text: "Seeds und erste Paarungen werden nach der Teamzusammenstellung durch die Orga festgelegt und vor Turnierbeginn im Zeitplan veröffentlicht.",
		footer: "Bis zur finalen Veröffentlichung begründet der Arbeitsstand keinen Anspruch auf eine bestimmte Paarung.",
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

export function getDefaultRuleSections(settings: TournamentSettings) {
	const config = settings.ultimateBravery;
	const kind = tournamentKind(settings.activeTournament);
	const displayedRuleSections = ruleSections
		.filter((section) => !section.kinds || section.kinds.includes(kind))
		.map((section) =>
			section.title === "Turnierformat"
				? {
						...section,
						text: `${describeStructurePlan(config).join(" ")} Platzierungen in Tabellen: ${describeTiebreakers(config.tiebreakers)}.${
							config.dayOneFormat === "swiss" || config.dayOneFormat === "swiss-elimination"
								? " Swiss-Runden werden innerhalb derselben Bilanz gelost; bereits gespielte Paarungen entstehen nicht erneut."
								: ""
						}`,
						list: playoffRuleBullets(config),
					}
				: section
		);
	return displayedRuleSections;
}

export function getDefaultRulesMarkdown(settings: TournamentSettings): string {
	return getDefaultRuleSections(settings)
		.map((section, index) =>
			[`## ${index + 1}. ${section.title}`, section.text, section.list?.map((item) => `- ${item}`).join("\n"), section.footer].filter(Boolean).join("\n\n")
		)
		.join("\n\n");
}
