type RiotAssetIdentity = {
	id: string | number;
	key?: string;
	name?: string;
};

export function ultimateBraveryIsHexflash(rune: RiotAssetIdentity): boolean {
	const identity = `${rune.key ?? ""} ${rune.name ?? ""}`;
	return String(rune.id) === "8306" || /hextechflashtraption|hexflash|hextech[- ]?blitz/i.test(identity);
}

export function ultimateBraveryHasFlash(spells: RiotAssetIdentity[]): boolean {
	return spells.some((spell) => spell.id === "SummonerFlash" || spell.key === "4");
}

export function ultimateBraveryRunesMatchSpells(runes: RiotAssetIdentity[], spells: RiotAssetIdentity[]): boolean {
	return !runes.some(ultimateBraveryIsHexflash) || ultimateBraveryHasFlash(spells);
}
