import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClipsArchive } from "./ClipsArchive";

export const metadata: Metadata = {
	title: "Clips",
	description: "Aktuelle Highlights und beliebte Twitch-Clips von Lauchgruen.",
};

export default function ClipsPage() {
	return (
		<div className="relative min-h-screen overflow-hidden bg-[#020b07] text-emerald-50">
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_4%,rgba(163,230,53,0.12),transparent_29%),radial-gradient(circle_at_92%_26%,rgba(34,211,238,0.09),transparent_27%),linear-gradient(155deg,#020b07_0%,#04140c_48%,#020906_100%)]"
			/>
			<div
				aria-hidden
				className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]"
			/>

			<header className="sticky top-0 z-50 border-b border-white/7 bg-[#020b07]/88 backdrop-blur-xl">
				<div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4 px-5 py-4 sm:px-8">
					<Link href="/" className="flex items-center gap-3">
						<Image src="/bear-logo.png" alt="Lauchgruen" width={44} height={44} priority className="size-11 rounded-2xl border border-lime-200/24 object-cover" />
						<div>
							<div className="text-[9px] font-black uppercase tracking-[0.3em] text-lime-200/62">Lauchgruen</div>
							<div className="mt-0.5 text-sm font-black">Clip-Archiv</div>
						</div>
					</Link>
					<div className="flex items-center gap-2">
						<Link
							href="/"
							className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.17em] text-emerald-100/70 transition hover:border-lime-200/30 hover:text-lime-100"
						>
							Zur Startseite
						</Link>
						<a
							href="https://www.twitch.tv/lauchgruen"
							target="_blank"
							rel="noreferrer"
							className="hidden rounded-xl bg-[#9146ff] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.17em] text-white transition hover:-translate-y-0.5 sm:inline-flex"
						>
							Twitch öffnen
						</a>
					</div>
				</div>
			</header>

			<main className="relative z-10 mx-auto w-full max-w-[90rem] px-5 py-10 sm:px-8 sm:py-14">
				<section className="relative overflow-hidden rounded-[2.4rem] border border-lime-200/13 bg-[linear-gradient(140deg,#0a2013_0%,#06160e_58%,#07171a_100%)] p-7 shadow-2xl shadow-black/30 sm:p-10">
					<div aria-hidden className="absolute -right-16 -top-24 size-80 rounded-full border border-lime-100/[0.07]" />
					<div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(190,242,100,0.13),transparent_30%)]" />
					<div className="relative">
						<div className="text-[9px] font-black uppercase tracking-[0.32em] text-lime-200/58">Direkt aus dem Stream</div>
						<h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-6xl">Momente, die bleiben durften.</h1>
						<p className="mt-5 max-w-2xl text-sm leading-7 text-emerald-100/58">
							Neue Highlights, alte Klassiker und genau die Szenen, die der Chat nicht vergessen wollte. Direkt von Twitch gesammelt.
						</p>
					</div>
				</section>

				<section className="mt-8">
					<ClipsArchive />
				</section>
			</main>

			<footer className="relative z-10 mt-8 border-t border-white/7 px-5 py-8 sm:px-8">
				<div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 text-xs text-emerald-100/40 sm:flex-row sm:items-center sm:justify-between">
					<span>Clips werden direkt über Twitch geladen.</span>
					<Link href="/" className="font-bold uppercase tracking-[0.14em] transition hover:text-lime-100">
						Zurück zu lauchgruen.de
					</Link>
				</div>
			</footer>
		</div>
	);
}
