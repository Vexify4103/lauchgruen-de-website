import type { ReactNode } from "react";

/** Section title used at the top of every page: small kicker, display heading, supporting copy. */
export function PageIntro({
	kicker,
	title,
	children,
	id,
	as: Heading = "h1",
	compact = true,
	aside,
}: {
	kicker: string;
	title: ReactNode;
	children?: ReactNode;
	id?: string;
	as?: "h1" | "h2";
	compact?: boolean;
	/** Optional element shown below the copy (badges, notes). */
	aside?: ReactNode;
}) {
	return (
		<div className={`section-title ${compact ? "compact" : ""}`}>
			<p>{kicker}</p>
			<Heading id={id}>{title}</Heading>
			{children || aside ? (
				<span>
					{children}
					{aside ? <span className="mt-3 block">{aside}</span> : null}
				</span>
			) : null}
		</div>
	);
}

/** Centered placeholder for sections that have no content yet. */
export function EmptyState({ title, children, icon = "✦", action }: { title: string; children?: ReactNode; icon?: string; action?: ReactNode }) {
	return (
		<div className="empty-state">
			<span aria-hidden="true">{icon}</span>
			<h2>{title}</h2>
			{children ? <p>{children}</p> : null}
			{action ? <div className="mt-6">{action}</div> : null}
		</div>
	);
}
