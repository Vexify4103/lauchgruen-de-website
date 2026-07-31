import { TournamentLink as Link } from "../../TournamentLink";
import { auth } from "@/lib/auth";
import { TOURNAMENT_OWNER_DISCORD_IDS } from "@/lib/tournament-storage";
import { loadRosterSnapshot } from "@/lib/roster";
import { RosterBuilder } from "./RosterBuilder";
import { getAdminVersion } from "@/lib/admin-version";
import { RefreshRanksButton } from "../applicants/RefreshRanksButton";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { DiscordSignInButton } from "../../DiscordSignInButton";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
	const session = await auth();
	const discordId = session?.user?.discordId;
	const isOwner = Boolean(discordId && TOURNAMENT_OWNER_DISCORD_IDS.has(discordId));

	if (!isOwner) {
		return (
			<div className="px-5 py-10 sm:py-14">
				<section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-amber-200/24 bg-amber-200/10 p-6 text-sm leading-7 text-amber-50">
					<p>Melde dich mit einem Owner-Discord-Account an, um Rosters auszubalancieren.</p>
					<div className="mt-4">
						<DiscordSignInButton
							redirectTo="/tournament/admin/roster"
							pendingLabel="Weiter zu Discord..."
							className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-amber-950 disabled:cursor-wait disabled:opacity-65"
						>
							Mit Discord anmelden
						</DiscordSignInButton>
					</div>
				</section>
			</div>
		);
	}

	const [snapshot, version, settings] = await Promise.all([loadRosterSnapshot(), getAdminVersion("roster"), getTournamentSettings()]);

	return (
		<div className="relative overflow-hidden px-5 py-8 sm:py-10">
			<div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_18%_0%,rgba(190,242,100,0.09),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(34,211,238,0.07),transparent_30%)]" />
			<section className="relative mx-auto w-full max-w-[96rem]">
				<header className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#09170f]/90 shadow-2xl shadow-black/25">
					<div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
						<div className="max-w-3xl">
							<div className="text-[10px] font-black uppercase tracking-[0.32em] text-lime-200/58">Turnierorganisation · Roster</div>
							<h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-emerald-50 sm:text-6xl">
								Teams bauen.
								<br />
								<span className="text-emerald-100/38">Balance sehen.</span>
							</h1>
							<p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-100/58">
								Spieler zuweisen, Wunschduos prüfen und Teamstärken vergleichen. Änderungen werden erst mit „Roster speichern“ übernommen.
							</p>
						</div>
						<div className="flex flex-wrap items-start gap-2 lg:justify-end">
							<RefreshRanksButton label="Alle Spielerdaten aktualisieren" confirmBulk />
							<Link
								href="/tournament/admin"
								className="rounded-2xl border border-white/14 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
							>
								← Zurück zum Admin
							</Link>
						</div>
					</div>
					<div className="grid grid-cols-3 border-t border-white/8 bg-black/14 text-center">
						<HeaderStat label="Bewerber" value={snapshot.applicants.length} />
						<HeaderStat label="Teams" value={snapshot.teams.length} />
						<HeaderStat label="Zugewiesen" value={snapshot.teams.reduce((total, team) => total + team.players.length, 0)} />
					</div>
				</header>

				<div className="mt-6">
					<RosterBuilder
						snapshot={snapshot}
						initialVersion={version}
						dayOneFormat={settings.ultimateBravery.dayOneFormat}
						groupCount={settings.ultimateBravery.groupCount}
						plannedTeamCount={settings.ultimateBravery.teamCount}
					/>
				</div>
			</section>
		</div>
	);
}

function HeaderStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="border-r border-white/8 px-3 py-3 last:border-r-0 sm:px-5">
			<div className="text-lg font-black tabular-nums text-emerald-50 sm:text-2xl">{value}</div>
			<div className="mt-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-100/36 sm:text-[9px]">{label}</div>
		</div>
	);
}
