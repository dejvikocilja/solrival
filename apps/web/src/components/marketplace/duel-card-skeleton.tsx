import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DuelCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-1 bg-surface-2" aria-hidden />
      <div className="space-y-4 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-start justify-between">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-[68px] w-full rounded-md" />
        <div className="flex justify-between">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </Card>
  );
}

export function DuelGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <DuelCardSkeleton key={i} />
      ))}
    </div>
  );
}
