import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.SMOKE_BASE_URL;
const routes = ["/", "/overlay", "/tournament"];

for (const route of routes) {
	test(`public route ${route} responds`, { skip: !baseUrl }, async () => {
		const response = await fetch(new URL(route, baseUrl), { redirect: "manual" });
		assert.ok(response.status >= 200 && response.status < 400, `${route} returned ${response.status}`);
	});
}
