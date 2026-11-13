"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { resolveBroadcastTeam, type BroadcastSnapshot, type BroadcastScene } from "@/lib/tournament-broadcast";

/** The compact team overlay predates the broadcast scenes and lives at /obs/tournament. */
type SetupSource = BroadcastScene | "team-overlay";

const scenes: { scene: SetupSource; title: string; description: string; who: string }[] = [
	{
		scene: "swiss-draw",
		title: "Swiss-Auslosung",
		description: "Zeigt die Ziehung aus dem Live-Cockpit. Die Steuerung bleibt bei der Orga.",
		who: "Host & Watchparty",
	},
	{
		scene: "tournament-board",
		title: "Turnierübersicht",
		description: "Paarungen, Ergebnisse und Tabelle. Die Ansicht folgt der laufenden Runde.",
		who: "Host & Watchparty",
	},
	{
		scene: "match-bar",
		title: "Match-Leiste",
		description: "Teams, Spielstand und Runde als transparente Leiste. Wechselt automatisch zum nächsten Match deines Teams.",
		who: "Spieler-POV",
	},
	{
		scene: "tournament-waiting",
		title: "Pausenbildschirm",
		description: "Zeigt deinen Gegner, den Matchstatus und ob die Captains bereit sind.",
		who: "Host & Spieler-POV",
	},
	{
		scene: "champ-select",
		title: "Champ Select",
		description: "Bestätigte Picks und Bans des ausgewählten Matches. Nicht bestätigte Auswahlen bleiben verborgen.",
		who: "Host & Watchparty",
	},
	{
		scene: "team-overlay",
		title: "Team-Overlay (kompakt)",
		description: "Das bisherige kleine Overlay deines Teams. Nur mit ausgewähltem Team, ohne Demodaten.",
		who: "Spieler-POV",
	},
];

