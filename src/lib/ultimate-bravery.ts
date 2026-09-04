import { randomInt } from "node:crypto";
import { getDb } from "@/lib/mongo";
import { ultimateBraveryItemGroups } from "@/lib/ultimate-bravery-items";

const COLLECTION = "ultimate_bravery_rolls";
const DATA_DRAGON = "https://ddragon.leagueoflegends.com";

type DataDragonImage = { full: string };
type ChampionData = { id: string; key: string; name: string; image: DataDragonImage };
type ItemData = {
	name: string;
	description: string;
	plaintext: string;
	gold: { total: number; purchasable: boolean };
	maps: Record<string, boolean>;
	from?: string[];
	into?: string[];
	tags: string[];
	image: DataDragonImage;
	inStore?: boolean;
	hideFromAll?: boolean;
	requiredChampion?: string;
	requiredAlly?: string;
};
type SpellData = { id: string; key: string; name: string; image: DataDragonImage; modes: string[] };
type RuneSlot = { runes: Array<{ id: number; key: string; name: string; icon: string }> };
type RuneTree = { id: number; key: string; name: string; icon: string; slots: RuneSlot[] };

export type UltimateBraveryAsset = { id: string; name: string; imageUrl: string };
export type UltimateBraveryRunePage = {
	primary: string;
	secondary: string;
	runes: UltimateBraveryAsset[];
	shards: string[];
};

export type UltimateBraveryRoll = {
	id: string;
	matchId: string;
	discordId: string;
	teamName: string;
	riotId: string;
	role: string;
	champion: UltimateBraveryAsset;
	startingItems: UltimateBraveryAsset[];
	items: UltimateBraveryAsset[];
	summonerSpells: UltimateBraveryAsset[];
	runes: UltimateBraveryRunePage;
	rollNumber: number;
	rerollsUsed: number;
	exceptionRerollsUsed?: number;
	status: "selecting" | "locked";
	confirmedAt?: string;
	rerollRequestedAt?: string;
	rerollRequestedBy?: string;
	rolledAt: string;
	rolledBy: string;
	updatedAt: string;
};

export function hideUltimateBraveryBuild(roll: UltimateBraveryRoll): UltimateBraveryRoll {
	return {
		...roll,
		startingItems: [],
		items: [],
		summonerSpells: [],
		runes: { primary: "", secondary: "", runes: [], shards: [] },
	};
}

type RollDoc = UltimateBraveryRoll & { _id: string };
type CatalogItem = ItemData & { id: string; canonicalName: string };
type Catalog = { version: string; champions: ChampionData[]; items: CatalogItem[]; spells: SpellData[]; runes: RuneTree[] };

const SUPPORT_UPGRADE_NAMES = new Set(["Celestial Opposition", "Dream Maker", "Zaz'Zak's Realmspike", "Solstice Sleigh", "Bloodsong"]);
const JUNGLE_COMPANION_IDS = new Set(["1101", "1102", "1103"]);
const CATALOG_CACHE_SCHEMA = 4;

function itemName(item: CatalogItem) {
	return item.canonicalName || item.name;
}

function isSupportQuestUpgrade(item: CatalogItem) {
	const name = itemName(item);
	return SUPPORT_UPGRADE_NAMES.has(name) || /celestial opposition|dream maker|traumweber|zaz.?zak|solstice sleigh|bloodsong|blutgesang/i.test(`${name} ${item.name}`);
}

function isJungleCompanion(item: CatalogItem) {
	const name = `${itemName(item)} ${item.name}`;
	return JUNGLE_COMPANION_IDS.has(item.id) || /scorchclaw|gustwalker|mosstomper|feuerklauen|windläufer|moosstampfer/i.test(name);
}

function isArenaExclusiveItem(item: CatalogItem) {
	const name = `${itemName(item)} ${item.name}`;
	return !/^\d{4}$/.test(item.id) || item.id.startsWith("44") || /flesheater|sword of the blossoming dawn|schwert des aufblühenden morgens/i.test(name);
}

