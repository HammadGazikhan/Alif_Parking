import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "./page-header";

export function PageSkeleton({ variant = "table" }: { variant?: "table" | "dashboard" | "detail" }) {
  return (
    <PageContainer>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 max-w-full rounded-md" />
      </div>
      {variant === "dashboard" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Skeleton className="h-[340px] rounded-2xl xl:col-span-2" />
            <Skeleton className="h-[340px] rounded-2xl" />
          </div>
        </>
      ) : variant === "detail" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl lg:col-span-2" />
        </div>
      ) : (
        <div className="surface-card p-5">
          <div className="mb-5 flex gap-3">
            <Skeleton className="h-10 w-72 rounded-xl" />
            <Skeleton className="h-10 w-36 rounded-xl" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
