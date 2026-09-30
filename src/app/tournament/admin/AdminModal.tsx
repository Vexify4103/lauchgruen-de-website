"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";

/** Modal frame of the admin control room: kicker, title, close button and a scrollable body. */
export function AdminModal({
	open,
	kicker,
	title,
	onClose,
	wide = false,
	danger = false,
	children,
}: {
	open: boolean;
	kicker: string;
	title: string;
	onClose: () => void;
	wide?: boolean;
	danger?: boolean;
	children: ReactNode;
}) {
	const titleId = useId();
	const dialogRef = useRef<HTMLDivElement>(null);
	const close = useEffectEvent(() => onClose());

	useEffect(() => {
		if (!open) return;
		const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialogRef.current?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") close();
		};
		window.addEventListener("keydown", onKey);
		const { overflow } = document.body.style;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
			previouslyFocused?.focus();
		};
	}, [open]);

	if (!open) return null;
	return (
		<div
			className="admin-modal-backdrop"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className={`admin-modal outline-none ${wide ? "wide" : ""} ${danger ? "danger" : ""}`}
			>
				<header>
					<div className="min-w-0">
						<span>{kicker}</span>
						<h2 id={titleId}>{title}</h2>
					</div>
					<button type="button" onClick={onClose} aria-label="Schließen" className="grid place-items-center">
						<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
							<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
						</svg>
					</button>
				</header>
				<div className="admin-modal-body">{children}</div>
			</div>
		</div>
	);
}
