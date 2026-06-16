export type TournamentPlayer = {
  name: string;
  role: "Top" | "Jungle" | "Mid" | "Bot" | "Support" | "Fill" | "Sub";
  riotId: string;
  discordId?: string;
  discordUsername?: string;
  verified?: boolean;
  opggUrl: string;
  dpmUrl: string;
};

export type TeamCaptainRef = {
  discordId: string;
  discordUsername?: string;
  riotId: string;
  puuid: string;
  assignedAt: string;
};

export type TournamentTeam = {
  id: string;
  name: string;
  seed: number;
  record: string;
  group: "A" | "B";
  /** Display string for the captain — derived from captainRef when present, else placeholder. */
  captain: string;
  /** Structured reference to a verified captain (Discord + Riot). Optional. */
  captainRef?: TeamCaptainRef;
  discordRoleId?: string;
  accent: string;
  players: TournamentPlayer[];
  playedChampions?: string[];
};

export type GroupMatch = {
  id: string;
  group: "A" | "B";
  round: string;
  time: string;
  teamA: string;
  teamB: string;
  scoreA?: number;
  scoreB?: number;
  score?: string;
  status: "Scheduled" | "Live" | "Finished";
};

export type PlayoffRound =
  | "Upper R1"
  | "Upper R2"
  | "Upper Final"
  | "Lower R1"
  | "Lower R2"
  | "Lower SF"
  | "Lower Final"
  | "Grand Final"
  | "Grand Final Reset";

export type PlayoffBracket = "Upper" | "Lower" | "Grand";

export type TeamSlot =
  | { kind: "team"; name: string }
  | { kind: "groupSeed"; seed: number }
  | { kind: "matchWinner"; matchId: string }
  | { kind: "matchLoser"; matchId: string };

const seed = (seedNumber: number): TeamSlot => ({ kind: "groupSeed", seed: seedNumber });
const winnerOf = (matchId: string): TeamSlot => ({ kind: "matchWinner", matchId });
const loserOf = (matchId: string): TeamSlot => ({ kind: "matchLoser", matchId });

export type PlayoffMatch = {
  id: string;
  bracket: PlayoffBracket;
  round: PlayoffRound;
  slot: string;
  time: string;
  teamA: TeamSlot;
  teamB: TeamSlot;
  scoreA?: number;
  scoreB?: number;
  status: "Locked" | "Scheduled" | "Pending" | "Live" | "Finished";
};

export const tournament = {
  name: "Kunterbuntes A-Z Turnier",
  season: "A-Z Turnier 2026",
  game: "League of Legends",
  region: "EUW",
  startDate: "19.06. um 18:00 Uhr CEST und 20.06. um 16:00 Uhr CEST",
  format: "Gruppenphase + Endbracket · A-Z Champion-Pools",
  discordUrl: "https://discord.gg/GFYv7K3SKb",
  rulesUrl: "/tournament/apply#rules",
};

export type PastTournamentWinner = {
  id: string;
  tournamentName: string;
  season: string;
  date: string;
  game: string;
  format: string;
  placement: "Champion" | "Finalist" | "Third";
  teamName: string;
  captain?: string;
  roster: string[];
  note?: string;
};

export const pastTournamentWinners: PastTournamentWinner[] = [];


export const azLetterPools = [
  "A",
  "B-D",
  "E-G",
  "H-J",
  "K",
  "L-M",
  "N-P",
  "Q, R und U",
  "S",
  "V und X",
  "T und W",
  "Y und Z",
];

export const tournamentCurrentHighlights = [
  "Bewerbungsschluss ist Donnerstag, 18.06.2026 um 20:00 Uhr CEST.",
  "Start ist Freitag, 19.06. um 18:00 Uhr und Samstag, 20.06. um 16:00 Uhr.",
  "Gespielt wird Gruppenphase plus Endbracket. Wer lange genug überlebt, kämpft am Samstag um den Titel.",
  "Pro Match bekommt jedes Team per Glücksrad einen A-Z Champion-Pool. Nur Champions aus diesem Pool sind erlaubt.",
  "Gespielte Pools verlassen für das jeweilige Team das Rad. Am zweiten Spieltag / Playoff-Tag werden die Pools refreshed.",
  "Gruppensieger überspringen die erste Upper-Bracket-Runde. Die Zweitplatzierten erhalten dort gegen Platz 3 einen vierten Ban.",
  "Gewinnerteam wird in die Hall of Fame aufgenommen.",
  "Streamer bekommen ein OBS-Panel mit Teamname und Gruppenphasen-Performance.",
];

const linkName = (name: string) => encodeURIComponent(name.replace("#", "-"));

function player(
  name: string,
  role: TournamentPlayer["role"],
  riotId = `${name}#EUW`,
): TournamentPlayer {
  const encoded = linkName(riotId);

  return {
    name,
    role,
    riotId,
    opggUrl: `https://www.op.gg/summoners/euw/${encoded}`,
    dpmUrl: `https://dpm.lol/${encoded}`,
  };
}

