import { useEffect, useState } from "react";
import { getFeedStatus, onFeedStatus } from "@/lib/market-data";

// Honest data-source indicator. Green LIVE when real market data is flowing
// (Binance WS + Yahoo proxy), amber DEMO while the app runs on its built-in
// simulator (offline, blocked host, or feed not yet connected).
export function LiveStatusBadge({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState(() => getFeedStatus());
  useEffect(() => {
    const off = onFeedStatus(setStatus);
    return () => {
      off();
    };
  }, []);

  const live = status.connected;
  const dotClass = live ? "bg-bull" : "bg-warn";
  const label = live ? "LIVE DATA" : "DEMO";
  const title = live
    ? `Live marktdata actief — ${status.liveCount}/${status.total} koersen realtime${status.wsOpen ? " · Binance WS" : ""}`
    : "Simulatie — nog geen live verbinding (offline of geblokkeerd). Prijzen zijn gesimuleerd.";

  if (compact) {
    return (
      <span
        className="mono inline-flex items-center gap-1 text-[10px] text-muted-foreground"
        title={title}
      >
        <span className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {label}
      </span>
    );
  }

  return (
    <span
      title={title}
      className={`mono inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        live ? "border-bull/40 bg-bull/10 text-bull" : "border-warn/40 bg-warn/10 text-warn"
      }`}
    >
      <span className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
      {live && (
        <span className="text-muted-foreground">
          {status.liveCount}/{status.total}
        </span>
      )}
    </span>
  );
}
