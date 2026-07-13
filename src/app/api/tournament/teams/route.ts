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
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { enqueueDiscordJob } from "@/lib/discord-job-queue";
import { getDb } from "@/lib/mongo";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { getTournamentSettings } from "@/lib/tournament-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
	name: z.string().trim().min(2).max(60),
	group: z
		.string()
		.regex(/^[A-P]$/)
		.optional(),
	seed: z.coerce.number().int().min(1).max(4).optional(),
	accent: z.string().trim().max(120).optional(),
	createDiscordSetup: z.boolean().optional().default(false),
});

const patchSchema = z.object({
	key: z.string().trim().min(1),
	name: z.string().trim().min(2).max(60),
	group: z
		.string()
		.regex(/^[A-P]$/)
		.nullable()
		.optional(),
	seed: z.coerce.number().int().min(1).max(4).optional(),
});

function teamKey(name: string): string {
	return name.trim().toLowerCase();
}

function legacyOverlayId(name: string): string {
	return (
		name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "")
			.slice(0, 60) || "team"
	);
}

type StoredTeam = {
	name: string;
	players?: unknown[];
	playedChampions?: unknown[];
	roleId?: string;
	voiceChannelId?: string;
	textChannelId?: string;
	meta?: {
		group?: string;
		seed?: number;
		accent?: string;
		overlayId?: string;
		captain?: {
			discordId?: string;
		};
		lastCaptainRenameAt?: string;
	};
};

const CAPTAIN_TEAM_RENAME_COOLDOWN_MS = 10 * 60 * 1000;

function findGroupSeedConflict(teams: Record<string, StoredTeam>, group: string | undefined, seed: number | undefined, exceptKey: string) {
	if (!group || !seed) return null;
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

	const warnings: string[] = [];
	const teamDoc: Record<string, unknown> = {
		name: parsed.data.name.trim(),
		players: [],
		playedChampions: [],
	};
	const meta: Record<string, unknown> = {};
	if (parsed.data.accent) meta.accent = parsed.data.accent;
	meta.overlayId = randomUUID();
	if (Object.keys(meta).length > 0) teamDoc.meta = meta;

	await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, { $set: { [`teams.${key}`]: teamDoc } }, { upsert: true });
	const discordJob = parsed.data.createDiscordSetup
		? await enqueueDiscordJob({
				type: "team-provision",
				title: `Discord-Team erstellen: ${parsed.data.name.trim()}`,
				operations: [{ kind: "team-provision", teamKey: key, name: parsed.data.name.trim(), label: parsed.data.name.trim() }],
				actorLabel: session.user.discordHandle ?? discordId,
			})
		: null;

	return NextResponse.json({
		ok: true,
		key,
		name: parsed.data.name.trim(),
		group: undefined,
		seed: null,
		discordJob,
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

	const settings = await getTournamentSettings();
	const usesGroups = settings.ultimateBravery.dayOneFormat === "groups";
	const currentGroup = existing.meta?.group;
	const newGroup = usesGroups ? (isOwner ? (parsed.data.group ?? currentGroup) : currentGroup) : undefined;
	if (usesGroups && !newGroup) return NextResponse.json({ message: "Für eine Gruppenphase muss eine Gruppe gewählt werden." }, { status: 400 });
	const newSeed = usesGroups && isOwner ? parsed.data.seed : usesGroups ? existing.meta?.seed : undefined;
	const nameChanged = newName !== existing.name;

	if (nameChanged && isCaptain && !isOwner) {
		const lastRenameAt = existing.meta?.lastCaptainRenameAt ? new Date(existing.meta.lastCaptainRenameAt).getTime() : 0;
		const cooldownUntil = lastRenameAt + CAPTAIN_TEAM_RENAME_COOLDOWN_MS;
		const now = Date.now();
		if (lastRenameAt > 0 && now < cooldownUntil) {
			const remainingMinutes = Math.ceil((cooldownUntil - now) / 60_000);
			return NextResponse.json(
				{
					message: `Teamnamen können nur einmal alle 10 Minuten geändert werden. Bitte warte noch etwa ${remainingMinutes} Minute(n).`,
					cooldownUntil: new Date(cooldownUntil).toISOString(),
				},
				{ status: 429 }
			);
		}
	}

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
			// Preserve old browser-source links when a legacy team is renamed.
			overlayId: existing.meta?.overlayId ?? legacyOverlayId(existing.name),
			...(newGroup ? { group: newGroup } : {}),
			...(newSeed ? { seed: newSeed } : {}),
			...(nameChanged && isCaptain && !isOwner ? { lastCaptainRenameAt: new Date().toISOString() } : {}),
		},
	};
	if (!newGroup) delete nextTeam.meta?.group;
	if (!newSeed) {
		delete nextTeam.meta?.seed;
	}

	const duplicateSeedWarning =
		isOwner && conflictingTeam && newSeed ? `Achtung: Gruppe ${newGroup} Seed ${newSeed} ist bereits von "${conflictingTeam.team.name}" belegt.` : null;

	const warnings: string[] = [];
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

	if (nameChanged) {
		await migrateStoredTeamName(db, existing.name, newName);
	}
	const discordJob = nameChanged
		? await enqueueDiscordJob({
				type: "team-rename",
				title: `Discord-Team umbenennen: ${existing.name} → ${newName}`,
				operations: [
					{
						kind: "team-rename",
						teamKey: newKey,
						name: newName,
						roleId: existing.roleId,
						voiceChannelId: existing.voiceChannelId,
						textChannelId: existing.textChannelId,
						label: newName,
					},
				],
				actorLabel: session.user.discordHandle ?? discordId,
			})
		: null;

	return NextResponse.json({
		ok: true,
		key: newKey,
		name: newName,
		group: newGroup,
		seed: newSeed ?? null,
		discordJob,
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

	await db.collection<{ _id: string }>("bot_state").updateOne({ _id: "default" }, { $unset: { [`teams.${key}`]: "" } });
	const discordJob = await enqueueDiscordJob({
		type: "team-delete",
		title: `Discord-Team löschen: ${team.name}`,
		operations: [
			{
				kind: "team-delete",
				teamKey: key,
				roleId: team.roleId,
				voiceChannelId: team.voiceChannelId,
				textChannelId: team.textChannelId,
				label: team.name,
			},
		],
		actorLabel: session.user.discordHandle ?? discordId,
	});

	return NextResponse.json({
		ok: true,
		key,
		discordJob,
		warnings: [],
	});
}
