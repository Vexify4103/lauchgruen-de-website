"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const VIEWPORT_MARGIN = 12;

function parseLocalDateTime(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const [, year, month, day, hour, minute] = match;
	const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
	return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalDateTime(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayKey(date: Date) {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function calendarDays(month: Date) {
	const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
	const mondayOffset = (first.getDay() + 6) % 7;
	const start = new Date(first);
	start.setDate(first.getDate() - mondayOffset);
	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		return date;
	});
}

function positionFor(trigger: HTMLElement): CSSProperties {
	const rect = trigger.getBoundingClientRect();
	const width = Math.min(356, window.innerWidth - VIEWPORT_MARGIN * 2);
	const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), window.innerWidth - width - VIEWPORT_MARGIN);
	const estimatedHeight = 470;
	const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
	const top = spaceBelow >= estimatedHeight || rect.top < spaceBelow ? rect.bottom + 8 : Math.max(VIEWPORT_MARGIN, rect.top - estimatedHeight - 8);
	return { left, top, width, maxHeight: window.innerHeight - VIEWPORT_MARGIN * 2 };
}

export function ThemedDateTimePicker({
	value,
	onChange,
	ariaLabel,
	placeholder = "Datum und Uhrzeit wählen",
	disabled = false,
	clearable = false,
	error,
}: {
	value: string;
	onChange: (value: string) => void;
	ariaLabel: string;
	placeholder?: string;
	disabled?: boolean;
	clearable?: boolean;
	error?: string;
}) {
	const id = useId();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<Date>(() => parseLocalDateTime(value) ?? new Date());
	const [month, setMonth] = useState(() => {
		const initial = parseLocalDateTime(value) ?? new Date();
		return new Date(initial.getFullYear(), initial.getMonth(), 1, 12);
	});
	const [hour, setHour] = useState(() => String(draft.getHours()).padStart(2, "0"));
	const [minute, setMinute] = useState(() => String(draft.getMinutes()).padStart(2, "0"));
	const [position, setPosition] = useState<CSSProperties>({});

	function close(restoreFocus = true) {
		setOpen(false);
		if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
	}

	function openPicker() {
		const next = parseLocalDateTime(value) ?? new Date();
		setDraft(next);
		setMonth(new Date(next.getFullYear(), next.getMonth(), 1, 12));
		setHour(String(next.getHours()).padStart(2, "0"));
		setMinute(String(next.getMinutes()).padStart(2, "0"));
		if (triggerRef.current) setPosition(positionFor(triggerRef.current));
		setOpen(true);
		requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(next)}"]`)?.focus());
	}

	useEffect(() => {
		if (!open) return;
		const updatePosition = () => triggerRef.current && setPosition(positionFor(triggerRef.current));
		const dismiss = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!triggerRef.current?.contains(target) && !dialogRef.current?.contains(target)) close(false);
		};
		const escape = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close(true);
			}
		};
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		document.addEventListener("pointerdown", dismiss);
		document.addEventListener("keydown", escape);
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
			document.removeEventListener("pointerdown", dismiss);
			document.removeEventListener("keydown", escape);
		};
	}, [open]);

	function selectDay(day: Date) {
		const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), draft.getHours(), draft.getMinutes());
		setDraft(next);
		setMonth(new Date(day.getFullYear(), day.getMonth(), 1, 12));
	}

	function moveDay(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
		const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
		const offset = offsets[event.key];
		if (!offset) return;
		event.preventDefault();
		const next = new Date(day);
		next.setDate(day.getDate() + offset);
		selectDay(next);
		requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(next)}"]`)?.focus());
	}

	function apply() {
		const safeHour = Math.min(23, Math.max(0, Number.parseInt(hour, 10) || 0));
		const safeMinute = Math.min(59, Math.max(0, Number.parseInt(minute, 10) || 0));
		const next = new Date(draft.getFullYear(), draft.getMonth(), draft.getDate(), safeHour, safeMinute);
		onChange(toLocalDateTime(next));
		close(true);
	}

	const selected = parseLocalDateTime(value);
	const display = selected
		? new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(selected)
		: placeholder;

	return (
		<div className="min-w-0">
			<button
				ref={triggerRef}
				id={id}
				type="button"
				disabled={disabled}
				onClick={() => (open ? close(false) : openPicker())}
				aria-label={ariaLabel}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={open ? `${id}-calendar` : undefined}
				className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border bg-[#07110c] px-4 py-3 text-left text-sm outline-none transition ${error ? "border-red-300/50 ring-2 ring-red-300/10" : open ? "border-lime-200/45 ring-2 ring-lime-200/10" : "border-white/10 hover:border-lime-200/28 focus-visible:border-lime-200/45 focus-visible:ring-2 focus-visible:ring-lime-200/12"} disabled:opacity-45`}
			>
				<span className={`truncate font-bold ${selected ? "text-emerald-50" : "text-emerald-100/36"}`}>{display}</span>
				<svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0 text-lime-200/72" fill="none" stroke="currentColor" strokeWidth="1.8">
					<path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
				</svg>
			</button>
			{error ? <p className="mt-1.5 text-xs font-bold text-red-200">{error}</p> : null}
			{open && typeof document !== "undefined"
				? createPortal(
						<div
							ref={dialogRef}
							id={`${id}-calendar`}
							role="dialog"
							aria-modal="false"
							aria-label={ariaLabel}
							style={position}
							className="themed-scrollbar fixed z-[120] overflow-y-auto rounded-[1.6rem] border border-lime-100/15 bg-gradient-to-br from-[#092519]/[0.99] via-[#061b12]/[0.99] to-[#020b07]/[0.995] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl"
						>
							<div className="flex items-center justify-between gap-3">
								<button
									type="button"
									aria-label="Vorheriger Monat"
									onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}
									className="grid size-9 place-items-center rounded-xl border border-white/10 bg-black/20 text-lg text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
								>
									‹
								</button>
								<div className="text-sm font-black capitalize text-emerald-50">
									{new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(month)}
								</div>
								<button
									type="button"
									aria-label="Nächster Monat"
									onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}
									className="grid size-9 place-items-center rounded-xl border border-white/10 bg-black/20 text-lg text-emerald-100 transition hover:border-lime-200/30 hover:text-lime-100"
								>
									›
								</button>
							</div>
							<div className="mt-4 grid grid-cols-7 gap-1 text-center">
								{WEEKDAYS.map((weekday) => (
									<div key={weekday} className="py-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100/40">
										{weekday}
									</div>
								))}
							</div>
							<div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Kalender">
								{calendarDays(month).map((day) => {
									const active = dayKey(day) === dayKey(draft);
									const today = dayKey(day) === dayKey(new Date());
									const outside = day.getMonth() !== month.getMonth();
									return (
										<button
											key={dayKey(day)}
											type="button"
											role="gridcell"
											data-day={dayKey(day)}
											aria-selected={active}
											tabIndex={active ? 0 : -1}
											onClick={() => selectDay(day)}
											onKeyDown={(event) => moveDay(event, day)}
											className={`grid aspect-square place-items-center rounded-xl text-xs font-black transition ${active ? "bg-lime-200 text-emerald-950 shadow-lg shadow-lime-300/15" : today ? "border border-cyan-200/35 bg-cyan-300/8 text-cyan-50" : outside ? "text-emerald-100/22 hover:bg-white/[0.035]" : "text-emerald-100/72 hover:bg-lime-200/10 hover:text-lime-50"}`}
										>
											{day.getDate()}
										</button>
									);
								})}
							</div>
							<div className="mt-4 border-t border-white/8 pt-4">
								<div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/45">Uhrzeit</div>
								<div className="mt-2 flex items-center gap-2">
									<input
										aria-label="Stunde"
										inputMode="numeric"
										maxLength={2}
										value={hour}
										onChange={(event) => setHour(event.target.value.replace(/\D/g, "").slice(0, 2))}
										onBlur={() => setHour(String(Math.min(23, Math.max(0, Number.parseInt(hour, 10) || 0))).padStart(2, "0"))}
										className="h-11 w-16 rounded-xl border border-white/10 bg-black/24 text-center font-mono text-sm font-black text-emerald-50 outline-none focus:border-lime-200/40"
									/>
									<span className="font-black text-emerald-100/45">:</span>
									<input
										aria-label="Minute"
										inputMode="numeric"
										maxLength={2}
										value={minute}
										onChange={(event) => setMinute(event.target.value.replace(/\D/g, "").slice(0, 2))}
										onBlur={() => setMinute(String(Math.min(59, Math.max(0, Number.parseInt(minute, 10) || 0))).padStart(2, "0"))}
										className="h-11 w-16 rounded-xl border border-white/10 bg-black/24 text-center font-mono text-sm font-black text-emerald-50 outline-none focus:border-lime-200/40"
									/>
									<button
										type="button"
										onClick={() => {
											const now = new Date();
											setDraft(now);
											setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12));
											setHour(String(now.getHours()).padStart(2, "0"));
											setMinute(String(now.getMinutes()).padStart(2, "0"));
										}}
										className="ml-auto rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100 hover:border-cyan-200/28 hover:text-cyan-50"
									>
										Jetzt
									</button>
								</div>
							</div>
							<div className="mt-4 flex items-center justify-between gap-2">
								{clearable ? (
									<button
										type="button"
										onClick={() => {
											onChange("");
											close(true);
										}}
										className="rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-200/72 hover:bg-red-500/10 hover:text-red-100"
									>
										Löschen
									</button>
								) : (
									<span />
								)}
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => close(true)}
										className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100"
									>
										Abbrechen
									</button>
									<button
										type="button"
										onClick={apply}
										className="rounded-xl bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-950"
									>
										Übernehmen
									</button>
								</div>
							</div>
						</div>,
						document.body
					)
				: null}
		</div>
	);
}
