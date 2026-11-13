/** Compact role silhouettes; substitutes use swap arrows and unknown roles keep a neutral dot. */
const PATHS: Record<string, string> = {
	top: "M4 4h12v2.5H6.5V16H4V4Zm5 5h7v7H9V9Z",
	jungle: "M10 18 8.2 10.2 10 2 11.8 10.2 10 18ZM7.8 17 3.7 12 2 5.5 6 9 7.8 17ZM12.2 17 14 9 18 5.5 16.3 12 12.2 17Z",
	mid: "M4 13.5 13.5 4H16v2.5L6.5 16H4v-2.5ZM4 4h5v2H6v3H4V4Zm12 12h-5v-2h3v-3h2v5Z",
	bot: "M16 16H4v-2.5h9.5V4H16v12ZM4 4h7v7H4V4Z",
	support: "M10 2.5 12 5 10 7.5 8 5 10 2.5ZM9 8.5h2V14h2l-3 4-3-4h2V8.5ZM2 6.5 7 8.5V12l-3-1.5L2 6.5ZM18 6.5 13 8.5V12l3-1.5 2-4Z",
	sub: "M3 5.5h9V2l5 4.5-5 4.5V7.5H3v-2ZM17 14.5H8V18l-5-4.5L8 9v3.5h9v2Z",
};

const ALIASES: Record<string, keyof typeof PATHS> = {
	top: "top",
	jungle: "jungle",
	jgl: "jungle",
	mid: "mid",
	middle: "mid",
	adc: "bot",
	bot: "bot",
	bottom: "bot",
	support: "support",
	sup: "support",
	utility: "support",
	sub: "sub",
	substitute: "sub",
	ersatz: "sub",
	ersatzspieler: "sub",
	bench: "sub",
};

export function RoleIcon({ role, className = "size-4" }: { role: string; className?: string }) {
	const key = ALIASES[role.trim().toLowerCase()];
	return (
		<svg viewBox="0 0 20 20" className={className} role="img" aria-label={role}>
			<title>{role}</title>
			{key ? <path d={PATHS[key]} fill="currentColor" /> : <circle cx="10" cy="10" r="3" fill="currentColor" />}
		</svg>
	);
}
