"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";

/** Decorative orb: its enclosing status or button supplies the accessible label. */
export function LoadingOrb({ size = 20, state = "working" }: { size?: 20 | 64; state?: OrbState }) {
	return <ThinkingOrb size={size} state={state} theme="dark" aria-hidden="true" className="shrink-0" />;
}

export function LoadingIndicator({
	label = "Wird geladen…",
	state = "working",
	compact = false,
	className = "",
}: {
	label?: string;
	state?: OrbState;
	compact?: boolean;
	className?: string;
}) {
	return (
		<span role="status" className={`flex items-center gap-3 text-sm text-[var(--muted)] ${compact ? "" : "flex-col justify-center py-8 text-center"} ${className}`}>
			<LoadingOrb size={compact ? 20 : 64} state={state} />
			<span>{label}</span>
		</span>
	);
}
