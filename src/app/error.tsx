"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<div className="grid min-h-screen place-items-center bg-[#03100a] px-5 text-emerald-50">
			<main className="w-full max-w-xl rounded-[2rem] border border-amber-200/18 bg-[#09170f] p-7 text-center shadow-2xl shadow-black/35">
					<div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/58">Kurz nicht erreichbar</div>
					<h1 className="mt-3 text-3xl font-black">Die Seite konnte nicht vollständig geladen werden.</h1>
					<p className="mt-3 text-sm leading-7 text-emerald-100/58">Ein externer Dienst oder die Verbindung hat gerade nicht geantwortet. Deine gespeicherten Daten bleiben erhalten.</p>
					<button type="button" onClick={reset} className="mt-6 rounded-xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">Erneut versuchen</button>
			</main>
		</div>
	);
}
