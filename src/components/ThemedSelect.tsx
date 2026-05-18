"use client";

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

export function ThemedSelect({
  name,
  options,
  value,
  onChange,
  placeholder = "Select…",
  required = false,
}: {
  name?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-index="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((prev) => Math.min(options.length - 1, prev + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((prev) => Math.max(0, prev - 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const next = options[highlight];
      if (next) {
        onChange(next.value);
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm outline-none transition ${
          open
            ? "border-lime-200/40 bg-black/30"
            : "border-white/10 bg-black/24 hover:border-lime-200/24"
        }`}
      >
        <span
          className={selected ? "font-bold text-emerald-50" : "text-emerald-100/34"}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className={`size-3 text-lime-200/72 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M1 1L6 6L11 1" />
        </svg>
      </button>

      {/* Hidden input keeps form-data submission working */}
      {name ? (
        <input
          type="text"
          name={name}
          value={value}
          required={required}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-0 opacity-0"
        />
      ) : null}

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-white/12 bg-gradient-to-br from-emerald-950/95 via-emerald-950/95 to-black/95 p-1 shadow-2xl shadow-black/40 backdrop-blur"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlight;
            return (
              <li
                key={option.value}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => {
                  // mousedown beats the outside-click handler
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                  isHighlighted
                    ? "bg-lime-200/12 text-lime-50"
                    : "text-emerald-100/80"
                } ${isSelected ? "font-black" : "font-bold"}`}
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/72">
                    Selected
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
