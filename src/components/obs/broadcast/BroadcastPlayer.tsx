"use client";

/* eslint-disable @next/next/no-img-element -- OBS uses direct cached assets with native image-error fallbacks, not optimizer requests per source. */

import { useEffect, useState, type CSSProperties } from "react";
import { SwissTeamDrawReel } from "@/components/SwissTeamDrawReel";
import { previewSwissPotRound, slotLetter } from "@/lib/swiss-pot-draw";
import {
	broadcastDrawReveals,
	broadcastHistoryContinues,
	maskedBroadcastPool,
	type BroadcastScene,
	type BroadcastSnapshot,
	type BroadcastReveal,
	type BroadcastMatch,
	type BroadcastChampion,
} from "@/lib/tournament-broadcast";

type View = { snapshot: BroadcastSnapshot | null; reveals: BroadcastReveal[]; error: boolean };
const statusLabel = (status: string) =>
	(({ Live: "Live", Pending: "Champ Select", Scheduled: "Als Nächstes", Finished: "Beendet", Locked: "Paarung offen" }) as Record<string, string>)[status] ?? status;

export function BroadcastPlayer({ scene, query }: { scene: BroadcastScene; query: string }) {
	const [view, setView] = useState<View>({ snapshot: null, reveals: [], error: false });
	const [frame, setFrame] = useState({ scale: 1, left: 0, top: 0 });
	useEffect(() => {
		function resize() {
			const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
			setFrame({ scale, left: (window.innerWidth - 1920 * scale) / 2, top: (window.innerHeight - 1080 * scale) / 2 });
		}
		resize();
		window.addEventListener("resize", resize);
		return () => window.removeEventListener("resize", resize);
	}, []);
	useEffect(() => {
		let disposed = false,
			timer = 0,
			step = 0,
			failures = 0;
		let controller: AbortController | undefined;
		const options = new URLSearchParams(query);
		async function poll() {
			controller = new AbortController();
			const timeout = window.setTimeout(() => controller?.abort(), 12000);
			try {
				const params = new URLSearchParams(query);
				params.set("scene", scene);
				if (options.get("demo") === "1" && scene === "swiss-draw") params.set("step", String(Math.min(step, 20)));
				const response = await fetch(`/api/obs/tournament-broadcast?${params}`, { cache: "no-store", signal: controller.signal });
				if (!response.ok) {
					if (response.status === 404 && !disposed) setView({ snapshot: null, reveals: [], error: true });
					throw new Error("Broadcast unavailable");
				}
				const snapshot = (await response.json()) as BroadcastSnapshot;
				if (snapshot.version !== 1 || !Array.isArray(snapshot.matches)) throw new Error("Invalid broadcast response");
				if (!disposed)
					setView((previous) => ({
						snapshot,
						error: false,
						reveals:
							scene === "swiss-draw"
								? [...(broadcastHistoryContinues(previous.snapshot, snapshot) ? previous.reveals : []), ...broadcastDrawReveals(previous.snapshot, snapshot)]
								: [],
					}));
				failures = 0;
				step++;
			} catch {
				if (!disposed) {
					failures++;
					setView((previous) => ({ ...previous, error: true }));
				}
			} finally {
				window.clearTimeout(timeout);
				if (!disposed)
					timer = window.setTimeout(
						() => void poll(),
						failures
							? Math.min(15000, 2000 * failures)
							: options.get("demo") === "1" && scene === "swiss-draw"
								? 4500
								: scene === "swiss-draw" || scene === "champ-select"
									? 1000
									: 4000
					);
			}
		}
		void poll();
		return () => {
			disposed = true;
			window.clearTimeout(timer);
			controller?.abort();
		};
	}, [query, scene]);
	const data = view.snapshot;
	const style = { transform: `translate(${frame.left}px, ${frame.top}px) scale(${frame.scale})` } as CSSProperties;
	return (
		<main
			className={`broadcast-canvas broadcast-${scene}${new URLSearchParams(query).get("position") === "bottom" ? " broadcast-bar-bottom" : ""}`}
			style={style}
			aria-label="Lauchgruen Turnier-Broadcast"
		>
			{!data ? (
				<div className="broadcast-loading">
					<img src="/bear-logo.png" alt="" />
					<h1>{view.error ? "Broadcast nicht erreichbar" : "Die Bühne wird vorbereitet."}</h1>
					<p>{view.error ? "Quelle und Team-Auswahl prüfen. Wir verbinden automatisch neu." : "Turnierdaten werden verbunden."}</p>
				</div>
			) : (
				<>
					{data.source !== "live" ? <div className="broadcast-demo-label">{data.source === "sandbox" ? "LOKALE GENERALPROBE" : "VORSCHAU · DEMODATEN"}</div> : null}
					{scene === "match-bar" ? (
						<MatchBar data={data} />
					) : (
						<section className="broadcast-stage">
							<header className="broadcast-heading">
								<div className="broadcast-brand">
									<img src="/tournament-bear-mark.png" alt="" />
									<span>
										Lauchgruen <i>/</i> Turnier
									</span>
								</div>
								<span className="broadcast-kicker">
									{scene === "swiss-draw"
										? "Die Auslosung"
										: scene === "champ-select"
											? "Champ Select"
											: scene === "tournament-waiting"
												? "Gleich geht’s weiter"
												: "Das Turnier"}
								</span>
							</header>
							{!data.published ? (
								<Empty title="Die Bühne steht. Die Teams folgen." text="Die Aufstellung wird nach der Veröffentlichung durch die Orga angezeigt." />
							) : scene === "swiss-draw" ? (
								<DrawScene
									data={data}
									reveals={view.reveals}
									finish={(id) => setView((previous) => ({ ...previous, reveals: previous.reveals.filter((reveal) => reveal.id !== id) }))}
								/>
							) : scene === "tournament-board" ? (
								<TournamentBoard data={data} />
							) : scene === "tournament-waiting" ? (
								<WaitingScene data={data} />
							) : (
								<DraftScene data={data} />
							)}
							<footer className="broadcast-signoff">
								<span>{data.tournament.name}</span>
								<span>tournament.lauchgruen.de</span>
							</footer>
						</section>
					)}
				</>
			)}
			{view.error && data ? (
				<div className="broadcast-connection" role="status">
					Verbindung unterbrochen · letzter bestätigter Stand
				</div>
			) : null}
		</main>
	);
}

