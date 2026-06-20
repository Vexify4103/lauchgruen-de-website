"use client";

import { useState, useTransition, type ReactNode } from "react";
import { TournamentLink as Link } from "../../TournamentLink";
import type { FeedbackDashboard, TournamentTemplate } from "@/lib/tournament-next";

type ApiResult = {
	message?: string;
	template?: TournamentTemplate;
	archive?: { championTeam: string };
	feedback?: FeedbackDashboard;
};

export function TournamentOperationsClient({ initialTemplates, initialFeedback }: { initialTemplates: TournamentTemplate[]; initialFeedback: FeedbackDashboard }) {
	const [templates, setTemplates] = useState(initialTemplates);
	const [message, setMessage] = useState("");
	const [pending, startTransition] = useTransition();

	async function send(payload: object): Promise<ApiResult> {
		const response = await fetch("/api/tournament/next", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		const json = (await response.json().catch(() => null)) as ApiResult | null;
		if (!response.ok) throw new Error(json?.message ?? "Aktion fehlgeschlagen.");
		return json ?? {};
	}

	function saveTemplate(data: FormData) {
		startTransition(async () => {
			try {
				const json = await send({
					action: "template",
					name: data.get("name"),
					game: "League of Legends",
					format: data.get("format"),
					teamCount: Number(data.get("teamCount")),
					groupCount: Number(data.get("groupCount")),
					doubleRoundRobin: data.get("doubleRoundRobin") === "on",
					draftMode: data.get("draftMode"),
					poolMode: data.get("poolMode"),
					notes: data.get("notes"),
				});
				if (json.template) setTemplates((items) => [json.template!, ...items]);
				setMessage("Turnier-Vorlage gespeichert.");
			} catch (error) {
				setMessage(error instanceof Error ? error.message : "Fehler");
			}
		});
	}

	function saveFeedback(data: FormData) {
		startTransition(async () => {
			try {
				await send({
					action: "feedback",
					formUrl: data.get("formUrl"),
					responses: Number(data.get("responses")),
					overallRating: optionalNumber(data, "overallRating"),
					balanceRating: optionalNumber(data, "balanceRating"),
					draftRating: optionalNumber(data, "draftRating"),
					websiteRating: optionalNumber(data, "websiteRating"),
					organisationRating: optionalNumber(data, "organisationRating"),
					highlights: data.get("highlights"),
					actions: data.get("actions"),
				});
				setMessage("Feedback-Auswertung gespeichert.");
			} catch (error) {
				setMessage(error instanceof Error ? error.message : "Fehler");
			}
		});
	}

	function archiveTournament(data: FormData) {
		startTransition(async () => {
			try {
				const json = await send({
					action: "archive-and-transition",
					confirmation: data.get("confirmation"),
					championTeam: data.get("championTeam"),
					finalistTeam: data.get("finalistTeam"),
					note: data.get("note"),
					vodUrl: data.get("vodUrl"),
					highlightUrl: data.get("highlightUrl"),
				});
				setMessage(`A-Z archiviert. Ultimate Bravery ist jetzt als Teaser aktiv. Hall of Fame: ${json.archive?.championTeam ?? "Turnier"}.`);
			} catch (error) {
				setMessage(error instanceof Error ? error.message : "Fehler");
			}
		});
	}

	return (
		<div>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/64">Turnier-Werkstatt</div>
					<h1 className="mt-3 text-4xl font-black text-emerald-50">Archiv, Gewinner, Vorlagen und Feedback.</h1>
					<p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-100/62">Vorlagen sind sichere Vorbereitung. Das Hall-of-Fame-Formular speichert Platz 1 und Platz 2 dauerhaft, ohne den laufenden Turnierstand anzutasten.</p>
				</div>
				<Link href="/tournament/admin" className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Zurück zum Admin</Link>
			</div>

			{message ? <div className="mt-5 rounded-2xl border border-lime-200/18 bg-lime-200/8 p-4 text-sm font-bold text-lime-50">{message}</div> : null}

			<div className="mt-8 grid gap-6 xl:grid-cols-2">
				<Panel title="A-Z archivieren & Ultimate Bravery vorbereiten">
					<form action={archiveTournament} className="grid gap-3">
						<Input name="championTeam" label="Platz 1 · Gewinnerteam" placeholder="Teamname" required />
						<Input name="finalistTeam" label="Platz 2 · Finalist" placeholder="Teamname" />
						<Input name="vodUrl" label="VOD-Link (optional)" />
						<Input name="highlightUrl" label="Highlight-Link (optional)" />
						<textarea name="note" rows={3} placeholder="MVP, besondere Momente oder Turniernotiz" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50" />
						<div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-xs leading-6 text-red-50/82">
							Der öffentliche A-Z-Snapshot wird zuerst gespeichert. Danach werden aktive Bewerbungen, Matches, Pools, Drafts, Wunschduos und der aktive Teamstand geleert. Verifizierte Riot-Accounts, Twitch-Links und Blacklist bleiben erhalten.
						</div>
						<Input name="confirmation" label="Zum Bestätigen ARCHIVIEREN eingeben" placeholder="ARCHIVIEREN" required />
						<button disabled={pending} className="rounded-xl bg-red-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-red-950">A-Z archivieren und Teaser starten</button>
					</form>
				</Panel>

				<Panel title="Neue Turnier-Vorlage">
					<form action={saveTemplate} className="grid gap-3">
						<Input name="name" label="Vorlagenname" placeholder="z. B. Fearless Cup" required />
						<Input name="format" label="Format" value="Gruppenphase + Playoffs" />
						<div className="grid grid-cols-2 gap-3"><Input name="teamCount" label="Teams" type="number" value="8" /><Input name="groupCount" label="Gruppen" type="number" value="2" /></div>
						<label className="flex gap-2 text-sm font-bold text-emerald-100/72"><input name="doubleRoundRobin" type="checkbox" /> Hin- und Rückrunde</label>
						<select name="draftMode" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50"><option value="tournament">Tournament Draft</option><option value="none">Kein Web-Draft</option></select>
						<select name="poolMode" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50"><option value="az">A-Z-Pools</option><option value="none">Keine Pools</option></select>
						<textarea name="notes" rows={2} placeholder="Regeln / Ablauf / offene Aufgaben" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50" />
						<button disabled={pending} className="rounded-xl bg-lime-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">Vorlage speichern</button>
					</form>
					<div className="mt-4 grid gap-2">{templates.map((template) => <div key={template.id} className="rounded-xl border border-white/8 bg-black/18 p-3"><strong className="text-emerald-50">{template.name}</strong><p className="mt-1 text-xs text-emerald-100/52">{template.teamCount} Teams · {template.groupCount} Gruppen · {template.format}</p></div>)}</div>
				</Panel>

				<Panel title="Google-Forms-Auswertung">
					<form action={saveFeedback} className="grid gap-3">
						<Input name="formUrl" label="Google-Forms-Link" value={initialFeedback.formUrl} />
						<Input name="responses" label="Antworten" type="number" value={String(initialFeedback.responses)} />
						<div className="grid grid-cols-2 gap-3"><Input name="overallRating" label="Gesamtwertung" type="number" value={initialFeedback.overallRating?.toString()} /><Input name="balanceRating" label="Balance" type="number" value={initialFeedback.balanceRating?.toString()} /><Input name="draftRating" label="Draft" type="number" value={initialFeedback.draftRating?.toString()} /><Input name="websiteRating" label="Website" type="number" value={initialFeedback.websiteRating?.toString()} /><Input name="organisationRating" label="Organisation" type="number" value={initialFeedback.organisationRating?.toString()} /></div>
						<textarea name="highlights" rows={2} placeholder="Was kam besonders gut an?" defaultValue={initialFeedback.highlights} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50" />
						<textarea name="actions" rows={2} placeholder="Konkrete Änderungen fürs nächste Turnier" defaultValue={initialFeedback.actions} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-emerald-50" />
						<button disabled={pending} className="rounded-xl bg-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">Auswertung speichern</button>
					</form>
				</Panel>
			</div>
		</div>
	);
}

function optionalNumber(data: FormData, name: string) { const value = Number(data.get(name)); return Number.isFinite(value) && value > 0 ? value : undefined; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20"><div className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/64">{title}</div><div className="mt-4">{children}</div></section>; }
function Input({ label, name, value, placeholder, type = "text", required = false }: { label: string; name: string; value?: string; placeholder?: string; type?: string; required?: boolean }) { return <label className="grid gap-1.5 text-xs font-bold text-emerald-100/64">{label}<input name={name} type={type} defaultValue={value} placeholder={placeholder} required={required || ["title", "season", "dateLabel", "format"].includes(name)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-emerald-50 outline-none focus:border-lime-200/40" /></label>; }
