import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { writeAuditLog } from "@/lib/tournament-audit";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { isTestRosterModeActive } from "@/lib/test-data";
import { mainEventTeamCount, seedSlotLayout } from "@/lib/tournament-structure";
import { getPlayInOutcome } from "@/lib/tournament-play-in";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assignmentSchema = z.object({ group: z.string().regex(/^[A-P]$/), seed: z.number().int().min(1).max(32) }).nullable();
const payloadSchema = z.object({ assignments: z.record(z.string().min(1), assignmentSchema) });
type TeamDoc = { name: string; meta?: { group?: string; seed?: number } };
type BotStateDoc = { _id: string; teams?: Record<string, TeamDoc> };
type RosterDraftDoc = {
	_id: "default";
	teams?: Record<string, { group?: string | null; seed?: number | null }>;
	updatedAt?: string;
};

const ROSTER_DRAFT_COLLECTION = "tournament_roster_drafts";

export async function POST(request: Request) {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) return NextResponse.json({ message: "Nicht berechtigt." }, { status: 403 });
	const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Ungültige Gruppenzuteilung." }, { status: 400 });

	const settings = await getTournamentSettings();
	const layout = seedSlotLayout(settings.ultimateBravery);
	if (!layout) return NextResponse.json({ message: "Das aktuelle Tag-1-Format braucht weder Gruppen noch eine Setzliste." }, { status: 409 });
	const plannedTeamCount = mainEventTeamCount(settings.ultimateBravery);
	const validGroups = new Set(Array.from({ length: layout.groupCount }, (_, index) => String.fromCharCode(65 + index)));
	const baseGroupSize = Math.floor(plannedTeamCount / layout.groupCount);
	const largerGroups = plannedTeamCount % layout.groupCount;
	const groupSizes = new Map([...validGroups].map((group, index) => [group, baseGroupSize + (index < largerGroups ? 1 : 0)]));
	const slots = new Set<string>();
	for (const assignment of Object.values(parsed.data.assignments)) {
		if (!assignment) continue;
		if (!validGroups.has(assignment.group)) return NextResponse.json({ message: `Gruppe ${assignment.group} ist nicht konfiguriert.` }, { status: 400 });
		if (assignment.seed > (groupSizes.get(assignment.group) ?? 0)) {
			return NextResponse.json({ message: `Seed ${assignment.seed} liegt außerhalb von Gruppe ${assignment.group}.` }, { status: 400 });
		}
		const slot = `${assignment.group}-${assignment.seed}`;
		if (slots.has(slot)) return NextResponse.json({ message: `Gruppe ${assignment.group}, Seed ${assignment.seed} wurde doppelt belegt.` }, { status: 409 });
		slots.add(slot);
	}

	const db = await getDb();
	const collection = db.collection<BotStateDoc>("bot_state");
	const [doc, testModeActive] = await Promise.all([collection.findOne({ _id: "default" }), isTestRosterModeActive()]);
	const teams = doc?.teams ?? {};
	const unknown = Object.keys(parsed.data.assignments).filter((teamKey) => !teams[teamKey]);
	if (unknown.length) return NextResponse.json({ message: `Unbekannte Teams: ${unknown.join(", ")}` }, { status: 404 });
	if (settings.ultimateBravery.playInTeamCount > 0) {
		// Play-in losers never get a Day-1 slot; teams still in the play-in only after they won.
		const playIn = await getPlayInOutcome(settings.activeTournament.id, settings.ultimateBravery.bestOf.dayOne);
		const blocked = new Set([
			...(playIn?.eliminated ?? []),
			...(playIn?.pairs ?? []).flatMap((pair) => [pair.teamAName, pair.teamBName]).filter((name) => !playIn?.qualified.includes(name)),
		]);
		const blockedAssigned = Object.entries(parsed.data.assignments).filter(([teamKey, assignment]) => assignment && blocked.has(teams[teamKey]?.name ?? ""));
		if (blockedAssigned.length) {
			return NextResponse.json(
				{
					message: `Diese Teams haben (noch) keinen Tag-1-Platz, weil sie im Play-in stehen oder ausgeschieden sind: ${blockedAssigned.map(([teamKey]) => teams[teamKey].name).join(", ")}.`,
				},
				{ status: 409 }
			);
		}
	}

	if (testModeActive) {
		const $set: Record<string, unknown> = {};
		const $unset: Record<string, ""> = {};
		for (const teamKey of Object.keys(teams)) {
			const assignment = parsed.data.assignments[teamKey] ?? null;
			if (assignment) {
				$set[`teams.${teamKey}.meta.group`] = assignment.group;
				$set[`teams.${teamKey}.meta.seed`] = assignment.seed;
			} else {
				$unset[`teams.${teamKey}.meta.group`] = "";
				$unset[`teams.${teamKey}.meta.seed`] = "";
			}
		}
		await collection.updateOne({ _id: "default" }, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) });
	} else {
		const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
		for (const teamKey of Object.keys(teams)) {
			const assignment = parsed.data.assignments[teamKey] ?? null;
			$set[`teams.${teamKey}.group`] = assignment?.group ?? null;
			$set[`teams.${teamKey}.seed`] = assignment?.seed ?? null;
		}
		await db.collection<RosterDraftDoc>(ROSTER_DRAFT_COLLECTION).updateOne({ _id: "default" }, { $set }, { upsert: true });
	}
	await writeAuditLog({
		action: "roster.groups_updated",
		targetType: "roster",
		targetId: "groups",
		summary: `${slots.size} Team(s) auf ${validGroups.size} Gruppe(n) verteilt${testModeActive ? " (Testmodus)" : " und als Entwurf gespeichert"}.`,
		actorDiscordId: discordId,
		actorLabel: session.user.discordHandle ?? discordId,
	});
	return NextResponse.json({ ok: true, assigned: slots.size, groups: validGroups.size });
}
