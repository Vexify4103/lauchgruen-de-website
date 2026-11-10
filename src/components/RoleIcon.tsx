/** Small line icons for the five League roles; Sub and unknown roles get a dot. */
const PATHS: Record<string, string> = {
	top: "M4 4h12v2.5H6.5V16H4V4Zm5 5h7v7H9V9Z",
	jungle: "M10 17.5c-.8-3.6-2.6-5.7-6-7.4 3.3.2 5 1.2 6 2.8.9-3.8 2.8-6.6 6-8.4-1 4.8-2.8 8.8-6 13Z",
	mid: "M4 13.5 13.5 4H16v2.5L6.5 16H4v-2.5ZM4 4h5v2H6v3H4V4Zm12 12h-5v-2h3v-3h2v5Z",
	bot: "M16 16H4v-2.5h9.5V4H16v12ZM4 4h7v7H4V4Z",
	support: "M10 3.5 12 8h4.5l-3.6 2.8 1.4 4.7L10 12.8l-4.3 2.7 1.4-4.7L3.5 8H8l2-4.5Z",
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
