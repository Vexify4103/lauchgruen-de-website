import assert from "node:assert/strict";
import test from "node:test";
import { checkTeamName, nameTokens } from "../src/lib/team-name-filter.ts";
import { generateTeamTag } from "../src/lib/team-tag.ts";

const blocked = [
	"Sturmfront",
	"STORMFRONT",
	"St0rm Front",
	"S.t.u.r.m.f.r.o.n.t",
	"Stuuurmfrooont",
	"Team 88",
	"Team88",
	"88ers",
	"1488",
	"HH Boys",
	"Die SS",
	"Wolfsschanze",
	"Sieg Heil",
	"N4zi Squad",
	"Hitlers Erben",
	"Blut und Ehre",
	"White Power",
	"ϟϟ Crew",
	"卐",
	"Kanaken Gang",
	"Hurens0hn FC",
	"Aryan Squad",
];

const allowed = [
	"Bitzzle party",
	"Int zum Sieg",
	"Team 1988",
	"Torpedo",
	"Heilung",
	"Frankreich",
	"Scunthorpe",
	"Anführer",
	"Vergaser Crew",
	"Grapefruit",
	"Essex",
	"Spaßtruppe",
	"Minuten-Team",
	"Maryanne",
	"Zyklon Bande",
	"Kiss the Baron",
	"Grosse Klasse",
	"Team 18",
];

test("blocks extremist, hateful and sexual names, also disguised", () => {
	for (const name of blocked) assert.equal(checkTeamName(name).ok, false, name);
});

test("allows normal names that only look similar", () => {
	for (const name of allowed) assert.deepEqual(checkTeamName(name), { ok: true }, name);
});

test("generated team tags skip blocked codes", () => {
	assert.notEqual(generateTeamTag("Super Squad"), "SS");
	assert.equal(checkTeamName(generateTeamTag("Super Squad")).ok, true);
	assert.notEqual(generateTeamTag("Happy Hippos"), "HH");
});

test("splits words and numbers into tokens", () => {
	assert.deepEqual(nameTokens("Team88 Größe"), ["team", "88", "groesse"]);
});
