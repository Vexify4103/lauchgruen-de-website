"use client";

export default function TournamentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return <div className="mx-auto grid min-h-[65vh] w-full max-w-3xl place-items-center px-5 py-12"><section className="rounded-[2rem] border border-amber-200/18 bg-amber-200/[0.07] p-7 text-center"><div className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-100/60">Turnierbereich</div><h1 className="mt-3 text-3xl font-black text-emerald-50">Diese Turnierdaten sind gerade nicht erreichbar.</h1><p className="mt-3 text-sm leading-7 text-emerald-100/58">Bitte versuche es erneut. Bereits gespeicherte Bewerbungen, Roster und Ergebnisse werden dadurch nicht verändert.</p><button type="button" onClick={reset} className="mt-5 rounded-xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.15em] text-emerald-950">Neu laden</button></section></div>;
}
