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
				<div className="mt-6 grid gap-4 rounded-[2rem] border border-amber-200/18 bg-gradient-to-r from-amber-200/[0.075] via-[#08150e] to-cyan-200/[0.055] p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
					<div>
						<div className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-100/58">5v5-Systemprobe</div>
						<h2 className="mt-2 text-2xl font-black text-emerald-50">Eine Swiss-Paarung mit zehn echten Logins testen.</h2>
						<p className="mt-2 max-w-3xl text-xs leading-6 text-emerald-100/50">
							Teile den Teilnehmer-Link mit zehn Testern. Jeder belegt genau eine Rolle und kann ausschließlich den eigenen Roll bedienen; das Admin-Cockpit zeigt
							beide Teams und offene Reroll-Ausnahmen.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 md:justify-end">
						<Link
							href="/tournament/matches/ub-test"
							className="rounded-xl border border-white/12 bg-white/[0.045] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100 transition hover:border-lime-200/28 hover:text-lime-100"
						>
							Teilnehmer-Link öffnen
						</Link>
						<Link
							href="/tournament/admin/matches/ub-test"
							className="rounded-xl bg-gradient-to-r from-amber-200 to-cyan-200 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-emerald-950"
						>
							Admin-Cockpit öffnen
						</Link>
					</div>
				</div>
				<SwissDrawControl initialState={state} configuredRounds={settings.ultimateBravery.swissRounds} teams={teams.map((team) => team.name)} testTeams={teams} testMode />
			</section>
		</div>
	);
}