function roster(prefix: string): TournamentPlayer[] {
  return [
    player(`Top ${prefix}`, "Top"),
    player(`Jungle ${prefix}`, "Jungle"),
    player(`Mid ${prefix}`, "Mid"),
    player(`Bot ${prefix}`, "Bot"),
    player(`Support ${prefix}`, "Support"),
  ];
}

export const teams: TournamentTeam[] = [
  {
    id: "sprout-squad",
    name: "Sprout Squad",
    seed: 1,
    record: "0-0",
    group: "A",
    captain: "Captain TBA",
    accent: "from-lime-300/24 via-emerald-400/12 to-cyan-400/10",
    players: roster("Sprout"),
  },
  {
    id: "onion-order",
    name: "Onion Order",
    seed: 2,
    record: "0-0",
    group: "A",
    captain: "Captain TBA",
    accent: "from-amber-300/24 via-orange-400/12 to-emerald-400/10",
    players: roster("Onion"),
  },
  {
    id: "garlic-guard",
    name: "Garlic Guard",
    seed: 3,
    record: "0-0",
    group: "A",
    captain: "Captain TBA",
    accent: "from-yellow-200/22 via-lime-400/12 to-emerald-400/10",
    players: roster("Garlic"),
  },
  {
    id: "pepper-patrol",
    name: "Pepper Patrol",
    seed: 4,
    record: "0-0",
    group: "A",
    captain: "Captain TBA",
    accent: "from-rose-300/22 via-orange-400/12 to-amber-300/10",
    players: roster("Pepper"),
  },
  {
    id: "baron-basil",
    name: "Baron Basil",
    seed: 5,
    record: "0-0",
    group: "B",
    captain: "Captain TBA",
    accent: "from-sky-300/22 via-cyan-400/12 to-emerald-400/10",
    players: roster("Basil"),
  },
  {
    id: "nexus-garden",
    name: "Nexus Garden",
    seed: 6,
    record: "0-0",
    group: "B",
    captain: "Captain TBA",
    accent: "from-fuchsia-300/18 via-rose-400/10 to-emerald-400/10",
    players: roster("Garden"),
  },
  {
    id: "radish-riot",
    name: "Radish Riot",
    seed: 7,
    record: "0-0",
    group: "B",
    captain: "Captain TBA",
    accent: "from-red-300/22 via-rose-400/12 to-fuchsia-400/10",
    players: roster("Radish"),
  },
  {
    id: "chili-chargers",
    name: "Chili Chargers",
    seed: 8,
    record: "0-0",
    group: "B",
    captain: "Captain TBA",
    accent: "from-orange-300/22 via-red-400/12 to-rose-400/10",
    players: roster("Chili"),
  },
];

function roundRobin(
  group: "A" | "B",
  teamNames: [string, string, string, string],
): GroupMatch[] {
  const [t1, t2, t3, t4] = teamNames;
  const pairings: Array<[string, string]> = [
    [t1, t2],
    [t3, t4],
    [t1, t3],
    [t2, t4],
    [t1, t4],
    [t2, t3],
  ];
  const firstLeg = pairings.map(([teamA, teamB], index) => ({
    round: Math.floor(index / 2) + 1,
    slot: (index % 2) + 1,
    teamA,
    teamB,
  }));
  return [...firstLeg, ...firstLeg.map((match) => ({
    ...match,
    round: match.round + 3,
    teamA: match.teamB,
    teamB: match.teamA,
  }))].map((match) => ({
    id: `${group.toLowerCase()}-r${match.round}-${match.slot}`,
    group,
    round: `Runde ${match.round} · Slot ${match.slot}`,
    time: groupRollingTime(match.round),
    teamA: match.teamA,
    teamB: match.teamB,
    status: "Scheduled",
  }));
}

const groupATeams = teams.filter((team) => team.group === "A").map((team) => team.name);
const groupBTeams = teams.filter((team) => team.group === "B").map((team) => team.name);

export const groupMatches: GroupMatch[] = [
  ...roundRobin("A", groupATeams as [string, string, string, string]),
  ...roundRobin("B", groupBTeams as [string, string, string, string]),
];

