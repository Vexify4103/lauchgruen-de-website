import { TournamentLink as Link } from "../TournamentLink";

const ruleSections = [
	{
		title: "Twitch-Streams",
		text: "Die Verknüpfung eines Twitch-Kanals ist freiwillig. Wenn die öffentliche Anzeige aktiviert ist, kann ein tatsächlich laufender Stream während eines Live-Matches im Zeitplan und bei den Teams verlinkt werden.",
	},
	{
		title: "Verbindliche Anmeldung",
		text: "Bewerbungsschluss ist Donnerstag, 18.06.2026 um 20:00 Uhr CEST. Mit dem Absenden der Bewerbung meldest du dich verbindlich für beide Turniertage an: Freitag, 19.06. um 18:00 Uhr CEST und Samstag, 20.06. um 16:00 Uhr CEST. Wenn du unsicher bist oder nur teilweise Zeit hast, musst du das in den Notizen angeben oder dem Orga-Team frühzeitig schreiben. Wer ohne vorherige Abmeldung nicht erscheint, wird vom nächsten Turnier ausgeschlossen.",
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
		text: "Das Turnier ist ein Spaß- und Community-Event. Alle Teilnehmer behandeln Mitspieler, Gegner, Zuschauer und Admins respektvoll.",
		list: [
			"Keine Beleidigungen oder Belästigungen",
			"Kein absichtliches Feeden oder Griefing",
			"Kein Cheating oder Scripting",
			"Kein Stream-Sniping",
			"Keine unsportlichen Manipulationen des Turnierablaufs",
		],
		footer: "Verstöße können je nach Schwere mit Verwarnungen, Matchverlusten oder Ausschluss geahndet werden.",
	},
	{
		title: "Account-Änderungen",
		text: "Die bei der Bewerbung angegebene Riot-ID muss korrekt sein. Änderungen nach der Anmeldung müssen dem Orga-Team vor Turnierbeginn mitgeteilt werden.",
	},
	{
		title: "A-Z Champion-Pools",
		text: "Für jedes Match wird pro Team ein A-Z Pool gelost. Ein Team darf in diesem Match nur Champions aus dem eigenen Pool picken. Bans richten sich gegen den gegnerischen Pool. Gespielte Pools verlassen für das jeweilige Team das Rad; zum zweiten Spieltag beziehungsweise Playoff-Tag wird der Pool-Verlauf zurückgesetzt.",
		list: [
			"Jedes Team verfügt standardmäßig über 3 Bans pro Match",
			"In Upper Bracket Runde 1 erhalten A #2 und B #2 jeweils einen zusätzlichen vierten Ban",
			"Nach Upper Bracket Runde 1 gelten wieder die normalen 3 Bans pro Team",
		],
	},
	{
		title: "Draft und Captains",
		text: "Nur Team-Captains oder berechtigte Admins dürfen im Champ Select ready klicken, Champions auswählen, bannen oder locken.",
		list: [
			"Captains sind für die Einhaltung der Pool-Regeln verantwortlich",
			"Admins dürfen bei technischen Problemen eingreifen",
			"Admins dürfen Drafts pausieren, zurücksetzen oder korrigieren",
		],
	},
	{
		title: "Falsche Picks oder Bans",
		text: "Wird ein Champion gepickt oder gebannt, der gegen die Turnierregeln verstößt, muss dies sofort gemeldet werden.",
		footer: "Das Orga-Team entscheidet im Einzelfall über Draft-Neustart, Pick-Korrektur, Matchverlust oder weitere Maßnahmen.",
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
		title: "Gruppenphase",
		text: "Jedes Team spielt zweimal gegen jedes andere Team seiner Gruppe, also sechs Gruppenspiele pro Team. Die Platzierung richtet sich zuerst nach der Sieg-Niederlagen-Bilanz.",
		list: [
			"Anzahl der direkten Siege zwischen den gleichstehenden Teams",
			"Niedrigere durchschnittliche Spielzeit der Siege im direkten Vergleich dieser Teams",
			"Entscheidung durch das Orga-Team, falls weiterhin Gleichstand besteht",
		],
		footer: "Fehlende Spielzeiten können nicht zugunsten eines Teams gewertet werden.",
	},
	{
		title: "Ergebnismeldung",
		text: "Der Captain des Sieger-Teams meldet das Ergebnis unmittelbar nach Spielende im offiziellen Turnier-Channel im Discord.",
		list: ["Screenshot des Endbildschirms beifügen", "Spielzeit im Format mm:ss angeben", "Ergebnis zeitnah melden", "Bei Streitfällen beide Screenshots bereithalten"],
	},
	{
		title: "Playoff-Seeding",
		text: "Alle acht Teams spielen am zweiten Turniertag weiter. Die Gruppensieger steigen erst in Upper Runde 2 ein. In Upper Runde 1 spielt A #2 mit vier Bans gegen B #3 und B #2 mit vier Bans gegen A #3.",
		footer: "Danach wird das Turnier als Double-Elimination-Bracket fortgesetzt.",
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
		text: "Teamname, Roster, Riot-ID, Rollen, Scores, Pools, Draft-Informationen und Turnierstatus können auf der Website, in OBS-Overlays, Discord-Embeds oder im Stream sichtbar sein.",
	},
	{
		title: "Admin-Entscheidungen",
		text: "Das Orga-Team entscheidet über Streitfälle, technische Probleme, Regelverstöße, Remakes, Ergebnis-Korrekturen und Disqualifikationen.",
		footer: "Ziel ist ein fairer, transparenter und entspannter Ablauf für alle Beteiligten.",
	},
];

export default function TournamentTermsPage() {
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-5xl">
				<div className="rounded-[2.4rem] border border-lime-200/14 bg-gradient-to-br from-lime-200/12 via-emerald-400/8 to-cyan-400/8 p-6 shadow-2xl shadow-black/30 sm:p-8">
					<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">Teilnahmebedingungen</div>
					<h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Regeln für das Kunterbunte A-Z Turnier.</h1>
					<p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-100/72">Diese Teilnahmebedingungen halten fest, was du mit deiner Bewerbung bestätigst.</p>
				</div>

				<div className="mt-6 grid gap-4">
					{ruleSections.map((section, index) => (
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
