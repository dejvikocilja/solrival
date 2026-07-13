"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Field, NumberInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Arena controls.
 *
 * The advanced filters are COLLAPSED by default on every breakpoint. Six
 * numeric inputs permanently expanded above the duel grid buried the actual
 * product (the duels) under configuration the vast majority of visitors never
 * touch. What stays visible is only what most people use — game and sort —
 * plus a Filters button carrying a count, and removable chips summarising
 * whatever is currently applied, so nothing is ever hidden *silently*.
 */

const GAME_OPTIONS = [
  { value: "", label: "All games" },
  { value: "CLASH_ROYALE", label: "Clash Royale", activeClassName: "text-cr" },
  { value: "BRAWL_STARS", label: "Brawl Stars", activeClassName: "text-bs" },
];

const SORT_OPTIONS = [
  { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "NEWEST", label: "Newest" },
  { value: "STAKE_HIGH", label: "Highest stake" },
  { value: "STAKE_LOW", label: "Lowest stake" },
];

const WIN_RATE_OPTIONS = [
  { value: "", label: "Any win rate" },
  { value: "5000", label: "50% and up" },
  { value: "6000", label: "60% and up" },
  { value: "7000", label: "70% and up" },
  { value: "8000", label: "80% and up" },
];

/** Advanced filter keys (game lives in the always-visible row, so it's excluded). */
const FILTER_KEYS = [
  "minStakeLamports",
  "maxStakeLamports",
  "minTrophies",
  "maxTrophies",
  "minAccountLevel",
  "maxAccountLevel",
  "minWinRateBps",
] as const;

const solToLamports = (sol: string): string | null => {
  const n = Number.parseFloat(sol);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e9)).toString() : null;
};
const lamportsToSolInput = (lamports: string | null): string =>
  lamports ? String(Number(lamports) / 1e9) : "";

