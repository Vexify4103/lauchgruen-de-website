"use client";

import type { KeyboardEvent } from "react";

function clamp(value: number, min?: number, max?: number) {
	return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, value));
}

export function ThemedNumberInput({
	value,
	onChange,
	name,
	min,
	max,
	step = 1,
	ariaLabel,
	placeholder,
	disabled = false,
	compact = false,
	error,
	onKeyDown,
	className = "",
}: {
	value: number | string;
	onChange: (value: string) => void;
	name?: string;
	min?: number;
	max?: number;
	step?: number;
	ariaLabel: string;
	placeholder?: string;
	disabled?: boolean;
	compact?: boolean;
	error?: string;
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
	className?: string;
}) {
	const numericValue = typeof value === "number" ? value : Number(value);
	const hasNumericValue = value !== "" && Number.isFinite(numericValue);

	function update(next: number) {
		onChange(String(clamp(next, min, max)));
	}

	function increment(direction: 1 | -1) {
		const fallback = min ?? 0;
		update((hasNumericValue ? numericValue : fallback) + step * direction);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();
			increment(event.key === "ArrowUp" ? 1 : -1);
		} else if (event.key === "Home" && min !== undefined) {
			event.preventDefault();
			update(min);
		} else if (event.key === "End" && max !== undefined) {
			event.preventDefault();
			update(max);
		}
		onKeyDown?.(event);
	}

	const buttonClass = `${compact ? "w-8 text-base" : "w-11 text-xl"} grid shrink-0 place-items-center bg-white/[0.035] font-black text-emerald-100/65 outline-none transition hover:bg-lime-200/10 hover:text-lime-100 focus-visible:bg-lime-200/12 focus-visible:text-lime-50 disabled:opacity-25`;
	const heightClass = compact ? "h-8 rounded-lg" : "h-12 rounded-2xl";

	return (
		<div className={`min-w-0 ${className}`}>
			<div
				className={`flex w-full overflow-hidden border bg-[#07110c] transition ${heightClass} ${error ? "border-red-300/50 ring-2 ring-red-300/10" : "border-white/10 focus-within:border-lime-200/45 focus-within:ring-2 focus-within:ring-lime-200/10"} ${disabled ? "opacity-45" : ""}`}
			>
				<button
					type="button"
					disabled={disabled || (hasNumericValue && min !== undefined && numericValue <= min)}
					onClick={() => increment(-1)}
					aria-label={`${ariaLabel} verringern`}
					className={`${buttonClass} border-r border-white/8`}
				>
					−
				</button>
				<input
					type="text"
					role="spinbutton"
					inputMode="numeric"
					name={name}
					value={value}
					disabled={disabled}
					placeholder={placeholder}
					aria-label={ariaLabel}
					aria-valuemin={min}
					aria-valuemax={max}
					aria-valuenow={hasNumericValue ? numericValue : undefined}
					aria-invalid={Boolean(error) || undefined}
					onChange={(event) => {
						const next = event.target.value.trim();
						if (/^-?\d*$/.test(next)) onChange(next);
					}}
					onBlur={() => {
						if (hasNumericValue) update(numericValue);
					}}
					onKeyDown={handleKeyDown}
					className={`min-w-0 flex-1 bg-transparent px-2 text-center font-mono font-black text-emerald-50 outline-none placeholder:text-emerald-100/28 ${compact ? "text-[11px]" : "text-sm"}`}
				/>
				<button
					type="button"
					disabled={disabled || (hasNumericValue && max !== undefined && numericValue >= max)}
					onClick={() => increment(1)}
					aria-label={`${ariaLabel} erhöhen`}
					className={`${buttonClass} border-l border-white/8`}
				>
					+
				</button>
			</div>
			{error ? <p className="mt-1.5 text-xs font-bold text-red-200">{error}</p> : null}
		</div>
	);
}
