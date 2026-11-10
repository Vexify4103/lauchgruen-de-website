"use client";

import type { ReplayAssets } from "@/lib/replay-assets";
import { formatGameDuration } from "@/lib/match-duration";
import type { ReplayPlayer, ReplaySummary } from "@/lib/rofl";

const POSITION_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", ""];
const POSITION_LABEL: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support", "": "" };

type Side = { team: 100 | 200; label: string; teamName: string; players: ReplayPlayer[] };

/** Full post-game scoreboard of one replay, blue and red side next to each other. */
export function ReplayScoreboard({
	summary,
	assets,
	blueTeamName,
	redTeamName,
	fileName,
	uploader,
}: {
	summary: ReplaySummary;
	assets: ReplayAssets | null;
	blueTeamName: string;
	redTeamName: string;
	fileName?: string;
	uploader?: string;
}) {
	const minutes = Math.max(1, summary.durationSeconds / 60);
	const sides: Side[] = [
		{ team: 100, label: "Blaue Seite", teamName: blueTeamName, players: [] },
		{ team: 200, label: "Rote Seite", teamName: redTeamName, players: [] },
	];
	for (const player of summary.players) sides[player.team === 200 ? 1 : 0].players.push(player);
	for (const side of sides) side.players.sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position));
	const patch = summary.gameVersion?.split(".").slice(0, 2).join(".");

	return (
		<div className="grid gap-4">
			<p className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
				<span>
					Spielzeit <strong className="font-mono text-[var(--text)]">{formatGameDuration(summary.durationSeconds)}</strong>
				</span>
				{patch ? (
					<span>
						Patch <strong className="font-mono text-[var(--text)]">{patch}</strong>
					</span>
				) : null}
				{uploader ? (
					<span>
						Hochgeladen von <strong className="text-[var(--text)]">{uploader}</strong>
					</span>
				) : null}
				{fileName ? (
					<span>
						Datei <span className="font-mono text-[var(--text)]">{fileName}</span>
					</span>
				) : null}
			</p>
			<div className="grid gap-4 xl:grid-cols-2">
				{sides.map((side) => (
					<SidePanel key={side.team} side={side} won={summary.winningTeam === side.team} minutes={minutes} assets={assets} />
				))}
			</div>
		</div>
	);
}

