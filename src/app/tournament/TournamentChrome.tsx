"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TournamentLink as Link, TournamentUrlProvider } from "./TournamentLink";

type NavItem = {
  href: string;
  label: string;
};

export function TournamentChrome({
  children,
  navItems,
  applicationsOpen,
  tournamentLive,
  apexUrl,
  cleanUrls,
}: {
  children: ReactNode;
  navItems: NavItem[];
  applicationsOpen: boolean;
  tournamentLive: boolean;
  apexUrl: string;
  cleanUrls: boolean;
}) {
  const pathname = usePathname();
  const focusedDraft =
    pathname.startsWith("/tournament/champ-select/")
    || pathname.includes("/champ-select/");

  return (
    <TournamentUrlProvider cleanUrls={cleanUrls}>
      <div className="min-h-screen bg-[#07110c] text-emerald-50">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-lime-300/10 blur-3xl" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-10rem] top-[22rem] h-[30rem] w-[30rem] rounded-full bg-amber-300/10 blur-3xl" />
      </div>

      {focusedDraft ? (
        <FocusedDraftNavigation
          navItems={navItems}
          applicationsOpen={applicationsOpen}
          tournamentLive={tournamentLive}
        />
      ) : (
        <FullTournamentHeader
          navItems={navItems}
          applicationsOpen={applicationsOpen}
          tournamentLive={tournamentLive}
        />
      )}

      <main className={`relative z-10 ${focusedDraft ? "pt-9" : ""}`}>{children}</main>

      {focusedDraft ? null : (
        <footer className="relative z-10 border-t border-lime-200/10 px-5 py-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-sm text-emerald-100/54 sm:flex-row sm:items-center sm:justify-between">
            <p>Kunterbuntes A-Z Turnier ist Lucas Community-Turnier am 19.06. und 20.06.2026.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/tournament/privacy" className="font-bold text-lime-200/80 hover:text-lime-100">
                Datenschutz
              </Link>
              <Link href="/tournament/terms" className="font-bold text-lime-200/80 hover:text-lime-100">
                Teilnahmebedingungen
              </Link>
              <a href={apexUrl} className="font-bold text-lime-200/80 hover:text-lime-100">
                Zurück zu lauchgruen.de
              </a>
            </div>
          </div>
        </footer>
      )}
      </div>
    </TournamentUrlProvider>
  );
}

function FocusedDraftNavigation({
  navItems,
  applicationsOpen,
  tournamentLive,
}: {
  navItems: NavItem[];
  applicationsOpen: boolean;
  tournamentLive: boolean;
}) {
  return (
    <div className="fixed left-1/2 top-0 z-50 -translate-x-1/2">
      <details className="group relative">
        <summary className="list-none rounded-b-2xl border-x border-b border-white/10 bg-[#1d1d1d]/96 px-7 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-emerald-50 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:bg-[#252525] [&::-webkit-details-marker]:hidden">
          Navigation
        </summary>
        <div className="absolute left-1/2 top-full mt-2 w-64 -translate-x-1/2 rounded-2xl border border-white/12 bg-[#101613]/96 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div
            className={`mb-2 rounded-xl border px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] ${
              tournamentLive
                ? "border-red-300/30 bg-red-500/14 text-red-100"
                : "border-amber-200/18 bg-amber-200/8 text-amber-100/72"
            }`}
          >
            {tournamentLive ? "Live" : "Vorbereitung"}
          </div>
          <nav className="grid gap-1">
            {navItems.map((item) =>
              item.href === "/tournament/apply" && !applicationsOpen ? (
                <span
                  key={item.href}
                  aria-disabled="true"
                  className="cursor-not-allowed rounded-xl px-3 py-2 text-sm font-bold text-emerald-100/28"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-emerald-100/72 transition hover:bg-lime-200/10 hover:text-lime-100"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </details>
    </div>
  );
}

function FullTournamentHeader({
  navItems,
  applicationsOpen,
  tournamentLive,
}: {
  navItems: NavItem[];
  applicationsOpen: boolean;
  tournamentLive: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-lime-200/10 bg-[#07110c]/78 px-5 py-4 backdrop-blur-2xl">
      <nav className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/tournament" className="group inline-flex w-fit items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl border border-lime-200/20 bg-lime-300/12 font-black text-lime-100 shadow-lg shadow-lime-400/10">
            LG
          </span>
          <span>
            <span className="block text-sm font-black uppercase tracking-[0.28em] text-lime-200/70">
              lauchgruen
            </span>
            <span className="block text-lg font-black tracking-tight text-emerald-50 group-hover:text-lime-200">
              Turnier
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`shrink-0 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
              tournamentLive
                ? "border-red-300/30 bg-red-500/14 text-red-100"
                : "border-amber-200/18 bg-amber-200/8 text-amber-100/72"
            }`}
            title={tournamentLive ? "Turniermodus ist live" : "Turniermodus ist Vorbereitung"}
          >
            {tournamentLive ? "Live" : "Vorbereitung"}
          </span>
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            {navItems.map((item) =>
              item.href === "/tournament/apply" && !applicationsOpen ? (
                <span
                  key={item.href}
                  aria-disabled="true"
                  title="Bewerbungen sind aktuell geschlossen"
                  className="cursor-not-allowed whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold text-emerald-100/28"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold text-emerald-100/68 transition hover:bg-lime-200/10 hover:text-lime-100"
                >
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
