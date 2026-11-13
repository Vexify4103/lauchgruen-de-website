import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
	getSwissPotSession,
	updateSwissPotSession,
	swissSandboxDb,
	isLocalSwissSandbox,
	localSwissMongoUri,
	SWISS_SANDBOX_COLLECTION,
	SWISS_SANDBOX_DB,
} from "../src/lib/swiss-pot-sandbox.ts";

test("sandbox routes are local-development only", () => {
	for (const host of ["localhost:3000", "127.0.0.1:3000", "tournament.lauchgruen.localhost:3000"]) {
		assert.equal(isLocalSwissSandbox(host, "development"), true);
		assert.equal(isLocalSwissSandbox(host, "production"), false);
	}
	for (const host of [null, "lauchgruen.de", "tournament.lauchgruen.de", "localhost.evil.example:3000", "example.com@localhost:3000", "localhost:3000/path"])
		assert.equal(isLocalSwissSandbox(host, "development"), false);
});

test("sandbox cannot connect to production or replica-set discovery hosts", () => {
	assert.match(localSwissMongoUri(), /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])/);
	for (const uri of ["mongodb://5.255.77.51:25078/", "mongodb+srv://cluster.example.com/", "mongodb://localhost:27017,remote.example.com:27017/", "https://localhost:27027/"])
		assert.throws(() => localSwissMongoUri(uri));
	assert.equal(SWISS_SANDBOX_DB, "lauchgruen_swiss_draw_sandbox");
});

test(
	"local Mongo persists drawn slots and rejects stale concurrent actions without overwriting them",
	{ skip: process.env.LOCAL_SWISS_DB_TEST !== "1" && "Set LOCAL_SWISS_DB_TEST=1 with local Mongo running" },
	async (t) => {
		const id = `integration-${randomUUID()}`;
		const db = await swissSandboxDb();
		t.after(async () => {
			await db.collection(SWISS_SANDBOX_COLLECTION).deleteOne({ _id: id });
			await (await globalThis.__swissPotLocalClient)?.close();
			globalThis.__swissPotLocalClient = undefined;
		});
		const initial = await getSwissPotSession(id);
		assert.equal(initial.revision, 0);
		const settled = await Promise.allSettled([updateSwissPotSession({ type: "draw" }, 0, id), updateSwissPotSession({ type: "draw" }, 0, id)]);
		assert.equal(settled.filter((entry) => entry.status === "fulfilled").length, 1);
		assert.equal(settled.filter((entry) => entry.status === "rejected").length, 1);
		const saved = await getSwissPotSession(id);
		assert.equal(saved.revision, 1);
		assert.equal(saved.state.rounds[0].pools[0].drawOrder.length, 1);
		assert.deepEqual(await getSwissPotSession(id), saved);
		await assert.rejects(() => updateSwissPotSession({ type: "reset" }, 0, id), /anderen Tab/);
		const reset = await updateSwissPotSession({ type: "reset" }, 1, id);
		assert.equal(reset.revision, 2);
		assert.deepEqual(reset.state.rounds, []);
	}
);