function SidePanel({ side, won, minutes, assets }: { side: Side; won: boolean; minutes: number; assets: ReplayAssets | null }) {
	const blue = side.team === 100;
	const kills = side.players.reduce((sum, player) => sum + player.kills, 0);
	const gold = side.players.reduce((sum, player) => sum + player.gold, 0);
	const damage = side.players.reduce((sum, player) => sum + player.damageToChampions, 0);
	const color = blue ? "#4f8dff" : "#ff4f5e";
	return (
		<section aria-label={side.label} className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--admin-inset)]">
			<header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] px-4 py-2.5">
				<span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color }}>
					<i aria-hidden className="size-2 rounded-full" style={{ background: color }} />
					{side.label}
				</span>
				<span className="truncate text-sm font-medium text-[var(--text)]">{side.teamName}</span>
				<span className={`text-xs font-semibold ${won ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{won ? "Sieg" : "Niederlage"}</span>
				<span className="ml-auto font-mono text-xs text-[var(--muted)]">
					{kills} Kills · {(gold / 1000).toFixed(1)}k Gold
				</span>
			</header>
			<ul className="divide-y divide-[var(--line)]">
				{side.players.map((player) => (
					<PlayerRow key={player.puuid || player.riotIdName} player={player} teamKills={kills} teamGold={gold} teamDamage={damage} minutes={minutes} assets={assets} />
				))}
			</ul>
		</section>
	);
}

function PlayerRow({
	player,
	teamKills,
	teamGold,
	teamDamage,
	minutes,
	assets,
}: {
	player: ReplayPlayer;
	teamKills: number;
	teamGold: number;
	teamDamage: number;
	minutes: number;
	assets: ReplayAssets | null;
}) {
	const champion = assets?.champions[player.champion.toLowerCase()];
	const kda = player.deaths ? (player.kills + player.assists) / player.deaths : player.kills + player.assists;
	const kdaTone = kda >= 4 ? "text-[var(--amber)]" : kda < 1 ? "text-[var(--danger)]" : "text-[var(--text)]";
	const percent = (value: number, total: number) => (total ? Math.round((value / total) * 100) : 0);
	const items = player.items ?? [];
	return (
		<li className="grid items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
			<div className="flex min-w-0 items-center gap-3">
				<div className="relative shrink-0">
					{champion ? (
						// eslint-disable-next-line @next/next/no-img-element -- Data Dragon icons, already sized
						<img src={champion.icon} alt={champion.name} width={48} height={48} className="size-12 rounded-lg" />
					) : (
						<div className="grid size-12 place-items-center rounded-lg bg-[var(--admin-step)] text-[10px] text-[var(--muted)]">{player.champion.slice(0, 4)}</div>
					)}
					<span className="absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-md bg-black/85 px-1 font-mono text-[10px] font-semibold text-white">
						{player.level}
					</span>
				</div>
				<div className="min-w-0">
					<div className="flex min-w-0 items-baseline gap-2">
						<span className="truncate text-sm font-semibold text-[var(--text)]" title={`${player.riotIdName}#${player.riotIdTag}`}>
							{player.riotIdName}
						</span>
						<span className="shrink-0 text-[11px] text-[var(--muted)]">{POSITION_LABEL[player.position]}</span>
					</div>
					<div className="mt-1 flex items-center gap-0.5">
						{(player.summonerSpells ?? []).map((id, index) => (
							<Icon key={`s${index}`} asset={assets?.spells[String(id)]} />
						))}
						{player.perks?.[0] ? <Icon asset={assets?.runes[String(player.perks[0])]} round /> : null}
						{player.subStyle ? <Icon asset={assets?.runes[String(player.subStyle)]} round small /> : null}
						<span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
						{items.length ? items.map((id, index) => <Icon key={`i${index}`} asset={id ? assets?.items[String(id)] : undefined} empty={!id} />) : null}
					</div>
					<div className="mt-1 text-[11px] text-[var(--muted)]">
						Kontrollwards {player.controlWardsPlaced ?? "–"} · Vision {player.visionScore}
					</div>
				</div>
			</div>
			<div className="grid grid-cols-4 gap-1.5 text-center">
				<Tile top={`${player.kills}/${player.deaths}/${player.assists}`} bottom={`${kda.toFixed(2)} KDA`} bottomTone={kdaTone} />
				<Tile top={`${player.creepScore} CS`} bottom={`${(player.creepScore / minutes).toFixed(1)}/min`} />
				<Tile top={`KP ${percent(player.kills + player.assists, teamKills)}%`} bottom={`Gold ${percent(player.gold, teamGold)}%`} />
				<Tile top={`${(player.damageToChampions / 1000).toFixed(1)}k`} bottom={`Schaden ${percent(player.damageToChampions, teamDamage)}%`} />
			</div>
		</li>
	);
}

function Tile({ top, bottom, bottomTone = "text-[var(--muted)]" }: { top: string; bottom: string; bottomTone?: string }) {
	return (
		<div className="w-[5.25rem] rounded-lg bg-[var(--admin-step)] px-1.5 py-1.5">
			<div className="font-mono text-xs font-semibold text-[var(--text)]">{top}</div>
			<div className={`font-mono text-[11px] ${bottomTone}`}>{bottom}</div>
		</div>
	);
}

function Icon({ asset, round = false, small = false, empty = false }: { asset?: { name: string; icon: string }; round?: boolean; small?: boolean; empty?: boolean }) {
	const size = small ? "size-3.5" : "size-[22px]";
	if (!asset) return <span aria-hidden={empty} className={`${size} shrink-0 ${round ? "rounded-full" : "rounded"} bg-[var(--admin-step)]`} />;
	return (
		// eslint-disable-next-line @next/next/no-img-element -- Data Dragon icons, already sized
		<img src={asset.icon} alt={asset.name} title={asset.name} width={24} height={24} className={`${size} shrink-0 ${round ? "rounded-full bg-black/40" : "rounded"}`} />
	);
}
