/**
 * POST /api/tournament/teams
 *
 * Creates a new team in bot_state.teams. Owner-only. Body:
 *   { name: string, group?: "A"|"B", seed?: 1..4, accent?: string }
 *
 * The bot's /createteam slash command can also do this — this endpoint exists
 * so admins can create teams without leaving the web roster builder.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
	name: z.string().trim().min(2).max(60),
	group: z.enum(["A", "B"]),
	seed: z.coerce.number().int().min(1).max(4).optional(),
	accent: z.string().trim().max(120).optional(),
	createDiscordSetup: z.boolean().optional().default(false),
});

const patchSchema = z.object({
	key: z.string().trim().min(1),
	name: z.string().trim().min(2).max(60),
	group: z.enum(["A", "B"]).optional(),
	seed: z.coerce.number().int().min(1).max(4).optional(),
});

function teamKey(name: string): string {
	return name.trim().toLowerCase();
}

type StoredTeam = {
	name: string;
	players?: unknown[];
	playedChampions?: unknown[];
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
	meta?: {
		group?: "A" | "B";
		seed?: number;
		accent?: string;
		captain?: {
			discordId?: string;
		};
	};
};

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_ROLE_TYPE = 0;
const DISCORD_TEXT_CHANNEL_TYPE = 0;
const DISCORD_VOICE_CHANNEL_TYPE = 2;
const VIEW_CHANNEL = 1024;
const SEND_MESSAGES = 2048;
const READ_MESSAGE_HISTORY = 65536;
const CONNECT = 1048576;
const SPEAK = 2097152;
const DISCORD_MAX_ATTEMPTS = 5;

function discordToken() {
	return process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "";
}

function discordGuildId() {
	return process.env.DISCORD_GUILD_ID ?? "";
}

function teamVoiceCategoryId() {
	return process.env.TEAM_VOICE_CATEGORY_ID ?? "";
}

function teamTextCategoryId() {
	return process.env.TEAM_TEXT_CATEGORY_ID ?? teamVoiceCategoryId();
}

function hasDiscordSetupConfig() {
	return Boolean(discordToken() && discordGuildId());
}

async function discordRequest<T>(path: string, init: Omit<RequestInit, "headers"> & { body?: string }): Promise<T> {
	for (let attempt = 1; attempt <= DISCORD_MAX_ATTEMPTS; attempt += 1) {
		const response = await fetch(`${DISCORD_API}${path}`, {
			...init,
			headers: {
				authorization: `Bot ${discordToken()}`,
				"content-type": "application/json",
			},
			cache: "no-store",
		});

		if (response.ok) {
			if (response.status === 204) return undefined as T;
			return (await response.json()) as T;
		}

		if (response.status === 429 && attempt < DISCORD_MAX_ATTEMPTS) {
			const body = (await response.json().catch(() => null)) as { retry_after?: number } | null;
			const retryAfterSeconds =
				body?.retry_after ?? parseRetryAfter(response.headers.get("retry-after")) ?? parseRetryAfter(response.headers.get("x-ratelimit-reset-after")) ?? 1;
			await wait(Math.ceil(retryAfterSeconds * 1000) + 100);
			continue;
		}

		const detail = await response.text().catch(() => "");
		throw new Error(`Discord API ${response.status}${detail ? `: ${detail}` : ""}`);
	}

	throw new Error("Discord API request failed after multiple attempts.");
}

function parseRetryAfter(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function wait(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function createDiscordRole(name: string): Promise<string> {
	const guildId = discordGuildId();
	const role = await discordRequest<{ id: string }>(`/guilds/${guildId}/roles`, {
		method: "POST",
		body: JSON.stringify({
			name,
			reason: `LauchManager: auto-created for team "${name}"`,
		}),
	});
	return role.id;
}

async function createDiscordVoiceChannel(name: string, roleId: string | null): Promise<string | null> {
	const guildId = discordGuildId();
	const parentId = teamVoiceCategoryId();
	if (!parentId) return null;

	const permissionOverwrites = [
		{
			id: guildId,
			type: DISCORD_ROLE_TYPE,
			deny: String(VIEW_CHANNEL),
		},
		...(roleId
			? [
					{
						id: roleId,
						type: DISCORD_ROLE_TYPE,
						allow: String(VIEW_CHANNEL | CONNECT | SPEAK),
					},
				]
			: []),
	];

	const channel = await discordRequest<{ id: string }>(`/guilds/${guildId}/channels`, {
		method: "POST",
		body: JSON.stringify({
			name,
			type: DISCORD_VOICE_CHANNEL_TYPE,
			parent_id: parentId,
			permission_overwrites: permissionOverwrites,
		}),
	});
	return channel.id;
}

function discordTextChannelName(name: string) {
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

async function createDiscordTextChannel(name: string, roleId: string | null): Promise<string | null> {
	const guildId = discordGuildId();
	const parentId = teamTextCategoryId();
	if (!parentId) return null;

	const permissionOverwrites = [
		{
			id: guildId,
			type: DISCORD_ROLE_TYPE,
			deny: String(VIEW_CHANNEL),
		},
		...(roleId
			? [
					{
						id: roleId,
						type: DISCORD_ROLE_TYPE,
						allow: String(VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY),
					},
				]
			: []),
	];

	const channel = await discordRequest<{ id: string }>(`/guilds/${guildId}/channels`, {
		method: "POST",
		body: JSON.stringify({
			name: discordTextChannelName(name),
			type: DISCORD_TEXT_CHANNEL_TYPE,
			parent_id: parentId,
			permission_overwrites: permissionOverwrites,
		}),
	});
	return channel.id;
}

async function renameDiscordTeamResources(team: StoredTeam, name: string): Promise<string[]> {
	if (!hasDiscordSetupConfig()) return [];
	const warnings: string[] = [];
	const guildId = discordGuildId();

	if (team.roleId) {
		try {
			await discordRequest(`/guilds/${guildId}/roles/${team.roleId}`, {
				method: "PATCH",
				body: JSON.stringify({ name }),
			});
		} catch {
			warnings.push("Discord-Rolle konnte nicht umbenannt werden.");
		}
	}

	if (team.voiceChannelId) {
		try {
			await discordRequest(`/channels/${team.voiceChannelId}`, {
				method: "PATCH",
				body: JSON.stringify({ name }),
			});
		} catch {
			warnings.push("Discord-Voice-Channel konnte nicht umbenannt werden.");
		}
	}

	if (team.textChannelId) {
		try {
			await discordRequest(`/channels/${team.textChannelId}`, {
				method: "PATCH",
				body: JSON.stringify({ name: discordTextChannelName(name) }),
			});
		} catch {
			warnings.push("Discord-Textkanal konnte nicht umbenannt werden.");
		}
	} else {
		try {
			const textChannelId = await createDiscordTextChannel(name, team.roleId ?? null);
			if (textChannelId) {
				team.textChannelId = textChannelId;
			} else {
				warnings.push("Discord-Textkanal konnte nicht erstellt werden: Es fehlt eine Team-Kategorie.");
			}
		} catch {
			warnings.push("Discord-Textkanal konnte nicht erstellt werden.");
		}
	}

	return warnings;
}

async function deleteDiscordTeamResources(team: StoredTeam): Promise<string[]> {
	if (!hasDiscordSetupConfig()) return [];
	const warnings: string[] = [];
	const guildId = discordGuildId();

	if (team.textChannelId) {
		try {
			await discordRequest(`/channels/${team.textChannelId}`, {
				method: "DELETE",
			});
		} catch {
			warnings.push("Discord-Textkanal konnte nicht gelöscht werden.");
		}
	}

	if (team.voiceChannelId) {
		try {
			await discordRequest(`/channels/${team.voiceChannelId}`, {
				method: "DELETE",
			});
		} catch {
			warnings.push("Discord-Voice-Channel konnte nicht gelöscht werden.");
		}
	}

	if (team.roleId) {
		try {
			await discordRequest(`/guilds/${guildId}/roles/${team.roleId}`, {
				method: "DELETE",
			});
		} catch {
			warnings.push("Discord-Rolle konnte nicht gelöscht werden.");
		}
	}

	return warnings;
}

function findGroupSeedConflict(teams: Record<string, StoredTeam>, group: "A" | "B", seed: number | undefined, exceptKey: string) {
	if (!seed) return null;
	for (const [otherKey, otherTeam] of Object.entries(teams)) {
		if (otherKey === exceptKey) continue;
		const meta = otherTeam.meta;
		if (meta?.group === group && meta?.seed === seed) return { key: otherKey, team: otherTeam };
	}
	return null;
}

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsedResult = bodySchema.safeParse(body);
	if (!parsedResult.success) {
		return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
	}

	const parsed = { data: parsedResult.data };

	const key = teamKey(parsed.data.name);
	const db = await getDb();
	const doc = await db.collection<{ _id: string; teams?: Record<string, StoredTeam> }>("bot_state").findOne({ _id: "default" });
	const teamsObj = doc?.teams ?? {};

	if (teamsObj[key]) {
		return NextResponse.json({ message: `Team „${parsed.data.name}" existiert bereits.` }, { status: 409 });
	}

	// Conflict check on (group, seed) slot.
	if (false) {
		const teamsObj = doc?.teams ?? {};
		for (const [otherKey, otherTeam] of Object.entries(teamsObj)) {
			const meta = (otherTeam as { meta?: { group?: string; seed?: number } }).meta;
			if (meta?.group === "" && meta?.seed === -1) {
				return NextResponse.json(
					{
						message: `Gruppe ${parsed.data.group} Seed ${parsed.data.seed} ist bereits von „${otherKey}" belegt.`,
					},
					{ status: 409 }
				);
			}
		}
	}

	let roleId: string | undefined;
	let voiceChannelId: string | undefined;
	let textChannelId: string | undefined;
	const warnings: string[] = [];
	const duplicateSeed = findGroupSeedConflict(teamsObj, parsed.data.group, parsed.data.seed, key);
	if (duplicateSeed && parsed.data.seed) {
		warnings.push(`Achtung: Gruppe ${parsed.data.group} Seed ${parsed.data.seed} ist bereits von "${duplicateSeed.team.name}" belegt.`);
	}
	if (parsed.data.createDiscordSetup) {
		if (!hasDiscordSetupConfig()) {
			warnings.push("Discord-Setup übersprungen: DISCORD_TOKEN und DISCORD_GUILD_ID fehlen.");
		} else {
			try {
				roleId = await createDiscordRole(parsed.data.name.trim());
			} catch {
				return NextResponse.json(
					{
						message: "Discord-Rolle konnte nicht erstellt werden. Prüfe Bot-Rechte und Rollen-Hierarchie.",
					},
					{ status: 502 }
				);
			}

			try {
				voiceChannelId = (await createDiscordVoiceChannel(parsed.data.name.trim(), roleId)) ?? undefined;
				if (!voiceChannelId) {
					warnings.push("Voice-Channel übersprungen: TEAM_VOICE_CATEGORY_ID fehlt.");
				}
			} catch {
				warnings.push("Discord-Voice-Channel konnte nicht erstellt werden.");
			}

			try {
				textChannelId = (await createDiscordTextChannel(parsed.data.name.trim(), roleId)) ?? undefined;
				if (!textChannelId) {
					warnings.push("Textkanal übersprungen: TEAM_TEXT_CATEGORY_ID und TEAM_VOICE_CATEGORY_ID fehlen.");
				}
			} catch {
				warnings.push("Discord-Textkanal konnte nicht erstellt werden.");
			}
		}
	}

	const teamDoc: Record<string, unknown> = {
		name: parsed.data.name.trim(),
		players: [],
		playedChampions: [],
	};
	if (roleId) teamDoc.roleId = roleId;
	if (voiceChannelId) teamDoc.voiceChannelId = voiceChannelId;
	if (textChannelId) teamDoc.textChannelId = textChannelId;
	const meta: Record<string, unknown> = {};
	meta.group = parsed.data.group;
	if (parsed.data.seed) meta.seed = parsed.data.seed;
	if (parsed.data.accent) meta.accent = parsed.data.accent;
	if (Object.keys(meta).length > 0) teamDoc.meta = meta;

	await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, { $set: { [`teams.${key}`]: teamDoc } }, { upsert: true });

	return NextResponse.json({
		ok: true,
		key,
		name: parsed.data.name.trim(),
		group: parsed.data.group,
		seed: parsed.data.seed ?? null,
		roleId,
		voiceChannelId,
		textChannelId,
		warnings,
	});
}

export async function PATCH(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const body = await request.json().catch(() => null);
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ message: "Ungültige Daten." }, { status: 400 });
	}

	const oldKey = parsed.data.key.trim().toLowerCase();
	const newName = parsed.data.name.trim();
	const newKey = teamKey(newName);
	const db = await getDb();
	const doc = await db.collection<{ _id: string; teams?: Record<string, StoredTeam> }>("bot_state").findOne({ _id: "default" });
	const teamsObj = doc?.teams ?? {};
	const existing = teamsObj[oldKey];

	if (!existing) {
		return NextResponse.json({ message: "Team nicht gefunden." }, { status: 404 });
	}

	const isOwner = TOURNAMENT_OWNER_DISCORD_IDS.has(discordId);
	const isCaptain = existing.meta?.captain?.discordId === discordId;
	if (!isOwner && !isCaptain) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const currentGroup = existing.meta?.group;
	if (!currentGroup) {
		return NextResponse.json({ message: "Das Team hat noch keine gültige Gruppe." }, { status: 409 });
	}
	const newGroup = isOwner ? (parsed.data.group ?? currentGroup) : currentGroup;
	const newSeed = isOwner ? parsed.data.seed : existing.meta?.seed;

	if (newKey !== oldKey && teamsObj[newKey]) {
		return NextResponse.json({ message: `Team "${newName}" existiert bereits.` }, { status: 409 });
	}

	const conflictingTeam = findGroupSeedConflict(teamsObj, newGroup, newSeed, oldKey);
	if (conflictingTeam && !isOwner) {
		return NextResponse.json(
			{
				message: `Gruppe ${newGroup} Seed ${newSeed} ist bereits von "${conflictingTeam.team.name}" belegt.`,
			},
			{ status: 409 }
		);
	}

	const nextTeam: StoredTeam = {
		...existing,
		name: newName,
		players: existing.players ?? [],
		playedChampions: existing.playedChampions ?? [],
		meta: {
			...existing.meta,
			group: newGroup,
			...(newSeed ? { seed: newSeed } : {}),
		},
	};
	if (!newSeed) {
		delete nextTeam.meta?.seed;
	}

	const duplicateSeedWarning =
		isOwner && conflictingTeam && newSeed ? `Achtung: Gruppe ${newGroup} Seed ${newSeed} ist bereits von "${conflictingTeam.team.name}" belegt.` : null;

	const warnings = newName !== existing.name ? await renameDiscordTeamResources(existing, newName) : [];
	if (duplicateSeedWarning) warnings.push(duplicateSeedWarning);
	if (existing.textChannelId) {
		nextTeam.textChannelId = existing.textChannelId;
	}

	const update: Record<string, unknown> = {
		$set: { [`teams.${newKey}`]: nextTeam },
	};
	if (newKey !== oldKey) {
		update.$unset = { [`teams.${oldKey}`]: "" };
	}

	await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, update);

	if (newName !== existing.name) {
		await migrateStoredTeamName(db, existing.name, newName);
	}

	return NextResponse.json({
		ok: true,
		key: newKey,
		name: newName,
		group: newGroup,
		seed: newSeed ?? null,
		warnings,
	});
}

async function migrateStoredTeamName(db: Awaited<ReturnType<typeof getDb>>, oldName: string, newName: string) {
	type WheelRenameDoc = {
		_id: string;
		usedPoolsByTeam?: Record<string, unknown>;
		playoffUsedPoolsByTeam?: Record<string, unknown>;
		currentAssignment?: unknown;
		history?: unknown[];
	};
	const wheelCollection = db.collection<WheelRenameDoc>("tournament_wheel");
	const wheel = await wheelCollection.findOne({ _id: "az-2026" });
	if (wheel) {
		const setOps: Record<string, unknown> = {};

		for (const field of ["usedPoolsByTeam", "playoffUsedPoolsByTeam"] as const) {
			const source = wheel[field] as Record<string, unknown> | undefined;
			if (source && Object.prototype.hasOwnProperty.call(source, oldName)) {
				const next = { ...source, [newName]: source[oldName] };
				delete next[oldName];
				setOps[field] = next;
			}
		}

		const renameAssignment = (value: unknown) => {
			if (!value || typeof value !== "object") return value;
			const assignment = { ...(value as Record<string, unknown>) };
			if (assignment.teamAName === oldName) assignment.teamAName = newName;
			if (assignment.teamBName === oldName) assignment.teamBName = newName;
			return assignment;
		};

		if (wheel.currentAssignment) {
			setOps.currentAssignment = renameAssignment(wheel.currentAssignment);
		}
		if (Array.isArray(wheel.history)) {
			setOps.history = wheel.history.map(renameAssignment);
		}

		if (Object.keys(setOps).length > 0) {
			await wheelCollection.updateOne({ _id: "az-2026" }, { $set: setOps });
		}
	}

	await db.collection<{ _id: string; winner?: string }>("tournament_matches").updateMany({ winner: oldName }, { $set: { winner: newName } });
}

/**
 * Admin-only: deletes a team from bot_state.teams. The team's roster (the
 * `players` array) goes away with it — those applicants drop back to
 * "unassigned" in the roster builder. Any stored match scores referencing
 * this team stay (they're keyed by match-id, not team name).
 */
export async function DELETE(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) {
		return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	}

	const key = new URL(request.url).searchParams.get("key")?.trim().toLowerCase();
	if (!key) {
		return NextResponse.json({ message: "Query-Parameter 'key' erforderlich." }, { status: 400 });
	}

	const db = await getDb();
	const doc = await db.collection<{ _id: string; teams?: Record<string, StoredTeam> }>("bot_state").findOne({ _id: "default" });

	if (!doc) {
		return NextResponse.json({ message: "Kein bot_state-Dokument gefunden." }, { status: 404 });
	}

	const team = doc.teams?.[key];
	if (!team) {
		return NextResponse.json({ message: "Team nicht gefunden." }, { status: 404 });
	}

	const warnings = await deleteDiscordTeamResources(team);

	await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, { $unset: { [`teams.${key}`]: "" } });

	return NextResponse.json({
		ok: true,
		key,
		warnings,
	});
}
