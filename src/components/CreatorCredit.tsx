"use client";

import { usePathname } from "next/navigation";

const VEXIFY_TWITCH_URL = "https://www.twitch.tv/vexi_fy";
const VEXIFY_DISCORD_URL = "https://discord.gg/RP33WtAc2D";

export function CreatorCredit({ className = "" }: { className?: string }) {
	const pathname = usePathname();
	if (pathname.startsWith("/overlay") || pathname.startsWith("/obs") || pathname.includes("/champ-select/")) return null;

	return (
		<section
			aria-label="Creator-Credit"
			className={`relative isolate overflow-hidden rounded-[1.75rem] border border-lime-200/12 bg-[linear-gradient(115deg,rgba(163,230,53,0.075),transparent_38%),linear-gradient(145deg,rgba(6,31,19,0.98),rgba(3,18,13,0.96)_55%,rgba(4,25,27,0.94))] p-4 shadow-xl shadow-black/20 sm:p-5 ${className}`}
		>
			<div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-lime-200 via-emerald-300 to-cyan-300" />
			<div aria-hidden className="absolute -right-20 -top-28 size-72 rounded-full border border-cyan-100/[0.06]" />
			<div aria-hidden className="absolute -right-6 -top-14 size-40 rounded-full border border-lime-100/[0.055]" />
			<div
				aria-hidden
				className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:34px_34px]"
			/>

			<div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
				<div className="flex min-w-0 items-center gap-4">
					<div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-lime-200/18 bg-black/25 shadow-[0_0_28px_rgba(163,230,53,0.1)]">
						<div aria-hidden className="absolute inset-2 rotate-45 rounded-md border border-cyan-200/12" />
						<span className="relative font-mono text-sm font-black tracking-[-0.08em] text-lime-100">VX</span>
					</div>
					<div className="min-w-0">
						<div className="text-[8px] font-black uppercase tracking-[0.3em] text-lime-200/52">Creator-Credit · Hinter den Kulissen</div>
						<h2 className="mt-1.5 text-xl font-black tracking-[-0.035em] text-emerald-50 sm:text-2xl">Website von Vexify.</h2>
						<p className="mt-1 text-[11px] leading-5 text-emerald-100/43">Design, Entwicklung und Plattform-Engineering für Lauchgruens Stream, Tools und Turniere.</p>
					</div>
				</div>

				<div className="grid gap-2 sm:grid-cols-2">
					<CreatorLink href={VEXIFY_TWITCH_URL} label="Twitch" value="vexi_fy" tone="twitch" icon={<TwitchIcon />} />
					<CreatorLink href={VEXIFY_DISCORD_URL} label="Discord-Server" value="Community" tone="discord" icon={<DiscordIcon />} />
				</div>
			</div>
		</section>
	);
}

function CreatorLink({ href, label, value, tone, icon }: { href: string; label: string; value: string; tone: "twitch" | "discord"; icon: React.ReactNode }) {
	const colors =
		tone === "twitch"
			? "border-fuchsia-200/12 bg-fuchsia-300/[0.065] hover:border-fuchsia-200/28 hover:bg-fuchsia-300/[0.1]"
			: "border-indigo-200/12 bg-indigo-300/[0.065] hover:border-indigo-200/28 hover:bg-indigo-300/[0.1]";
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className={`group grid min-h-14 min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition hover:-translate-y-0.5 ${colors}`}
		>
			<span className="grid size-8 place-items-center rounded-xl border border-white/8 bg-black/18 text-emerald-50/82">{icon}</span>
			<span className="min-w-0">
				<small className="block truncate text-[7px] font-black uppercase tracking-[0.18em] text-emerald-100/42">{label}</small>
				<strong className="mt-0.5 block truncate text-[11px] font-black text-emerald-50">{value}</strong>
			</span>
			<span aria-hidden className="text-xs font-black text-emerald-100/32 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-50">
				↗
			</span>
		</a>
	);
}

function TwitchIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
			<path d="M4.3 2.5 2.8 6.2v13.3h4.6V22h2.5l2.5-2.5h3.8l5-5V2.5H4.3Zm15 11.1-2.9 2.9h-4.7L9.2 19v-2.5H5.7V4.4h13.6v9.2Zm-2.5-6.3v5.1h-1.9V7.3h1.9Zm-5.1 0v5.1H9.8V7.3h1.9Z" />
		</svg>
	);
}

function DiscordIcon() {
	return (
		<svg viewBox="0 0 24 24" className="size-[1.1rem]" aria-hidden fill="currentColor">
			<path d="M19.5 5.3A17.2 17.2 0 0 0 15.3 4l-.5 1a15.7 15.7 0 0 0-5.6 0l-.5-1a17 17 0 0 0-4.2 1.3C1.8 9.3 1 13.2 1.4 17a17 17 0 0 0 5.2 2.6l1.3-1.7c-.7-.3-1.4-.7-2-1.2l.5-.4c3.8 1.8 7.8 1.8 11.5 0l.5.4c-.7.5-1.4.9-2.1 1.2l1.3 1.7a17 17 0 0 0 5.2-2.6c.4-4.4-.8-8.2-3.3-11.7ZM8.8 14.7c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm6.4 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z" />
		</svg>
	);
}
