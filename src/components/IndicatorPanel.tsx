import type { IndicatorFlags } from "@/components/TradingChart";

const ITEMS: { key: keyof IndicatorFlags; label: string; sub: string }[] = [
  { key: "ema20", label: "EMA 20", sub: "fast trend" },
  { key: "ema50", label: "EMA 50", sub: "mid trend" },
  { key: "ema200", label: "EMA 200", sub: "macro trend" },
  { key: "bollinger", label: "Bollinger", sub: "20 · 2σ" },
  { key: "volume", label: "Volume", sub: "histogram" },
  { key: "volumeProfile", label: "Volume Profile", sub: "POC · VA" },
  { key: "macd", label: "MACD", sub: "12/26/9" },
  { key: "rsi", label: "RSI", sub: "14" },
];

export function IndicatorPanel({
  flags,
  onChange,
}: {
  flags: IndicatorFlags;
  onChange: (f: IndicatorFlags) => void;
}) {
  return (
    <div className="mono flex flex-wrap gap-1.5">
      {ITEMS.map((it) => {
        const on = flags[it.key];
        return (
          <button
            key={it.key}
            onClick={() => onChange({ ...flags, [it.key]: !on })}
            className={`group rounded-md border px-2 py-1 text-left transition-all ${
              on
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-panel-border bg-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
            }`}
          >
            <div className="text-[10px] font-semibold uppercase leading-tight">{it.label}</div>
            <div className="text-[9px] opacity-70">{it.sub}</div>
          </button>
        );
      })}
    </div>
  );
}
