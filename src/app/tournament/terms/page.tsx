import { TournamentLink as Link } from "../TournamentLink";
import { getDefaultRuleSections } from "@/lib/tournament-rulebook";
import { TournamentMarkdown } from "@/components/TournamentMarkdown";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { PageIntro } from "@/components/site/PageIntro";

export default async function TournamentTermsPage() {
	const settings = await getTournamentSettings();
	const displayedRuleSections = getDefaultRuleSections(settings);
	return (
		<>
			<section className="page-section compact-top">
				<PageIntro kicker="Teilnahmebedingungen" title={`Regeln für ${settings.activeTournament.name}.`}>
					Diese Teilnahmebedingungen halten fest, was du mit deiner Bewerbung bestätigst.
				</PageIntro>

				<div className="grid max-w-5xl gap-4">
					{settings.activeTournament.rulesMarkdown?.trim() ? (
						<article className="content-panel">
							<TournamentMarkdown>{settings.activeTournament.rulesMarkdown}</TournamentMarkdown>
						</article>
					) : (
						displayedRuleSections.map((section, index) => (
							<article key={section.title} className="content-panel tight">
								<div className="flex gap-4">
									<span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-lime-200/18 bg-lime-200/10 text-sm font-black text-lime-100">
										{index + 1}
									</span>
									<div>
										<h2 className="text-lg font-black text-emerald-50">{section.title}</h2>
										<p className="mt-2 text-sm leading-7 text-emerald-100/70">{section.text}</p>
										{"list" in section && section.list && (
											<ul className="mt-2 space-y-1">
												{section.list.map((item, i) => (
													<li key={i} className="flex gap-2 text-sm leading-7 text-emerald-100/70">
														<span className="shrink-0 text-lime-300/60">–</span>
														{item}
													</li>
												))}
											</ul>
										)}
										{"footer" in section && section.footer && <p className="mt-2 text-sm leading-7 text-emerald-100/50">{section.footer}</p>}
									</div>
								</div>
							</article>
						))
					)}

					<article className="rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.06] p-5 shadow-xl shadow-black/20">
						<h2 className="text-xs font-black uppercase tracking-[0.28em] text-amber-100/72">Zustimmung bei Bewerbung</h2>
						<p className="mt-4 text-sm leading-7 text-amber-50/82">
							Wenn du auf &quot;Bewerbung absenden&quot; klickst, bestätigst du, dass du diese Teilnahmebedingungen und die Datenschutzhinweise gelesen hast und mit
							der Verarbeitung deiner Turnierdaten für Organisation, Durchführung und Nachvollziehbarkeit des Events einverstanden bist.
						</p>
					</article>

					<div className="flex flex-wrap gap-3">
						<Link href="/tournament/privacy" className="button ghost">
							Datenschutz
						</Link>
						<Link href="/tournament/apply" className="button primary">
							Zur Bewerbung
						</Link>
					</div>
				</div>
			</section>
		</>
	);
}
