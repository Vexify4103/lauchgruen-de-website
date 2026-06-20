"use client";

import { useState } from "react";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

type PreferenceGroupView = {
	code: string;
	memberCount: number;
	maxMembers: number;
};

export function PreferenceGroupCard({ initialGroup, hasApplication }: { initialGroup: PreferenceGroupView | null; hasApplication: boolean }) {
	const [group, setGroup] = useState(initialGroup);
	const [joinCode, setJoinCode] = useState("");
	const [pending, setPending] = useState<"create" | "join" | "leave" | null>(null);
	const [confirmJoinCode, setConfirmJoinCode] = useState("");
	const [message, setMessage] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);
	const [copied, setCopied] = useState(false);

	async function mutate(action: "create" | "join" | "leave", code?: string): Promise<boolean> {
		setPending(action);
		setMessage(null);
		try {
			const response = await fetch("/api/tournament/preference-group", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action, ...(code ? { code } : {}) }),
			});
			const payload = (await response.json()) as {
				group?: PreferenceGroupView | null;
				message?: string;
			};
			if (!response.ok) {
				throw new Error(payload.message ?? "Aktion fehlgeschlagen.");
			}
			setGroup(payload.group ?? null);
			if (action === "join") setJoinCode("");
			setMessage({
				tone: "ok",
				text: payload.message ?? "Wunschduo aktualisiert.",
			});
			return true;
		} catch (error) {
			setMessage({
				tone: "error",
				text: error instanceof Error ? error.message : "Wunschduo konnte nicht aktualisiert werden.",
			});
			return false;
		} finally {
			setPending(null);
		}
	}

	useUnsavedChanges({
		dirty: Boolean(joinCode.trim()),
		label: "Wunschduo-Code",
		save: () => mutate("join", joinCode),
	});

	function requestJoinConfirmation() {
		const code = joinCode.trim().toUpperCase();
		if (!code) return;
		setConfirmJoinCode(code);
	}

	function cancelJoinConfirmation() {
		setConfirmJoinCode("");
		setJoinCode("");
	}

	async function confirmJoinPreferenceGroup() {
		const code = confirmJoinCode;
		setConfirmJoinCode("");
		await mutate("join", code);
	}

	async function copyCode() {
		if (!group) return;
		await navigator.clipboard.writeText(group.code);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	}

	return (
		<section className="rounded-[2rem] border border-cyan-200/14 bg-cyan-300/[0.045] p-5 shadow-xl shadow-black/20 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/64">Wunschduo</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Mit Freunden zusammenspielen</h2>
				</div>
				{group ? (
					<span className="rounded-full border border-cyan-200/18 bg-cyan-300/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50/74">
						{group.memberCount}/{group.maxMembers} Personen
					</span>
				) : null}
			</div>

			<p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-100/60">
				Teile deinen privaten Code mit bis zu vier anderen Bewerbern. Die Orga sieht euren Wunsch beim Team-Building, eine gemeinsame Einteilung kann wegen der Balance aber
				nicht garantiert werden.
			</p>

			{!hasApplication ? (
				<div className="mt-5 rounded-2xl border border-amber-200/18 bg-amber-200/[0.07] p-4 text-sm text-amber-50/76">
					Speichere zuerst deine Turnierbewerbung, um ein Wunschduo zu erstellen oder einem Code beizutreten.
				</div>
			) : group ? (
				<div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
					<button
						type="button"
						onClick={copyCode}
						className="group flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-cyan-200/20 bg-black/20 px-5 py-4 text-left transition hover:border-cyan-200/38"
					>
						<span>
							<span className="block text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/42">Dein privater Code</span>
							<span className="mt-1 block font-mono text-2xl font-black tracking-[0.16em] text-cyan-50">{group.code}</span>
						</span>
						<span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/62 group-hover:text-cyan-50">
							{copied ? "Kopiert" : "Kopieren"}
						</span>
					</button>
					<button
						type="button"
						onClick={() => mutate("leave")}
						disabled={pending !== null}
						className="rounded-2xl border border-red-200/16 bg-red-500/[0.06] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-red-100/72 transition hover:border-red-200/30 hover:text-red-50 disabled:opacity-50"
					>
						{pending === "leave" ? "Wird verlassen…" : "Gruppe verlassen"}
					</button>
				</div>
			) : (
				<div className="mt-5 grid gap-4 lg:grid-cols-2">
					<div className="rounded-2xl border border-white/9 bg-black/18 p-4">
						<div className="text-sm font-black text-emerald-50">Neues Wunschduo</div>
						<p className="mt-1 text-xs leading-5 text-emerald-100/48">Erzeuge einen Code und teile ihn privat mit deinen Mitspielern.</p>
						<button
							type="button"
							onClick={() => mutate("create")}
							disabled={pending !== null}
							className="mt-4 rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-50"
						>
							{pending === "create" ? "Code wird erstellt…" : "Code erstellen"}
						</button>
					</div>

					<form
						className="rounded-2xl border border-white/9 bg-black/18 p-4"
						onSubmit={(event) => {
							event.preventDefault();
							requestJoinConfirmation();
						}}
					>
						<label htmlFor="preference-group-code" className="text-sm font-black text-emerald-50">
							Bestehendem Code beitreten
						</label>
						<p className="mt-1 text-xs leading-5 text-emerald-100/48">Den Code erhältst du direkt von deiner Wunschduo-Person.</p>
						<div className="mt-4 flex gap-2">
							<input
								id="preference-group-code"
								value={joinCode}
								onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
								placeholder="LG-XXXXXX"
								autoComplete="off"
								maxLength={20}
								className="min-w-0 flex-1 rounded-xl border border-white/12 bg-black/28 px-4 py-3 font-mono text-sm font-black uppercase tracking-[0.12em] text-emerald-50 outline-none placeholder:text-emerald-100/24 focus:border-cyan-200/38"
							/>
							<button
								type="submit"
								disabled={pending !== null || !joinCode.trim()}
								className="rounded-xl border border-cyan-200/22 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 disabled:opacity-40"
							>
								{pending === "join" ? "…" : "Beitreten"}
							</button>
						</div>
					</form>
				</div>
			)}

			{confirmJoinCode ? (
				<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center px-5">
					<button type="button" aria-label="Hinweis schließen" onClick={cancelJoinConfirmation} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
					<div className="relative w-full max-w-xl rounded-[2rem] border border-amber-200/24 bg-gradient-to-br from-emerald-950 via-emerald-950 to-black p-6 shadow-2xl shadow-black/60">
						<div className="text-xs font-black uppercase tracking-[0.28em] text-amber-200/72">Wunschduo beitreten</div>
						<h3 className="mt-3 text-2xl font-black text-emerald-50">Wichtig vor dem Beitritt</h3>
						<p className="mt-3 text-sm leading-6 text-emerald-100/68">
							Wunschduos sind <strong className="font-black text-amber-100">nicht garantiert</strong>. Die Orga versucht, euer Duo beim Team-Building zu
							berücksichtigen, aber faire Team-Balance hat Vorrang.
						</p>
						<div className="mt-4 rounded-2xl border border-amber-200/18 bg-amber-200/[0.08] p-4 text-sm leading-6 text-amber-50/80">
							Mit <strong className="font-black text-amber-100">„Ich verstehe“</strong> akzeptierst du, dass Team-Fairness und Balancing wichtiger sind als diese
							Wunschduo. Du verzichtest außerdem darauf, später mit Staff-Mitgliedern darüber zu diskutieren, falls dein Wunschduo aus Balancing-Gründen nicht
							vollständig zusammen eingeteilt werden kann.
						</div>
						<p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100/56">
							Code: <span className="font-mono text-cyan-50">{confirmJoinCode}</span>
						</p>
						<div className="mt-6 flex flex-wrap justify-end gap-3">
							<button
								type="button"
								onClick={cancelJoinConfirmation}
								className="rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:border-white/24 hover:text-emerald-50"
							>
								Okay
							</button>
							<button
								type="button"
								onClick={confirmJoinPreferenceGroup}
								disabled={pending !== null}
								className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 shadow-xl shadow-lime-300/20 disabled:opacity-50"
							>
								{pending === "join" ? "Tritt bei…" : "Ich verstehe"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{message ? (
				<div
					className={`mt-4 rounded-xl border px-4 py-3 text-xs font-bold ${
						message.tone === "ok" ? "border-lime-200/20 bg-lime-200/[0.07] text-lime-50/80" : "border-red-200/20 bg-red-500/[0.07] text-red-100"
					}`}
				>
					{message.text}
				</div>
			) : null}
		</section>
	);
}
