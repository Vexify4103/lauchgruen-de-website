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

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
	return (
		<Icon {...props}>
			<path fill={filled ? "currentColor" : "none"} d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
		</Icon>
	);
}

export function CloseIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</Icon>
	);
}

export function PencilIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
			<path d="m15 5 4 4" />
		</Icon>
	);
}

export function ChevronDownIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m6 9 6 6 6-6" />
		</Icon>
	);
}

export function SearchIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m21 21-4.34-4.34" />
			<circle cx="11" cy="11" r="8" />
		</Icon>
	);
}
