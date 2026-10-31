"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ThemedMultiSelect, ThemedSelect } from "@/components/ThemedSelect";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import type { TournamentApplication } from "@/lib/tournament-storage";

const roleOptions = ["Top", "Jungle", "Mid", "Bot", "Support", "Fill"];

export function EditApplicantForm({ app, initialVersion }: { app: TournamentApplication; initialVersion: number }) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [displayName, setDisplayName] = useState(app.displayName);
	const [mainRole, setMainRole] = useState(app.mainRole);
	const [preferredRoles, setPreferredRoles] = useState(app.preferredRoles);
	const [notes, setNotes] = useState(app.notes);
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const [savedValues, setSavedValues] = useState(
		JSON.stringify({
			displayName: app.displayName,
			mainRole: app.mainRole,
			preferredRoles: app.preferredRoles,
			notes: app.notes,
		})
	);
	const currentValues = JSON.stringify({
		displayName,
		mainRole,
		preferredRoles,
		notes,
	});

	useUnsavedChanges({
		dirty: currentValues !== savedValues,
		label: `Bewerbung: ${app.displayName}`,
		save,
	});

	async function save(): Promise<boolean> {
		setMessage("");
		const response = await fetch("/api/tournament/applications", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: app.id,
				expectedVersion: version,
				displayName,
				mainRole,
				preferredRoles,
				notes,
			}),
		});
		const json = (await response.json().catch(() => null)) as { message?: string; version?: number } | null;
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage(json?.message ?? "Bewerbung konnte nicht gespeichert werden.");
			return false;
		}
		if (json?.version !== undefined) setVersion(json.version);
		setSavedValues(currentValues);
		setMessage("Gespeichert.");
		router.refresh();
		return true;
	}

	return (
		<details className="rounded-[12px] border border-[var(--line)] bg-[var(--admin-inset)] p-3">
			<summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">Bewerbung bearbeiten</summary>
			<div className="mt-3 grid gap-3">
				<label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
					Anzeigename
					<input
						name="display-name"
						autoComplete="off"
						value={displayName}
						onChange={(event) => setDisplayName(event.target.value)}
						className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2 text-sm font-medium text-[var(--text)] outline-none focus:border-[var(--accent)]"
					/>
				</label>

				<label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
					Main Rolle
					<ThemedSelect value={mainRole} onChange={setMainRole} options={roleOptions.map((role) => ({ value: role, label: role }))} />
				</label>

				<label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
					Wunschrollen
					<ThemedMultiSelect
						value={preferredRoles}
						onChange={setPreferredRoles}
						placeholder="Eine oder mehrere Rollen wählen…"
						options={roleOptions.map((role) => ({ value: role, label: role }))}
						ordered
						exclusiveValues={["Fill"]}
					/>
				</label>

				<label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
					Notizen
					<textarea
						name="notes"
						autoComplete="off"
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
						rows={4}
						className="rounded-xl border border-[var(--line)] bg-[var(--admin-inset)] px-3 py-2 text-sm font-medium text-[var(--text)] outline-none focus:border-[var(--accent)]"
					/>
				</label>

				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						disabled={isPending}
						onClick={() =>
							startTransition(async () => {
								await save();
							})
						}
						className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent)] disabled:opacity-45"
					>
						{isPending ? "Speichert…" : "Speichern"}
					</button>
					{message ? (
						<span role="status" className="text-xs font-medium text-[var(--muted)]">
							{message}
						</span>
					) : null}
				</div>
			</div>
		</details>
	);
}
