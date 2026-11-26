"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * One result row of the archive. When the match has replay scoreboards, a small toggle in the
 * last cell opens them in a full-width row below. Matches without replays keep a single row.
 */
export function ArchiveResultRow({ cells, detail, columns, label }: { cells: ReactNode; detail: ReactNode | null; columns: number; label: string }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	return (
		<>
			<tr>
				{cells}
				<td className="text-right">
					{detail ? (
						<button
							type="button"
							aria-expanded={open}
							aria-controls={id}
							onClick={() => setOpen((value) => !value)}
							className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs whitespace-nowrap text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
						>
							{label}
							<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" className={`transition-transform ${open ? "rotate-180" : ""}`}>
								<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</button>
					) : null}
				</td>
			</tr>
			{detail ? (
				<tr id={id} hidden={!open}>
					<td colSpan={columns} className="text-left">
						{detail}
					</td>
				</tr>
			) : null}
		</>
	);
}
