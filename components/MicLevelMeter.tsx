"use client";

type MicLevelMeterProps = {
  level: number; // 0 a 1
  active: boolean;
  bars?: number;
};

export function MicLevelMeter({ level, active, bars = 14 }: MicLevelMeterProps) {
  const activeBars = active ? Math.round(level * bars) : 0;

  return (
    <div className="flex h-10 items-end justify-center gap-1" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const isLit = i < activeBars;
        const heightPct = 25 + (i / bars) * 75;
        return (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all duration-100 ${
              isLit ? "bg-emerald-500" : "bg-slate-200"
            }`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </div>
  );
}
