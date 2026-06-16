"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type SaveRegistration = {
  dirty: boolean;
  label: string;
  save: () => Promise<boolean>;
};

type UnsavedChangesContextValue = {
  register: (id: string, registration: SaveRegistration) => void;
  unregister: (id: string) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

type PendingNavigation =
  | { kind: "href"; href: string }
  | { kind: "back" }
  | { kind: "reload" };

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [registrations, setRegistrations] = useState(
    () => new Map<string, SaveRegistration>(),
  );
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bypassNavigation = useRef(false);
  const sentinelActive = useRef(false);
  const suppressPop = useRef(false);

  const register = useCallback((id: string, registration: SaveRegistration) => {
    setRegistrations((current) => {
      const next = new Map(current);
      next.set(id, registration);
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setRegistrations((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const dirtyRegistrations = useMemo(
    () =>
      [...registrations.values()].filter(
        (registration) => registration.dirty,
      ),
    [registrations],
  );
  const hasUnsavedChanges = dirtyRegistrations.length > 0;

  useEffect(() => {
    bypassNavigation.current = false;
  }, [pathname]);

  useEffect(() => {
    if (hasUnsavedChanges && !sentinelActive.current) {
      window.history.pushState(
        { ...window.history.state, unsavedChangesSentinel: true },
        "",
        window.location.href,
      );
      sentinelActive.current = true;
      return;
    }

    if (
      !hasUnsavedChanges
      && sentinelActive.current
      && !pendingNavigation
      && !saving
    ) {
      suppressPop.current = true;
      sentinelActive.current = false;
      window.history.back();
    }
  }, [hasUnsavedChanges, pendingNavigation, saving]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!hasUnsavedChanges || bypassNavigation.current) return;
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor
        || anchor.target === "_blank"
        || anchor.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin === window.location.origin
        &&
        destination.pathname === window.location.pathname
        && destination.search === window.location.search
        && destination.hash === window.location.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setError("");
      setPendingNavigation({
        kind: "href",
        href:
          destination.origin === window.location.origin
            ? `${destination.pathname}${destination.search}${destination.hash}`
            : destination.href,
      });
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    function handleRefreshShortcut(event: KeyboardEvent) {
      const refreshShortcut =
        event.key === "F5"
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");
      if (!refreshShortcut || !hasUnsavedChanges || bypassNavigation.current) {
        return;
      }
      event.preventDefault();
      setError("");
      setPendingNavigation({ kind: "reload" });
    }

    window.addEventListener("keydown", handleRefreshShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleRefreshShortcut, true);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    function handlePopState() {
      if (suppressPop.current) {
        suppressPop.current = false;
        return;
      }
      if (!hasUnsavedChanges || bypassNavigation.current) return;

      window.history.forward();
      window.setTimeout(() => {
        setError("");
        setPendingNavigation({ kind: "back" });
      }, 0);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hasUnsavedChanges]);

  const continueNavigation = useCallback(
    (navigation: PendingNavigation) => {
      bypassNavigation.current = true;
      const hadSentinel = sentinelActive.current;
      sentinelActive.current = false;
      setPendingNavigation(null);
      if (navigation.kind === "back") {
        window.history.go(hadSentinel ? -2 : -1);
        return;
      }
      if (navigation.kind === "reload") {
        window.location.reload();
        return;
      }
      const destination = new URL(navigation.href, window.location.href);
      if (destination.origin !== window.location.origin) {
        window.location.assign(destination.href);
        return;
      }
      router.push(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    },
    [router],
  );

  async function saveAndContinue() {
    if (!pendingNavigation || saving) return;
    setSaving(true);
    setError("");

    for (const registration of [...registrations.values()].filter(
      (entry) => entry.dirty,
    )) {
      try {
        const saved = await registration.save();
        if (!saved) {
          setError(
            `„${registration.label}“ konnte nicht gespeichert werden. Bitte prüfe die Eingaben.`,
          );
          setSaving(false);
          return;
        }
      } catch {
        setError(
          `„${registration.label}“ konnte nicht gespeichert werden. Bitte versuche es erneut.`,
        );
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    continueNavigation(pendingNavigation);
  }

  const contextValue = useMemo(
    () => ({ register, unregister }),
    [register, unregister],
  );

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {children}
      {pendingNavigation ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-changes-title"
          className="fixed inset-0 z-[100] grid place-items-center px-5"
        >
          <button
            type="button"
            aria-label="Dialog schließen"
            onClick={() => !saving && setPendingNavigation(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-amber-200/24 bg-gradient-to-br from-[#15261c] via-[#0b1b13] to-[#04100b] p-6 shadow-2xl shadow-black/60">
            <div className="absolute -right-16 -top-20 size-48 rounded-full bg-amber-200/10 blur-3xl" />
            <div className="relative">
              <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-amber-200/24 bg-amber-200/10 text-xl font-black text-amber-100">
                !
              </div>
              <h2
                id="unsaved-changes-title"
                className="mt-4 text-2xl font-black tracking-tight text-emerald-50"
              >
                Ungespeicherte Änderungen
              </h2>
              <p className="mt-2 text-sm leading-6 text-emerald-100/66">
                Wenn du jetzt weitergehst, gehen deine letzten Änderungen
                verloren.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {dirtyRegistrations.map((registration) => (
                  <span
                    key={registration.label}
                    className="rounded-full border border-amber-200/16 bg-amber-200/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-amber-100/76"
                  >
                    {registration.label}
                  </span>
                ))}
              </div>
              {error ? (
                <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-100">
                  {error}
                </div>
              ) : null}
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPendingNavigation(null)}
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100 disabled:opacity-50"
                >
                  Weiter bearbeiten
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => continueNavigation(pendingNavigation)}
                  className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-red-100 transition hover:border-red-200/40 hover:bg-red-500/15 disabled:opacity-50"
                >
                  Verwerfen & weiter
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveAndContinue}
                  className="rounded-xl bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-xl shadow-lime-300/15 transition hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {saving ? "Speichert..." : "Speichern & weiter"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges({
  dirty,
  label,
  save,
}: SaveRegistration) {
  const context = useContext(UnsavedChangesContext);
  const id = useId();
  const saveEvent = useEffectEvent(save);

  useEffect(() => {
    if (!context) return;
    context.register(id, {
      dirty,
      label,
      save: () => saveEvent(),
    });
    return () => context.unregister(id);
  }, [context, dirty, id, label]);
}
