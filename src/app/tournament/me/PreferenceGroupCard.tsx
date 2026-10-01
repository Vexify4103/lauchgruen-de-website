"use client";

import { useState } from "react";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
				text: payload.message ?? "Wunschgruppe aktualisiert.",
			});
			return true;
		} catch (error) {
			setMessage({
				tone: "error",
				text: error instanceof Error ? error.message : "Wunschgruppe konnte nicht aktualisiert werden.",
			});
			return false;
		} finally {
			setPending(null);
		}
	}

	useUnsavedChanges({
		dirty: Boolean(joinCode.trim()),
		label: "Wunschgruppen-Code",
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
		<section className="account-section" aria-labelledby="group-hub-title">
			<div className="account-section-head">
				<div>
					<span>Wunschgruppe</span>
					<h2 id="group-hub-title">Mit Freunden spielen</h2>
				</div>
				<small>Ein bis fünf Personen. Die Orga berücksichtigt euren Wunsch, Team-Balance hat aber Vorrang.</small>
			</div>

			{group ? (
				<div className="my-group-card">
					<div>
						<span>Deine Wunschgruppe</span>
						<strong>
							{group.memberCount}/{group.maxMembers} Personen
						</strong>
					</div>
					<footer>
						<code>{group.code}</code>
						<button type="button" className="connection-action" onClick={copyCode}>
							{copied ? "Kopiert ✓" : "Code kopieren"}
						</button>
						<button type="button" className="connection-action danger" onClick={() => mutate("leave")} disabled={pending !== null}>
							{pending === "leave" ? "Wird verlassen…" : "Verlassen"}
						</button>
					</footer>
				</div>
			) : (
				<div className="group-hub-grid">
					<section data-disabled={!hasApplication}>
						<span className="group-hub-step">01 · Erstellen</span>
						<h3>Neuen Code erzeugen</h3>
						<p>Erstelle einen privaten Code und teile ihn mit bis zu vier Mitspielern.</p>
						<button type="button" className="button primary small justify-self-start" onClick={() => mutate("create")} disabled={!hasApplication || pending !== null}>
							{pending === "create" ? "Code wird erstellt…" : "Code erstellen"}
						</button>
					</section>
					<form
						data-disabled={!hasApplication}
						onSubmit={(event) => {
							event.preventDefault();
							requestJoinConfirmation();
						}}
					>
						<span className="group-hub-step">02 · Beitreten</span>
						<h3>
							<label htmlFor="preference-group-code">Code erhalten?</label>
						</h3>
						<p>Den Code bekommst du von einem Mitglied der Wunschgruppe.</p>
						<div className="connection-form">
							<input
								id="preference-group-code"
								name="preference-group-code"
								spellCheck={false}
								value={joinCode}
								onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
								placeholder="LG-XXXXXX…"
								autoComplete="off"
								maxLength={20}
								disabled={!hasApplication}
								className="account-input font-mono uppercase tracking-[0.12em]"
							/>
							<button type="submit" className="connection-action solid" disabled={!hasApplication || pending !== null || !joinCode.trim()}>
								{pending === "join" ? "Tritt bei…" : "Beitreten"}
							</button>
						</div>
					</form>
				</div>
			)}
			{!hasApplication ? <p className="account-note">Speichere zuerst deine Turnierbewerbung, dann kannst du eine Wunschgruppe erstellen oder beitreten.</p> : null}

			{message ? (
				<p role="status" className="account-message" data-tone={message.tone === "error" ? "error" : undefined}>
					{message.text}
				</p>
			) : null}

			<ConfirmDialog
				open={Boolean(confirmJoinCode)}
				title="Wichtig vor dem Beitritt"
				description={
					<>
						Wunschgruppen sind <strong>nicht garantiert</strong>. Die Orga versucht, eure Gruppe beim Team-Building zu berücksichtigen, aber faire Team-Balance hat
						Vorrang; die Gruppe kann teilweise oder ganz aufgeteilt werden. Mit „Ich verstehe“ akzeptierst du das und verzichtest auf spätere Diskussionen mit dem Staff
						darüber. Code: <strong className="font-mono">{confirmJoinCode}</strong>
					</>
				}
				confirmLabel={pending === "join" ? "Tritt bei…" : "Ich verstehe"}
				cancelLabel="Abbrechen"
				onConfirm={() => void confirmJoinPreferenceGroup()}
				onCancel={cancelJoinConfirmation}
			/>
		</section>
	);
}
