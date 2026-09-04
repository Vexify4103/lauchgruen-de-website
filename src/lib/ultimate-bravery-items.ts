const ITEM_EXCLUSIVITY_GROUPS = new Map<string, readonly string[]>(
	Object.entries({
		"Tear of the Goddess": ["manaflow"],
		"Doran's Blade": ["starter"],
		"Doran's Shield": ["starter"],
		"Doran's Ring": ["starter"],
		Bloodsong: ["spellblade"],
		"Scorchclaw Pup": ["starter"],
		"Gustwalker Hatchling": ["starter"],
		"Mosstomper Seedling": ["starter"],
		Sheen: ["spellblade"],
		Tiamat: ["hydra"],
		Hexdrinker: ["lifeline"],
		Manamune: ["manaflow"],
		"Iceborn Gauntlet": ["spellblade"],
		"Dead Man's Plate": ["momentum"],
		Terminus: ["blight", "fatality"],
		"Black Cleaver": ["fatality"],
		"Serrated Dirk": ["dirk"],
		"Quicksilver Sash": ["quicksilver"],
		"Last Whisper": ["fatality"],
		"Maw of Malmortius": ["lifeline"],
		"Mercurial Scimitar": ["quicksilver"],
		"Lord Dominik's Regards": ["fatality"],
		"Mortal Reminder": ["fatality"],
		"Profane Hydra": ["hydra"],
		"Edge of Night": ["annul"],
		"Serylda's Grudge": ["fatality"],
		"Dark Seal": ["glory"],
		"Blighting Jewel": ["blight"],
		"Lost Chapter": ["enlighten"],
		"Catalyst of Aeons": ["eternity"],
		"Verdant Barrier": ["annul"],
		"Seeker's Armguard": ["stasis"],
		"Mejai's Soulstealer": ["glory"],
		"Rod of Ages": ["eternity"],
		"Archangel's Staff": ["manaflow", "lifeline"],
		"Lich Bane": ["spellblade"],
		"Bloodletter's Curse": ["blight"],
		"Banshee's Veil": ["annul"],
		"Void Staff": ["blight"],
		Cryptbloom: ["blight"],
		"Dusk and Dawn": ["spellblade"],
		"Zhonya's Hourglass": ["stasis"],
		"Sterak's Gage": ["lifeline"],
		Stridebreaker: ["hydra"],
		"Ravenous Hydra": ["hydra"],
		"Titanic Hydra": ["hydra"],
		"Trinity Force": ["spellblade"],
		"Bami's Cinder": ["immolate"],
		"Winter's Approach": ["manaflow"],
		"Protoplasm Harness": ["lifeline"],
		"Immortal Shieldbow": ["lifeline"],
		"Hollow Radiance": ["immolate"],
		"Sunfire Aegis": ["immolate"],
		"Whispering Circlet": ["manaflow"],
	}).map(([name, groups]) => [normalizeItemName(name), groups])
);

function normalizeItemName(name: string) {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function ultimateBraveryItemGroups(name: string): readonly string[] {
	return ITEM_EXCLUSIVITY_GROUPS.get(normalizeItemName(name)) ?? [];
}

export function ultimateBraveryItemsConflict(firstName: string, secondName: string): boolean {
	const firstGroups = ultimateBraveryItemGroups(firstName);
	const secondGroups = new Set(ultimateBraveryItemGroups(secondName));
	return firstGroups.some((group) => secondGroups.has(group));
}

export function ultimateBraveryChampionCanUseRunaans(attackRange: number): boolean {
	// Data Dragon does not expose Riot's internal melee/ranged shop flag. A
	// conservative threshold keeps Runaan's away from melee and ambiguous
	// short-range champions while retaining it for standard ranged champions.
	return Number.isFinite(attackRange) && attackRange >= 350;
}
