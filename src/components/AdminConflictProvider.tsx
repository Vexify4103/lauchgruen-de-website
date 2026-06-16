"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type AdminConflictPayload = {
  code: "ADMIN_VERSION_CONFLICT";
  message?: string;
  resource?: string;
  currentVersion?: number;
};

type AdminConflictContextValue = {
  showConflict: (payload?: AdminConflictPayload | null) => void;
};

const AdminConflictContext =
  createContext<AdminConflictContextValue | null>(null);

export function AdminConflictProvider({ children }: { children: ReactNode }) {
  const [conflict, setConflict] = useState<AdminConflictPayload | null>(null);

  const showConflict = useCallback(
    (payload?: AdminConflictPayload | null) =>
      setConflict(
        payload ?? {
          code: "ADMIN_VERSION_CONFLICT",
        },
      ),
    [],
  );
  const value = useMemo(() => ({ showConflict }), [showConflict]);

  return (
    <AdminConflictContext.Provider value={value}>
      {children}
      {conflict ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-conflict-title"
          className="fixed inset-0 z-[110] grid place-items-center px-5"
        >
          <button
            type="button"
            aria-label="Dialog schließen"
            onClick={() => setConflict(null)}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-amber-200/28 bg-gradient-to-br from-[#1e2b1b] via-[#0b1b13] to-[#04100b] p-6 shadow-2xl shadow-black/70">
            <div className="absolute -right-14 -top-16 size-48 rounded-full bg-amber-200/12 blur-3xl" />
            <div className="relative">
              <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-amber-200/28 bg-amber-200/10 text-xl font-black text-amber-100">
                !
              </div>
              <h2
                id="admin-conflict-title"
                className="mt-4 text-2xl font-black tracking-tight text-emerald-50"
              >
                Neuere Änderungen vorhanden
              </h2>
              <p className="mt-2 text-sm leading-6 text-emerald-100/68">
                Eine andere Admin-Person hat diese Daten gespeichert, nachdem
                du die Seite geöffnet hast. Deine lokale Version wurde deshalb
                nicht überschrieben.
              </p>
              <div className="mt-4 rounded-2xl border border-amber-200/16 bg-amber-200/[0.06] px-4 py-3 text-xs leading-5 text-amber-50/74">
                Du kannst deine Eingaben weiter ansehen oder sie verwerfen und
                die aktuelle Version vom Server laden.
              </div>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setConflict(null)}
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
                >
                  Weiter bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-xl bg-gradient-to-r from-amber-200 via-lime-200 to-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-xl shadow-amber-200/15 transition hover:-translate-y-0.5"
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

export function isAdminVersionConflict(
  response: Response,
  json: unknown,
): json is AdminConflictPayload {
  return (
    response.status === 409
    && !!json
    && typeof json === "object"
    && "code" in json
    && json.code === "ADMIN_VERSION_CONFLICT"
  );
}