function rollContainsForbiddenItem(roll: UltimateBraveryRoll) {
	return [...roll.startingItems, ...roll.items].some(
		(item) => !/^\d{4}$/.test(item.id) || item.id.startsWith("44") || /flesheater|sword of the blossoming dawn|schwert des aufblühenden morgens/i.test(item.name)
	);
}

function isSummonersRiftStoreItem(item: CatalogItem) {
	return item.maps?.["11"] && item.gold.purchasable && item.inStore !== false && !item.hideFromAll && !item.requiredChampion && !item.requiredAlly && !isArenaExclusiveItem(item);
}

const globalCache = globalThis as unknown as { __ultimateBraveryCatalog?: { schema: number; expiresAt: number; data: Catalog } };
let indexesEnsured = false;

async function rollsCollection() {
	const collection = (await getDb()).collection<RollDoc>(COLLECTION);
	if (!indexesEnsured) {
		indexesEnsured = true;
		await collection.createIndex({ matchId: 1, "champion.id": 1 }, { unique: true }).catch((error) => {
			indexesEnsured = false;
			console.warn("[ultimate-bravery] Champion-Unique-Index konnte nicht erstellt werden.", error);
		});
	}
	return collection;
}

function pick<T>(values: T[]): T {
	if (!values.length) throw new Error("Für diesen Ultimate-Bravery-Roll fehlen gültige Riot-Daten.");
	return values[randomInt(values.length)];
}

function sample<T>(values: T[], count: number): T[] {
	const available = [...values];
	const result: T[] = [];
	while (available.length && result.length < count) result.push(available.splice(randomInt(available.length), 1)[0]);
	return result;
}

function sampleCompatibleItems(values: CatalogItem[], count: number, initialGroups: readonly string[] = []): CatalogItem[] {
	const available = [...values];
	const result: CatalogItem[] = [];
	const usedGroups = new Set(initialGroups);
	while (available.length && result.length < count) {
		const item = available.splice(randomInt(available.length), 1)[0];
		const groups = ultimateBraveryItemGroups(itemName(item));
		if (groups.some((group) => usedGroups.has(group))) continue;
		result.push(item);
		groups.forEach((group) => usedGroups.add(group));
	}
	if (result.length < count) throw new Error("Es konnten nicht genug miteinander kompatible Items zugelost werden.");
	return result;
}

const SPELLBLADE_ITEM_IDS = new Set(["3057", "3078", "3100", "6662"]);

function storedAssetGroups(item: UltimateBraveryAsset): readonly string[] {
	const groups = ultimateBraveryItemGroups(item.name.replace(/\s*\(Quest-Upgrade\)\s*$/i, ""));
	if (groups.length) return groups;
	if (/bloodsong|blutgesang/i.test(item.name) || SPELLBLADE_ITEM_IDS.has(item.id)) return ["spellblade"];
	return [];
}

function rollContainsConflictingItems(roll: UltimateBraveryRoll) {
	const usedGroups = new Set<string>();
	for (const item of [...roll.startingItems, ...roll.items]) {
		const groups = storedAssetGroups(item);
		if (groups.some((group) => usedGroups.has(group))) return true;
		groups.forEach((group) => usedGroups.add(group));
	}
	return false;
}

function imageUrl(version: string, type: "champion" | "item" | "spell", file: string) {
	return `${DATA_DRAGON}/cdn/${version}/img/${type}/${file}`;
}

