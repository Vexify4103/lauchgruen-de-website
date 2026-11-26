import type { Metadata } from "next";
import { DiscordSignInButton } from "@/app/tournament/DiscordSignInButton";
import { currentUser } from "@/lib/winchallenge/http";
import { ControlClient } from "./ControlClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Steuerung", robots: { index: false, follow: false } };

export default async function ControlPage() {
	const user = await currentUser();
	if (!user) {
		return (
			<section className="mx-auto max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6">
				<h1 className="font-display text-2xl font-semibold text-[var(--text)]">Steuerung</h1>
				<p className="mt-2 text-sm text-[var(--muted)]">Bitte mit Discord anmelden, um euren Timer zu steuern.</p>
				<DiscordSignInButton redirectTo="/winchallenge/control" returnToCurrentPage className="button primary mt-4">
					Mit Discord anmelden
				</DiscordSignInButton>
			</section>
		);
	}
	return <ControlClient />;
}
