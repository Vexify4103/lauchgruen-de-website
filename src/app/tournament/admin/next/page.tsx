import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getFeedbackDashboard, listTournamentTemplates } from "@/lib/tournament-next";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { TournamentOperationsClient } from "./TournamentOperationsClient";

export default async function TournamentOperationsPage() {
	const session = await auth();
	if (!session?.user?.discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(session.user.discordId)) redirect("/tournament/admin");
	const [templates, feedback] = await Promise.all([listTournamentTemplates(), getFeedbackDashboard()]);
	return <div className="px-5 py-10 sm:py-14"><section className="mx-auto w-full max-w-6xl"><TournamentOperationsClient initialTemplates={templates} initialFeedback={feedback} /></section></div>;
}
