"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type AdminConflictPayload = {
	code: "ADMIN_VERSION_CONFLICT";
	message?: string;
	resource?: string;
	currentVersion?: number;
};

type AdminConflictContextValue = {
	showConflict: (payload?: AdminConflictPayload | null) => void;
};

const AdminConflictContext = createContext<AdminConflictContextValue | null>(null);

export function AdminConflictProvider({ children }: { children: ReactNode }) {
	const [conflict, setConflict] = useState<AdminConflictPayload | null>(null);

	const showConflict = useCallback(
		(payload?: AdminConflictPayload | null) =>
			setConflict(
				payload ?? {
					code: "ADMIN_VERSION_CONFLICT",
				}
			),
		[]
	);
	const value = useMemo(() => ({ showConflict }), [showConflict]);

	return (
		<AdminConflictContext.Provider value={value}>
			{children}
			{conflict ? (
				<div role="dialog" aria-modal="true" aria-labelledby="admin-conflict-title" className="fixed inset-0 z-[110] grid place-items-center px-5">
					<button type="button" aria-label="Dialog schließen" onClick={() => setConflict(null)} className="absolute inset-0 bg-[var(--admin-inset)]" />
					<div className="relative w-full max-w-lg overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] from-[#1e2b1b] via-[#0b1b13] to-[#04100b] p-6">
						<div className="absolute -right-14 -top-16 size-48 rounded-full bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] blur-3xl" />
						<div className="relative">
							<div className="inline-flex size-11 items-center justify-center rounded-[12px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] text-xl font-semibold text-[var(--amber)]">
								!
							</div>
							<h2 id="admin-conflict-title" className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
								Neuere Änderungen vorhanden
							</h2>
							<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
								Eine andere Admin-Person hat diese Daten gespeichert, nachdem du die Seite geöffnet hast. Deine lokale Version wurde deshalb nicht überschrieben.
							</p>
							<div className="mt-4 rounded-[12px] border border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
								Du kannst deine Eingaben weiter ansehen oder sie verwerfen und die aktuelle Version vom Server laden.
							</div>
							<div className="mt-6 grid gap-2 sm:grid-cols-2">
								<button
									type="button"
									onClick={() => setConflict(null)}
									className="rounded-xl border border-[var(--line)] bg-[var(--admin-step)] px-4 py-3 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--line-strong)] hover:text-[var(--accent)]"
								>
									Weiter bearbeiten
								</button>
								<button
									type="button"
									onClick={() => window.location.reload()}
									className="bg-[var(--accent)] rounded-xl px-4 py-3 text-xs font-semibold text-[var(--on-accent)] transition"
								>
									Verwerfen & neu laden
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</AdminConflictContext.Provider>
	);
}

export function useAdminConflict() {
	const context = useContext(AdminConflictContext);
	if (!context) {
		throw new Error("useAdminConflict requires AdminConflictProvider.");
	}
	return context;
}

export function isAdminVersionConflict(response: Response, json: unknown): json is AdminConflictPayload {
	return response.status === 409 && !!json && typeof json === "object" && "code" in json && json.code === "ADMIN_VERSION_CONFLICT";
}
