import { getDb } from "@/lib/mongo";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_ROLE_TYPE = 0;
const DISCORD_TEXT_CHANNEL_TYPE = 0;
const DISCORD_VOICE_CHANNEL_TYPE = 2;
const VIEW_CHANNEL = 1024;
const SEND_MESSAGES = 2048;
const READ_MESSAGE_HISTORY = 65536;
const CONNECT = 1048576;
const SPEAK = 2097152;
const MAX_ATTEMPTS = 5;

type TeamResources = {
	name: string;
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
};

type BotStateDoc = { _id: string; teams?: Record<string, TeamResources> };
type OperationResult = { ok: true } | { ok: false; message: string };

function token() {
	return process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "";
}

function guildId() {
	return process.env.DISCORD_GUILD_ID ?? "";
}

function voiceCategoryId() {
	return process.env.TEAM_VOICE_CATEGORY_ID ?? "";
}

function textCategoryId() {
	return process.env.TEAM_TEXT_CATEGORY_ID ?? voiceCategoryId();
}

function textChannelName(name: string) {
	return (
		name
			.trim()
			.toLocaleLowerCase("de-DE")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9äöüß-]+/g, "-")
			.replace(/-{2,}/g, "-")
			.replace(/(^-|-$)/g, "")
			.slice(0, 90) || "team"
	);
}

function retryAfter(value: string | null) {
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function wait(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function request<T>(path: string, init: Omit<RequestInit, "headers"> & { body?: string }): Promise<T> {
	if (!token() || !guildId()) throw new Error("Discord Bot Token oder Guild ID fehlt.");
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(`${DISCORD_API}${path}`, {
				...init,
				headers: { authorization: `Bot ${token()}`, "content-type": "application/json" },
				cache: "no-store",
			});
		} catch {
			if (attempt === MAX_ATTEMPTS) throw new Error("Discord-Netzwerkfehler nach mehreren Versuchen.");
			await wait(300 * attempt);
			continue;
		}

		if (response.ok) {
			await wait(250);
			if (response.status === 204) return undefined as T;
			return (await response.json()) as T;
		}
		if (response.status === 404 && init.method === "DELETE") return undefined as T;
		if (response.status === 429 && attempt < MAX_ATTEMPTS) {
			const body = (await response
				.clone()
				.json()
				.catch(() => null)) as { retry_after?: number } | null;
			const seconds = body?.retry_after ?? retryAfter(response.headers.get("retry-after")) ?? retryAfter(response.headers.get("x-ratelimit-reset-after")) ?? 1;
			await wait(Math.ceil(seconds * 1000) + 250);
			continue;
		}
		const detail = await response.text().catch(() => "");
		throw new Error(`Discord API ${response.status}${detail ? `: ${detail}` : ""}`);
	}
	throw new Error("Discord-Anfrage ist fehlgeschlagen.");
}

async function currentTeam(teamKey: string) {
	const db = await getDb();
	const doc = await db.collection<BotStateDoc>("bot_state").findOne({ _id: "default" });
	return doc?.teams?.[teamKey] ?? null;
}

async function saveResourceId(teamKey: string, field: "roleId" | "voiceChannelId" | "textChannelId", value: string) {
	const db = await getDb();
	await db.collection<BotStateDoc>("bot_state").updateOne({ _id: "default", [`teams.${teamKey}`]: { $exists: true } }, { $set: { [`teams.${teamKey}.${field}`]: value } });
}

async function createRole(name: string) {
	const role = await request<{ id: string }>(`/guilds/${guildId()}/roles`, {
		method: "POST",
		body: JSON.stringify({ name, reason: `LauchManager: Team ${name}` }),
	});
	return role.id;
}

async function createChannel(name: string, roleId: string, kind: "voice" | "text") {
	const parentId = kind === "voice" ? voiceCategoryId() : textCategoryId();
	if (!parentId) return null;
	const allow = kind === "voice" ? VIEW_CHANNEL | CONNECT | SPEAK : VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY;
	const channel = await request<{ id: string }>(`/guilds/${guildId()}/channels`, {
		method: "POST",
		body: JSON.stringify({
			name: kind === "text" ? textChannelName(name) : name,
			type: kind === "text" ? DISCORD_TEXT_CHANNEL_TYPE : DISCORD_VOICE_CHANNEL_TYPE,
			parent_id: parentId,
			permission_overwrites: [
				{ id: guildId(), type: DISCORD_ROLE_TYPE, deny: String(VIEW_CHANNEL) },
				{ id: roleId, type: DISCORD_ROLE_TYPE, allow: String(allow) },
			],
		}),
	});
	return channel.id;
}

export async function provisionDiscordTeamResources(teamKey: string, name: string): Promise<OperationResult> {
	try {
		let team = await currentTeam(teamKey);
		if (!team) return { ok: false, message: "Team wurde vor der Discord-Erstellung gelöscht." };
		if (!team.roleId) {
			await saveResourceId(teamKey, "roleId", await createRole(name));
			team = await currentTeam(teamKey);
		}
		if (!team?.roleId) return { ok: false, message: "Teamrolle konnte nicht gespeichert werden." };
		if (!team.voiceChannelId && voiceCategoryId()) {
			const id = await createChannel(name, team.roleId, "voice");
			if (id) await saveResourceId(teamKey, "voiceChannelId", id);
		}
		team = await currentTeam(teamKey);
		if (team && !team.textChannelId && textCategoryId()) {
			const id = await createChannel(name, team.roleId ?? "", "text");
			if (id) await saveResourceId(teamKey, "textChannelId", id);
		}
		return { ok: true };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : "Discord-Teamressourcen konnten nicht erstellt werden." };
	}
}

export async function renameDiscordTeamResources(input: {
	teamKey: string;
	name: string;
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
}): Promise<OperationResult> {
	try {
		if (input.roleId) await request(`/guilds/${guildId()}/roles/${input.roleId}`, { method: "PATCH", body: JSON.stringify({ name: input.name }) });
		if (input.voiceChannelId) await request(`/channels/${input.voiceChannelId}`, { method: "PATCH", body: JSON.stringify({ name: input.name }) });
		if (input.textChannelId) {
			await request(`/channels/${input.textChannelId}`, { method: "PATCH", body: JSON.stringify({ name: textChannelName(input.name) }) });
		} else if (input.roleId && textCategoryId()) {
			const id = await createChannel(input.name, input.roleId, "text");
			if (id) await saveResourceId(input.teamKey, "textChannelId", id);
		}
		return { ok: true };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : "Discord-Teamressourcen konnten nicht umbenannt werden." };
	}
}

export async function deleteDiscordTeamResources(input: { roleId?: string; voiceChannelId?: string; textChannelId?: string }): Promise<OperationResult> {
	try {
		if (input.textChannelId) await request(`/channels/${input.textChannelId}`, { method: "DELETE" });
		if (input.voiceChannelId) await request(`/channels/${input.voiceChannelId}`, { method: "DELETE" });
		if (input.roleId) await request(`/guilds/${guildId()}/roles/${input.roleId}`, { method: "DELETE" });
		return { ok: true };
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : "Discord-Teamressourcen konnten nicht gelöscht werden." };
	}
}