function Empty({ title, text }: { title: string; text: string }) {
	return (
		<div className="broadcast-empty">
			<span className="broadcast-kicker">Lauchgruen Community</span>
			<h1>{title}</h1>
			<p>{text}</p>
		</div>
	);
}

function DrawScene({ data, reveals, finish }: { data: BroadcastSnapshot; reveals: BroadcastReveal[]; finish: (id: string) => void }) {
	const draw = data.draw;
	if (!draw) return <Empty title="Noch keine Swiss-Auslosung." text="Sobald die Orga die Swiss-Ziehung vorbereitet, erscheint sie hier automatisch." />;
	const active = reveals[0];
	const round = (active ? draw.rounds.find((round) => round.round === active.round) : previewSwissPotRound(draw)) ?? draw.rounds.at(-1);
	if (!round) return <Empty title="Die Lostöpfe werden vorbereitet." text="Acht Teams. Ein gemeinsamer Weg." />;
	const name = (key: string | null) => draw.teams.find((team) => team.key === key)?.name ?? "Noch im Lostopf";
	return (
		<div className="broadcast-draw-content">
			<div className="broadcast-title-row">
				<div>
					<span className="broadcast-kicker">Swiss Stage · Runde {String(round.round).padStart(2, "0")}</span>
					<h1>Ein Los. Ein neuer Gegner.</h1>
				</div>
				<span className={`broadcast-live-pill${active ? " is-active" : ""}`}>
					{active ? "Ziehung läuft" : round.complete ? "Paarungen stehen" : "Bereit für das nächste Los"}
				</span>
			</div>
			<div className={`broadcast-pots pots-${round.pools.length}`}>
				{round.pools.map((original) => {
					const pool = maskedBroadcastPool(original, round.round, reveals);
					return (
						<section className={`broadcast-pot${active?.record === pool.record ? " is-active" : ""}`} key={pool.record}>
							<header>
								<strong>{pool.record.replace("-", "–")}</strong>
								<span>{pool.automatic ? "Paarung steht fest" : `${pool.drawOrder.length} / ${pool.teamKeys.length} Teams gezogen`}</span>
							</header>
							<div className="broadcast-draw-rows">
								{Array.from({ length: pool.slots.length / 2 }, (_, row) => (
									<div
										key={row}
										className="broadcast-draw-row"
										role="group"
										aria-label={`Slot ${slotLetter(row)} gegen ${slotLetter(row + pool.slots.length / 2)}`}
									>
										{[row, row + pool.slots.length / 2].map((slot, side) => (
											<div
												key={slot}
												className={`broadcast-draw-side side-${side}${active?.round === round.round && active.record === pool.record && active.slot === slot ? " is-drawing" : ""}`}
											>
												<span className="broadcast-slot-letter">{slotLetter(slot)}</span>
												{active?.round === round.round && active.record === pool.record && active.slot === slot ? (
													<SwissTeamDrawReel key={active.id} draw={{ ...active, id: 0 }} onComplete={() => finish(active.id)} />
												) : (
													<strong>{name(pool.slots[slot])}</strong>
												)}
											</div>
										))}
										<span className="broadcast-versus" aria-hidden="true">
											VS
										</span>
									</div>
								))}
							</div>
							{pool.blockedRematches.length > 0 && !pool.complete ? <p className="broadcast-rematch">Platzierungsduell · Orga-Freigabe ausstehend</p> : null}
						</section>
					);
				})}
			</div>
			{!round.pools.length ? (
				<div className="broadcast-match-grid">
					{round.pairings.map((pair) => (
						<div className="broadcast-match-card" key={pair.id}>
							<strong>{name(pair.teamAKey)}</strong>
							<span>VS</span>
							<strong>{name(pair.teamBKey)}</strong>
						</div>
					))}
				</div>
			) : null}
			<p className="broadcast-draw-caption">
				Gleiche Bilanz. Neue Begegnungen. <span>Die Orga zieht, ihr seid live dabei.</span>
			</p>
		</div>
	);
}

