"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export type SelectOption = {
	value: string;
	label: string;
	description?: string;
	group?: string;
	disabled?: boolean;
};

type CommonSelectProps = {
	name?: string;
	options: SelectOption[];
	placeholder?: string;
	disabled?: boolean;
	loading?: boolean;
	error?: string;
	ariaLabel?: string;
	className?: string;
	emptyMessage?: string;
	compact?: boolean;
};

type MenuPosition = { left: number; top: number; width: number; maxHeight: number };

const MENU_GAP = 8;
const VIEWPORT_MARGIN = 12;
const MAX_MENU_HEIGHT = 288;

function firstEnabledIndex(options: SelectOption[]) {
	return options.findIndex((option) => !option.disabled);
}

function nextEnabledIndex(options: SelectOption[], current: number, direction: 1 | -1) {
	if (options.length === 0) return -1;
	for (let offset = 1; offset <= options.length; offset += 1) {
		const index = (current + direction * offset + options.length) % options.length;
		if (!options[index]?.disabled) return index;
	}
	return -1;
}

function calculateMenuPosition(trigger: HTMLElement): MenuPosition {
	const rect = trigger.getBoundingClientRect();
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const width = Math.min(Math.max(rect.width, 220), viewportWidth - VIEWPORT_MARGIN * 2);
	const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), viewportWidth - width - VIEWPORT_MARGIN);
	const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - MENU_GAP;
	const spaceAbove = rect.top - VIEWPORT_MARGIN - MENU_GAP;
	const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
	const maxHeight = Math.max(120, Math.min(MAX_MENU_HEIGHT, openAbove ? spaceAbove : spaceBelow));
	const top = openAbove ? Math.max(VIEWPORT_MARGIN, rect.top - maxHeight - MENU_GAP) : rect.bottom + MENU_GAP;
	return { left, top, width, maxHeight };
}

function usePortalMenu(open: boolean) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<MenuPosition | null>(null);

	useEffect(() => {
		if (!open) return;
		const update = () => {
			if (triggerRef.current) setPosition(calculateMenuPosition(triggerRef.current));
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [open]);

	return { triggerRef, menuRef, position };
}

function useDismiss(
	open: boolean,
	close: (restoreFocus?: boolean) => void,
	triggerRef: React.RefObject<HTMLButtonElement | null>,
	menuRef: React.RefObject<HTMLDivElement | null>
) {
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
		};
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close(true);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [close, menuRef, open, triggerRef]);
}

function MenuShell({
	menuRef,
	position,
	children,
	labelledBy,
	multi = false,
}: {
	menuRef: React.RefObject<HTMLDivElement | null>;
	position: MenuPosition;
	children: ReactNode;
	labelledBy: string;
	multi?: boolean;
}) {
	const style: CSSProperties = { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight };
	return (
		<div
			ref={menuRef}
			id={`${labelledBy}-menu`}
			role="listbox"
			aria-labelledby={labelledBy}
			aria-multiselectable={multi || undefined}
			style={style}
			className="themed-scrollbar fixed z-[120] overflow-y-auto overscroll-contain rounded-2xl border border-lime-100/15 bg-gradient-to-br from-[#092519]/[0.985] via-[#061b12]/[0.985] to-[#020b07]/[0.99] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.62),0_0_0_1px_rgba(190,242,100,0.04)] backdrop-blur-xl"
		>
			{children}
		</div>
	);
}

