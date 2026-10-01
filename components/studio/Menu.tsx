"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  note?: string;
}

interface MenuProps<T extends string> {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}

// Square, borderless, and it opens upward. Every control in this studio sits
// near the top of the viewport, so a downward menu would either clip or cover
// the model.
export default function Menu<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: MenuProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex h-[30px] cursor-pointer items-center gap-1.5 px-2 text-[11px] text-white/60 transition-colors duration-150 hover:bg-white/8 hover:text-white/92 disabled:cursor-not-allowed disabled:opacity-40"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-white/38">{label}</span>
        <span className="text-white/88">{selected.label}</span>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute bottom-full right-0 z-30 mb-1 min-w-[168px] bg-black/78 py-1 backdrop-blur-2xl"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors duration-150 hover:bg-white/10"
                data-active={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={`h-3 w-3 shrink-0 ${active ? "text-white/88" : "text-transparent"}`}
                  strokeWidth={2.25}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className={active ? "text-white/92" : "text-white/64"}>
                    {option.label}
                  </span>
                  {option.note ? (
                    <span className="ml-1.5 text-white/34">{option.note}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
