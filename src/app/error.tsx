"use client";

import { CreatorCredit } from "@/components/CreatorCredit";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<div className="flex min-h-screen items-center bg-[#03100a] px-5 py-10 text-emerald-50">
			<div className="mx-auto grid w-full max-w-4xl gap-5">
				<main className="mx-auto w-full max-w-xl rounded-[2rem] border border-amber-200/18 bg-[#09170f] p-7 text-center shadow-2xl shadow-black/35">
					<div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/58">Kurz nicht erreichbar</div>
					<h1 className="mt-3 text-3xl font-black">Die Seite konnte nicht vollständig geladen werden.</h1>
					<p className="mt-3 text-sm leading-7 text-emerald-100/58">
						Ein externer Dienst oder die Verbindung hat gerade nicht geantwortet. Deine gespeicherten Daten bleiben erhalten.
					</p>
					<button type="button" onClick={reset} className="mt-6 rounded-xl bg-lime-200 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">
						Erneut versuchen
					</button>
				</main>
				<div className="flex justify-center text-[10px] font-bold tracking-wide text-emerald-100/45">
					<CreatorCredit />
				</div>
			</div>
		</div>
	);
}
