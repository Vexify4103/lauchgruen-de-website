"use client";

import { useEffect, type ReactNode } from "react";

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	tone = "default",
	onConfirm,
	onCancel,
}: {
	open: boolean;
	title: string;
	description: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: "default" | "danger";
	onConfirm: () => void;
	onCancel: () => void;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onCancel();
			if (event.key === "Enter") onConfirm();
		};
		window.addEventListener("keydown", onKey);
		const { overflow } = document.body.style;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
		};
	}, [open, onCancel, onConfirm]);

	if (!open) return null;

	const confirmClass =
		tone === "danger"
			? "bg-gradient-to-r from-rose-300 via-red-300 to-amber-200 text-red-950 shadow-rose-300/20"
			: "bg-gradient-to-r from-lime-200 via-emerald-300 to-cyan-200 text-emerald-950 shadow-lime-300/20";

	return (
		<div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="fixed inset-0 z-50 grid place-items-center px-5">
			<button type="button" aria-label="Close" onClick={onCancel} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
			<div className="relative w-full max-w-md rounded-[1.7rem] border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-6 shadow-2xl shadow-black/40">
				<h2 id="confirm-dialog-title" className="text-xl font-black tracking-tight text-emerald-50">
					{title}
				</h2>
				<div className="mt-3 text-sm leading-6 text-emerald-100/72">{description}</div>
				<div className="mt-6 flex flex-wrap justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-[0.18em] shadow-xl transition hover:-translate-y-0.5 ${confirmClass}`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