export const playoffMatches: PlayoffMatch[] = [
  {
    id: "ub-r1-1",
    bracket: "Upper",
    round: "Upper R1",
    slot: "Upper R1 · Gruppe A #2 vs. Gruppe B #3",
    time: "Playoff-Runde 1",
    teamA: seed(3),
    teamB: seed(6),
    status: "Locked",
  },
  {
    id: "ub-r1-2",
    bracket: "Upper",
    round: "Upper R1",
    slot: "Upper R1 · Gruppe B #2 vs. Gruppe A #3",
    time: "Playoff-Runde 1",
    teamA: seed(4),
    teamB: seed(5),
    status: "Locked",
  },
  {
    id: "ub-r2-1",
    bracket: "Upper",
    round: "Upper R2",
    slot: "Upper R2 · Gruppe B #1 vs. Sieger UB-R1-1",
    time: "Playoff-Runde 2",
    teamA: seed(2),
    teamB: winnerOf("ub-r1-1"),
    status: "Locked",
  },
  {
    id: "ub-r2-2",
    bracket: "Upper",
    round: "Upper R2",
    slot: "Upper R2 · Gruppe A #1 vs. Sieger UB-R1-2",
    time: "Playoff-Runde 2",
    teamA: seed(1),
    teamB: winnerOf("ub-r1-2"),
    status: "Locked",
  },
  {
    id: "ub-f",
    bracket: "Upper",
    round: "Upper Final",
    slot: "Upper-Bracket-Finale",
    time: "Nach Upper R2",
    teamA: winnerOf("ub-r2-1"),
    teamB: winnerOf("ub-r2-2"),
    status: "Locked",
  },
  {
    id: "lb-r1-1",
    bracket: "Lower",
    round: "Lower R1",
    slot: "Lower R1 · Verlierer UB-R1-1 vs. Gruppe A #4",
    time: "Playoff-Runde 1",
    teamA: loserOf("ub-r1-1"),
    teamB: seed(7),
    status: "Locked",
  },
  {
    id: "lb-r1-2",
    bracket: "Lower",
    round: "Lower R1",
    slot: "Lower R1 · Verlierer UB-R1-2 vs. Gruppe B #4",
    time: "Playoff-Runde 1",
    teamA: loserOf("ub-r1-2"),
    teamB: seed(8),
    status: "Locked",
  },
  {
    id: "lb-r2-1",
    bracket: "Lower",
    round: "Lower R2",
    slot: "Lower R2 · Sieger LB-R1-1 vs. Verlierer UB-R2-1",
    time: "Nach Upper R2",
    teamA: winnerOf("lb-r1-1"),
    teamB: loserOf("ub-r2-1"),
    status: "Locked",
  },
  {
    id: "lb-r2-2",
    bracket: "Lower",
    round: "Lower R2",
    slot: "Lower R2 · Sieger LB-R1-2 vs. Verlierer UB-R2-2",
    time: "Nach Upper R2",
    teamA: winnerOf("lb-r1-2"),
    teamB: loserOf("ub-r2-2"),
    status: "Locked",
  },
  {
    id: "lb-sf",
    bracket: "Lower",
    round: "Lower SF",
    slot: "Lower-Halbfinale",
    time: "Nach Lower R2",
    teamA: winnerOf("lb-r2-1"),
    teamB: winnerOf("lb-r2-2"),
    status: "Locked",
  },
  {
    id: "lb-f",
    bracket: "Lower",
    round: "Lower Final",
    slot: "Lower-Bracket-Finale",
    time: "Nach dem Upper Final",
    teamA: winnerOf("lb-sf"),
    teamB: loserOf("ub-f"),
    status: "Locked",
  },
  {
    id: "gf",
    bracket: "Grand",
    round: "Grand Final",
    slot: "Grand Final",
    time: "Nach dem Lower Final",
    teamA: winnerOf("ub-f"),
    teamB: winnerOf("lb-f"),
    status: "Locked",
  },
  {
    id: "gf-reset",
    bracket: "Grand",
    round: "Grand Final Reset",
    slot: "Bracket Reset (falls nötig)",
    time: "Falls Lower Bracket gewinnt",
    teamA: winnerOf("ub-f"),
    teamB: winnerOf("lb-f"),
    status: "Locked",
  },
];


export const applicationSteps = [
  "Melde dich mit Discord an und tritt dem Lauchgruen Discord bei.",
  "Verifiziere deine Riot-ID über das Profilicon im League-Client.",
  "Gib Anzeigename, Main Rolle und Wunschrollen an. Deinen aktuellen Rang holen wir aus der Riot-Verifizierung.",
  "Bestätige, dass du am 19.06. um 18:00 Uhr CEST und 20.06. um 16:00 Uhr CEST verbindlich Zeit hast.",
  "Sende deine verbindliche Bewerbung spätestens am 18.06.2026 um 20:00 Uhr CEST ab.",
  "Warte auf Teamzuteilung und weitere Infos im Discord.",
];

export const announcedDates = "Freitag, 19.06.2026 um 18:00 Uhr CEST + Samstag, 20.06.2026 um 16:00 Uhr CEST";

export const rankOptions = [
  "Unranked",
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Emerald",
  "Diamond",
  "Master",
  "Grandmaster",
  "Challenger",
];
import { groupRollingTime } from "@/lib/tournament-schedule";