export function ArenaControls({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const get = (k: string) => searchParams.get(k) ?? "";

  // Controlled local state for free-typed numeric fields (seeded from the URL).
  const [minStake, setMinStake] = React.useState(() => lamportsToSolInput(searchParams.get("minStakeLamports")));
  const [maxStake, setMaxStake] = React.useState(() => lamportsToSolInput(searchParams.get("maxStakeLamports")));
  const [minTrophies, setMinTrophies] = React.useState(() => get("minTrophies"));
  const [maxTrophies, setMaxTrophies] = React.useState(() => get("maxTrophies"));
  const [minLevel, setMinLevel] = React.useState(() => get("minAccountLevel"));
  const [maxLevel, setMaxLevel] = React.useState(() => get("maxAccountLevel"));

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("cursor"); // any filter/sort change resets pagination
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [searchParams, pathname, router],
  );

  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const commitDebounced = (key: string, value: string | null) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => update({ [key]: value }), 450);
  };

  const clearAll = () => {
    setMinStake("");
    setMaxStake("");
    setMinTrophies("");
    setMaxTrophies("");
    setMinLevel("");
    setMaxLevel("");
    update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  };

  const activeFilterCount = FILTER_KEYS.filter((k) => get(k) !== "").length;

  /** Human summary of what's applied, each chip removable in one click. */
  const chips: Array<{ label: string; clear: () => void }> = [];
  if (get("minStakeLamports") || get("maxStakeLamports")) {
    const lo = minStake || "0";
    const hi = maxStake || "∞";
    chips.push({
      label: `Stake ${lo}–${hi} SOL`,
      clear: () => {
        setMinStake("");
        setMaxStake("");
        update({ minStakeLamports: null, maxStakeLamports: null });
      },
    });
  }
  if (get("minWinRateBps")) {
    chips.push({
      label: `${Number(get("minWinRateBps")) / 100}%+ win rate`,
      clear: () => update({ minWinRateBps: null }),
    });
  }
  if (get("minTrophies") || get("maxTrophies")) {
    chips.push({
      label: `Trophies ${minTrophies || "0"}–${maxTrophies || "∞"}`,
      clear: () => {
        setMinTrophies("");
        setMaxTrophies("");
        update({ minTrophies: null, maxTrophies: null });
      },
    });
  }
  if (get("minAccountLevel") || get("maxAccountLevel")) {
    chips.push({
      label: `Level ${minLevel || "0"}–${maxLevel || "∞"}`,
      clear: () => {
        setMinLevel("");
        setMaxLevel("");
        update({ minAccountLevel: null, maxAccountLevel: null });
      },
    });
  }

  return (
    <div className="space-y-3">
      {/* Primary row — the only controls most players ever touch. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:max-w-md sm:flex-1">
          <Segmented
            aria-label="Filter by game"
            options={GAME_OPTIONS}
            value={get("game")}
            onValueChange={(v) => update({ game: v || null })}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={open || activeFilterCount > 0 ? "secondary" : "ghost"}
            size="md"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="arena-filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-1 rounded-full bg-rival px-1.5 text-xs tabular text-rival-fg">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
          <div className="min-w-[170px]">
            <Select
              aria-label="Sort duels"
              options={SORT_OPTIONS}
              value={get("sort") || "EXPIRING_SOON"}
              onChange={(e) => update({ sort: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Result count + active filter chips — applied filters stay visible even
          when the panel is closed, so results are never mysteriously narrow. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm tabular text-muted">
          {resultCount} open {resultCount === 1 ? "duel" : "duels"}
        </span>
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={chip.clear}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-2.5 pr-1.5 text-caption text-muted transition-colors hover:border-border-strong hover:text-fg focus-visible:focus-ring"
          >
            {chip.label}
            <X className="h-3 w-3" aria-hidden />
            <span className="sr-only">Remove filter</span>
          </button>
        ))}
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="rounded-sm text-caption text-faint underline-offset-2 transition-colors hover:text-fg hover:underline focus-visible:focus-ring"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* Advanced filters — collapsed until asked for, on every breakpoint. */}
      <div
        id="arena-filters"
        className={cn("rounded-lg border border-border bg-surface/60 p-4", open ? "block" : "hidden")}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
          <Field label="Min stake" hint="SOL">
            <NumberInput
              placeholder="0.5"
              value={minStake}
              onChange={(e) => {
                setMinStake(e.target.value);
                commitDebounced("minStakeLamports", solToLamports(e.target.value));
              }}
            />
          </Field>
          <Field label="Max stake" hint="SOL">
            <NumberInput
              placeholder="Any"
              value={maxStake}
              onChange={(e) => {
                setMaxStake(e.target.value);
                commitDebounced("maxStakeLamports", solToLamports(e.target.value));
              }}
            />
          </Field>
          <Field label="Win rate">
            <Select
              aria-label="Minimum win rate"
              options={WIN_RATE_OPTIONS}
              value={get("minWinRateBps")}
              onChange={(e) => update({ minWinRateBps: e.target.value || null })}
            />
          </Field>
          <Field label="Trophy range">
            <div className="flex items-center gap-2">
              <NumberInput
                aria-label="Minimum trophies"
                placeholder="Min"
                value={minTrophies}
                onChange={(e) => {
                  setMinTrophies(e.target.value);
                  commitDebounced("minTrophies", e.target.value || null);
                }}
              />
              <span className="text-faint">–</span>
              <NumberInput
                aria-label="Maximum trophies"
                placeholder="Max"
                value={maxTrophies}
                onChange={(e) => {
                  setMaxTrophies(e.target.value);
                  commitDebounced("maxTrophies", e.target.value || null);
                }}
              />
            </div>
          </Field>
          <Field label="Account level" className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2">
              <NumberInput
                aria-label="Minimum account level"
                placeholder="Min"
                value={minLevel}
                onChange={(e) => {
                  setMinLevel(e.target.value);
                  commitDebounced("minAccountLevel", e.target.value || null);
                }}
              />
              <span className="text-faint">–</span>
              <NumberInput
                aria-label="Maximum account level"
                placeholder="Max"
                value={maxLevel}
                onChange={(e) => {
                  setMaxLevel(e.target.value);
                  commitDebounced("maxAccountLevel", e.target.value || null);
                }}
              />
            </div>
          </Field>

          <div className="col-span-2 flex items-end justify-end gap-2 lg:col-span-2">
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
