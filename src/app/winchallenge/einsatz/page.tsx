import type { Metadata } from "next";
import { DiscordSignInButton } from "@/app/tournament/DiscordSignInButton";
import { currentUser } from "@/lib/winchallenge/http";
import { EinsatzClient } from "./EinsatzClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Einsatz", robots: { index: false, follow: false } };

export default async function EinsatzPage() {
	const user = await currentUser();
	return (
		<div className="mx-auto grid max-w-3xl gap-6">
			<header>
				<p className="text-xs font-semibold text-[var(--accent)]">Win Challenge</p>
				<h1 className="mt-1 font-display text-3xl font-semibold text-[var(--text)]">Dein Einsatz</h1>
				<p className="mt-2 text-sm leading-6 text-[var(--muted)]">Nach dem Ende schenkt jeder einen Twitch-Sub an ein Team aus den Top 3. Hier siehst du, an wen, und wer dir etwas schenkt.</p>
			</header>
			{user ? (
				<EinsatzClient />
			) : (
				<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6">
					<p className="text-sm text-[var(--muted)]">Bitte mit Discord anmelden.</p>
					<DiscordSignInButton redirectTo="/winchallenge/einsatz" returnToCurrentPage className="button primary mt-4">
						Mit Discord anmelden
					</DiscordSignInButton>
				</section>
			)}
		</div>
	);
}
