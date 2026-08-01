/**
 * Analytics time-range vocabulary, shared by the client picker and the server
 * query. Deliberately free of `server-only` and of any Prisma import so both
 * sides resolve the same definitions — a range the picker can express but the
 * server can't parse (or vice versa) is a whole class of bug this prevents.
 */

export const RANGE_PRESETS = ["7d", "14d", "30d", "90d", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type RangeSelection =
  | { kind: "preset"; preset: RangePreset }
  | { kind: "custom"; from: string; to: string }; // yyyy-mm-dd, inclusive

export const PRESET_LABELS: Record<RangePreset, string> = {
  "7d": "7 days",
  "14d": "14 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

export const PRESET_DAYS: Record<Exclude<RangePreset, "all">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

export const DEFAULT_RANGE: RangeSelection = { kind: "preset", preset: "30d" };

/** Buckets wider than a day once a range is long enough that daily bars turn
 *  into unreadable hairlines. Kept here so the axis label and the SQL agree. */
export type Bucket = "day" | "week" | "month";

export function bucketForSpanDays(days: number): Bucket {
  if (days <= 92) return "day";
  if (days <= 730) return "week";
  return "month";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses yyyy-mm-dd as UTC midnight. Returns null if malformed or unreal. */
export function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Rejects overflow like 2026-02-31, which Date silently rolls forward.
  if (d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Serialises a selection into query params for the API and the URL bar. */
export function rangeToParams(sel: RangeSelection): URLSearchParams {
  const p = new URLSearchParams();
  if (sel.kind === "preset") p.set("range", sel.preset);
  else {
    p.set("range", "custom");
    p.set("from", sel.from);
    p.set("to", sel.to);
  }
  return p;
}

/** Reads a selection back out of query params, falling back to the default
 *  rather than throwing — a hand-edited URL should degrade, not 500. */
export function rangeFromParams(params: URLSearchParams | null): RangeSelection {
  const raw = params?.get("range");
  if (raw === "custom") {
    const from = params?.get("from") ?? "";
    const to = params?.get("to") ?? "";
    if (parseIsoDate(from) && parseIsoDate(to) && from <= to) {
      return { kind: "custom", from, to };
    }
    return DEFAULT_RANGE;
  }
  if (raw && (RANGE_PRESETS as readonly string[]).includes(raw)) {
    return { kind: "preset", preset: raw as RangePreset };
  }
  return DEFAULT_RANGE;
}

/** Human-readable label for the current selection, used in card sublabels. */
export function rangeLabel(sel: RangeSelection): string {
  if (sel.kind === "preset") {
    return sel.preset === "all" ? "All time" : `Last ${PRESET_LABELS[sel.preset]}`;
  }
  return `${sel.from} → ${sel.to}`;
}
