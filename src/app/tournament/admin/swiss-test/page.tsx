import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSwissStageState, listSwissTeams } from "@/lib/tournament-swiss";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { buildSwissTestTeams, SWISS_TEST_ID } from "@/lib/tournament-swiss-test";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { TournamentLink as Link } from "../../TournamentLink";
import { SwissDrawControl } from "../live/SwissDrawControl";

export default async function SwissTestPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	if (!discordId || !TOURNAMENT_OWNER_DISCORD_IDS.has(discordId)) redirect("/tournament/admin");
	const [state, settings, existingTeams] = await Promise.all([getSwissStageState(SWISS_TEST_ID), getTournamentSettings(), listSwissTeams()]);
	const teams = buildSwissTestTeams(settings.ultimateBravery.teamCount, existingTeams);

	return (
		<div className="px-5 py-10">
			<section className="mx-auto w-full max-w-7xl">
				<Link href="/tournament/admin/live" className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/70 hover:text-lime-100">
					← Zum Live-Cockpit
				</Link>
				<div className="mt-5 rounded-[2.3rem] border border-cyan-200/16 bg-gradient-to-br from-cyan-300/[0.09] via-[#07140d] to-lime-200/[0.06] p-7 shadow-2xl shadow-black/30 sm:p-9">
					<div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/58">Owner-Simulation</div>
					<h1 className="mt-3 text-4xl font-black text-emerald-50 sm:text-6xl">Swiss-Auslosung testen.</h1>
					<p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-100/56">
						Ziehe alle Matchups einzeln, trage Testsieger ein und beobachte, wie die Teams in ihre nächsten Bilanz-Brackets wechseln. Teamzahl und Rundenzahl stammen
						aus den aktuellen Admin-Einstellungen; bestehende Teamnamen werden übernommen.
					</p>
				</div>
				<SwissDrawControl initialState={state} configuredRounds={settings.ultimateBravery.swissRounds} teams={teams.map((team) => team.name)} testTeams={teams} testMode />
			</section>
		</div>
	);
}
