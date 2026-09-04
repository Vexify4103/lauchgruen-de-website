import assert from "node:assert/strict";
import test from "node:test";
import {
	ultimateBraveryHasFlash,
	ultimateBraveryIsHexflash,
	ultimateBraveryRunesMatchSpells,
} from "../src/lib/ultimate-bravery-constraints.ts";

test("recognizes Hexflash and Flash by stable Riot identifiers", () => {
	assert.equal(ultimateBraveryIsHexflash({ id: 8306, name: "Hextech-Blitztraption" }), true);
	assert.equal(ultimateBraveryHasFlash([{ id: "SummonerFlash", name: "Blitz" }]), true);
});

test("requires Flash whenever Hexflash was rolled", () => {
	const hexflash = [{ id: "8306", name: "Hextech-Blitztraption" }];
	const flash = [{ id: "SummonerFlash", name: "Blitz" }];
	const noFlash = [
		{ id: "SummonerTeleport", name: "Teleportation" },
		{ id: "SummonerDot", name: "Entzünden" },
	];

	assert.equal(ultimateBraveryRunesMatchSpells(hexflash, flash), true);
	assert.equal(ultimateBraveryRunesMatchSpells(hexflash, noFlash), false);
	assert.equal(ultimateBraveryRunesMatchSpells([{ id: "8347", name: "Kosmische Einsicht" }], noFlash), true);
});
