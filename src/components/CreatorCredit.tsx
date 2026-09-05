"use client";

import { usePathname } from "next/navigation";

const VEXIFY_TWITCH_URL = "https://www.twitch.tv/vexi_fy";

export function CreatorCredit({ className = "" }: { className?: string }) {
	const pathname = usePathname();
	if (pathname.startsWith("/overlay") || pathname.startsWith("/obs") || pathname.includes("/champ-select/")) return null;

	return (
		<a
			href={VEXIFY_TWITCH_URL}
			target="_blank"
			rel="noreferrer"
			aria-label="Website von Vexify - Vexify auf Twitch besuchen"
			className={`group inline-flex items-center gap-1.5 rounded-sm text-inherit underline-offset-4 transition-colors hover:text-emerald-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-200 ${className}`}
		>
			<span>Website von Vexify</span>
			<span aria-hidden className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
				↗
			</span>
		</a>
	);
}