function TriggerIcon({ open, loading }: { open: boolean; loading: boolean }) {
	if (loading) return <span aria-hidden className="size-4 shrink-0 animate-spin rounded-full border-2 border-cyan-100/25 border-t-cyan-100" />;
	return (
		<svg
			aria-hidden
			viewBox="0 0 12 8"
			className={`size-3 shrink-0 text-lime-200/72 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M1 1L6 6L11 1" />
		</svg>
	);
}

function triggerClass(open: boolean, disabled: boolean, error: boolean, compact: boolean, className = "") {
	return `flex w-full items-center justify-between gap-3 border text-left outline-none transition ${compact ? "min-h-8 rounded-lg px-2.5 py-1.5 text-[11px]" : "min-h-12 rounded-2xl px-4 py-3 text-sm"} ${
		error
			? "border-red-300/50 bg-red-500/[0.08] focus-visible:ring-2 focus-visible:ring-red-300/30"
			: open
				? "border-lime-200/45 bg-black/34 ring-2 ring-lime-200/10"
				: "border-white/10 bg-black/24 hover:border-lime-200/28 focus-visible:border-lime-200/45 focus-visible:ring-2 focus-visible:ring-lime-200/12"
	} ${disabled ? "cursor-not-allowed opacity-45" : ""} ${className}`;
}

function Checkmark({ selected }: { selected: boolean }) {
	return (
		<span
			className={`grid size-5 shrink-0 place-items-center rounded-md border transition ${selected ? "border-lime-200/55 bg-lime-200 text-emerald-950" : "border-white/12 bg-black/15 text-transparent"}`}
		>
			<svg aria-hidden viewBox="0 0 12 10" className="h-2.5 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
				<path d="m1 5 3 3 7-7" />
			</svg>
		</span>
	);
}

function OptionRows({
	idBase,
	options,
	value,
	highlight,
	onHighlight,
	onSelect,
	multi = false,
}: {
	idBase: string;
	options: SelectOption[];
	value: string | string[];
	highlight: number;
	onHighlight: (index: number) => void;
	onSelect: (option: SelectOption) => void;
	multi?: boolean;
}) {
	let previousGroup: string | undefined;
	return options.map((option, index) => {
		const selected = Array.isArray(value) ? value.includes(option.value) : option.value === value;
		const showGroup = option.group && option.group !== previousGroup;
		previousGroup = option.group;
		return (
			<div key={`${option.group ?? ""}-${option.value}`}>
				{showGroup ? (
					<div role="presentation" className="px-3 pb-1 pt-3 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100/45 first:pt-1">
						{option.group}
					</div>
				) : null}
				<button
					id={`${idBase}-option-${index}`}
					type="button"
					role="option"
					aria-selected={selected}
					aria-disabled={option.disabled || undefined}
					disabled={option.disabled}
					onPointerMove={() => !option.disabled && onHighlight(index)}
					onClick={() => onSelect(option)}
					className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
						index === highlight
							? "bg-lime-200/13 text-lime-50"
							: selected
								? "bg-cyan-300/[0.07] text-emerald-50"
								: "text-emerald-100/78 hover:bg-white/[0.045] hover:text-emerald-50"
					} ${option.disabled ? "opacity-35" : ""}`}
				>
					<span className="min-w-0">
						<span className={`block truncate ${selected ? "font-black" : "font-bold"}`}>{option.label}</span>
						{option.description ? <span className="mt-0.5 block truncate text-[11px] text-emerald-100/45">{option.description}</span> : null}
					</span>
					{multi || selected ? <Checkmark selected={selected} /> : null}
				</button>
			</div>
		);
	});
}

export function ThemedSelect({
	name,
	options,
	value,
	onChange,
	placeholder = "Auswählen…",
	required = false,
	disabled = false,
	loading = false,
	error,
	ariaLabel,
	className,
	emptyMessage = "Keine Optionen verfügbar.",
	compact = false,
}: CommonSelectProps & { value: string; onChange: (value: string) => void; required?: boolean }) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(() =>
		Math.max(
			firstEnabledIndex(options),
			options.findIndex((option) => option.value === value)
		)
	);
	const typeahead = useRef("");
	const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { triggerRef, menuRef, position } = usePortalMenu(open);
	const selected = options.find((option) => option.value === value);

	function close(restoreFocus = true) {
		setOpen(false);
		if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
	}
	useDismiss(open, close, triggerRef, menuRef);

	function openMenu() {
		const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
		setHighlight(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
		setOpen(true);
	}

	function select(option: SelectOption) {
		if (option.disabled) return;
		onChange(option.value);
		close(true);
	}

	function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key === "Tab") return close(false);
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!open) openMenu();
			else setHighlight((current) => nextEnabledIndex(options, current < 0 ? 0 : current, event.key === "ArrowDown" ? 1 : -1));
			return;
		}
		if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			if (!open) openMenu();
			setHighlight(event.key === "Home" ? firstEnabledIndex(options) : nextEnabledIndex(options, 0, -1));
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (!open) openMenu();
			else if (options[highlight]) select(options[highlight]);
			return;
		}
		if (event.key.length === 1 && /\S/.test(event.key)) {
			typeahead.current += event.key.toLocaleLowerCase("de-DE");
			if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
			typeaheadTimer.current = setTimeout(() => (typeahead.current = ""), 650);
			const match = options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase("de-DE").startsWith(typeahead.current));
			if (match >= 0) {
				openMenu();
				setHighlight(match);
			}
		}
	}

	return (
		<div className="min-w-0">
			<button
				ref={triggerRef}
				id={id}
				type="button"
				disabled={disabled || loading}
				onClick={() => (open ? close(false) : openMenu())}
				onKeyDown={onKeyDown}
				role="combobox"
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? `${id}-menu` : undefined}
				aria-activedescendant={open && highlight >= 0 ? `${id}-option-${highlight}` : undefined}
				aria-required={required || undefined}
				aria-invalid={Boolean(error) || undefined}
				className={triggerClass(open, disabled || loading, Boolean(error), compact, className)}
			>
				<span className={`min-w-0 truncate ${selected ? "font-bold text-emerald-50" : "text-emerald-100/36"}`}>
					{loading ? "Wird geladen…" : (selected?.label ?? placeholder)}
				</span>
				<TriggerIcon open={open} loading={loading} />
			</button>
			{name ? (
				required ? (
					<input
						type="text"
						name={name}
						value={value}
						required
						readOnly
						disabled={disabled}
						tabIndex={-1}
						aria-hidden
						className="pointer-events-none absolute size-px opacity-0"
					/>
				) : (
					<input type="hidden" name={name} value={value} disabled={disabled} />
				)
			) : null}
			{error ? <p className="mt-1.5 text-xs font-bold text-red-200">{error}</p> : null}
			{open && position && typeof document !== "undefined"
				? createPortal(
						<MenuShell menuRef={menuRef} position={position} labelledBy={id}>
							{options.length ? (
								<OptionRows idBase={id} options={options} value={value} highlight={highlight} onHighlight={setHighlight} onSelect={select} />
							) : (
								<EmptyState>{emptyMessage}</EmptyState>
							)}
						</MenuShell>,
						document.body
					)
				: null}
		</div>
	);
}

