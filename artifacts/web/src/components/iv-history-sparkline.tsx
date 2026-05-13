import { useGetIvHistory } from "@workspace/api-client-react";
import type { IvSnapshotPoint } from "@workspace/api-client-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
  className?: string;
}

export function IvHistorySparkline({ ticker, className }: Props) {
  const { data, isLoading } = useGetIvHistory(ticker);

  if (isLoading) {
    return (
      <div
        className={cn("h-12 w-full animate-pulse rounded-md bg-muted/40", className)}
        data-testid="iv-sparkline-loading"
      />
    );
  }
  const points = data?.points ?? [];
  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground",
          className,
        )}
        data-testid="iv-sparkline-empty"
      >
        No IV history yet — collecting daily snapshots.
      </div>
    );
  }

  const ivs = points.map((p: IvSnapshotPoint) => p.iv);
  const min = Math.min(...ivs);
  const max = Math.max(...ivs);
  const stroke = data?.basis === "real" ? "var(--primary)" : "var(--muted-foreground)";

  return (
    <div className={cn("space-y-1", className)} data-testid="iv-sparkline">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>52-week IV</span>
        <span className="tabular-nums">
          {(min * 100).toFixed(0)}% – {(max * 100).toFixed(0)}% · {data?.sampleSize ?? 0} pts
          {data?.basis === "provisional" && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">provisional</span>
          )}
        </span>
      </div>
      <div className="h-12 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis hide domain={[min * 0.95, max * 1.05]} />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
                padding: "4px 8px",
              }}
              labelFormatter={(label: unknown) => String(label)}
              formatter={(v: unknown) => [`${(Number(v) * 100).toFixed(1)}%`, "ATM IV"]}
            />
            <Line
              type="monotone"
              dataKey="iv"
              stroke={stroke}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
