// Line icons for the control room, one size and stroke (paths from Lucide, ISC licence).
import type { ReactNode } from "react";

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
	return (
		<svg
			className={className ?? "admin-icon"}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{children}
		</svg>
	);
}

export function ExternalIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M15 3h6v6" />
			<path d="M10 14 21 3" />
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		</Icon>
	);
}

export function RefreshIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
			<path d="M21 3v5h-5" />
			<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
			<path d="M8 16H3v5" />
		</Icon>
	);
}

export function CheckIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M20 6 9 17l-5-5" />
		</Icon>
	);
}
