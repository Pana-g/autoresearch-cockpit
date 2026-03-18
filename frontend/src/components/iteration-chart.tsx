import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import { TrendingDown, ChevronDown, ChevronUp, Trophy, Maximize2, Minimize2 } from "lucide-react";
import { useChartData } from "@/hooks/use-queries";

interface ChartPoint {
  iteration: number;
  val_bpb: number | null;
  improved: boolean | null;
  status: string;
}

/** Show dots only when zoomed in enough (fewer than ~60 visible points) */
function AdaptiveDot(props: any) {
  const { cx, cy, payload, visibleCount } = props;
  if (cy == null || cx == null || payload.val_bpb == null) return null;
  if (visibleCount > 60) return null;

  if (payload.improved) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={visibleCount < 30 ? 5 : 3.5} fill="#34d399" stroke="#064e3b" strokeWidth={1.5} opacity={0.9} />
        {visibleCount < 30 && (
          <circle cx={cx} cy={cy} r={8} fill="none" stroke="#34d399" strokeWidth={1} opacity={0.3} />
        )}
      </g>
    );
  }

  if (payload.status === "failed") {
    return <circle cx={cx} cy={cy} r={3} fill="#f87171" stroke="#7f1d1d" strokeWidth={1} opacity={0.7} />;
  }

  return <circle cx={cx} cy={cy} r={2.5} fill="#94a3b8" stroke="#334155" strokeWidth={1} opacity={0.5} />;
}

function CustomActiveDot(props: any) {
  const { cx, cy, payload } = props;
  if (cy == null || cx == null) return null;
  const color = payload.improved ? "#34d399" : payload.status === "failed" ? "#f87171" : "#94a3b8";
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} stroke="white" strokeWidth={2} opacity={1} />
      <circle cx={cx} cy={cy} r={12} fill={color} opacity={0.15} />
    </g>
  );
}

function ChartTooltip({ active, payload, visibleCount }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-lg border border-border/30 bg-popover/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-muted-foreground">Iteration</span>
        <span className="text-xs font-semibold text-foreground">#{d.iteration}</span>
      </div>
      {d.val_bpb != null ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">val_bpb</span>
            <span className={`text-sm font-bold tabular-nums ${d.improved ? "text-emerald-400" : "text-foreground"}`}>
              {d.val_bpb.toFixed(6)}
            </span>
            {d.improved && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                new best
              </span>
            )}
          </div>
          {/* Show extra detail when zoomed */}
          {visibleCount != null && visibleCount <= 40 && d.status === "completed" && !d.improved && (
            <div className="mt-1 text-[10px] text-muted-foreground/50">no improvement — reverted</div>
          )}
        </>
      ) : (
        <span className="text-xs text-red-400 font-medium">Failed</span>
      )}
    </div>
  );
}

/** Mini brush chart — simplified sparkline for the navigation area */
function BrushChart(props: any) {
  const { x, y, width, height, data } = props;
  if (!data?.length || !width || !height) return null;

  const scores = data.filter((d: ChartPoint) => d.val_bpb != null).map((d: ChartPoint) => d.val_bpb!);
  if (!scores.length) return null;

  const yMin = Math.min(...scores);
  const yMax = Math.max(...scores);
  const yRange = yMax - yMin || 0.001;

  const points = data
    .filter((d: ChartPoint) => d.val_bpb != null)
    .map((d: ChartPoint, i: number, arr: ChartPoint[]) => {
      const px = x + (i / Math.max(arr.length - 1, 1)) * width;
      const py = y + height - ((d.val_bpb! - yMin) / yRange) * height * 0.8 - height * 0.1;
      return `${px},${py}`;
    })
    .join(" ");

  return (
    <polyline
      points={points}
      fill="none"
      stroke="#22d3ee"
      strokeWidth={1}
      strokeOpacity={0.5}
    />
  );
}

interface IterationChartProps {
  projectId: string;
  runId: string;
  bestValBpb: number | null;
}

