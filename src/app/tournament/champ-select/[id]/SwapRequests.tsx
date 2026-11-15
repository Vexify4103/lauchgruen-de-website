"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { championFitsRole } from "@/lib/champion-roles";
import { RoleIcon } from "@/components/RoleIcon";
import type { ChampionPool } from "@/lib/champion-pools";
import { DRAFT_ROLE_LABELS, DRAFT_ROLES, type DraftRole, type DraftSide, type DraftSwapRequest } from "@/lib/tournament-draft-shared";

type ChampionEntry = ChampionPool["champions"][number];

const other = (side: DraftSide): DraftSide => (side === "teamA" ? "teamB" : "teamA");

function normalize(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]/g, "");
}

/** Small corner button on an own locked pick, like drafter.lol's swap icon. */
export function SwapCardButton({ champion, disabled, onClick }: { champion: string; disabled: boolean; onClick: () => void }) {
	return (
		<button type="button" className="draft-swap-request-button" disabled={disabled} onClick={onClick} aria-label={`Wechsel für ${champion} anfragen`} title="Wechsel anfragen">
			<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M3 5h10m0 0-3-3m3 3-3 3M13 11H3m0 0 3-3m-3 3 3 3" />
			</svg>
		</button>
	);
}

/** Modal to choose the replacement champion for one own pick. */
export function SwapPicker({
	from,
	slotLabel,
	champions,
	pending,
	onSubmit,
	onClose,
}: {
	from: string;
	slotLabel: string;
	champions: ChampionEntry[];
	pending: boolean;
	onSubmit: (champion: string) => void;
	onClose: () => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const searchId = useId();
	const [role, setRole] = useState<DraftRole | null>(null);
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState("");
	const term = normalize(useDeferredValue(search));

	// No close() on cleanup: it fires onClose, and React's dev double effect would close the picker at once.
	// Unmounting removes the dialog anyway.
	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog && !dialog.open) dialog.showModal();
	}, []);

	const visible = champions.filter((champion) => (!term || normalize(champion.name).includes(term)) && (!role || championFitsRole(champion.id, role)));
	return (
		<dialog ref={dialogRef} className="draft-swap-dialog" aria-labelledby={`${searchId}-title`} onClose={onClose} onCancel={onClose}>
			<header>
				<h2 id={`${searchId}-title`}>Wechsel anfragen</h2>
				<p>
					Ersetze <strong>{from}</strong> ({slotLabel}). Der Gegner muss zustimmen.
				</p>
			</header>
			<div className="draft-toolbar">
				<button type="button" className="draft-role-filter" aria-pressed={role === null} onClick={() => setRole(null)}>
					Alle
				</button>
				{DRAFT_ROLES.map((entry) => (
					<button
						key={entry}
						type="button"
						className="draft-role-filter"
						aria-pressed={role === entry}
						onClick={() => setRole(role === entry ? null : entry)}
						title={DRAFT_ROLE_LABELS[entry]}
					>
						<RoleIcon role={entry} className="draft-role-icon" />
						<span className="sr-only">{DRAFT_ROLE_LABELS[entry]}</span>
					</button>
				))}
				<label htmlFor={searchId} className="sr-only">
					Champion suchen
				</label>
				<input
					id={searchId}
					type="search"
					name="swap-champion-search"
					autoComplete="off"
					spellCheck={false}
					placeholder="Champion suchen…"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="draft-search"
				/>
			</div>
			<div className="draft-grid draft-swap-grid">
				{visible.map((champion) => (
					<button key={champion.id} type="button" className="draft-tile" aria-pressed={selected === champion.name} onClick={() => setSelected(champion.name)}>
						<div className="draft-tile-art">
							<Image src={champion.imageUrl} alt="" fill sizes="5rem" />
						</div>
						<span>{champion.name}</span>
					</button>
				))}
				{visible.length === 0 ? <p className="draft-empty">Kein Champion passt zu Suche und Filter.</p> : null}
			</div>
			<footer>
				<button type="button" className="button ghost" onClick={onClose}>
					Abbrechen
				</button>
				<button type="button" className="button" disabled={!selected || pending} onClick={() => onSubmit(selected)}>
					{selected ? `${selected} anfragen` : "Champion wählen"}
				</button>
			</footer>
		</dialog>
	);
}

/** Open requests, shown right above the lock button: the opponent answers, the requester can withdraw. */
export function SwapPrompts({
	requests,
	teamLabel,
	canAct,
	pending,
	onCancel,
	onAnswer,
}: {
	requests: Partial<Record<DraftSide, DraftSwapRequest>> | undefined;
	teamLabel: (side: DraftSide) => string;
	canAct: (side: DraftSide) => boolean;
	pending: boolean;
	onCancel: (side: DraftSide) => void;
	onAnswer: (side: DraftSide, accept: boolean) => void;
}) {
	const entries = (["teamA", "teamB"] as const).flatMap((side) => (requests?.[side] ? [[side, requests[side]!] as const] : []));
	if (!entries.length) return null;
	return (
		<div className="draft-swap-prompts">
			{entries.map(([side, request]) => {
				const answer = canAct(other(side));
				const own = canAct(side);
				return (
					<div key={side} className="draft-swap-prompt" data-side={side} role="status">
						<p>
							{own && !answer ? "Wechsel angefragt: " : `${teamLabel(side)} möchte `}
							<strong>{request.from}</strong> → <strong>{request.champion}</strong>
							{own && !answer ? ` · warte auf ${teamLabel(other(side))}` : " tauschen."}
						</p>
						<div>
							{answer ? (
								<>
									<button type="button" className="button ghost small" disabled={pending} onClick={() => onAnswer(side, false)}>
										Ablehnen
									</button>
									<button type="button" className="button small" disabled={pending} onClick={() => onAnswer(side, true)}>
										Annehmen
									</button>
								</>
							) : null}
							{own && !answer ? (
								<button type="button" className="button ghost small" disabled={pending} onClick={() => onCancel(side)}>
									Zurückziehen
								</button>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}
