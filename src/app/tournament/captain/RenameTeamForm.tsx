"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

export function RenameTeamForm({ teamKey, initialName }: { teamKey: string; initialName: string }) {
	const router = useRouter();
	const [name, setName] = useState(initialName);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);
	const [savedName, setSavedName] = useState(initialName);

	async function saveName(): Promise<boolean> {
		const nextName = name.trim();
		if (nextName === savedName) return true;
		if (nextName.length < 2) {
			setMessage({
				tone: "error",
				text: "Der Teamname muss mindestens zwei Zeichen lang sein.",
			});
			return false;
		}

		setSaving(true);
		setMessage(null);
		const response = await fetch("/api/tournament/teams", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ key: teamKey, name: nextName }),
		});
		const result = (await response.json().catch(() => null)) as { message?: string; warnings?: string[] } | null;
		setSaving(false);

		if (!response.ok) {
			setMessage({
				tone: "error",
				text: result?.message ?? "Der Teamname konnte nicht geändert werden.",
			});
			return false;
		}

		const warnings = result?.warnings ?? [];
		setMessage({
			tone: warnings.length > 0 ? "error" : "ok",
			text: warnings.length > 0 ? `Teamname geändert. ${warnings.join(" ")}` : "Teamname und Discord-Ressourcen wurden geändert.",
		});
		setSavedName(nextName);
		router.refresh();
		return true;
	}

	useUnsavedChanges({
		dirty: name.trim() !== savedName,
		label: "Teamname",
		save: saveName,
	});

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void saveName();
	}

	return (
		<form onSubmit={submit} className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-5">
			<h2 className="text-lg font-semibold text-[var(--text)]">Teamname</h2>
			<p className="mt-1 text-sm leading-6 text-[var(--muted)]">Gilt auch für eure Discord-Rolle und beide Teamchannels.</p>
			<div className="mt-4 flex flex-col gap-3 sm:flex-row">
				<input
					name="team-name"
					aria-label="Neuer Teamname"
					autoComplete="off"
					value={name}
					onChange={(event) => setName(event.target.value)}
					minLength={2}
					maxLength={60}
					required
					className="min-w-0 flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
				/>
				<button
					type="submit"
					disabled={saving || name.trim() === savedName || name.trim().length < 2}
					className="rounded-[10px] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
				>
					{saving ? "Wird geändert…" : "Namen ändern"}
				</button>
			</div>
			{message ? (
<p role="status" className={`mt-3 text-sm ${message.tone === "ok" ? "text-[var(--accent)]" : "text-[var(--amber)]"}`}>
					{message.text}
				</p>
			) : null}
		</form>
	);
}