export function BroadcastSetup({ initialTeam }: { initialTeam: string }) {
	const [data, setData] = useState<BroadcastSnapshot | null>(null);
	const [team, setTeam] = useState(initialTeam);
	const [match, setMatch] = useState("");
	const [demo, setDemo] = useState(false);
	const [origin, setOrigin] = useState("");
	const [copied, setCopied] = useState("");
	const [manual, setManual] = useState("");
	const [position, setPosition] = useState("top");
	const selectedTeam = resolveBroadcastTeam(data?.teams ?? [], team);
	const publicTeamId = selectedTeam?.id ?? team;
	const teamKey = selectedTeam?.key ?? "";
	useEffect(() => {
		let stopped = false;
		void fetch("/api/obs/tournament-broadcast", { cache: "no-store" })
			.then(async (response) => {
				if (response.ok && !stopped) setData((await response.json()) as BroadcastSnapshot);
			})
			.catch(() => {});
		const timer = window.setTimeout(() => setOrigin(window.location.origin), 0);
		return () => {
			stopped = true;
			window.clearTimeout(timer);
		};
	}, []);
	function url(scene: SetupSource) {
		if (scene === "team-overlay") return `${origin}/obs/tournament?team=${encodeURIComponent(publicTeamId)}`;
		const query = new URLSearchParams();
		if (scene === "match-bar" && position === "bottom") query.set("position", "bottom");
		if (demo) query.set("demo", "1");
		else if (scene !== "swiss-draw" && scene !== "tournament-board") {
			if (publicTeamId) query.set("team", publicTeamId);
			if (match) query.set("match", match);
		}
		return `${origin}/obs/${scene}${query.size ? `?${query}` : ""}`;
	}
	async function copy(scene: SetupSource) {
		const value = url(scene);
		try {
			await navigator.clipboard.writeText(value);
			setCopied(scene);
			setManual("");
		} catch {
			setManual(value);
		}
	}
	return (
		<main className="broadcast-setup">
			<div className="broadcast-setup-shell">
				<header>
					<Link href="/" className="broadcast-brand">
						<Image src="/tournament-bear-mark.png" alt="" width={42} height={42} unoptimized />
						<span>
							Lauchgruen <i>/</i> Broadcast
						</span>
					</Link>
					<span className="broadcast-kicker">OBS-Browser-Quellen</span>
					<h1>Turnier-Overlays</h1>
					<p>Wähle dein Team und füge den Link der gewünschten Ansicht als Browser-Quelle in OBS hinzu.</p>
				</header>
				<section className="broadcast-setup-options" aria-label="Quellen konfigurieren">
					<div>
						<label htmlFor="broadcast-team">Deinem Team folgen</label>
						<select
							id="broadcast-team"
							value={publicTeamId}
							onChange={(event) => {
								setTeam(event.target.value);
								setMatch("");
							}}
						>
							<option value="">Host · Cast-Match automatisch</option>
							{data?.teams.map((entry) => (
								<option key={entry.key} value={entry.id}>
									{entry.name}
								</option>
							))}
						</select>
					</div>
					<div>
						<label htmlFor="broadcast-match">Oder ein Match fest anheften</label>
						<select id="broadcast-match" value={match} onChange={(event) => setMatch(event.target.value)}>
							<option value="">Automatisch zum nächsten Match wechseln</option>
							{data?.matches
								.filter((entry) => !teamKey || entry.teamA?.key === teamKey || entry.teamB?.key === teamKey)
								.map((entry) => (
									<option key={entry.id} value={entry.id}>
										{entry.round} · {entry.labelA} vs {entry.labelB}
									</option>
								))}
						</select>
					</div>
					<div>
						<label htmlFor="broadcast-position">Position der Match-Leiste</label>
						<select id="broadcast-position" value={position} onChange={(event) => setPosition(event.target.value)}>
							<option value="top">Oben mittig · HUD bleibt frei</option>
							<option value="bottom">Unten mittig</option>
						</select>
					</div>
					<label className="broadcast-demo-toggle">
						<input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} /> Demodaten statt Turnierdaten
					</label>
				</section>
				<p className="broadcast-setup-note">
					<strong>OBS: 1920 × 1080</strong> · Benutzerdefiniertes CSS leer lassen · Browser-Quelle bei Szenenwechsel nicht entladen, wenn du durchgehende Draw-Reveals
					möchtest. Ein neu geladener Draw zeigt den gespeicherten Stand, ohne alte Ziehungen erneut abzuspielen.
				</p>
				{!data?.published ? (
					<p className="broadcast-setup-note">Team-Auswahl erscheint nach der Veröffentlichung. Alle Szenen lassen sich bereits mit Demodaten testen.</p>
				) : null}
				<div className="broadcast-source-grid">
					{scenes.map((entry, index) => (
						<article key={entry.scene}>
							<span className="broadcast-source-number">0{index + 1}</span>
							<span className="broadcast-kicker">{entry.who}</span>
							<h2>{entry.title}</h2>
							<p>{entry.description}</p>
							<code>{url(entry.scene)}</code>
							<div>
								<button
									type="button"
									disabled={
										!origin ||
										(entry.scene === "team-overlay" && (demo || !publicTeamId)) ||
										(!demo && Boolean(team) && !selectedTeam && entry.scene !== "swiss-draw" && entry.scene !== "tournament-board")
									}
									onClick={() => void copy(entry.scene)}
								>
									{copied === entry.scene ? "Kopiert" : "OBS-URL kopieren"}
								</button>
								<a href={url(entry.scene)} target="_blank" rel="noreferrer">
									Vorschau öffnen ↗
								</a>
							</div>
						</article>
					))}
				</div>
				{manual ? (
					<label className="broadcast-manual-copy">
						Zwischenablage nicht verfügbar. Diese URL kann direkt markiert werden:
						<input readOnly value={manual} onFocus={(event) => event.target.select()} />
					</label>
				) : null}
				<footer>Keine Riot- oder Twitch-Anfragen pro Zuschauer. Kein Login für Browser-Quellen. Nur veröffentlichte Turnierdaten.</footer>
			</div>
		</main>
	);
}
