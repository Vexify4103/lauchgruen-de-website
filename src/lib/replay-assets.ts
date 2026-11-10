/**
 * Names and icons for the replay scoreboard: champions, items, summoner spells and runes from Data Dragon.
 * Fetched once an hour and sent with the replay list, so the browser gets plain URLs.
 */
const DATA_DRAGON = "https://ddragon.leagueoflegends.com";

export type ReplayAsset = { name: string; icon: string };
export type ReplayAssets = {
	version: string;
	/** Keyed by the lowercase Data Dragon champion id ("monkeyking"); replays store that id as SKIN. */
	champions: Record<string, ReplayAsset>;
	items: Record<string, ReplayAsset>;
	spells: Record<string, ReplayAsset>;
	/** Runes and rune trees by numeric id. */
	runes: Record<string, ReplayAsset>;
};

type Cached = { data: ReplayAssets; expiresAt: number };
const cache = globalThis as typeof globalThis & { __replayAssets?: Cached };

type DdImage = { full: string };
type RuneTree = { id: number; name: string; icon: string; slots: Array<{ runes: Array<{ id: number; name: string; icon: string }> }> };

async function json<T>(url: string): Promise<T> {
	const response = await fetch(url, { next: { revalidate: 3600 } });
	if (!response.ok) throw new Error(`Data Dragon ${response.status}: ${url}`);
	return response.json() as Promise<T>;
}

export async function getReplayAssets(): Promise<ReplayAssets | null> {
	if (cache.__replayAssets && cache.__replayAssets.expiresAt > Date.now()) return cache.__replayAssets.data;
	try {
		const [version] = await json<string[]>(`${DATA_DRAGON}/api/versions.json`);
		const base = `${DATA_DRAGON}/cdn/${version}`;
		const [champions, items, spells, runes] = await Promise.all([
			json<{ data: Record<string, { id: string; name: string; image: DdImage }> }>(`${base}/data/de_DE/champion.json`),
			json<{ data: Record<string, { name: string; image: DdImage }> }>(`${base}/data/de_DE/item.json`),
			json<{ data: Record<string, { key: string; name: string; image: DdImage }> }>(`${base}/data/de_DE/summoner.json`),
			json<RuneTree[]>(`${base}/data/de_DE/runesReforged.json`),
		]);
		const data: ReplayAssets = {
			version,
			champions: Object.fromEntries(
				Object.values(champions.data).map((champion) => [champion.id.toLowerCase(), { name: champion.name, icon: `${base}/img/champion/${champion.image.full}` }])
			),
			items: Object.fromEntries(Object.entries(items.data).map(([id, item]) => [id, { name: item.name, icon: `${base}/img/item/${item.image.full}` }])),
			spells: Object.fromEntries(Object.values(spells.data).map((spell) => [spell.key, { name: spell.name, icon: `${base}/img/spell/${spell.image.full}` }])),
			runes: Object.fromEntries(
				runes.flatMap((tree) => [
					[String(tree.id), { name: tree.name, icon: `${DATA_DRAGON}/cdn/img/${tree.icon}` }],
					...tree.slots.flatMap((slot) => slot.runes.map((rune) => [String(rune.id), { name: rune.name, icon: `${DATA_DRAGON}/cdn/img/${rune.icon}` }])),
				])
			),
		};
		cache.__replayAssets = { data, expiresAt: Date.now() + 60 * 60 * 1000 };
		return data;
	} catch (error) {
		console.warn("[replay-assets] Data Dragon unavailable:", error);
		return cache.__replayAssets?.data ?? null;
	}
}
