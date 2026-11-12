import { TournamentLink as Link } from "../TournamentLink";
import { getRuleCategories, getCustomRuleHeadings, getCustomRuleCategories, RULEBOOK_REVISION } from "@/lib/tournament-rulebook";
import { TournamentMarkdown } from "@/components/TournamentMarkdown";
import { getTournamentSettings } from "@/lib/tournament-settings";
import { PageIntro } from "@/components/site/PageIntro";
import { CopyRuleLink, RulesNavigation } from "./RulesNavigation";

export default async function TournamentTermsPage() {
	const settings = await getTournamentSettings();
	const customRules = settings.activeTournament.rulesMarkdown?.trim();
	const categories = getRuleCategories(settings);
	const headings = customRules ? getCustomRuleHeadings(customRules) : [];
	const navigation = customRules ? getCustomRuleCategories(customRules) : categories;
	const ruleCount = categories.reduce((sum, category) => sum + category.rules.length, 0);
	return (
		<section className="page-section compact-top rules-page" id="regelwerk">
			<PageIntro
				kicker="Das Regelwerk"
				title={
					<>
						Fair spielen.
						<br />
						Gut vorbereitet sein.
					</>
				}
			>
				Die Regeln für {settings.activeTournament.name}. Wähle ein Thema im Inhaltsverzeichnis oder lies das Regelwerk in Ruhe durch. Jede Regel lässt sich direkt
				verlinken.
			</PageIntro>
			<div className="rules-meta">
				<span>{settings.activeTournament.name}</span>
				{customRules ? (
					<span>Eigene Turnierregeln</span>
				) : (
					<>
						<span>
							{categories.length} Kategorien · {ruleCount} Regeln
						</span>
						<span>
							Stand: {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" }).format(new Date(`${RULEBOOK_REVISION}T12:00:00Z`))}
						</span>
					</>
				)}
			</div>
			<div className={`rules-layout${navigation.length ? "" : " without-navigation"}`}>
				{navigation.length ? <RulesNavigation categories={navigation} /> : null}
				<div className="rules-content">
					{customRules ? (
						<article className="content-panel rules-custom" id="eigene-regeln">
							<h2 className="rules-custom-title">Eigene Turnierregeln</h2>
							<TournamentMarkdown headingIds={headings.map((heading) => heading.id)}>{customRules}</TournamentMarkdown>
						</article>
					) : (
						categories.map((category) => (
							<section className="rules-category" id={category.id} aria-labelledby={`${category.id}-title`} key={category.id}>
								<header className="rules-category-header">
									<div>
										<p>
											{category.rules[0].number.toString().padStart(2, "0")} — {category.rules.at(-1)!.number.toString().padStart(2, "0")}
										</p>
										<h2 id={`${category.id}-title`}>{category.title}</h2>
									</div>
									<span>
										{category.rules.length} {category.rules.length === 1 ? "Regel" : "Regeln"}
									</span>
								</header>
								{category.rules.map((rule) => (
									<article id={rule.id} key={rule.id} className="rule-card" aria-labelledby={`${rule.id}-title`}>
										<header className="rule-card-header">
											<span className="rule-number" aria-label={`Regel ${rule.number}`}>
												{rule.number.toString().padStart(2, "0")}
											</span>
											<h3 id={`${rule.id}-title`}>{rule.title}</h3>
											<CopyRuleLink id={rule.id} title={rule.title} />
										</header>
										<div className="rule-card-body">
											<p>{rule.text}</p>
											{rule.list?.length ? (
												<ul>
													{rule.list.map((item) => (
														<li key={item}>{item}</li>
													))}
												</ul>
											) : null}
											{rule.footer ? <p className="rule-note">{rule.footer}</p> : null}
										</div>
									</article>
								))}
							</section>
						))
					)}
					<article className="rules-consent">
						<p className="rules-nav-label">Vor dem Absenden</p>
						<h2>Zustimmung bei Bewerbung</h2>
						<p>
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
			</div>
		</section>
	);
}