export function IterationChart({ projectId, runId, bestValBpb }: IterationChartProps) {
  const { data: rawData } = useChartData(projectId, runId);
  const [collapsed, setCollapsed] = useState(false);
  const [brushRange, setBrushRange] = useState<{ startIndex?: number; endIndex?: number }>({});
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const data = useMemo<ChartPoint[]>(() => {
    if (!rawData) return [];
    return rawData
      .filter((s) => s.status === "completed" || s.status === "failed")
      .sort((a, b) => a.iteration - b.iteration);
  }, [rawData]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const resetZoom = useCallback(() => {
    setBrushRange({});
  }, []);

  const completedWithScore = useMemo(() => data.filter((d) => d.val_bpb != null), [data]);
  const improvements = useMemo(() => data.filter((d) => d.improved), [data]);

  // Scroll-to-zoom handler
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || data.length < 2) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const total = data.length;
      const curStart = brushRange.startIndex ?? 0;
      const curEnd = brushRange.endIndex ?? total - 1;
      const range = curEnd - curStart;

      // Total points to add/remove across the window
      const totalZoom = Math.max(2, Math.round(range * 0.2));
      const direction = Math.sign(e.deltaY); // +1 = zoom out, -1 = zoom in

      // Compute cursor position ratio within the plot area.
      // offsetX is relative to the container element; subtract the approximate
      // y-axis + left-margin width and right-margin to get the plot-only ratio.
      const containerWidth = (e.currentTarget as HTMLElement).offsetWidth;
      const plotLeft = 52;  // y-axis label area (approx)
      const plotRight = 12; // right margin
      const plotWidth = Math.max(1, containerWidth - plotLeft - plotRight);
      const cursorRatio = Math.max(0, Math.min(1, (e.offsetX - plotLeft) / plotWidth));

      // Split the zoom proportionally: cursor-side shrinks/grows less
      const leftChange = Math.round(totalZoom * cursorRatio);
      const rightChange = totalZoom - leftChange;

      let newStart = curStart - direction * leftChange;
      let newEnd = curEnd + direction * rightChange;

      // Clamp to data bounds
      newStart = Math.max(0, newStart);
      newEnd = Math.min(total - 1, newEnd);

      // Ensure minimum range of 4 points
      if (newEnd - newStart < 4) {
        const mid = Math.round((curStart + curEnd) / 2);
        newStart = Math.max(0, mid - 2);
        newEnd = Math.min(total - 1, mid + 2);
      }

      // If fully zoomed out, clear brush range
      if (newStart === 0 && newEnd === total - 1) {
        setBrushRange({});
      } else {
        setBrushRange({ startIndex: newStart, endIndex: newEnd });
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [data.length, brushRange]);

  if (data.length === 0) return null;

  // Determine visible range
  const startIdx = brushRange.startIndex ?? 0;
  const endIdx = brushRange.endIndex ?? data.length - 1;
  const visibleData = data.slice(startIdx, endIdx + 1);
  const visibleCount = visibleData.length;
  const isZoomed = visibleCount < data.length;

  // Compute Y domain from visible slice
  const visibleScores = visibleData.filter((d) => d.val_bpb != null).map((d) => d.val_bpb!);
  const yMin = visibleScores.length ? Math.min(...visibleScores) : 0;
  const yMax = visibleScores.length ? Math.max(...visibleScores) : 1;
  const yPad = Math.max((yMax - yMin) * 0.12, 0.002);

  return (
    <div className="glass rounded-xl overflow-hidden mb-6 transition-all duration-300">
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-tint/[3%] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <TrendingDown className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <span className="text-sm font-medium text-foreground/90">Score Progression</span>
          <span className="text-[11px] font-mono text-muted-foreground/50">
            {completedWithScore.length} evals
          </span>
          {improvements.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              <Trophy className="h-2.5 w-2.5" />
              {improvements.length} improvements
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {bestValBpb != null && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
              <span className="inline-block w-4 border-t-2 border-dashed border-emerald-400/60" />
              best: {bestValBpb.toFixed(4)}
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
      </button>

      {/* Chart */}
      {!collapsed && (
        <div className="px-4 pb-2 pt-1">
          {/* Zoom indicator */}
          {isZoomed && (
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-[10px] font-mono text-muted-foreground/50">
                Showing iterations {visibleData[0]?.iteration}–{visibleData[visibleData.length - 1]?.iteration}
              </span>
              <button
                onClick={resetZoom}
                className="flex items-center gap-1 text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors"
              >
                <Minimize2 className="h-3 w-3" />
                Reset zoom
              </button>
            </div>
          )}
          {!isZoomed && data.length > 20 && (
            <div className="flex items-center gap-1 mb-1 px-1">
              <Maximize2 className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[10px] text-muted-foreground/30">
                Scroll to zoom · drag handles below to pan
              </span>
            </div>
          )}
          <div className="h-60" ref={chartContainerRef}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="bpbGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.04}
                  strokeDasharray="3 6"
                  vertical={false}
                />
                <XAxis
                  dataKey="iteration"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "currentColor", strokeOpacity: 0.06 }}
                  interval="preserveStartEnd"
                  minTickGap={visibleCount > 80 ? 60 : 30}
                />
                <YAxis
                  domain={[yMin - yPad, yMax + yPad]}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v.toFixed(visibleCount <= 30 ? 4 : 3)}
                  width={visibleCount <= 30 ? 58 : 48}
                />
                <Tooltip
                  content={<ChartTooltip visibleCount={visibleCount} />}
                  cursor={{ stroke: "var(--color-border)", strokeDasharray: "4 4" }}
                />
                {bestValBpb != null && (
                  <ReferenceLine
                    y={bestValBpb}
                    stroke="#34d399"
                    strokeDasharray="6 4"
                    strokeOpacity={0.4}
                  />
                )}
                <Area
                  type="stepAfter"
                  dataKey="val_bpb"
                  stroke="#22d3ee"
                  strokeWidth={1.5}
                  fill="url(#bpbGradient)"
                  dot={(dotProps: any) => <AdaptiveDot {...dotProps} visibleCount={visibleCount} key={dotProps.key} />}
                  activeDot={<CustomActiveDot />}
                  connectNulls
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="iteration"
                  height={28}
                  stroke="var(--color-border)"
                  fill="transparent"
                  travellerWidth={8}
                  startIndex={brushRange.startIndex}
                  endIndex={brushRange.endIndex}
                  onChange={(range: any) => {
                    if (range && typeof range.startIndex === "number") {
                      setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
                    }
                  }}
                >
                  <AreaChart data={data}>
                    <Area
                      type="stepAfter"
                      dataKey="val_bpb"
                      stroke="#22d3ee"
                      strokeWidth={0.8}
                      strokeOpacity={0.4}
                      fill="#22d3ee"
                      fillOpacity={0.05}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </AreaChart>
                </Brush>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