export function ThemedMultiSelect({
	name,
	options,
	value,
	onChange,
	placeholder = "Auswählen…",
	disabled = false,
	loading = false,
	error,
	ariaLabel,
	className,
	emptyMessage = "Keine Optionen verfügbar.",
	compact = false,
}: CommonSelectProps & { value: string[]; onChange: (value: string[]) => void }) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(() => firstEnabledIndex(options));
	const { triggerRef, menuRef, position } = usePortalMenu(open);
	const selected = options.filter((option) => value.includes(option.value));
	const selectedText = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.map((option) => option.label).join(", ") : `${selected.length} Optionen ausgewählt`;

	function close(restoreFocus = true) {
		setOpen(false);
		if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
	}
	useDismiss(open, close, triggerRef, menuRef);

	function toggle(option: SelectOption) {
		if (option.disabled) return;
		onChange(value.includes(option.value) ? value.filter((entry) => entry !== option.value) : [...value, option.value]);
	}

	function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key === "Tab") return close(false);
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!open) setOpen(true);
			else setHighlight((current) => nextEnabledIndex(options, current < 0 ? 0 : current, event.key === "ArrowDown" ? 1 : -1));
			return;
		}
		if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			setOpen(true);
			setHighlight(event.key === "Home" ? firstEnabledIndex(options) : nextEnabledIndex(options, 0, -1));
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (!open) setOpen(true);
			else if (options[highlight]) toggle(options[highlight]);
		}
	}

	return (
		<div className="min-w-0">
			<button
				ref={triggerRef}
				id={id}
				type="button"
				disabled={disabled || loading}
				onClick={() => setOpen((current) => !current)}
				onKeyDown={onKeyDown}
				role="combobox"
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? `${id}-menu` : undefined}
				aria-activedescendant={open && highlight >= 0 ? `${id}-option-${highlight}` : undefined}
				aria-invalid={Boolean(error) || undefined}
				className={triggerClass(open, disabled || loading, Boolean(error), compact, className)}
			>
				<span className={`min-w-0 truncate ${selected.length ? "font-bold text-emerald-50" : "text-emerald-100/36"}`}>{loading ? "Wird geladen…" : selectedText}</span>
				<span className="flex shrink-0 items-center gap-2">
					{selected.length ? <span className="rounded-full bg-lime-200/14 px-2 py-0.5 text-[10px] font-black text-lime-100">{selected.length}</span> : null}
					<TriggerIcon open={open} loading={loading} />
				</span>
			</button>
			{name ? value.map((entry) => <input key={entry} type="hidden" name={name} value={entry} disabled={disabled} />) : null}
			{error ? <p className="mt-1.5 text-xs font-bold text-red-200">{error}</p> : null}
			{open && position && typeof document !== "undefined"
				? createPortal(
						<MenuShell menuRef={menuRef} position={position} labelledBy={id} multi>
							{options.length ? (
								<OptionRows idBase={id} options={options} value={value} highlight={highlight} onHighlight={setHighlight} onSelect={toggle} multi />
							) : (
								<EmptyState>{emptyMessage}</EmptyState>
							)}
						</MenuShell>,
						document.body
					)
				: null}
		</div>
	);
}

function EmptyState({ children }: { children: ReactNode }) {
	return <div className="grid min-h-24 place-items-center px-4 py-6 text-center text-xs font-bold text-emerald-100/42">{children}</div>;
}