async function getCatalog(): Promise<Catalog> {
	if (globalCache.__ultimateBraveryCatalog?.schema === CATALOG_CACHE_SCHEMA && globalCache.__ultimateBraveryCatalog.expiresAt > Date.now())
		return globalCache.__ultimateBraveryCatalog.data;
	const versions = (await fetch(`${DATA_DRAGON}/api/versions.json`, { next: { revalidate: 3600 } }).then((response) => response.json())) as string[];
	const version = versions[0];
	const [champions, items, englishItems, spells, runes] = await Promise.all([
		fetch(`${DATA_DRAGON}/cdn/${version}/data/de_DE/champion.json`, { next: { revalidate: 3600 } }).then((response) => response.json()) as Promise<{
			data: Record<string, ChampionData>;
		}>,
		fetch(`${DATA_DRAGON}/cdn/${version}/data/de_DE/item.json`, { next: { revalidate: 3600 } }).then((response) => response.json()) as Promise<{
			data: Record<string, ItemData>;
		}>,
		fetch(`${DATA_DRAGON}/cdn/${version}/data/en_US/item.json`, { next: { revalidate: 3600 } }).then((response) => response.json()) as Promise<{
			data: Record<string, ItemData>;
		}>,
		fetch(`${DATA_DRAGON}/cdn/${version}/data/de_DE/summoner.json`, { next: { revalidate: 3600 } }).then((response) => response.json()) as Promise<{
			data: Record<string, SpellData>;
		}>,
		fetch(`${DATA_DRAGON}/cdn/${version}/data/de_DE/runesReforged.json`, { next: { revalidate: 3600 } }).then((response) => response.json()) as Promise<RuneTree[]>,
	]);
	const data: Catalog = {
		version,
		champions: Object.values(champions.data),
		items: Object.entries(items.data).map(([id, item]) => ({ ...item, id, canonicalName: englishItems.data[id]?.name ?? item.name })),
		spells: Object.values(spells.data),
		runes,
	};
	globalCache.__ultimateBraveryCatalog = { schema: CATALOG_CACHE_SCHEMA, data, expiresAt: Date.now() + 60 * 60 * 1000 };
	return data;
}

function toAsset(version: string, type: "champion" | "item" | "spell", value: { id?: string; key: string; name: string; image: DataDragonImage }): UltimateBraveryAsset {
	return { id: value.id ?? value.key, name: value.name, imageUrl: imageUrl(version, type, value.image.full) };
}

