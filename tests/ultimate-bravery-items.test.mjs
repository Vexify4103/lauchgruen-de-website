import assert from "node:assert/strict";
import test from "node:test";
import { ultimateBraveryChampionCanUseRunaans, ultimateBraveryItemGroups, ultimateBraveryItemsConflict } from "../src/lib/ultimate-bravery-items.ts";

test("blocks items from the same exclusive group", () => {
	assert.equal(ultimateBraveryItemsConflict("Lord Dominik's Regards", "Mortal Reminder"), true);
	assert.equal(ultimateBraveryItemsConflict("Trinity Force", "Iceborn Gauntlet"), true);
	assert.equal(ultimateBraveryItemsConflict("Bloodsong", "Sheen"), true);
	assert.equal(ultimateBraveryItemsConflict("Bloodsong", "Lich Bane"), true);
	assert.equal(ultimateBraveryItemsConflict("Maw of Malmortius", "Sterak's Gage"), true);
	assert.equal(ultimateBraveryItemsConflict("Ravenous Hydra", "Stridebreaker"), true);
});

test("an item with multiple groups blocks every matching group", () => {
	assert.deepEqual(ultimateBraveryItemGroups("Terminus"), ["blight", "fatality"]);
	assert.equal(ultimateBraveryItemsConflict("Terminus", "Black Cleaver"), true);
	assert.equal(ultimateBraveryItemsConflict("Terminus", "Void Staff"), true);
});

test("treats semi-unique manaflow items as mutually exclusive", () => {
	assert.equal(ultimateBraveryItemsConflict("Manamune", "Archangel's Staff"), true);
	assert.equal(ultimateBraveryItemsConflict("Winter's Approach", "Whispering Circlet"), true);
});

test("treats Archangel's Staff as both Manaflow and Lifeline", () => {
	assert.deepEqual(ultimateBraveryItemGroups("Archangel's Staff"), ["manaflow", "lifeline"]);
	assert.equal(ultimateBraveryItemsConflict("Archangel's Staff", "Protoplasm Harness"), true);
	assert.equal(ultimateBraveryItemsConflict("Archangel's Staff", "Maw of Malmortius"), true);
	assert.equal(ultimateBraveryItemsConflict("Protoplasm Harness", "Immortal Shieldbow"), true);
});

test("allows items whose exclusivity groups do not overlap", () => {
	assert.equal(ultimateBraveryItemsConflict("Lord Dominik's Regards", "Banshee's Veil"), false);
	assert.equal(ultimateBraveryItemsConflict("Sunfire Aegis", "Trinity Force"), false);
});

test("only allows Runaan's Hurricane for clearly ranged champions", () => {
	assert.equal(ultimateBraveryChampionCanUseRunaans(550), true);
	assert.equal(ultimateBraveryChampionCanUseRunaans(350), true);
	assert.equal(ultimateBraveryChampionCanUseRunaans(325), false);
	assert.equal(ultimateBraveryChampionCanUseRunaans(175), false);
});
