import { Skeleton } from "@/components/ui/skeleton";

export default function AdminWithdrawalsLoading() {
  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-72" />
        </div>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-4 w-20 font-mono" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