function buildRunes(catalog: Catalog): UltimateBraveryRunePage {
	const primary = pick(catalog.runes);
	const secondary = pick(catalog.runes.filter((tree) => tree.id !== primary.id));
	const primaryRunes = primary.slots.map((slot) => pick(slot.runes));
	const secondarySlots = sample(secondary.slots.slice(1), 2);
	const secondaryRunes = secondarySlots.map((slot) => pick(slot.runes));
	return {
		primary: primary.name,
		secondary: secondary.name,
		runes: [...primaryRunes, ...secondaryRunes].map((rune) => ({ id: String(rune.id), name: rune.name, imageUrl: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}` })),
		shards: [
			pick(["Angriffstempo", "Fähigkeitstempo", "Adaptive Stärke"]),
			pick(["Adaptive Stärke", "Lauftempo", "Skalierende Leben"]),
			pick(["Leben", "Zähigkeit", "Skalierende Leben"]),
		],
	};
}

async function generateRoll(input: {
	matchId: string;
	discordId: string;
	teamName: string;
	riotId: string;
	role: string;
	rollNumber: number;
	rerollsUsed: number;
	rerollLimit: number;
	rolledBy: string;
	excludedChampionIds: string[];
}): Promise<UltimateBraveryRoll> {
	const catalog = await getCatalog();
	const champion = pick(catalog.champions.filter((entry) => !input.excludedChampionIds.includes(entry.id)));
	const finishedItems = catalog.items.filter(
		(item) =>
			isSummonersRiftStoreItem(item) &&
			item.gold.total >= 2200 &&
			!item.into?.length &&
			!item.tags.includes("Consumable") &&
			!item.tags.includes("Trinket") &&
			!isSupportQuestUpgrade(item) &&
			!isJungleCompanion(item)
	);
	// Tier-2 boots build directly from basic Boots (1001). Tier-3 role-quest
	// upgrades build from a Tier-2 pair and are reserved for Mid below.
	const boots = catalog.items.filter((item) => isSummonersRiftStoreItem(item) && item.tags.includes("Boots") && item.from?.includes("1001"));
	const role = input.role.toLowerCase();
	const fixedStartItemId = role === "jungle" ? pick([...JUNGLE_COMPANION_IDS]) : null;
	const supportStartItem = role === "support" ? catalog.items.find((item) => item.canonicalName === "World Atlas") : null;
	const supportUpgrade = role === "support" ? pick(catalog.items.filter(isSupportQuestUpgrade)) : null;
	if (role === "support" && !supportStartItem) throw new Error("World Atlas konnte in Riots aktuellem Item-Katalog nicht gefunden werden.");
	if (role === "support" && !supportUpgrade) throw new Error("Keine gültige Support-Quest-Belohnung im aktuellen Riot-Katalog gefunden.");
	const fixedStartItem = supportStartItem ?? (fixedStartItemId ? catalog.items.find((item) => item.id === fixedStartItemId) : null);
	const laneStartItems = catalog.items.filter(
		(item) =>
			isSummonersRiftStoreItem(item) &&
			item.gold.total > 0 &&
			item.gold.total <= 500 &&
			!item.into?.length &&
			!item.tags.includes("Consumable") &&
			!item.tags.includes("Trinket") &&
			!item.tags.includes("Boots") &&
			!isJungleCompanion(item) &&
			item.canonicalName !== "World Atlas" &&
			!isSupportQuestUpgrade(item)
	);
	const laneStartItem = role !== "jungle" && role !== "support" ? pick(laneStartItems) : null;
	// Tier-3 Mid quest boots are role rewards and therefore may be marked as
	// unavailable in the normal shop; allow only that explicit role-only pool.
	const midBoots = catalog.items.filter(
		(item) =>
			/^\d{4}$/.test(item.id) &&
			item.maps?.["11"] &&
			item.tags.includes("Boots") &&
			item.gold.total >= 1200 &&
			!item.into?.length &&
			!item.hideFromAll &&
			!item.requiredChampion
	);
	const selectedBoots = role === "mid" && midBoots.length ? pick(midBoots) : pick(boots);
	const legendaryCount = role === "bot" ? 6 : role === "support" ? 4 : 5;
	const fixedItemGroups = [fixedStartItem, supportUpgrade, laneStartItem].flatMap((item) => (item ? ultimateBraveryItemGroups(itemName(item)) : []));
	const legendaryItems = sampleCompatibleItems(finishedItems, legendaryCount, fixedItemGroups);
	const selectedItems = [legendaryItems[0], selectedBoots, ...legendaryItems.slice(1)];

	const riftSpells = catalog.spells.filter((spell) => spell.modes.includes("CLASSIC") && !["SummonerSmite", "SummonerSnowball"].includes(spell.id));
	const smite = catalog.spells.find((spell) => spell.id === "SummonerSmite");
	const spells = role === "jungle" && smite ? [smite, pick(riftSpells)] : sample(riftSpells, 2);
	const now = new Date().toISOString();
	return {
		id: `${input.matchId}:${input.discordId}`,
		matchId: input.matchId,
		discordId: input.discordId,
		teamName: input.teamName,
		riotId: input.riotId,
		role: input.role,
		rollNumber: input.rollNumber,
		rerollsUsed: input.rerollsUsed,
		rolledBy: input.rolledBy,
		champion: toAsset(catalog.version, "champion", champion),
		startingItems: [
			...(fixedStartItem
				? [toAsset(catalog.version, "item", { id: fixedStartItem.id, key: fixedStartItem.id, name: fixedStartItem.name, image: fixedStartItem.image })]
				: []),
			...(supportUpgrade
				? [toAsset(catalog.version, "item", { id: supportUpgrade.id, key: supportUpgrade.id, name: `${supportUpgrade.name} (Quest-Upgrade)`, image: supportUpgrade.image })]
				: []),
			...(laneStartItem ? [toAsset(catalog.version, "item", { id: laneStartItem.id, key: laneStartItem.id, name: laneStartItem.name, image: laneStartItem.image })] : []),
		],
		items: selectedItems.map((item) => toAsset(catalog.version, "item", { id: item.id, key: item.id, name: item.name, image: item.image })),
		summonerSpells: spells.map((spell) => toAsset(catalog.version, "spell", spell)),
		runes: buildRunes(catalog),
		status: input.rerollsUsed >= input.rerollLimit ? "locked" : "selecting",
		...(input.rerollsUsed >= input.rerollLimit ? { confirmedAt: now } : {}),
		rolledAt: now,
		updatedAt: now,
	};
}

function strip(doc: RollDoc): UltimateBraveryRoll {
	const { _id, ...roll } = doc;
	void _id;
	return roll;
}

export async function listUltimateBraveryRolls(matchId: string): Promise<UltimateBraveryRoll[]> {
	const docs = await (await rollsCollection()).find({ matchId }, { sort: { teamName: 1, role: 1 } }).toArray();
	return docs.filter((doc) => !rollContainsForbiddenItem(doc) && !rollContainsConflictingItems(doc)).map(strip);
}

export async function getUltimateBraveryRoll(matchId: string, discordId: string): Promise<UltimateBraveryRoll | null> {
	const doc = await (await rollsCollection()).findOne({ _id: `${matchId}:${discordId}` });
	return doc ? strip(doc) : null;
}

export async function createUltimateBraveryRoll(input: {
	matchId: string;
	discordId: string;
	teamName: string;
	riotId: string;
	role: string;
	rolledBy: string;
	rerollLimit: number;
	reroll?: boolean;
	force?: boolean;
}): Promise<UltimateBraveryRoll> {
	const col = await rollsCollection();
	let existing = await col.findOne({ _id: `${input.matchId}:${input.discordId}` });
	if (existing && (rollContainsForbiddenItem(existing) || rollContainsConflictingItems(existing))) {
		await col.deleteOne({ _id: existing._id });
		existing = null;
	}
	if (existing?.status === "locked" && !input.force) return strip(existing);
	if (existing && !input.reroll) return strip(existing);
	const rerollsUsed = existing ? existing.rerollsUsed + 1 : 0;
	if (rerollsUsed > input.rerollLimit && !input.force) return strip(existing!);
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const matchRolls = await col.find({ matchId: input.matchId }).toArray();
		const excludedChampionIds = matchRolls.filter((entry) => entry.discordId !== input.discordId).map((entry) => entry.champion.id);
		const roll = {
			...(await generateRoll({ ...input, rollNumber: (existing?.rollNumber ?? 0) + 1, rerollsUsed, excludedChampionIds })),
			...(input.force ? { exceptionRerollsUsed: (existing?.exceptionRerollsUsed ?? 0) + 1 } : {}),
		};
		try {
			await col.replaceOne({ _id: roll.id }, { ...roll }, { upsert: true });
			return roll;
		} catch (error) {
			if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
		}
	}
	throw new Error("Es konnte kein einzigartiger Champion zugelost werden. Bitte erneut versuchen.");
}

export async function confirmUltimateBraveryRoll(matchId: string, discordId: string): Promise<UltimateBraveryRoll | null> {
	const col = await rollsCollection();
	const now = new Date().toISOString();
	const doc = await col.findOneAndUpdate({ _id: `${matchId}:${discordId}` }, { $set: { status: "locked", confirmedAt: now, updatedAt: now } }, { returnDocument: "after" });
	return doc ? strip(doc) : null;
}

export async function requestUltimateBraveryReroll(input: { matchId: string; discordId: string; requestedBy: string; rerollLimit: number }): Promise<UltimateBraveryRoll> {
	const collection = await rollsCollection();
	const current = await collection.findOne({ _id: `${input.matchId}:${input.discordId}` });
	if (!current) throw new Error("Bitte würfle und bestätige zuerst deinen Roll.");
	if (current.rerollsUsed < input.rerollLimit) throw new Error("Du hast noch einen garantierten Reroll übrig.");
	if (current.rerollRequestedAt) return strip(current);
	const now = new Date().toISOString();
	const updated = await collection.findOneAndUpdate(
		{ _id: current._id },
		{ $set: { rerollRequestedAt: now, rerollRequestedBy: input.requestedBy, updatedAt: now } },
		{ returnDocument: "after" }
	);
	if (!updated) throw new Error("Die Reroll-Anfrage konnte nicht gespeichert werden.");
	return strip(updated);
}

export async function deleteUltimateBraveryRoll(matchId: string, discordId: string): Promise<void> {
	await (await rollsCollection()).deleteOne({ _id: `${matchId}:${discordId}` });
}

export async function resetUltimateBraveryMatch(matchId: string): Promise<void> {
	await (await rollsCollection()).deleteMany({ matchId });
}

export async function resetUltimateBraveryTestDraft(): Promise<void> {
	await resetUltimateBraveryMatch("ub-test");
}