function MatchCard({ match }: { match: BroadcastMatch }) {
	return (
		<article className={`broadcast-match-card${match.status === "Live" ? " is-live" : ""}`}>
			<div className="broadcast-match-meta">
				<span>{statusLabel(match.status)}</span>
				<small>
					BO{match.bestOf}
					{match.casted ? " · MAIN STREAM" : ""}
				</small>
			</div>
			<div className="broadcast-match-line">
				<strong>{match.teamA?.name ?? match.labelA}</strong>
				<b>{match.scoreA ?? "–"}</b>
			</div>
			<div className="broadcast-match-line">
				<strong>{match.teamB?.name ?? match.labelB}</strong>
				<b>{match.scoreB ?? "–"}</b>
			</div>
		</article>
	);
}

function TournamentBoard({ data }: { data: BroadcastSnapshot }) {
	const matches = data.matches;
	const focus =
		matches.find((match) => match.status === "Live") ??
		matches.find((match) => match.status === "Pending") ??
		matches.find((match) => match.status === "Scheduled" && match.teamA && match.teamB) ??
		[...matches].reverse().find((match) => match.status === "Finished");
	const phase = focus?.phase ?? "groups";
	const groups = new Map<string, BroadcastMatch[]>();
	for (const match of matches.filter((match) => match.phase === phase)) {
		const key = `${match.bracket ? `${match.bracket} · ` : ""}${match.round}`;
		groups.set(key, [...(groups.get(key) ?? []), match]);
	}
	const columns = [...groups];
	const active = Math.max(
		0,
		columns.findIndex(([, entries]) => entries.some((match) => match.id === focus?.id))
	);
	const firstColumn = Math.max(0, Math.min(active - 1, columns.length - 3));
	const visible = columns.slice(firstColumn, firstColumn + 3);
	return (
		<div className="broadcast-board-content">
			<div className="broadcast-title-row">
				<div>
					<span className="broadcast-kicker">{phase === "playoffs" ? "Der Weg ins Finale" : "Jede Runde zählt"}</span>
					<h1>{data.champion ? `${data.champion} gewinnt!` : phase === "playoffs" ? "Die Playoffs." : "Die aktuelle Lage."}</h1>
				</div>
				<span className="broadcast-live-pill">{matches.filter((match) => match.status === "Live").length} Matches live</span>
			</div>
			<div className="broadcast-board-layout">
				<div className="broadcast-round-columns" style={{ "--broadcast-columns": Math.max(1, visible.length) } as CSSProperties}>
					{visible.map(([round, entries]) => (
						<section key={round} className="broadcast-round">
							<h2>{round}</h2>
							{entries.slice(0, 4).map((match) => (
								<MatchCard key={match.id} match={match} />
							))}
							{entries.length > 4 ? <p className="broadcast-more">+ {entries.length - 4} weitere Matches · vollständiger Plan auf der Website</p> : null}
						</section>
					))}
					{!visible.length ? <Empty title="Die Begegnungen folgen." text="Auslosung und Match-Ergebnisse erscheinen automatisch." /> : null}
				</div>
				<aside className="broadcast-standings">
					<span className="broadcast-kicker">{data.standingsFinal ? "Playoff-Setzliste" : data.standings.length ? "Zwischenstand" : "Das Teilnehmerfeld"}</span>
					{(data.standings.length ? data.standings : data.teams.map((team, index) => ({ name: team.name, rank: index + 1, wins: 0, losses: 0 })))
						.slice(0, 10)
						.map((row, index) => (
							<div key={row.name}>
								<span>{data.standings.length ? `${"group" in row && row.group ? `${row.group} · ` : "#"}${row.rank}` : String(index + 1).padStart(2, "0")}</span>
								<strong>{row.name}</strong>
								{data.standings.length ? (
									<b>
										{row.wins}–{row.losses}
									</b>
								) : null}
							</div>
						))}
				</aside>
			</div>
		</div>
	);
}

