import { TournamentLink as Link } from "../TournamentLink";
import { playoffFormatLabel } from "@/lib/tournament-format";
import { getTournamentSettings } from "@/lib/tournament-settings";

const ruleSections = [
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
			"Dein Account muss mindestens 150 Champions besitzen",
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
		title: "Ultimate-Bravery-Rolls",
		text: "Jeder Spieler würfelt auf der Match-Seite Champion, Item-Build, Runen und Summoner Spells. Pro Spieler und Match sind 2 Rerolls garantiert. Der final bestätigte Roll wird serverseitig gespeichert und ist verbindlich.",
		list: [
			"Jungle erhält garantiert Smite und ein Jungle-Startitem",
			"Support erhält garantiert ein Support-Startitem",
			"Der restliche Build und die übrigen Vorgaben werden zufällig aus gültigen Riot-Daten erzeugt",
		],
	},
	{
		title: "Reroll-Ausnahmen und Captains",
		text: "Die 2 normalen Rerolls pro Spieler und Match sind garantiert. Eine zusätzliche Ausnahme ist nur möglich, wenn nach diesen Rerolls weiterhin kein besessener Champion dabei ist.",
		list: [
			"Der Captain beantragt die Ausnahme mit einer nachvollziehbaren Begründung",
			"Die Orga genehmigt oder verwirft den Antrag",
			"Missbrauch kann als automatische Niederlage oder Regelverstoß gewertet werden",
		],
	},
	{
		title: "Falsche Champions oder Builds",
		text: "Abweichungen vom gespeicherten Roll müssen sofort gemeldet werden.",
		footer: "Das Orga-Team entscheidet im Einzelfall über Korrektur, Neustart, Matchverlust oder weitere Maßnahmen.",
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
		text: "Teamname, Roster, Riot-ID, Rollen, Scores, Ultimate-Bravery-Rolls und Turnierstatus können auf der Website, in OBS-Overlays, Discord-Embeds oder im Stream sichtbar sein.",
	},
	{
		title: "Admin-Entscheidungen",
		text: "Das Orga-Team entscheidet über Streitfälle, technische Probleme, Regelverstöße, Remakes, Ergebnis-Korrekturen und Disqualifikationen.",
		footer: "Ziel ist ein fairer, transparenter und entspannter Ablauf für alle Beteiligten.",
	},
];

export default async function TournamentTermsPage() {
	const config = (await getTournamentSettings()).ultimateBravery;
	const dayOne =
		config.dayOneFormat === "swiss"
			? `eine Swiss Stage mit ${config.swissRounds} Runden`
			: config.dayOneFormat === "groups"
				? `eine Gruppenphase mit ${config.groupCount} ${config.groupCount === 1 ? "Gruppe" : "Gruppen"}`
				: "ein noch nicht festgelegtes Stage-Format";
	const playoffName = playoffFormatLabel(config.format);
	const playoffs = playoffName ? `${playoffName.replaceAll(" ", "-")}-Bracket` : "noch nicht festgelegten Playoff-Format";
	const qualification =
		config.advanceTeamCount === config.teamCount
			? "Alle Teams erreichen den zweiten Spieltag."
			: `Die besten ${config.advanceTeamCount} von ${config.teamCount} Teams erreichen die Playoffs.`;
	const swissPairingRule =
		config.dayOneFormat === "swiss" ? " Jede Swiss-Runde wird zufällig ausgelost. Bereits gespielte Paarungen dürfen im weiteren Swiss-Verlauf nicht erneut entstehen." : "";
	const displayedRuleSections = ruleSections.map((section) =>
		section.title === "Turnierformat"
			? {
					...section,
					text: `Alle Matches werden als Best of 1 gespielt. Am ersten Spieltag folgt ${dayOne}.${swissPairingRule} Am zweiten Spieltag finden die Playoffs im ${playoffs} statt. ${qualification}`,
					list:
						config.format === "double-elimination" || config.format === "double-elimination-light"
							? [
									...(config.format === "double-elimination-light"
										? [
												config.advanceTeamCount === 6
													? "Seed #1 spielt gegen #4 und #2 gegen #3 im Upper Bracket; Seed #5 und #6 beginnen im Lower Bracket"
													: "Seed #1 und #2 starten im Upper-Halbfinale; Seed #7 und #8 beginnen im Lower Bracket",
											]
										: ["Alle qualifizierten Teams starten im Upper Bracket"]),
									"Das höher gesetzte Team erhält die Seitenwahl",
									"Eine Niederlage im Upper Bracket führt ins Lower Bracket",
									"Eine Niederlage im Lower Bracket beendet das Turnier",
									"Das Grand Final ist ein einzelnes Do-or-die-Match ohne Bracket Reset",
								]
							: config.format === "single-elimination"
								? [
										"Eine Niederlage in den Playoffs beendet das Turnier",
										"Mögliche Freilose ergeben sich aus Seeding und Teamzahl",
										"Der finale Ablauf wird vor Turnierbeginn veröffentlicht",
									]
								: [
										"Das Playoff-System wird anhand der finalen Teamzahl festgelegt",
										"Seeding und mögliche Freilose werden rechtzeitig veröffentlicht",
										"Der finale Ablauf wird vor Turnierbeginn veröffentlicht",
									],
				}
			: section
	);
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-5xl">
				<div className="rounded-[2.4rem] border border-lime-200/14 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-2xl shadow-black/30 sm:p-8">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Teilnahmebedingungen</div>
					<h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Regeln für Ultimate Bravery.</h1>
					<p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-100/72">Diese Teilnahmebedingungen halten fest, was du mit deiner Bewerbung bestätigst.</p>
				</div>

				<div className="mt-6 grid gap-4">
					{displayedRuleSections.map((section, index) => (
						<article key={section.title} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
							<div className="flex gap-4">
								<span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-lime-200/18 bg-lime-200/10 text-sm font-black text-lime-100">
									{index + 1}
								</span>
								<div>
									<h2 className="text-lg font-black text-emerald-50">{section.title}</h2>
									<p className="mt-2 text-sm leading-7 text-emerald-100/70">{section.text}</p>
									{"list" in section && section.list && (
										<ul className="mt-2 space-y-1">
											{section.list.map((item, i) => (
												<li key={i} className="flex gap-2 text-sm leading-7 text-emerald-100/70">
													<span className="shrink-0 text-lime-300/60">–</span>
													{item}
												</li>
											))}
										</ul>
									)}
									{"footer" in section && section.footer && <p className="mt-2 text-sm leading-7 text-emerald-100/50">{section.footer}</p>}
								</div>
							</div>
						</article>
					))}

					<article className="rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.06] p-5 shadow-xl shadow-black/20">
						<h2 className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/72">Zustimmung bei Bewerbung</h2>
						<p className="mt-4 text-sm leading-7 text-amber-50/82">
							Wenn du auf &quot;Bewerbung absenden&quot; klickst, bestätigst du, dass du diese Teilnahmebedingungen und die Datenschutzhinweise gelesen hast und mit
							der Verarbeitung deiner Turnierdaten für Organisation, Durchführung und Nachvollziehbarkeit des Events einverstanden bist.
						</p>
					</article>

					<div className="flex flex-wrap gap-3">
						<Link
							href="/tournament/privacy"
							className="rounded-2xl border border-white/14 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
						>
							Datenschutz
						</Link>
						<Link
							href="/tournament/apply"
							className="rounded-2xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 transition hover:-translate-y-0.5"
						>
							Zur Bewerbung
						</Link>
					</div>
				</div>
			</section>
		</div>
	);
}
