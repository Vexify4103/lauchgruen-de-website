"use client";

import { useEffect, useState } from "react";

export type RulesNavigationCategory = { id: string; title: string; rules: { id: string; title: string; number?: number }[] };

export function RulesNavigation({ categories }: { categories: RulesNavigationCategory[] }) {
	const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
	const [expanded, setExpanded] = useState<string | null>(categories[0]?.id ?? null);
	const activeCategory = categories.find((category) => category.id === activeId || category.rules.some((rule) => rule.id === activeId));
	useEffect(() => {
		const ids = categories.flatMap((category) => [category.id, ...category.rules.map((rule) => rule.id)]);
		let frame = 0;
		function update() {
			frame = 0;
			const offset = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 158) + 24;
			let current = ids[0] ?? "";
			for (const id of ids) {
				const element = document.getElementById(id);
				if (element && element.getBoundingClientRect().top <= offset) current = id;
			}
			setActiveId(current);
		}
		function schedule() {
			if (!frame) frame = requestAnimationFrame(update);
		}
		schedule();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		window.addEventListener("hashchange", schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			window.removeEventListener("hashchange", schedule);
		};
	}, [categories]);
	function links() {
		return categories.map((category) => (
			<div className="rules-nav-category" key={category.id} data-current={activeCategory?.id === category.id || undefined}>
				<div className="rules-nav-category-title">
					<a href={`#${category.id}`} onClick={() => setExpanded(category.id)} aria-current={activeCategory?.id === category.id ? "location" : undefined}>
						<i aria-hidden="true" />
						{category.title}
					</a>
					<button
						type="button"
						aria-label={`${category.title}: Regeln ${expanded === category.id ? "einklappen" : "anzeigen"}`}
						aria-expanded={expanded === category.id}
						onClick={() => setExpanded(expanded === category.id ? null : category.id)}
					>
						<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
							<path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
						</svg>
					</button>
				</div>
				<ul hidden={expanded !== category.id}>
					{category.rules.map((rule) => (
						<li key={rule.id}>
							<a href={`#${rule.id}`} aria-current={activeId === rule.id ? "location" : undefined}>
								{rule.number ? <span>{rule.number.toString().padStart(2, "0")}</span> : null}
								{rule.title}
							</a>
						</li>
					))}
				</ul>
			</div>
		));
	}
	return (
		<aside className="rules-sidebar">
			<nav className="rules-desktop-nav" aria-label="Regelkategorien">
				<p className="rules-nav-label">Inhaltsverzeichnis</p>
				{links()}
				<a className="rules-nav-top" href="#regelwerk">
					Zurück zum Anfang ↑
				</a>
			</nav>
			<details className="rules-mobile-nav">
				<summary>
					Inhaltsverzeichnis <span>{categories.length} Kategorien</span>
				</summary>
				<nav aria-label="Regelkategorien mobil">{links()}</nav>
			</details>
		</aside>
	);
}

export function CopyRuleLink({ id, title }: { id: string; title: string }) {
	const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
	useEffect(() => {
		if (status === "idle") return;
		const timer = window.setTimeout(() => setStatus("idle"), 2500);
		return () => window.clearTimeout(timer);
	}, [status]);
	async function copy() {
		try {
			const url = new URL(window.location.href);
			url.hash = id;
			await navigator.clipboard.writeText(url.toString());
			setStatus("copied");
		} catch {
			setStatus("error");
		}
	}
	return (
		<span className="rule-link-control">
			<button type="button" onClick={copy} aria-label={`Link kopieren: ${title}`}>
				<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
					<path
						d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 4 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"
						transform="translate(2 1)"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>
				<span>{status === "copied" ? "Kopiert" : "Link kopieren"}</span>
			</button>
			<span className="rule-copy-status" role="status">
				{status === "copied" ? (
					"Link kopiert."
				) : status === "error" ? (
					<>
						Kopieren nicht möglich. <a href={`#${id}`}>Direktlink öffnen</a>
					</>
				) : (
					""
				)}
			</span>
		</span>
	);
}