function MatchBar({ data }: { data: BroadcastSnapshot }) {
	const match = data.selectedMatch;
	return (
		<section className="broadcast-matchbar">
			<img src="/tournament-bear-mark.png" alt="" />
			<div className="broadcast-matchbar-body">
				<div className="broadcast-matchbar-meta">
					<span>{data.tournament.name}</span>
					<span>
						{match?.round ?? "Warten auf das nächste Match"} {match ? `· BO${match.bestOf}` : ""}
					</span>
				</div>
				<div className="broadcast-matchbar-teams">
					<strong className={match ? (match.blueSide === "teamA" ? "is-blue" : "is-red") : ""}>{match?.teamA?.name ?? data.selectedTeam?.name ?? "Teams folgen"}</strong>
					<b>{match ? `${match.scoreA ?? 0} : ${match.scoreB ?? 0}` : "VS"}</b>
					<strong className={match ? (match.blueSide === "teamB" ? "is-blue" : "is-red") : ""}>{match?.teamB?.name ?? "Gegner noch offen"}</strong>
				</div>
				<div className="broadcast-matchbar-status">
					{!data.published ? "Teams noch nicht veröffentlicht" : match ? statusLabel(match.status) : "Die nächste Paarung erscheint automatisch"}
				</div>
			</div>
		</section>
	);
}

