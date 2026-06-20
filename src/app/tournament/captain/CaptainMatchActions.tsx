"use client";

import { useState, useTransition } from "react";

export function CaptainMatchActions({ matchId, teamName }: { matchId: string; teamName: string }) {
	const [checkedIn, setCheckedIn] = useState(false);
	const [reportOpen, setReportOpen] = useState(false);
	const [message, setMessage] = useState("");
	const [pending, startTransition] = useTransition();

	function checkIn() {
		startTransition(async () => {
			const response = await fetch("/api/tournament/next", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check-in", matchId, rosterConfirmed: true, rulesConfirmed: true }) });
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) return setMessage(json?.message ?? "Check-in konnte nicht gespeichert werden.");
			setCheckedIn(true); setMessage("Check-in gespeichert. Team und Regeln sind bestätigt.");
		});
	}

	function submitReport(formData: FormData) {
		startTransition(async () => {
			const response = await fetch("/api/tournament/next", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report", matchId, declaredWinner: formData.get("winner") === "yes", gameDuration: String(formData.get("duration") ?? ""), screenshotUrl: String(formData.get("screenshot") ?? ""), note: String(formData.get("note") ?? "") }) });
			const json = (await response.json().catch(() => null)) as { message?: string } | null;
			if (!response.ok) return setMessage(json?.message ?? "Match-Report konnte nicht gespeichert werden.");
			setReportOpen(false); setMessage("Match-Report gesendet. Die Orga kann ihn jetzt prüfen.");
		});
	}

	return <div className="mt-4 rounded-2xl border border-cyan-200/14 bg-cyan-300/[0.055] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/68">Captain-Check-in · {teamName}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={checkIn} disabled={pending || checkedIn} className="rounded-xl border border-lime-200/24 bg-lime-200/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-lime-100 disabled:opacity-50">{checkedIn ? "Eingecheckt" : "Team bereit bestätigen"}</button><button type="button" onClick={() => setReportOpen((open) => !open)} disabled={pending} className="rounded-xl border border-white/12 bg-black/18 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-emerald-100">Match-Report</button></div>{reportOpen ? <form action={submitReport} className="mt-4 grid gap-3"><label className="text-xs font-bold text-emerald-100/70">Hat {teamName} gewonnen?<select name="winner" className="mt-1 block w-full rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-emerald-50"><option value="yes">Ja</option><option value="no">Nein</option></select></label><input name="duration" placeholder="Spielzeit, z. B. 31:42" className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50" /><input name="screenshot" placeholder="Screenshot-Link (optional)" className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50" /><textarea name="note" rows={2} placeholder="Hinweis für die Orga (optional)" className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-sm text-emerald-50" /><button disabled={pending} className="rounded-xl bg-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950">Report senden</button></form> : null}{message ? <p className="mt-3 text-sm font-bold text-cyan-50/80">{message}</p> : null}<p className="mt-3 text-xs leading-5 text-emerald-100/46">Der Report unterstützt die Orga, ersetzt aber nicht die offizielle Ergebnisprüfung.</p></div>;
}
