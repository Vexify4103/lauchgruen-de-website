"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ThemedMultiSelect, ThemedSelect } from "@/components/ThemedSelect";
import { isAdminVersionConflict, useAdminConflict } from "@/components/AdminConflictProvider";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

type ApplicantOption = {
	discordId: string;
	displayName: string;
	discordHandle: string;
	riotId: string;
	groupCode: string | null;
};

type GroupView = {
	code: string;
	memberDiscordIds: string[];
};

export function PreferenceGroupManager({ applicants, groups, initialVersion }: { applicants: ApplicantOption[]; groups: GroupView[]; initialVersion: number }) {
	const router = useRouter();
	const { showConflict } = useAdminConflict();
	const [version, setVersion] = useState(initialVersion);
	const [newMembers, setNewMembers] = useState<string[]>([]);
	const [selectedApplicant, setSelectedApplicant] = useState("");
	const [targetCode, setTargetCode] = useState("");
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const applicantById = new Map(applicants.map((applicant) => [applicant.discordId, applicant]));
	const ungrouped = applicants.filter((applicant) => !applicant.groupCode);
	const selectedApplicantEntry = applicantById.get(selectedApplicant);
	const assignmentDirty = Boolean(selectedApplicant && targetCode !== (selectedApplicantEntry?.groupCode ?? ""));

	async function request(body: Record<string, unknown>, successMessage: string): Promise<boolean> {
		setMessage("");
		const response = await fetch("/api/tournament/admin/preference-groups", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...body, expectedVersion: version }),
		});
		const json = (await response.json().catch(() => null)) as { message?: string; version?: number } | null;
		if (!response.ok) {
			if (isAdminVersionConflict(response, json)) {
				showConflict(json);
				return false;
			}
			setMessage(json?.message ?? "Wunschduo konnte nicht geändert werden.");
			return false;
		}
		if (json?.version !== undefined) setVersion(json.version);
		setMessage(successMessage);
		router.refresh();
		return true;
	}

	async function createGroup(): Promise<boolean> {
		const saved = await request({ action: "create", discordIds: newMembers }, "Wunschduo erstellt.");
		if (saved) {
			setNewMembers([]);
		}
		return saved;
	}

	async function saveAssignment(): Promise<boolean> {
		const saved = await request(
			{
				action: "move",
				discordId: selectedApplicant,
				targetCode: targetCode || null,
			},
			targetCode
				? `${selectedApplicantEntry?.displayName ?? "Person"} wurde ${targetCode} zugewiesen.`
				: `${selectedApplicantEntry?.displayName ?? "Person"} wurde aus dem Wunschduo entfernt.`
		);
		if (saved) {
			setSelectedApplicant("");
			setTargetCode("");
		}
		return saved;
	}

	useUnsavedChanges({
		dirty: newMembers.length > 0,
		label: "Neues Wunschduo",
		save: createGroup,
	});
	useUnsavedChanges({
		dirty: assignmentDirty,
		label: "Wunschduo-Zuweisung",
		save: saveAssignment,
	});

	return (
		<section className="mt-8 rounded-[2rem] border border-cyan-200/16 bg-cyan-300/[0.045] p-5 shadow-xl shadow-black/20">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/68">Wunschduos verwalten</div>
					<h2 className="mt-2 text-2xl font-black text-emerald-50">Gemeinsam spielen – fair eingeteilt</h2>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/58">
						Hier könnt ihr Bewerber zu Wunschduos zusammenfassen oder ihre Duo-Zugehörigkeit anpassen. Der Auto-Balancer berücksichtigt diese Wünsche nach
						Möglichkeit, eine gemeinsame Einteilung ist jedoch nicht garantiert.
					</p>
				</div>
				<span className="rounded-full border border-cyan-200/18 bg-cyan-300/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50/72">
					{groups.length} Gruppen
				</span>
			</div>

			<div className="mt-5 grid gap-4 xl:grid-cols-2">
				<div className="rounded-2xl border border-white/9 bg-black/18 p-4">
					<div className="text-sm font-black text-emerald-50">Neues Wunschduo erstellen</div>
					<p className="mt-1 text-xs leading-5 text-emerald-100/48">Wähle eine bis fünf Bewerber aus, die noch keiner Gruppe angehören.</p>
					<div className="mt-4">
						<ThemedMultiSelect
							value={newMembers}
							onChange={(values) => setNewMembers(values.slice(0, 5))}
							placeholder="Bewerber auswählen"
							options={ungrouped.map((applicant) => ({
								value: applicant.discordId,
								label: `${applicant.displayName} · ${applicant.riotId}`,
							}))}
						/>
					</div>
					<button
						type="button"
						disabled={isPending || newMembers.length === 0 || newMembers.length > 5}
						onClick={() =>
							startTransition(async () => {
								await createGroup();
							})
						}
						className="mt-4 rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-40"
					>
						{isPending ? "Wird gespeichert..." : `Gruppe mit ${newMembers.length} erstellen`}
					</button>
				</div>

				<div className="rounded-2xl border border-white/9 bg-black/18 p-4">
					<div className="text-sm font-black text-emerald-50">Person zuweisen oder verschieben</div>
					<p className="mt-1 text-xs leading-5 text-emerald-100/48">„Kein Wunschduo“ entfernt die Person aus ihrem aktuellen Duo.</p>
					<div className="mt-4 grid gap-3">
						<ThemedSelect
							value={selectedApplicant}
							onChange={(value) => {
								setSelectedApplicant(value);
								setTargetCode(applicants.find((entry) => entry.discordId === value)?.groupCode ?? "");
							}}
							placeholder="Bewerber auswählen"
							options={applicants.map((applicant) => ({
								value: applicant.discordId,
								label: `${applicant.displayName} · ${applicant.groupCode ?? "ohne Gruppe"}`,
							}))}
						/>
						<ThemedSelect
							value={targetCode}
							onChange={setTargetCode}
							placeholder="Zielgruppe auswählen"
							options={[
								{ value: "", label: "Kein Wunschduo" },
								...groups.map((group) => ({
									value: group.code,
									label: `${group.code} · ${group.memberDiscordIds.length}/5`,
								})),
							]}
						/>
					</div>
					<button
						type="button"
						disabled={isPending || !selectedApplicant}
						onClick={() =>
							startTransition(async () => {
								await saveAssignment();
							})
						}
						className="mt-4 rounded-xl border border-cyan-200/22 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-cyan-50 disabled:opacity-40"
					>
						Zuweisung speichern
					</button>
				</div>
			</div>

			{groups.length > 0 ? (
				<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{groups.map((group) => (
						<article key={group.code} className="rounded-2xl border border-cyan-200/12 bg-black/18 p-4">
							<div className="flex items-center justify-between gap-3">
								<span className="font-mono text-sm font-black tracking-[0.12em] text-cyan-50">{group.code}</span>
								<span className="text-[10px] font-black text-cyan-100/48">{group.memberDiscordIds.length}/5</span>
							</div>
							<div className="mt-3 flex flex-wrap gap-1.5">
								{group.memberDiscordIds.map((discordId) => {
									const applicant = applicantById.get(discordId);
									return (
										<span
											key={discordId}
											title={applicant?.riotId ?? discordId}
											className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1 text-[10px] font-bold text-emerald-100/68"
										>
											{applicant?.displayName ?? discordId}
										</span>
									);
								})}
							</div>
						</article>
					))}
				</div>
			) : null}

			{message ? <div className="mt-4 rounded-xl border border-cyan-200/16 bg-black/20 px-4 py-3 text-xs font-bold text-cyan-50/80">{message}</div> : null}
		</section>
	);
}
