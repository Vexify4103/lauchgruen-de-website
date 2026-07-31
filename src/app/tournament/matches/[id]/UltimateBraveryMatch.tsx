"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { UltimateBraveryRoll } from "@/lib/ultimate-bravery";
import { playDraftCompleteSound, playRerollSound, unlockTournamentAudio } from "@/lib/tournament-sounds";

type Player = { discordId?: string; name: string; riotId: string; role: string; teamName: string };
type DraftResponse = { rolls: UltimateBraveryRoll[]; allLocked: boolean; lockedCount: number; totalPlayers: number; viewerTeam: string; message?: string };

export function UltimateBraveryMatch({
	matchId,
	players,
	initialRolls,
	currentDiscordId,
	viewerTeam,
	initialAllLocked,
	rerollLimit,
	testOwner = false,
}: {
	matchId: string;
	players: Player[];
	initialRolls: UltimateBraveryRoll[];
	currentDiscordId?: string;
	viewerTeam: string;
	initialAllLocked: boolean;
	rerollLimit: number;
	testOwner?: boolean;
}) {
	const [rolls, setRolls] = useState(initialRolls);
	const [activeViewerTeam, setActiveViewerTeam] = useState(viewerTeam);
	const [allLocked, setAllLocked] = useState(initialAllLocked);
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const previousAllLockedRef = useRef(initialAllLocked);

	useEffect(() => {
		if (!previousAllLockedRef.current && allLocked) playDraftCompleteSound();
		previousAllLockedRef.current = allLocked;
	}, [allLocked]);

	async function refresh(team = activeViewerTeam) {
		const response = await fetch(`/api/tournament/ultimate-bravery?matchId=${encodeURIComponent(matchId)}${testOwner ? `&viewerTeam=${encodeURIComponent(team)}` : ""}`, {
			cache: "no-store",
		});
		if (!response.ok) return;
		const json = (await response.json()) as DraftResponse;
		setRolls(json.rolls);
		setAllLocked(json.allLocked);
	}

	useEffect(() => {
		const timer = window.setInterval(async () => {
			const response = await fetch(
				`/api/tournament/ultimate-bravery?matchId=${encodeURIComponent(matchId)}${testOwner ? `&viewerTeam=${encodeURIComponent(activeViewerTeam)}` : ""}`,
				{ cache: "no-store" }
			);
			if (!response.ok) return;
			const json = (await response.json()) as DraftResponse;
			setRolls(json.rolls);
			setAllLocked(json.allLocked);
		}, 5_000);
		return () => window.clearInterval(timer);
	}, [activeViewerTeam, matchId, testOwner]);

	function act(action: "roll" | "reroll" | "confirm" | "reset-test", playerDiscordId?: string) {
		setMessage("");
		void unlockTournamentAudio();
		startTransition(async () => {
			const response = await fetch("/api/tournament/ultimate-bravery", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action, matchId, ...(playerDiscordId ? { playerDiscordId } : {}) }),
			});
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			setMessage(json?.message ?? (response.ok ? "Gespeichert." : "Aktion fehlgeschlagen."));
			if (response.ok) {
				if (action === "reroll") playRerollSound();
				await refresh();
			}
		});
	}

	const teamNames = [...new Set(players.map((player) => player.teamName))];
	return (
		<section className="mt-6 overflow-hidden rounded-[2.3rem] border border-cyan-200/14 bg-[#07140e]/92 shadow-2xl shadow-black/30">
			<header className="border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.08] via-transparent to-lime-300/[0.08] p-5 sm:p-7">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<div className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100/64">Ultimate-Bravery-Draft</div>
						<h2 className="mt-2 text-3xl font-black text-emerald-50">Würfeln, prüfen, bestätigen.</h2>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{testOwner ? (
							<button
								disabled={isPending}
								onClick={() => act("reset-test")}
								className="rounded-full border border-red-200/20 bg-red-500/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-100 disabled:opacity-50"
							>
								Test zurücksetzen
							</button>
						) : null}
						<div
							className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${allLocked ? "border-lime-200/28 bg-lime-200/12 text-lime-100" : "border-amber-200/20 bg-amber-200/8 text-amber-100"}`}
						>
							{allLocked ? "Beide Teams aufgedeckt" : "Gegner bleibt verborgen"}
						</div>
					</div>
				</div>
				<p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-100/60">
					Kein Timer und keine Bans. Jeder Spieler hat 2 garantierte Rerolls pro Match; der letzte verfügbare Reroll wird automatisch bestätigt. Die gegnerischen Rolls
					werden erst sichtbar, wenn beide Teams vollständig bestätigt haben.
				</p>
				{testOwner ? (
					<div className="mt-4 flex flex-wrap gap-2">
						<span className="self-center text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/42">Test-Perspektive</span>
						{teamNames.map((teamName) => (
							<button
								key={teamName}
								type="button"
								onClick={() => {
									setActiveViewerTeam(teamName);
									void refresh(teamName);
								}}
								className={`rounded-xl border px-4 py-2 text-xs font-black ${activeViewerTeam === teamName ? "border-cyan-200/32 bg-cyan-200/14 text-cyan-50" : "border-white/10 bg-black/18 text-emerald-100/52"}`}
							>
								{teamName}
							</button>
						))}
					</div>
				) : null}
			</header>

			<div className="grid gap-px bg-white/8 lg:grid-cols-2">
				{teamNames.map((teamName) => {
					const enemyHidden = teamName !== activeViewerTeam && !allLocked;
					const enemyRevealed = teamName !== activeViewerTeam && allLocked;
					return (
						<div key={teamName} className="bg-[#08150f] p-4 sm:p-6">
							<div className="mb-4 flex items-center justify-between">
								<h3 className="text-2xl font-black text-emerald-50">{teamName}</h3>
								<span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/42">
									{teamName === activeViewerTeam ? "Dein Team" : enemyHidden ? "Verdeckt" : "Aufgedeckt"}
								</span>
							</div>
							<div className="grid gap-3">
								{players
									.filter((player) => player.teamName === teamName)
									.map((player) => (
										<PlayerRoll
											key={`${teamName}:${player.riotId}`}
											player={player}
											roll={enemyHidden ? undefined : rolls.find((entry) => entry.discordId === player.discordId)}
											hidden={enemyHidden}
											summaryOnly={enemyRevealed}
											canControl={Boolean(player.discordId && (player.discordId === currentDiscordId || testOwner))}
											rerollLimit={rerollLimit}
											pending={isPending}
											onAction={(action) => act(action, testOwner ? player.discordId : undefined)}
										/>
									))}
							</div>
						</div>
					);
				})}
			</div>
			{message ? <div className="border-t border-white/8 px-5 py-4 text-sm font-bold text-emerald-100/72">{message}</div> : null}
		</section>
	);
}

function PlayerRoll({
	player,
	roll,
	hidden,
	summaryOnly,
	canControl,
	rerollLimit,
	pending,
	onAction,
}: {
	player: Player;
	roll?: UltimateBraveryRoll;
	hidden: boolean;
	summaryOnly: boolean;
	canControl: boolean;
	rerollLimit: number;
	pending: boolean;
	onAction: (action: "roll" | "reroll" | "confirm") => void;
}) {
	if (hidden)
		return (
			<div className="grid min-h-32 place-items-center rounded-2xl border border-white/8 bg-black/20 p-4">
				<div className="text-center">
					<div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100/32">{player.role}</div>
					<div className="mt-2 text-3xl text-emerald-100/16">?</div>
					<div className="mt-1 text-xs font-bold text-emerald-100/28">Wartet auf alle Bestätigungen</div>
				</div>
			</div>
		);
	const remaining = roll ? Math.max(0, rerollLimit - roll.rerollsUsed) : rerollLimit;
	const controls =
		canControl && roll?.status !== "locked" ? (
			<div className="grid gap-2">
				<button
					disabled={pending || remaining === 0}
					onClick={() => onAction("reroll")}
					className="w-full rounded-xl border border-amber-200/24 bg-amber-200/10 px-2 py-2 text-[10px] font-black uppercase text-amber-50 disabled:opacity-40"
				>
					Reroll · {remaining} übrig
				</button>
				<button
					disabled={pending}
					onClick={() => onAction("confirm")}
					className="w-full rounded-xl bg-cyan-200 px-2 py-2 text-[10px] font-black uppercase text-emerald-950 disabled:opacity-50"
				>
					Bestätigen
				</button>
			</div>
		) : roll?.status === "locked" ? (
			<div className="rounded-xl border border-lime-200/18 bg-lime-200/8 px-2 py-2 text-center text-[9px] font-black uppercase tracking-[0.12em] text-lime-100/76">
				Bestätigt · #{roll.rollNumber}
			</div>
		) : null;
	return (
		<article
			className={`relative overflow-hidden rounded-2xl border p-4 transition ${roll?.status === "locked" ? "locked-roll border-lime-200/30 bg-lime-200/[0.07]" : "border-white/9 bg-black/20"}`}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/48">{player.role}</div>
					<div className="truncate text-sm font-black text-emerald-50">{player.name}</div>
				</div>
				<div className={`size-2.5 rounded-full ${roll?.status === "locked" ? "bg-lime-300 shadow-[0_0_14px_rgba(190,242,100,.8)]" : "bg-amber-200/50"}`} />
			</div>
			{roll ? (
				summaryOnly ? (
					<EnemyChampion roll={roll} />
				) : (
					<RollDetails roll={roll} controls={controls} />
				)
			) : (
				<div className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-center text-xs font-bold text-emerald-100/38">
					Noch nicht gewürfelt
					{canControl ? (
						<button
							disabled={pending}
							onClick={() => onAction("roll")}
							className="mx-auto mt-3 block rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-2.5 text-xs font-black uppercase text-emerald-950 disabled:opacity-50"
						>
							Würfeln
						</button>
					) : null}
				</div>
			)}
			<style>{`@keyframes lock-in { 0% { box-shadow: 0 0 0 rgba(190,242,100,0); transform: scale(.985); } 45% { box-shadow: 0 0 32px rgba(190,242,100,.22); transform: scale(1.012); } 100% { box-shadow: 0 0 0 rgba(190,242,100,0); transform: scale(1); } } .locked-roll { animation: lock-in 850ms ease-out; }`}</style>
		</article>
	);
}

function EnemyChampion({ roll }: { roll: UltimateBraveryRoll }) {
	return (
		<div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200/12 bg-red-300/[0.04] p-3">
			{/* Remote Data Dragon assets are already size-specific and do not benefit from Next image optimization here. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={roll.champion.imageUrl}
				alt={roll.champion.name}
				className="size-16 rounded-xl border border-white/12 object-cover"
			/>
			<div>
				<div className="text-[9px] font-black uppercase tracking-[0.18em] text-red-100/48">Gegnerischer Champion</div>
				<div className="mt-1 text-base font-black text-emerald-50">{roll.champion.name}</div>
				<div className="mt-1 text-[10px] font-bold text-emerald-100/42">Build und Runen bleiben verborgen.</div>
			</div>
		</div>
	);
}

function RollDetails({ roll, controls }: { roll: UltimateBraveryRoll; controls: ReactNode }) {
	return (
		<div className="mt-4 grid items-start gap-4 sm:grid-cols-[8.5rem_1fr]">
			<div className="grid gap-2">
				<div className="mx-auto w-[5.5rem] overflow-hidden rounded-xl border border-lime-200/18 bg-black/30">
					<img src={roll.champion.imageUrl} alt={roll.champion.name} className="aspect-square w-full object-cover" /* eslint-disable-line @next/next/no-img-element */ />
					<div className="p-1.5 text-center text-[10px] font-black text-lime-50">{roll.champion.name}</div>
				</div>
				{controls}
			</div>
			<div className="min-w-0">
				<div className="grid grid-cols-2 gap-3">
					{roll.startingItems?.length ? <ItemRow label="Start" items={roll.startingItems} /> : <div />}
					<ItemRow label="Spells" items={roll.summonerSpells} />
				</div>
				<ItemRow label="Build-Reihenfolge" items={roll.items} numbered />
				<RunePage runes={roll.runes} />
			</div>
		</div>
	);
}

function RunePage({ runes }: { runes: UltimateBraveryRoll["runes"] }) {
	const primaryRunes = runes.runes.slice(0, 4);
	const secondaryRunes = runes.runes.slice(4);
	return (
		<div className="mt-3 grid gap-2 rounded-xl border border-white/8 bg-black/16 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,.7fr)] sm:items-center">
			<ItemRow label={`Primär · ${runes.primary}`} items={primaryRunes} />
			<div className="hidden h-10 w-px bg-gradient-to-b from-transparent via-cyan-200/28 to-transparent sm:block" />
			<ItemRow label={`Sekundär · ${runes.secondary}`} items={secondaryRunes} />
		</div>
	);
}

function ItemRow({ label, items, numbered = false }: { label: string; items: Array<{ id: string; name: string; imageUrl: string }>; numbered?: boolean }) {
	return (
		<div className="mb-2">
			<div className="mb-1 text-[8px] font-black uppercase tracking-[0.16em] text-emerald-100/38">{label}</div>
			<div className="flex flex-wrap gap-1">
				{items.map((item, index) => (
					<div
						key={`${item.id}-${index}`}
						title={`${numbered ? `${index + 1}. ` : ""}${item.name}`}
						className="relative size-9 overflow-hidden rounded-lg border border-white/14 bg-black/30"
					>
						<img src={item.imageUrl} alt={item.name} className="size-full object-cover" /* eslint-disable-line @next/next/no-img-element */ />
						{numbered ? (
							<span className="absolute left-0 top-0 grid size-3.5 place-items-center rounded-br bg-black/80 text-[8px] font-black text-white">{index + 1}</span>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
