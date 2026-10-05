import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <p role="status" className="sr-only">
        Loading your page…
      </p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
