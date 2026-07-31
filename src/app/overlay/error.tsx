"use client";

export default function OverlayError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return <main id="main-content" className="grid min-h-screen place-items-center bg-[#03100a] px-5 text-emerald-50"><section className="w-full max-w-xl rounded-[2rem] border border-cyan-200/16 bg-[#08160f] p-7 text-center"><div className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-100/55">Overlay Builder</div><h1 className="mt-3 text-3xl font-black">Die Vorschau konnte nicht gestartet werden.</h1><p className="mt-3 text-sm leading-7 text-emerald-100/55">Deine Einstellungen in der URL bleiben erhalten. Meist reicht ein erneuter Versuch, sobald Riot oder Twitch wieder antwortet.</p><button type="button" onClick={reset} className="mt-5 rounded-xl bg-cyan-200 px-5 py-3 text-xs font-black uppercase tracking-[0.15em] text-cyan-950">Erneut versuchen</button></section></main>;
}
