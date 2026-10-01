import { formatGameDuration } from "@/lib/match-duration";
import type { StandingsResult } from "@/lib/tournament-standings";

/**
 * Public table for groups, Swiss stages and round-robin playoffs. `advancing` highlights the ranks
 * that reach the next stage; open ties are marked until the staff decides them.
 */
export function StandingsTable({
	kicker,
	title,
	standings,
	advancing,
	showGames,
	showBuchholz = false,
	full = false,
	emptyText = "Noch keine Ergebnisse.",
}: {
	kicker: string;
	title: string;
	standings: StandingsResult | null;
	advancing: number;
	/** Show the game difference column (only useful for Bo3/Bo5). */
	showGames: boolean;
	showBuchholz?: boolean;
	full?: boolean;
	emptyText?: string;
}) {
	return (
		<article className={`standings-card ${full ? "full" : ""}`}>
			<header>
				<div>
					<span>{kicker}</span>
					<h3>{title}</h3>
				</div>
				{standings?.tiebreakerRequired ? <span className="text-[var(--amber)]">Gleichstand offen</span> : null}
			</header>
			{standings?.rows.length ? (
				<div className="standings-table-wrap">
					<table className="standings-table">
						<thead>
							<tr>
								<th scope="col">#</th>
								<th scope="col">Team</th>
								<th scope="col">S–N</th>
								{showGames ? <th scope="col">Spiele</th> : null}
								{showBuchholz ? <th scope="col">Buchholz</th> : null}
								<th scope="col">Ø Sieg</th>
							</tr>
						</thead>
						<tbody>
							{standings.rows.map((row) => (
								<tr key={row.name} data-advancing={row.rank <= advancing ? "true" : undefined}>
									<td>{row.rank}</td>
									<td>
										<strong>{row.name}</strong>
										{row.tiedWith.length ? <small className="ml-2 text-[var(--amber)]">Gleichstand</small> : null}
										{row.decidedByStaff ? <small className="ml-2 text-[var(--muted)]">Tiebreaker entschieden</small> : null}
									</td>
									<td className="whitespace-nowrap">
										{row.wins}–{row.losses}
									</td>
									{showGames ? (
										<td className="whitespace-nowrap">
											{row.gamesWon}:{row.gamesLost}
										</td>
									) : null}
									{showBuchholz ? <td>{row.buchholz}</td> : null}
									<td>{row.avgWinSeconds === null ? "–" : formatGameDuration(row.avgWinSeconds)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="px-6 py-5 text-sm text-[var(--muted)]">{emptyText}</p>
			)}
		</article>
	);
}
