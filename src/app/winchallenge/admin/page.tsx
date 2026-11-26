import type { Metadata } from "next";
import { DiscordSignInButton } from "@/app/tournament/DiscordSignInButton";
import { currentUser } from "@/lib/winchallenge/http";
import { WinAdminClient } from "./WinAdminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function WinChallengeAdminPage() {
	const user = await currentUser();
	if (!user) {
		return (
			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6">
				<h1 className="font-display text-2xl font-semibold text-[var(--text)]">Win Challenge Admin</h1>
				<p className="mt-2 text-sm text-[var(--muted)]">Bitte mit Discord anmelden.</p>
				<DiscordSignInButton redirectTo="/winchallenge/admin" returnToCurrentPage className="button primary mt-4">
					Mit Discord anmelden
				</DiscordSignInButton>
			</section>
		);
	}
	if (!user.isOwner) {
		return (
			<section className="rounded-2xl border border-[var(--line)] bg-[var(--panel-solid)] p-6">
				<h1 className="font-display text-2xl font-semibold text-[var(--text)]">Kein Zugriff</h1>
				<p className="mt-2 text-sm text-[var(--muted)]">Diese Seite ist nur für die Orga.</p>
			</section>
		);
	}
	return <WinAdminClient />;
}
