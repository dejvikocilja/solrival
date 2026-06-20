"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
  value: string;
  label: string;
  activeClassName?: string;
}

export function Segmented({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (v: string) => void;
  "aria-label"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-md border border-border bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "flex-1 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:focus-ring",
              active ? cn("bg-surface text-fg shadow-sm", o.activeClassName) : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
