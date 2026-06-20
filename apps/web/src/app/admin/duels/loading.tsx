import { Skeleton } from '@/components/ui/skeleton'

export default function AdminDuelsLoading() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md ml-auto" />
      </div>

      {/* Duels table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-6 gap-4 border-b border-border px-4 py-2">
          {['ID', 'Creator', 'Opponent', 'Stake', 'Status', 'Created'].map((h) => (
            <Skeleton key={h} className="h-3 w-full max-w-[80px]" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 gap-4 px-4 py-3 items-center">
              <Skeleton className="h-4 w-20 font-mono" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
