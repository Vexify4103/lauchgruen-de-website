import { CHAMPION_POSITIONS } from "@/lib/champion-positions";
import type { DraftRole } from "@/lib/tournament-draft-shared";

// Display names whose Data Dragon id is not just the name without punctuation.
const ID_BY_NAME: Record<string, string> = { wukong: "MonkeyKing", nunuwillump: "Nunu", renataglasc: "Renata" };

const POSITIONS_BY_KEY = new Map(Object.entries(CHAMPION_POSITIONS).map(([id, roles]) => [normalizeChampionKey(id), roles]));

export function normalizeChampionKey(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]/g, "");
}

/** Roles a champion is played in, by display name or Data Dragon id. Undefined for unknown (new) champions. */
export function championRoles(nameOrId: string): readonly DraftRole[] | undefined {
	const key = normalizeChampionKey(nameOrId);
	return POSITIONS_BY_KEY.get(key) ?? POSITIONS_BY_KEY.get(normalizeChampionKey(ID_BY_NAME[key] ?? ""));
}

/** Unknown champions match every role filter so a new release is never hidden. */
export function championFitsRole(nameOrId: string, role: DraftRole): boolean {
	const roles = championRoles(nameOrId);
	return !roles || roles.includes(role);
}
