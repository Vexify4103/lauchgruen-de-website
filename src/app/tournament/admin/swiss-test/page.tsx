import { redirect } from "next/navigation";
import { usesUltimateBravery } from "@/lib/tournament-kind";
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
		<>
			<section className="admin-panel">
				<div className="admin-panel-head !mb-3">
					<div>
						<span>Owner-Simulation</span>
						<h2>Swiss-Auslosung testen</h2>
					</div>
					<Link href="/tournament/admin/live" className="button ghost small">
						Zum Live-Cockpit
					</Link>
				</div>
				<p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
					Ziehe alle Matchups einzeln, trage Testsieger ein und beobachte, wie die Teams in ihre nächsten Bilanz-Brackets wechseln. Teamzahl und Rundenzahl stammen aus
					den aktuellen Admin-Einstellungen; bestehende Teamnamen werden übernommen.
				</p>
			</section>
			{usesUltimateBravery(settings.activeTournament) ? (
				<div className="mb-[18px] grid gap-4 rounded-[20px] border border-amber-200/18 bg-gradient-to-r from-amber-200/[0.075] via-[#08150e] to-cyan-200/[0.055] p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
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
			) : null}
			<SwissDrawControl initialState={state} configuredRounds={settings.ultimateBravery.swissRounds} teams={teams.map((team) => team.name)} testTeams={teams} testMode />
		</>
	);
}
