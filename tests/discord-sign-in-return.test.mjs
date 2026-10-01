import assert from "node:assert/strict";
import test from "node:test";
import { discordSignInReturnUrl } from "../src/lib/discord-sign-in-return.ts";

test("Discord sign-in returns to the public apply URL on the production tournament host", () => {
	assert.equal(discordSignInReturnUrl("/tournament/apply", "https://tournament.lauchgruen.de/apply"), "https://tournament.lauchgruen.de/apply");
});

test("Discord sign-in preserves the local tournament host, protocol and port", () => {
	assert.equal(discordSignInReturnUrl("/tournament/apply", "http://tournament.lauchgruen.localhost:3000/apply"), "http://tournament.lauchgruen.localhost:3000/apply");
});

test("plain localhost retains explicit tournament routes", () => {
	assert.equal(discordSignInReturnUrl("/tournament/apply", "http://localhost:3000/tournament/apply"), "http://localhost:3000/tournament/apply");
});

test("apex account returns stay on the apex with their navigation context", () => {
	assert.equal(discordSignInReturnUrl("/me?from=overlay", "https://lauchgruen.de/overlay"), "https://lauchgruen.de/me?from=overlay");
});

test("explicit cross-host account links keep their intended destination", () => {
	assert.equal(discordSignInReturnUrl("https://lauchgruen.de/me?from=tournament", "https://tournament.lauchgruen.de/apply"), "https://lauchgruen.de/me?from=tournament");
});

test("clean tournament return URLs preserve queries and anchors", () => {
	assert.equal(discordSignInReturnUrl("/tournament/apply?source=nav#rules", "https://tournament.lauchgruen.de/"), "https://tournament.lauchgruen.de/apply?source=nav#rules");
});
