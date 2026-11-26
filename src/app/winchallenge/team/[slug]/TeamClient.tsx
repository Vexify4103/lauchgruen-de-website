"use client";

import Link from "next/link";
import { formatElapsed } from "@/lib/winchallenge/timer";
import type { PublicChallenge } from "@/lib/winchallenge/view";
import { formatDateTime } from "../../win-api";
import { TEAM_STATUS_LABEL, usePublicChallenge } from "../../usePublicChallenge";

export function TeamClient({ slug, initial }: { slug: string; initial: PublicChallenge }) {
	const { data, elapsed } = usePublicChallenge(initial);
	const team = data?.teams.find((entry) => entry.slug === slug);
	const challenge = data?.challenge;
	if (!data || !challenge || !team) {
		return <p className="text-sm text-[var(--muted)]">Dieses Team gibt es nicht mehr.</p>;
	}
	const states = new Map(team.games.map((game) => [game.id, game]));

	return (
		<div className="mx-auto grid max-w-3xl gap-6">
			<Link href="/winchallenge" className="text-sm text-[var(--muted)] underline-offset-2 hover:underline">
				← Rangliste
			</Link>
			<header className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
				<p className="text-xs font-semibold text-[var(--accent)]">
					{challenge.name} · Platz {team.rank}
				</p>
				<h1 className="mt-1 font-display text-3xl font-semibold text-[var(--text)]">{team.name}</h1>
				<ul className="mt-3 flex flex-wrap gap-3">
					{team.members.map((member) => (
						<li key={member.twitch || member.name}>
							<a
								href={`https://twitch.tv/${member.twitch}`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1 text-sm text-[var(--text)] hover:border-[var(--accent)]"
							>
								<span className={`size-2 rounded-full ${member.live ? "bg-[var(--live)]" : "bg-[var(--muted)]"}`} aria-hidden="true" />
								{member.name}
								<span className="text-xs text-[var(--muted)]">{member.live ? "live" : "offline"}</span>
							</a>
						</li>
					))}
				</ul>
				<p className="mt-5 font-mono text-5xl font-semibold tabular-nums text-[var(--text)]">{formatElapsed(elapsed(team))}</p>
				<p className="mt-2 text-sm text-[var(--muted)]">
					{TEAM_STATUS_LABEL[team.status]} · {team.done}/{team.total} geschafft
					{team.finishedAt ? ` · fertig am ${formatDateTime(team.finishedAt)}` : ""}
				</p>
			</header>

			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-3 sm:p-4">
				<h2 className="px-2 pb-2 pt-1 font-display text-lg font-semibold text-[var(--text)]">Spiele</h2>
				<ul className="grid gap-2">
					{challenge.games.map((game) => {
						const state = states.get(game.id);
						const done = Boolean(state?.doneAt);
						const current = team.currentGameId === game.id;
						return (
							<li key={game.id} className={`grid gap-1 rounded-xl border px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center ${current ? "border-[var(--accent)]" : "border-[var(--line)]"}`}>
								<span>
									<span className="font-semibold text-[var(--text)]">
										<span className={done ? "text-[var(--accent)]" : "text-[var(--muted)]"} aria-hidden="true">
											{done ? "✓ " : current ? "▶ " : "○ "}
										</span>
										{game.title}
									</span>
									<span className="block text-sm text-[var(--muted)]">
										{game.goal}
										{game.type === "counter" && !done ? ` · ${state?.count ?? 0}/${Math.max(1, game.target ?? 1)} · Versuch ${(state?.tries ?? 0) + 1}` : ""}
									</span>
								</span>
								<span className="text-xs tabular-nums text-[var(--muted)]">{done ? `geschafft ${formatDateTime(state?.doneAt)}` : current ? "spielen sie gerade" : "offen"}</span>
							</li>
						);
					})}
				</ul>
			</section>
		</div>
	);
}
