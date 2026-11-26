import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPublicChallenge } from "@/lib/winchallenge/view";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await params;
	const view = await buildPublicChallenge().catch(() => null);
	const team = view?.teams.find((entry) => entry.slug === slug);
	return { title: team ? team.name : "Team" };
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const view = await buildPublicChallenge().catch(() => null);
	if (!view?.teams.some((team) => team.slug === slug)) notFound();
	return <TeamClient slug={slug} initial={view} />;
}
