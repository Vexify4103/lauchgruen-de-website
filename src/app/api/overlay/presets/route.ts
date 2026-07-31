import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { communityOverlayParams, parseCommunityOverlayConfig } from "@/lib/community-overlay-config";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "community_overlay_presets";
const presetSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1).max(48),
	query: z.string().min(1).max(12_000),
});

type PresetDoc = {
	_id: string;
	discordId: string;
	name: string;
	query: string;
	createdAt: string;
	updatedAt: string;
};

async function currentDiscordId() {
	return (await auth())?.user?.discordId ?? null;
}

function publicPreset(doc: PresetDoc) {
	return { id: doc._id, name: doc.name, query: doc.query, updatedAt: doc.updatedAt };
}

export async function GET() {
	const discordId = await currentDiscordId();
	if (!discordId) return NextResponse.json({ presets: [], signedIn: false });
	const presets = await (await getDb())
		.collection<PresetDoc>(COLLECTION)
		.find({ discordId })
		.sort({ updatedAt: -1 })
		.limit(12)
		.toArray();
	return NextResponse.json({ presets: presets.map(publicPreset), signedIn: true });
}

export async function POST(request: Request) {
	const discordId = await currentDiscordId();
	if (!discordId) return NextResponse.json({ message: "Bitte zuerst mit Discord anmelden." }, { status: 401 });
	const parsed = presetSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ message: "Das Preset ist ungültig." }, { status: 400 });

	const normalizedConfig = parseCommunityOverlayConfig(new URLSearchParams(parsed.data.query));
	if (!normalizedConfig.accountId && !normalizedConfig.ingame.includes("#")) {
		return NextResponse.json({ message: "Das Preset benötigt einen Riot-Account." }, { status: 400 });
	}
	const query = communityOverlayParams(normalizedConfig).toString();
	const now = new Date().toISOString();
	const id = parsed.data.id ?? crypto.randomUUID();
	const collection = (await getDb()).collection<PresetDoc>(COLLECTION);
	if (!parsed.data.id && (await collection.countDocuments({ discordId })) >= 12) {
		return NextResponse.json({ message: "Du kannst maximal zwölf Presets speichern." }, { status: 409 });
	}
	await collection.updateOne(
		{ _id: id, discordId },
		{
			$set: { name: parsed.data.name, query, updatedAt: now },
			$setOnInsert: { _id: id, discordId, createdAt: now },
		},
		{ upsert: true }
	);
	const preset = await collection.findOne({ _id: id, discordId });
	return NextResponse.json({ preset: publicPreset(preset!) });
}

export async function DELETE(request: Request) {
	const discordId = await currentDiscordId();
	if (!discordId) return NextResponse.json({ message: "Nicht angemeldet." }, { status: 401 });
	const id = new URL(request.url).searchParams.get("id") ?? "";
	if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ message: "Ungültiges Preset." }, { status: 400 });
	await (await getDb()).collection<PresetDoc>(COLLECTION).deleteOne({ _id: id, discordId });
	return NextResponse.json({ ok: true });
}
