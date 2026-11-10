"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { isValidTeamTag, normalizeTeamTag, TEAM_TAG_MAX } from "@/lib/team-tag";

export function RenameTeamForm({ teamKey, initialName, initialTag }: { teamKey: string; initialName: string; initialTag: string }) {
	const router = useRouter();
	const [name, setName] = useState(initialName);
	const [tag, setTag] = useState(initialTag);
	const [savedTag, setSavedTag] = useState(initialTag);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{
		tone: "ok" | "error";
		text: string;
	} | null>(null);
	const [savedName, setSavedName] = useState(initialName);

	async function saveName(): Promise<boolean> {
		const nextName = name.trim();
		const nextTag = normalizeTeamTag(tag);
		if (nextName === savedName && nextTag === savedTag) return true;
		if (!isValidTeamTag(nextTag)) {
			setMessage({ tone: "error", text: "Der Teamtag braucht 2 bis 5 Zeichen (A–Z, 0–9)." });
			return false;
		}
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
			body: JSON.stringify({ key: teamKey, name: nextName, tag: nextTag }),
		}).catch(() => null);
		if (!response) {
			setSaving(false);
			setMessage({ tone: "error", text: "Keine Verbindung. Bitte erneut versuchen." });
			return false;
		}
		const result = (await response.json().catch(() => null)) as { message?: string; warnings?: string[]; tag?: string } | null;
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
			text: warnings.length > 0 ? `Gespeichert. ${warnings.join(" ")}` : "Gespeichert. Discord wird aktualisiert.",
		});
		setSavedName(nextName);
		setSavedTag(result?.tag ?? nextTag);
		setTag(result?.tag ?? nextTag);
		router.refresh();
		return true;
	}

	useUnsavedChanges({
		dirty: name.trim() !== savedName || normalizeTeamTag(tag) !== savedTag,
		label: "Teamname",
		save: saveName,
	});

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void saveName();
	}

	return (
		<form onSubmit={submit} className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-solid)] p-5">
			<h2 className="text-lg font-semibold text-[var(--text)]">Teamname und Tag</h2>
			<p className="mt-1 text-sm leading-6 text-[var(--muted)]">Der Name gilt auch für eure Discord-Rolle und beide Teamchannels. Der Tag (2–5 Zeichen) steht überall dort, wo der volle Name zu lang ist.</p>
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
				<input
					name="team-tag"
					aria-label="Teamtag"
					autoComplete="off"
					spellCheck={false}
					value={tag}
					onChange={(event) => setTag(normalizeTeamTag(event.target.value).slice(0, TEAM_TAG_MAX))}
					maxLength={TEAM_TAG_MAX}
					placeholder="TAG"
					className="w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-[var(--text)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)] sm:w-24"
				/>
				<button
					type="submit"
					disabled={saving || (name.trim() === savedName && normalizeTeamTag(tag) === savedTag) || name.trim().length < 2}
					className="rounded-[10px] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
				>
					{saving ? "Wird gespeichert…" : "Speichern"}
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
