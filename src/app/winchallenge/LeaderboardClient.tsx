"use client";

import Link from "next/link";
import { formatElapsed } from "@/lib/winchallenge/timer";
import type { PublicChallenge, PublicDebt, PublicTeam } from "@/lib/winchallenge/view";
import { formatDateTime } from "./win-api";
import { TEAM_STATUS_LABEL, usePublicChallenge } from "./usePublicChallenge";

export function LeaderboardClient({ initial }: { initial: PublicChallenge | null }) {
	const { data, elapsed } = usePublicChallenge(initial);
	const challenge = data?.challenge;

	if (!data || !challenge) {
		return (
			<section className="mx-auto max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6">
				<h1 className="font-display text-3xl font-semibold text-[var(--text)]">Win Challenge</h1>
				<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
					Zweierteams spielen eine feste Liste an Spielen durch. Wer zuerst alles geschafft hat, gewinnt. Die nächste Runde ist noch nicht angekündigt.
				</p>
			</section>
		);
	}

	const started = new Date(challenge.startAt).getTime() <= data.serverNow;
	const ended = challenge.status !== "open";

	return (
		<div className="grid gap-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-xs font-semibold text-[var(--accent)]">Win Challenge</p>
					<h1 className="mt-1 font-display text-3xl font-semibold text-[var(--text)] sm:text-4xl">{challenge.name}</h1>
					<p className="mt-2 text-sm text-[var(--muted)]">
						{ended
							? `Beendet ${formatDateTime(challenge.endedAt)}`
							: started
								? `Läuft seit ${formatDateTime(challenge.startAt)}`
								: `Start ${formatDateTime(challenge.startAt)}`}{" "}
						· {data.teams.length} Teams · {data.participants} Spieler · {data.pot} Subs im Pot
					</p>
					{ended && data.payouts.total ? (
						<p className="mt-1 text-sm text-[var(--muted)]">
							{data.payouts.done}/{data.payouts.total} Subs verschenkt
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap gap-3">
					{!ended && challenge.signupOpen ? (
						<Link href="/winchallenge/mitmachen" className="button primary">
							Mitmachen
						</Link>
					) : null}
					{ended ? (
						<Link href="/winchallenge/einsatz" className="button ghost">
							Mein Einsatz
						</Link>
					) : (
						<Link href="/winchallenge/control" className="button ghost">
							Steuerung
						</Link>
					)}
				</div>
			</header>

			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-2 sm:p-4">
				<h2 className="sr-only">Rangliste</h2>
				{data.teams.length === 0 ? <p className="p-4 text-sm text-[var(--muted)]">Noch keine Teams. Sei das erste Team.</p> : null}
				<ol className="grid">
					{data.teams.map((team) => (
						<TeamRow key={team.slug} team={team} elapsed={elapsed(team)} />
					))}
				</ol>
			</section>

			{ended && data.payouts.total ? <DebtList debts={data.debts} /> : null}

			<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
				<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
					<h2 className="font-display text-lg font-semibold text-[var(--text)]">Die Spiele</h2>
					<ol className="mt-4 grid gap-3">
						{challenge.games.map((game, index) => (
							<li key={game.id} className="grid grid-cols-[28px_1fr] gap-2 text-sm">
								<span className="font-mono tabular-nums text-[var(--muted)]">{index + 1}</span>
								<span>
									<span className="font-semibold text-[var(--text)]">{game.title}</span>
									<span className="block text-[var(--muted)]">{game.goal}</span>
									{game.note ? <span className="mt-1 block text-xs text-[var(--text)]">Hinweis: {game.note}</span> : null}
								</span>
							</li>
						))}
					</ol>
				</section>
				<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
					<h2 className="font-display text-lg font-semibold text-[var(--text)]">Letzte Ereignisse</h2>
					{data.feed.length === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">Noch nichts passiert.</p> : null}
					<ul className="mt-4 grid gap-2.5">
						{data.feed.map((entry, index) => (
							<li key={`${entry.at}-${index}`} className="text-sm">
								<span className="font-semibold text-[var(--text)]">{entry.team}</span> <span className="text-[var(--muted)]">{entry.text}</span>
								<span className="block text-xs tabular-nums text-[var(--muted)]">{formatDateTime(entry.at)}</span>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}

/** Public list of subs that are not confirmed yet. Not paying gets you banned from the next round. */
function DebtList({ debts }: { debts: PublicDebt[] }) {
	return (
		<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-5 sm:p-6">
			<h2 className="font-display text-lg font-semibold text-[var(--text)]">Offene Subs</h2>
			{debts.length === 0 ? (
				<p className="mt-2 text-sm text-[var(--muted)]">Alle Subs sind angekommen. Danke an alle.</p>
			) : (
				<>
					<p className="mt-1 text-sm text-[var(--muted)]">Wer seinen Sub nicht verschenkt, ist bei der nächsten Win Challenge gesperrt.</p>
					<ul className="mt-4 grid gap-1">
						{debts.map((debt, index) => (
							<li
								key={`${debt.payer}-${index}`}
								className="grid grid-cols-[1fr_auto] gap-x-3 rounded-lg px-3 py-2 text-sm odd:bg-[var(--bg)] sm:grid-cols-[1fr_1fr_auto]"
							>
								<span className="font-semibold text-[var(--text)]">{debt.payer}</span>
								<span className="col-start-1 text-[var(--muted)] sm:col-start-auto">
									an {debt.recipient} auf {debt.channel}
								</span>
								<span
									className={`row-span-2 row-start-1 col-start-2 self-center text-xs sm:row-span-1 sm:col-start-3 ${debt.status === "open" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}
								>
									{debt.status === "open" ? "offen" : "verschenkt, nicht bestätigt"}
								</span>
							</li>
						))}
					</ul>
				</>
			)}
		</section>
	);
}

function TeamRow({ team, elapsed }: { team: PublicTeam; elapsed: number }) {
	const liveMember = team.members.find((member) => member.live);
	return (
		<li className="border-t border-[var(--line)] first:border-t-0">
			<div className="grid grid-cols-[32px_1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[40px_1.4fr_1fr_110px_100px]">
				<span className="font-display text-lg font-semibold tabular-nums text-[var(--accent)]">{team.rank}</span>
				<span className="min-w-0">
					<Link href={`/winchallenge/team/${team.slug}`} className="font-semibold text-[var(--text)] underline-offset-2 hover:underline">
						{team.name}
					</Link>
					<span className="block truncate text-xs text-[var(--muted)]">{team.members.map((member) => member.name).join(" + ")}</span>
				</span>
				<span className="font-mono text-sm tabular-nums text-[var(--text)] sm:order-last sm:text-right">{team.status === "gave-up" ? "–" : formatElapsed(elapsed)}</span>
				<span className="col-span-2 col-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-auto">
					<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(239,251,242,0.1)]" aria-hidden="true">
						<span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${team.total ? (team.done / team.total) * 100 : 0}%` }} />
					</span>
					<span className="text-xs tabular-nums text-[var(--muted)]">
						{team.done}/{team.total}
					</span>
				</span>
				<span className="col-start-2 text-xs text-[var(--muted)] sm:col-start-auto">
					{liveMember ? (
						<a
							href={`https://twitch.tv/${liveMember.twitch}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)]"
						>
							<span className="size-2 rounded-full bg-[var(--live)]" aria-hidden="true" />
							live
						</a>
					) : (
						TEAM_STATUS_LABEL[team.status]
					)}
				</span>
			</div>
		</li>
	);
}
