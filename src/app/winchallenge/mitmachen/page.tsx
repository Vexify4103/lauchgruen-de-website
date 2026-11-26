import type { Metadata } from "next";
import { DiscordSignInButton } from "@/app/tournament/DiscordSignInButton";
import { currentUser } from "@/lib/winchallenge/http";
import { MitmachenClient } from "./MitmachenClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mitmachen", description: "Für die Win Challenge anmelden und ein Zweierteam bilden." };

export default async function MitmachenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const user = await currentUser();
	const params = await searchParams;
	const twitchStatus = typeof params.twitch === "string" ? params.twitch : null;
	return (
		<div className="mx-auto grid max-w-3xl gap-6">
			<header>
				<p className="text-xs font-semibold text-[var(--accent)]">Win Challenge</p>
				<h1 className="mt-1 font-display text-3xl font-semibold text-[var(--text)]">Mitmachen</h1>
				<p className="mt-2 text-sm leading-6 text-[var(--muted)]">Anmelden, Twitch verknüpfen und mit einem Partner ein Team bilden.</p>
			</header>
			{user ? (
				<MitmachenClient twitchStatus={twitchStatus} />
			) : (
				<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6">
					<h2 className="font-display text-lg font-semibold text-[var(--text)]">Schritt 1: Mit Discord anmelden</h2>
					<p className="mt-2 text-sm text-[var(--muted)]">Wir nutzen deinen Discord-Account, damit dein Team nur von euch beiden gesteuert werden kann.</p>
					<DiscordSignInButton redirectTo="/winchallenge/mitmachen" returnToCurrentPage className="button primary mt-4">
						Mit Discord anmelden
					</DiscordSignInButton>
				</section>
			)}
		</div>
	);
}
