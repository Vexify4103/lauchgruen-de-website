import assert from "node:assert/strict";
import test from "node:test";
import { participantInventoryItemIds } from "../src/lib/riot.ts";

function participantWithItems(items) {
	return {
		item0: items[0] ?? 0,
		item1: items[1] ?? 0,
		item2: items[2] ?? 0,
		item3: items[3] ?? 0,
		item4: items[4] ?? 0,
		item5: items[5] ?? 0,
		item6: items[6] ?? 0,
	};
}

test("keeps a real seventh inventory item such as ADC boots", () => {
	const items = participantInventoryItemIds(participantWithItems([3031, 3036, 3094, 3072, 6676, 3140, 3006]));

	assert.deepEqual(items, [3031, 3036, 3094, 3072, 6676, 3140, 3006]);
});

test("does not render the trinket slot as a seventh build item", () => {
	const items = participantInventoryItemIds(participantWithItems([3031, 3036, 3094, 3072, 6676, 3006, 3363]));

	assert.deepEqual(items, [3031, 3036, 3094, 3072, 6676, 3006]);
});
