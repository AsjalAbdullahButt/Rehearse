import { Skeleton } from "@/components/ui/skeleton";

export default function ReportLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14"
    >
      <p role="status" className="sr-only">
        Building your report…
      </p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-3/4" />
      </div>
      <div className="flex flex-wrap items-center gap-8">
        <Skeleton className="size-[120px] rounded-full" />
        <div className="grid flex-1 grid-cols-3 gap-6">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
