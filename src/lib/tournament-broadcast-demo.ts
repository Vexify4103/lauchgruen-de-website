import { advanceSwissPotDraw, createSwissPotState, type SwissPotState } from "@/lib/swiss-pot-draw";
import type { BroadcastSnapshot, BroadcastChampion } from "@/lib/tournament-broadcast";

/** Deterministic fixture, not a login bypass or a write to any tournament collection. */
export function demoBroadcastSnapshot(step = 12): BroadcastSnapshot {
	let pot: SwissPotState = createSwissPotState();
	for (let index = 0; index < Math.max(0, Math.min(20, step)); index++) {
		const previous = pot.rounds.at(-1);
		if (previous?.complete) for (const pair of previous.pairings) pot = advanceSwissPotDraw(pot, { type: "result", pairingId: pair.id, winnerTeamKey: pair.teamAKey }, () => 0);
		pot = advanceSwissPotDraw(pot, { type: "draw" }, () => 0);
	}
	const teams = pot.teams.map((team, index) => ({ ...team, id: team.key, tag: team.name.slice(5, 8).toUpperCase(), seed: index + 1 }));
	const champion = (id: string): BroadcastChampion => ({ id, name: id, image: `https://ddragon.leagueoflegends.com/cdn/15.24.1/img/champion/${id}.png` });
	return {
		version: 1,
		tournament: { id: "broadcast-demo", name: "Lauchgruen Community Cup", mode: "live" },
		generatedAt: new Date().toISOString(),
		source: "demo",
		published: true,
		draftEnabled: true,
		teams,
		draw: pot,
		drawRevision: `demo-${step}`,
		champion: null,
		standings: teams.map((team, index) => ({ name: team.name, rank: index + 1, wins: index < 4 ? 1 : 0, losses: index < 4 ? 0 : 1 })),
		standingsFinal: false,
		matches: Array.from({ length: 4 }, (_, index) => ({
			id: `demo-match-${index + 1}`,
			phase: "groups",
			bracket: null,
			round: "Swiss Runde 2",
			time: "Rolling Schedule",
			teamA: teams[index],
			teamB: teams[index + 4],
			labelA: teams[index].name,
			labelB: teams[index + 4].name,
			status: index === 0 ? "Live" : index === 1 ? "Pending" : "Scheduled",
			scoreA: 0,
			scoreB: 0,
			bestOf: 1,
			blueSide: "teamA",
			casted: index === 0,
		})),
		selectedMatch: null,
		selectedTeam: null,
		draft: {
			picksA: ["Ahri", "Gnar", "Vi"].map(champion),
			picksB: ["Jinx", "Thresh"].map(champion),
			bansA: ["Yone", "Syndra", "Orianna"].map(champion),
			bansB: ["Zed", "LeBlanc", "Aurora"].map(champion),
			readyA: true,
			readyB: true,
			finalized: false,
		},
	};
}
