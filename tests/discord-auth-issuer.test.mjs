import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const providerConfig = source.match(/Discord\(\{([\s\S]*?)\n\t\t\}\)/)?.[1];
const issuer = providerConfig?.match(/issuer:\s*"([^"]+)"/)?.[1];
const require = createRequire(import.meta.url);
const authRequire = createRequire(require.resolve("@auth/core"));
const oauth = await import(pathToFileURL(authRequire.resolve("oauth4webapi")).href);

test("Discord callbacks accept their published issuer while preserving state validation", () => {
	assert.equal(issuer, "https://discord.com");
	assert.match(providerConfig, /checks:\s*\["state"\]/);
	const params = new URLSearchParams({ code: "test-code", state: "test-state", iss: "https://discord.com" });
	const result = oauth.validateAuthResponse({ issuer }, { client_id: "test-client" }, params, "test-state");
	assert.equal(result.get("code"), "test-code");
});

test("Discord callback validation still rejects foreign issuers and mismatched state", () => {
	const params = new URLSearchParams({ code: "test-code", state: "test-state", iss: "https://example.invalid" });
	assert.throws(() => oauth.validateAuthResponse({ issuer }, { client_id: "test-client" }, params, "test-state"));
	params.set("iss", issuer);
	assert.throws(() => oauth.validateAuthResponse({ issuer }, { client_id: "test-client" }, params, "different-state"));
});
