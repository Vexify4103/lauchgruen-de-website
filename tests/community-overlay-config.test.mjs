import assert from "node:assert/strict";
import test from "node:test";
import {
	COMMUNITY_OVERLAY_URL_VERSION,
	DEFAULT_COMMUNITY_OVERLAY_CONFIG,
	communityOverlayParams,
	normalizeTwitchLogin,
	parseCommunityOverlayConfig,
} from "../src/lib/community-overlay-config.ts";

test("normalizes Twitch channel names and URLs", () => {
	assert.equal(normalizeTwitchLogin("@Vexi_Fy"), "vexi_fy");
	assert.equal(normalizeTwitchLogin("https://www.twitch.tv/Lauchgruen/"), "lauchgruen");
	assert.equal(normalizeTwitchLogin("not a channel"), "");
});

test("serializes versioned overlay URLs and preserves the public configuration", () => {
	const input = {
		...DEFAULT_COMMUNITY_OVERLAY_CONFIG,
		streamer: "lauchgruen",
		ingame: "LauchgruenTV#EUW",
		style: "freeform",
		historyRows: 3,
		showLiveGame: true,
		showStreamerParticipants: true,
	};
	const params = communityOverlayParams(input);

	assert.equal(params.get("v"), String(COMMUNITY_OVERLAY_URL_VERSION));
	assert.equal(params.has("preview"), false);
	assert.deepEqual(parseCommunityOverlayConfig(params), input);
});

test("preview is explicit and malformed values fall back safely", () => {
	const params = communityOverlayParams(DEFAULT_COMMUNITY_OVERLAY_CONFIG, true);
	assert.equal(params.get("preview"), "1");

	const parsed = parseCommunityOverlayConfig(new URLSearchParams("style=unknown&rows=99&primary=oops&livegame=1"));
	assert.equal(parsed.style, "default");
	assert.equal(parsed.historyRows, 1);
	assert.equal(parsed.primary, DEFAULT_COMMUNITY_OVERLAY_CONFIG.primary);
});

test("styles without participant space disable the live-game panel", () => {
	for (const style of ["banner", "rail", "portrait"]) {
		const parsed = parseCommunityOverlayConfig(new URLSearchParams(`style=${style}&livegame=1`));
		assert.equal(parsed.showLiveGame, false);
	}
});
