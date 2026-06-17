import { azLetterPools } from "@/lib/tournament-data";
import { compactPoolLabel, poolForChampion } from "@/lib/tournament-wheel-shared";

const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "15.24.1";

type DataDragonChampion = {
	id: string;
	key: string;
	name: string;
	title: string;
	image: {
		full: string;
	};
};

type DataDragonChampionResponse = {
	data: Record<string, DataDragonChampion>;
};

export type ChampionPoolEntry = {
	id: string;
	key: string;
	name: string;
	title: string;
	imageUrl: string;
};

export type ChampionPool = {
	pool: string;
	label: string;
	champions: ChampionPoolEntry[];
};

async function getDataDragonVersion(): Promise<string> {
	try {
		const response = await fetch(`${DATA_DRAGON_BASE}/api/versions.json`, {
			next: { revalidate: 60 * 60 * 24 },
		});
		if (!response.ok) return FALLBACK_VERSION;
		const versions = (await response.json()) as unknown;
		return Array.isArray(versions) && typeof versions[0] === "string" ? versions[0] : FALLBACK_VERSION;
	} catch {
		return FALLBACK_VERSION;
	}
}

export async function getChampionPools(): Promise<ChampionPool[]> {
	const version = await getDataDragonVersion();
	const response = await fetch(`${DATA_DRAGON_BASE}/cdn/${version}/data/de_DE/champion.json`, { next: { revalidate: 60 * 60 * 24 } });

	if (!response.ok) {
		return azLetterPools.map((pool) => ({
			pool,
			label: compactPoolLabel(pool),
			champions: [],
		}));
	}

	const json = (await response.json()) as DataDragonChampionResponse;
	const grouped = new Map<string, ChampionPoolEntry[]>(azLetterPools.map((pool) => [pool, []]));

	for (const champion of Object.values(json.data)) {
		const pool = poolForChampion(champion.name);
		if (!pool) continue;
		grouped.get(pool)?.push({
			id: champion.id,
			key: champion.key,
			name: champion.name,
			title: champion.title,
			imageUrl: `${DATA_DRAGON_BASE}/cdn/${version}/img/champion/${champion.image.full}`,
		});
	}

	return azLetterPools.map((pool) => ({
		pool,
		label: compactPoolLabel(pool),
		champions: [...(grouped.get(pool) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "de")),
	}));
}
