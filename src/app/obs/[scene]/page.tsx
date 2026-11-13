import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isBroadcastScene } from "@/lib/tournament-broadcast";
import { BroadcastPlayer } from "@/components/obs/broadcast/BroadcastPlayer";
import { BroadcastSetup } from "@/components/obs/broadcast/BroadcastSetup";
import "../broadcast.css";

export const metadata: Metadata = { title: "Turnier Broadcast", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BroadcastPage({
	params,
	searchParams,
}: {
	params: Promise<{ scene: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { scene } = await params;
	const input = await searchParams;
	const query = new URLSearchParams();
	for (const key of ["team", "match", "demo", "source", "position"]) if (typeof input[key] === "string" && input[key].length <= 160) query.set(key, input[key]);
	if (scene === "broadcast") return <BroadcastSetup initialTeam={query.get("team") ?? ""} />;
	if (!isBroadcastScene(scene)) notFound();
	return <BroadcastPlayer key={`${scene}:${query}`} scene={scene} query={query.toString()} />;
}
