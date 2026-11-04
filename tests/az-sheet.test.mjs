import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, parseMatchLogExclusions, parsePauseFlag } from "../src/lib/az-sheet.ts";

test("parses quoted CSV with commas, doubled quotes and CRLF", () => {
	assert.deepEqual(parseCsv('"a","b, c"\r\n"say ""hi""",""\n'), [
		["a", "b, c"],
		['say "hi"', ""],
	]);
});

test("match log: every 'No …' row is excluded, 'Yes' rows are not", () => {
	const csv = [
		'"Match ID","Game ended","Champion","Result","Queue","Counts"',
		'"EUW1_1","15.10.2026 19:24","Aatrox","Win","Ranked Solo/Duo","Yes"',
		'"EUW1_2","18.10.2026 15:34","Alistar","Win","Ranked Solo/Duo","No (remake)"',
		'"EUW1_3","18.10.2026 22:59","Viktor","Win","Ranked Solo/Duo","No (not challenge)"',
		'"EUW1_4","18.10.2026 23:59","Viktor","Win","Ranked Solo/Duo","no"',
	].join("\n");
	assert.deepEqual(parseMatchLogExclusions(csv), ["EUW1_2", "EUW1_3", "EUW1_4"]);
});

test("match log without the expected headers excludes nothing", () => {
	assert.deepEqual(parseMatchLogExclusions('"Id","Status"\n"EUW1_2","No"'), []);
});

test("pause flag: label anywhere on the Stats tab, value in the next filled cell", () => {
	assert.equal(parsePauseFlag('"Challenge start","15.10.2026"\n"Progress",""'), null);
	assert.equal(parsePauseFlag('"","","","","","","Pause","TRUE"'), true);
	assert.equal(parsePauseFlag('"Pause","","FALSE"'), false);
	assert.equal(parsePauseFlag('"pausiert","Ja"'), true);
	assert.equal(parsePauseFlag('"Pause",""'), false);
});
