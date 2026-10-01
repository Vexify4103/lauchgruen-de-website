type BrandMarkProps = { className?: string; label?: string };

function svgA11y(label?: string) {
	return label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
}

// Official symbol geometry from discord.com/branding.
export function DiscordMark({ className, label }: BrandMarkProps) {
	return (
		<svg className={className} viewBox="0 0 64 48" focusable="false" {...svgA11y(label)}>
			<path
				fill="currentColor"
				d="M40.575 0c-.619 1.099-1.174 2.235-1.68 3.397a48.784 48.784 0 0 0-14.497 0A29.913 29.913 0 0 0 22.719 0a47.744 47.744 0 0 0-13.07 4.028C1.39 16.265-.846 28.186.266 39.943a53.088 53.088 0 0 0 16.025 8.044 40.85 40.85 0 0 0 3.435-5.531 32.39 32.39 0 0 1-5.405-2.576c.455-.328.897-.669 1.326-.998 10.14 4.774 21.885 4.774 32.038 0 .429.354.871.695 1.326.998a32.605 32.605 0 0 1-5.418 2.589 40.85 40.85 0 0 0 3.435 5.531 53.084 53.084 0 0 0 16.025-8.032c1.313-13.638-2.248-25.458-9.408-35.927A47.856 47.856 0 0 0 40.587.025L40.575 0ZM21.14 32.707c-3.119 0-5.708-2.829-5.708-6.327 0-3.498 2.488-6.339 5.696-6.339 3.207 0 5.758 2.854 5.707 6.339-.05 3.486-2.513 6.327-5.695 6.327Zm21.039 0c-3.132 0-5.696-2.829-5.696-6.327 0-3.498 2.488-6.339 5.696-6.339 3.207 0 5.746 2.854 5.695 6.339-.05 3.486-2.513 6.327-5.695 6.327Z"
			/>
		</svg>
	);
}

export function TwitchMark({ className, label }: BrandMarkProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" focusable="false" {...svgA11y(label)}>
			<path
				fill="currentColor"
				d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"
			/>
		</svg>
	);
}

export function RiotGamesMark({ className, label }: BrandMarkProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" focusable="false" {...svgA11y(label)}>
			<path
				fill="currentColor"
				d="M13.458.86 0 7.093l3.353 12.761 2.552-.313-.701-8.024.838-.373 1.447 8.202 4.361-.535-.775-8.857.83-.37 1.591 9.025 4.412-.542-.849-9.708.84-.374 1.74 9.87L24 17.318V3.5Zm.316 19.356.222 1.256L24 23.14v-4.18l-10.22 1.256Z"
			/>
		</svg>
	);
}
