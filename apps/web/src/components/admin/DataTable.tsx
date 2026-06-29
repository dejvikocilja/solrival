'use client'

import { useState, type ReactNode } from "react"

export interface Column<T> {
  key:       string
  header:    string
  render:    (row: T) => ReactNode
  sortable?: boolean
  width?:    string  // tailwind width class, e.g. "w-32"
}

interface PaginationProps {
  page:     number
  total:    number
  limit:    number
  onPage:   (p: number) => void
}

interface DataTableProps<T> {
  columns:    Column<T>[]
  rows:       T[]
  onRowClick?: (row: T) => void
  pagination?: PaginationProps
  loading?:   boolean
  rowKey:     (row: T) => string
}

type SortDir = "asc" | "desc"

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  pagination,
  loading = false,
  rowKey,
}: DataTableProps<T>) {
  const [sortKey, setSortKey]   = useState<string | null>(null)
  const [sortDir, setSortDir]   = useState<SortDir>("asc")

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  // Client-side sort over current page
  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const col  = columns.find((c) => c.key === sortKey)
        if (!col) return 0
        // Compare rendered values as strings
        const va = String((a as Record<string, unknown>)[sortKey] ?? "")
        const vb = String((b as Record<string, unknown>)[sortKey] ?? "")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    : rows

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1

  return (
    <div className="flex flex-col gap-0">
      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={[
                    "whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-faint",
                    col.sortable ? "cursor-pointer select-none hover:text-fg" : "",
                    col.width ?? "",
                  ].join(" ")}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <SortIcon active={sortKey === col.key} dir={sortDir} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <div className="h-4 rounded-md bg-surface-2/60" style={{ width: "60%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-faint"
                >
                  No records found
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={[
                    "group bg-bg/40 transition-colors",
                    onRowClick
                      ? "cursor-pointer hover:bg-surface-2/40"
                      : "",
                  ].join(" ")}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="whitespace-nowrap px-4 py-3.5 text-fg"
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-1 pt-4">
          <p className="text-xs text-faint">
            {pagination.total.toLocaleString()} total · page {pagination.page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <PaginationButton
              label="←"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPage(pagination.page - 1)}
            />
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1
              return (
                <PaginationButton
                  key={p}
                  label={String(p)}
                  active={p === pagination.page}
                  onClick={() => pagination.onPage(p)}
                />
              )
            })}
            {totalPages > 7 && (
              <span className="flex items-center px-2 text-xs text-faint">…</span>
            )}
            <PaginationButton
              label="→"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPage(pagination.page + 1)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={active ? "text-rival" : "text-faint"}
    >
      <path
        d="M5 1L8 4H2L5 1ZM5 9L2 6H8L5 9Z"
        fill="currentColor"
        opacity={active ? (dir === "asc" ? 1 : 0.4) : 0.5}
      />
    </svg>
  )
}

function PaginationButton({
  label,
  onClick,
  disabled = false,
  active   = false,
}: {
  label:    string
  onClick:  () => void
  disabled?: boolean
  active?:  boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-30",
        active
          ? "bg-rival text-white"
          : "text-muted hover:bg-surface-2 hover:text-fg",
      ].join(" ")}
    >
      {label}
    </button>
  )
}
