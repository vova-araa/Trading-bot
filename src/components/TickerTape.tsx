import { useEffect, useRef, useState } from "react";
import {
  SYMBOLS,
  currentPrice,
  formatPrice,
  dayChangePct,
  symbolSource,
  onTick,
} from "@/lib/market-data";

// Full-width scrolling ticker tape — the signature "live trading floor" strip.
// Rides the same live feed as the rest of the app: real price + real day-change
// per symbol, a pulsing dot on symbols currently backed by live data, and a
// soft flash on each tick. Pauses on hover; respects reduced-motion.
export function TickerTape() {
  const [, force] = useState(0);
  // throttle re-renders to ~4/s so the marquee stays smooth under a tick storm
  useEffect(() => {
    let dirty = false;
    const off = onTick(() => {
      dirty = true;
    });
    const iv = setInterval(() => {
      if (dirty) {
        dirty = false;
        force((n) => n + 1);
      }
    }, 250);
    return () => {
      off();
      clearInterval(iv);
    };
  }, []);

  // Recomputed on each throttled re-render so prices/changes stay live.
  const items = SYMBOLS.map((s) => ({
    id: s.id,
    price: currentPrice(s.id),
    change: dayChangePct(s.id),
    live: symbolSource(s.id) === "live",
  }));

  // Duplicate the row so the -50% translate loops seamlessly.
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden border-b border-panel-border/70 bg-panel/60 py-1.5 backdrop-blur">
      <div className="ticker-track">
        {doubled.map((it, i) => (
          <TickerItem key={`${it.id}-${i}`} {...it} />
        ))}
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-panel to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-panel to-transparent" />
    </div>
  );
}

function TickerItem({
  id,
  price,
  change,
  live,
}: {
  id: string;
  price: number;
  change: number;
  live: boolean;
}) {
  const up = change >= 0;
  const prevPrice = useRef(price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (price > prevPrice.current) setFlash("up");
    else if (price < prevPrice.current) setFlash("down");
    prevPrice.current = price;
    if (price) {
      const t = setTimeout(() => setFlash(null), 450);
      return () => clearTimeout(t);
    }
  }, [price]);

  return (
    <span className="mono inline-flex items-center gap-1.5 px-3 text-[11px]">
      <span
        className={`inline-block h-1 w-1 rounded-full ${live ? "live-dot bg-bull" : "bg-muted-foreground/50"}`}
        title={live ? "Live data" : "Demo data"}
      />
      <span className="font-black tracking-tight text-foreground">{id}</span>
      <span
        className={`tabular-nums transition-colors ${
          flash === "up" ? "text-bull" : flash === "down" ? "text-bear" : "text-muted-foreground"
        }`}
      >
        {formatPrice(id, price)}
      </span>
      <span className={`tabular-nums font-bold ${up ? "text-bull" : "text-bear"}`}>
        {up ? "▲" : "▼"}
        {up ? "+" : ""}
        {change.toFixed(2)}%
      </span>
      <span className="text-panel-border">·</span>
    </span>
  );
}
