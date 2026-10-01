import assert from "node:assert/strict";
import test from "node:test";
import { applicationSchema } from "../src/lib/tournament-application-schema.ts";

const valid = { displayName: "Player", mainRole: "Mid", preferredRoles: ["Mid"], availableAllDates: true, acceptedRules: true, acceptedDataStorage: true };

test("existing application payloads need no competitive experience", () => {
	const result = applicationSchema.parse(valid);
	assert.equal(result.hasCompetitiveExperience, false);
	assert.equal(result.competitiveExperience, "");
});

test("competitive experience requires a nonblank description only when checked", () => {
	for (const competitiveExperience of [undefined, "", "  \n  "]) {
		assert.equal(applicationSchema.safeParse({ ...valid, hasCompetitiveExperience: true, competitiveExperience }).success, false);
	}
	assert.equal(
		applicationSchema.parse({ ...valid, hasCompetitiveExperience: true, competitiveExperience: "  Amateur league for two seasons  " }).competitiveExperience,
		"Amateur league for two seasons"
	);
});

test("competitive experience rejects oversized descriptions", () => {
	assert.equal(applicationSchema.safeParse({ ...valid, hasCompetitiveExperience: true, competitiveExperience: "x".repeat(1501) }).success, false);
});

test("unchecking experience clears previous details", () => {
	assert.equal(applicationSchema.parse({ ...valid, hasCompetitiveExperience: false, competitiveExperience: "Previously entered experience" }).competitiveExperience, "");
});

test("experience cannot bypass existing mandatory consents", () => {
	assert.equal(applicationSchema.safeParse({ ...valid, acceptedRules: false, hasCompetitiveExperience: true, competitiveExperience: "Amateur league" }).success, false);
});
