import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { tournament } from "@/lib/tournament-data";
import { getSiteUrls } from "@/lib/site-urls";

const navItems = [
  { href: "/tournament", label: "Übersicht" },
  { href: "/tournament/apply", label: "Bewerben" },
  { href: "/tournament/teams", label: "Teams" },
  { href: "/tournament/pools", label: "Pools" },
  { href: "/tournament/groups", label: "Gruppen" },
  { href: "/tournament/playoffs", label: "Playoffs" },
  { href: "/tournament/admin", label: "Admin" },
];

const APPLICATIONS_ENABLED =
  process.env.TOURNAMENT_APPLICATIONS_ENABLED !== "false";

export const metadata: Metadata = {
  title: `${tournament.name} | lauchgruen`,
  description:
    "Kunterbuntes A-Z League-of-Legends-Turnier mit Bewerbung, Teams, Gruppenphase und Endbracket.",
};

export default async function TournamentLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host");
  const siteUrls = getSiteUrls(host);

  return (
    <div className="min-h-screen bg-[#07110c] text-emerald-50">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-lime-300/10 blur-3xl" />
        <div className="absolute bottom-[-14rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-10rem] top-[22rem] h-[30rem] w-[30rem] rounded-full bg-amber-300/10 blur-3xl" />
      </div>

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

          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            {navItems.map((item) =>
              item.href === "/tournament/apply" && !APPLICATIONS_ENABLED ? (
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
        </nav>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-lime-200/10 px-5 py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-sm text-emerald-100/54 sm:flex-row sm:items-center sm:justify-between">
          <p>{tournament.name} ist Lucas Community-Turnier am 19.06. und 20.06.2026.</p>
          <a href={siteUrls.apex} className="font-bold text-lime-200/80 hover:text-lime-100">
            Zurück zu lauchgruen.de
          </a>
        </div>
      </footer>
    </div>
  );
}
