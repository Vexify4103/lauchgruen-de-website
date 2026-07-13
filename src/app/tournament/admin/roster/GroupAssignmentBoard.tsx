"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThemedSelect } from "@/components/ThemedSelect";
import type { RosterTeam } from "@/lib/roster";

function initialAssignments(teams: RosterTeam[]) {
	return new Map(teams.flatMap((team) => (team.group && team.seed ? [[team.key, { group: team.group, seed: team.seed }] as const] : [])));
}

export function GroupAssignmentBoard({ teams, groupCount, plannedTeamCount }: { teams: RosterTeam[]; groupCount: number; plannedTeamCount: number }) {
	const router = useRouter();
	const [assignments, setAssignments] = useState(() => initialAssignments(teams));
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();
	const groups = Array.from({ length: groupCount }, (_, index) => String.fromCharCode(65 + index));
	const baseSize = Math.floor(plannedTeamCount / groupCount);
	const remainder = plannedTeamCount % groupCount;
	const groupSizes = new Map(groups.map((group, index) => [group, baseSize + (index < remainder ? 1 : 0)]));
	const unassigned = teams.filter((team) => !assignments.has(team.key));

	function setSlot(group: string, seed: number, teamKey: string) {
		setAssignments((current) => {
			const next = new Map(current);
			for (const [key, assignment] of next) {
				if ((assignment.group === group && assignment.seed === seed) || key === teamKey) next.delete(key);
			}
			if (teamKey) next.set(teamKey, { group, seed });
			return next;
		});
		setMessage("");
		setError("");
	}

	function save() {
		startTransition(async () => {
			setMessage("");
			setError("");
			const payload = Object.fromEntries(teams.map((team) => [team.key, assignments.get(team.key) ?? null]));
			const response = await fetch("/api/tournament/team-groups", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ assignments: payload }),
			});
			const json = (await response.json().catch(() => null)) as { assigned?: number; message?: string } | null;
			if (!response.ok) {
				setError(json?.message ?? "Gruppenzuteilung konnte nicht gespeichert werden.");
				return;
			}
			setMessage(`${json?.assigned ?? assignments.size} Team(s) wurden den Gruppen zugeteilt.`);
			router.refresh();
		});
	}

	return (
		<section className="overflow-hidden rounded-[2rem] border border-cyan-200/14 bg-[#08160f]/86 shadow-xl shadow-black/22">
			<header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/8 bg-gradient-to-r from-cyan-300/[0.06] to-transparent px-5 py-4">
				<div>
					<div className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-100/54">Gruppenphase</div>
					<h2 className="mt-1 text-xl font-black text-emerald-50">Teams auf Gruppen verteilen</h2>
					<p className="mt-1 text-xs leading-5 text-emerald-100/44">
						Die Slots bestimmen gleichzeitig Gruppe und initialen Seed. Verschieben ist bis zum Speichern nur lokal.
					</p>
				</div>
				<button
					type="button"
					disabled={pending || teams.length === 0}
					onClick={save}
					className="rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-950 disabled:opacity-45"
				>
					{pending ? "Wird gespeichert…" : "Gruppen speichern"}
				</button>
			</header>
			<div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
				{groups.map((group) => (
					<div key={group} className="rounded-2xl border border-white/9 bg-black/18 p-3">
						<div className="flex items-center justify-between">
							<strong className="text-base text-emerald-50">Gruppe {group}</strong>
							<span className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100/42">
								{[...assignments.values()].filter((entry) => entry.group === group).length}/{groupSizes.get(group)}
							</span>
						</div>
						<div className="mt-3 grid gap-2">
							{Array.from({ length: groupSizes.get(group) ?? 0 }, (_, index) => {
								const seed = index + 1;
								const occupant = teams.find((team) => {
									const assignment = assignments.get(team.key);
									return assignment?.group === group && assignment.seed === seed;
								});
								return (
									<div key={seed} className="grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-2">
										<span className="text-[9px] font-black uppercase tracking-[0.15em] text-lime-200/48">Seed {seed}</span>
										<ThemedSelect
											value={occupant?.key ?? ""}
											onChange={(value) => setSlot(group, seed, value)}
											ariaLabel={`Team für Gruppe ${group}, Seed ${seed}`}
											options={[{ value: "", label: "Slot frei" }, ...teams.map((team) => ({ value: team.key, label: team.name }))]}
										/>
									</div>
								);
							})}
						</div>
					</div>
				))}
				<div className="rounded-2xl border border-dashed border-amber-200/16 bg-amber-200/[0.035] p-3">
					<div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/52">Nicht zugeteilt · {unassigned.length}</div>
					<div className="mt-3 flex flex-wrap gap-1.5">
						{unassigned.length ? (
							unassigned.map((team) => (
								<span key={team.key} className="rounded-lg border border-white/9 bg-black/20 px-2 py-1 text-[10px] font-bold text-emerald-100/62">
									{team.name}
								</span>
							))
						) : (
							<span className="text-xs text-lime-100/58">Alle Teams sind eingeordnet.</span>
						)}
					</div>
				</div>
			</div>
			{message || error ? (
				<div
					className={`mx-4 mb-4 rounded-xl border px-3 py-2 text-xs font-bold ${error ? "border-red-300/24 bg-red-500/10 text-red-100" : "border-lime-200/20 bg-lime-200/8 text-lime-50"}`}
				>
					{error || message}
				</div>
			) : null}
		</section>
	);
}
