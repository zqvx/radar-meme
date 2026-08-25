import { cn } from "@/lib/utils";

export function ScoreRing({
  value,
  max = 80,
  size = 56,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const tone =
    pct >= 0.7 ? "text-good" : pct >= 0.4 ? "text-warn" : "text-bad";
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 44 44" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          className="text-border-strong"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className={tone}
        />
      </svg>
      <span className={cn("absolute font-mono text-sm tabular-nums", tone)}>
        {Math.round(value)}
      </span>
    </div>
  );
}
