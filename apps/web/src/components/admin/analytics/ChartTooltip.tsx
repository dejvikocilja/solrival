"use client";

/**
 * Themed tooltip shared by every admin chart, so hover states look identical
 * across the dashboard. Recharts hands us the active payload; we render it
 * against the design tokens instead of the library's default white box.
 */

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadEntry[];
  /** Formats the label (x value). Defaults to identity. */
  labelFormatter?: (label: string | number) => string;
  /** Formats each series value. Defaults to localized number. */
  valueFormatter?: (value: number | string, name?: string) => string;
}

export function ChartTooltip({
  active,
  label,
  payload,
  labelFormatter,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const formatValue =
    valueFormatter ??
    ((v: number | string) => (typeof v === "number" ? v.toLocaleString() : String(v)));

  return (
    <div className="pointer-events-none rounded-lg border border-border-strong bg-bg-raised px-3 py-2 shadow-card-hover">
      {label !== undefined ? (
        <p className="mb-1 text-caption text-faint">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center gap-2 text-body-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            {entry.name ? <span className="text-muted">{entry.name}</span> : null}
            <span className="ml-auto font-mono tabular font-medium text-fg">
              {entry.value !== undefined ? formatValue(entry.value, entry.name) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