function WaitingScene({ data }: { data: BroadcastSnapshot }) {
	const match = data.selectedMatch;
	if (!match)
		return (
			<Empty
				title={data.selectedTeam ? `${data.selectedTeam.name} ist gleich wieder da.` : "Wir sind gleich wieder da."}
				text="Die nächste Begegnung erscheint nach der Freigabe automatisch. Bleibt dabei."
			/>
		);
	return (
		<div className="broadcast-waiting-content">
			<span className="broadcast-kicker">
				{match.round} · BO{match.bestOf}
			</span>
			<h1>{match.status === "Live" ? "Das Match läuft." : match.status === "Finished" ? "GG. Kurz durchatmen." : "Der nächste Gegner steht."}</h1>
			<div className="broadcast-faceoff">
				<div>
					<span>{match.blueSide === "teamA" ? "BLUE SIDE" : "RED SIDE"}</span>
					<h2>{match.teamA?.name ?? match.labelA}</h2>
					<small>{(match.blueSide === "teamA" ? data.draft?.readyA : data.draft?.readyB) ? "Captain bereit" : "Match-Informationen folgen"}</small>
				</div>
				<b>VS</b>
				<div>
					<span>{match.blueSide === "teamB" ? "BLUE SIDE" : "RED SIDE"}</span>
					<h2>{match.teamB?.name ?? match.labelB}</h2>
					<small>{(match.blueSide === "teamB" ? data.draft?.readyA : data.draft?.readyB) ? "Captain bereit" : "Match-Informationen folgen"}</small>
				</div>
			</div>
			<div className="broadcast-waiting-note">
				<span>{statusLabel(match.status)}</span>
				<strong>{match.time === "Rolling Schedule" ? "Im Anschluss an die vorherige Runde" : match.time}</strong>
				<p>{data.selectedTeam ? `Diese Szene folgt ${data.selectedTeam.name} automatisch.` : "Holt euch etwas zu trinken. Wir sehen uns gleich auf der Kluft."}</p>
			</div>
		</div>
	);
}

function ChampionTile({ champion, index, ban = false }: { champion?: BroadcastChampion; index: number; ban?: boolean }) {
	return (
		<div className={`broadcast-champion${ban ? " is-ban" : ""}${champion ? " is-locked" : ""}`}>
			{champion?.image ? (
				<img
					key={champion.image}
					src={champion.image}
					alt=""
					onError={(event) => {
						event.currentTarget.hidden = true;
					}}
				/>
			) : null}
			<span>{champion?.name ?? (ban ? "BAN" : `PICK ${index + 1}`)}</span>
			{champion && !ban ? <small>LOCKED IN</small> : null}
		</div>
	);
}

function DraftScene({ data }: { data: BroadcastSnapshot }) {
	const match = data.selectedMatch;
	if (!match || !data.draftEnabled)
		return (
			<Empty
				title={data.draftEnabled ? "Der nächste Draft wartet." : "Champ Select ist pausiert."}
				text="Sobald ein öffentliches Match bereit ist, erscheinen die bestätigten Picks und Bans hier."
			/>
		);
	const draft = data.draft;
	const blueTeam = match.blueSide === "teamA" ? match.teamA : match.teamB;
	const redTeam = match.blueSide === "teamA" ? match.teamB : match.teamA;
	return (
		<div className="broadcast-draft-content">
			<div className="broadcast-title-row">
				<div>
					<span className="broadcast-kicker">
						{match.round} · BO{match.bestOf}
					</span>
					<h1>{draft?.finalized ? "Die Teams sind bereit." : "Die Entscheidung fällt hier."}</h1>
				</div>
				<span className="broadcast-live-pill">Nur bestätigte Picks & Bans</span>
			</div>
			<div className="broadcast-draft-sides">
				{[
					{ name: blueTeam?.name ?? "Blue Side", picks: draft?.picksA ?? [], bans: draft?.bansA ?? [], color: "blue" },
					{ name: redTeam?.name ?? "Red Side", picks: draft?.picksB ?? [], bans: draft?.bansB ?? [], color: "red" },
				].map((side) => (
					<section className={`broadcast-draft-team is-${side.color}`} key={side.color}>
						<header>
							<span className="broadcast-kicker">{side.color} side</span>
							<h2>{side.name}</h2>
						</header>
						<div className="broadcast-picks">
							{Array.from({ length: 5 }, (_, index) => (
								<ChampionTile champion={side.picks[index]} index={index} key={index} />
							))}
						</div>
						<div className="broadcast-bans">
							{Array.from({ length: Math.max(5, side.bans.length) }, (_, index) => (
								<ChampionTile champion={side.bans[index]} index={index} ban key={index} />
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
