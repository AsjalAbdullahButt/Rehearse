import { Card } from "@/components/ui/card";

function Block({ className }: { className: string }) {
  return <div className={`bg-surface-2 animate-pulse rounded-[var(--radius-tile)] ${className}`} />;
}

export default function ReportLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <Block className="h-3 w-24" />
        <Block className="h-7 w-2/3" />
      </div>

      <Card className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-8">
          <div className="bg-surface-2 h-24 w-24 animate-pulse rounded-full" />
          <div className="grid flex-1 grid-cols-3 gap-6">
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
          </div>
        </div>
        <Block className="h-20 w-full" />
        <Block className="h-32 w-full" />
      </Card>
    </div>
  );
}
