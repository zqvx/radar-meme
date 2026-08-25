import { cn } from "@/lib/utils";

export function RadarField({
  scanning = false,
  className,
}: {
  scanning?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative aspect-square w-full max-w-72", className)}
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full border border-border" />
      <div className="absolute inset-[12%] rounded-full border border-border" />
      <div className="absolute inset-[28%] rounded-full border border-border" />
      <div className="absolute inset-[46%] rounded-full border border-border-strong radar-pulse" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
      <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-border" />
      <div
        className={cn(
          "absolute inset-0 rounded-full",
          scanning ? "radar-sweep" : "opacity-40",
        )}
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, var(--color-accent) 28%, transparent) 50deg, transparent 70deg)",
        }}
      />
      <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
    </div>
  );
}
