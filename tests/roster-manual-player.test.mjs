import assert from "node:assert/strict";
import test from "node:test";

import { resolveManualRosterIdentity } from "../src/lib/roster-manual-player.ts";

test("restores a verified roster player without an application from their Riot identity", () => {
	const identity = resolveManualRosterIdentity({
		discordId: "470376469277835264",
		riotId: "KingKuli87#EUW",
		verificationStatus: "verified",
	});

	assert.equal(identity.discordHandle, "KingKuli87");
	assert.equal(identity.displayName, "KingKuli87");
	assert.equal(identity.verified, true);
});

test("preserves manually entered roster metadata for an unverified player", () => {
	const identity = resolveManualRosterIdentity({
		discordId: "123456789012345678",
		discordUsername: "manual_user",
		displayName: "Manual Player",
		riotId: "Manual Riot#EUW",
		verificationStatus: "manual",
	});

	assert.equal(identity.discordHandle, "@manual_user");
	assert.equal(identity.displayName, "Manual Player");
	assert.equal(identity.verified, false);
});
