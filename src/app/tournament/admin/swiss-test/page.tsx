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
				<div className="mb-[18px] grid gap-4 rounded-[20px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] via-[#08150e] p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
					<div>
						<div className="text-xs font-semibold text-[var(--muted)]">5v5-Systemprobe</div>
						<h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Swiss-Paarung mit zehn echten Logins testen</h2>
						<p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--muted)]">
							Teile den Teilnehmer-Link mit zehn Testern. Jeder belegt genau eine Rolle und kann ausschließlich den eigenen Roll bedienen; das Admin-Cockpit zeigt
							beide Teams und offene Reroll-Ausnahmen.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 md:justify-end">
						<Link
							href="/tournament/matches/ub-test"
							className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-4 py-3 text-center text-xs font-semibold text-[var(--text)] transition hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
						>
							Teilnehmer-Link öffnen
						</Link>
						<Link
							href="/tournament/admin/matches/ub-test"
							className="bg-[var(--accent)] rounded-xl px-4 py-3 text-center text-xs font-semibold text-[var(--on-accent)]"
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
