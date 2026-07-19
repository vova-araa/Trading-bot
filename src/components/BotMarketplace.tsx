import { useEffect, useState } from "react";
import { MARKETPLACE, type BotTemplate } from "@/lib/bot-marketplace";
import { installFromTemplate } from "@/lib/bots";
import { autoBind, brokerEmoji, brokerLabel, connectedBrokers, pickBrokerFor, translateSymbol } from "@/lib/broker-mapping";
import { BotPreview } from "@/components/BotPreview";

const PLATFORMS = ["Alle", "MQL5", "cTrader", "TradingView", "Binance"] as const;
type Platform = typeof PLATFORMS[number];

export function BotMarketplace({ onInstalled }: { onInstalled?: () => void }) {
  const [filter, setFilter] = useState<Platform>("Alle");
  const [q, setQ] = useState("");

  const list = MARKETPLACE.filter((t) => {
    if (filter !== "Alle" && t.platform !== filter) return false;
    if (q && !`${t.name} ${t.author} ${t.desc}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="panel mb-3 flex flex-col gap-2 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek bot, auteur of strategie…"
          className="w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-1 overflow-x-auto">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`mono shrink-0 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                filter === p ? "bg-primary text-primary-foreground" : "border border-panel-border text-muted-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.map((t) => (
          <TemplateCard key={t.id} tpl={t} onInstalled={onInstalled} />
        ))}
        {list.length === 0 && (
          <div className="panel col-span-full p-6 text-center text-sm text-muted-foreground">
            Geen bots gevonden.
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ tpl, onInstalled }: { tpl: BotTemplate; onInstalled?: () => void }) {
  const [installed, setInstalled] = useState<null | { broker: string; symbol: string; leverage: number } | "no-broker">(null);
  const [brokerBump, setBrokerBump] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const riskColor = tpl.risk === "Laag" ? "text-bull" : tpl.risk === "Hoog" ? "text-bear" : "text-primary";

  // Live preview of what auto-bind would produce (reacts to broker connects)
  useEffect(() => {
    const sync = () => setBrokerBump((n) => n + 1);
    window.addEventListener("ara-brokers-change", sync);
    return () => window.removeEventListener("ara-brokers-change", sync);
  }, []);
  const brokers = connectedBrokers();
  const picked = brokers.length ? pickBrokerFor(tpl, tpl.symbols[0]) : null;
  const previewSym = picked ? translateSymbol(picked.id, tpl.symbols[0]) : tpl.symbols[0];
  void brokerBump;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel-border/40 text-2xl">
          {tpl.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-black">{tpl.name}</span>
            <span className="mono shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary">
              {tpl.platform}
            </span>
          </div>
          <div className="mono truncate text-[10px] text-muted-foreground">{tpl.author}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{tpl.desc}</div>
        </div>
      </div>

      {/* Auto-bind preview strip */}
      <div className={`mono flex items-center gap-1.5 border-t border-panel-border/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
        picked ? "bg-primary/5 text-primary" : "bg-warn/5 text-warn"
      }`}>
        {picked ? (
          <>
            <span className="text-sm">{brokerEmoji(picked.id)}</span>
            <span className="truncate">{brokerLabel(picked.id)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="normal-case tracking-normal">{previewSym}</span>
            <span className="ml-auto opacity-70">auto-koppel</span>
          </>
        ) : (
          <>
            <span>⚠ Geen broker gekoppeld — koppel er één in tab Brokers</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-4 gap-px border-t border-panel-border/60 bg-panel-border/50">
        <Meta label="Rating" value={`★ ${tpl.rating.toFixed(1)}`} />
        <Meta label="Installs" value={tpl.installs > 1000 ? `${(tpl.installs / 1000).toFixed(1)}k` : `${tpl.installs}`} />
        <Meta label="TF" value={tpl.timeframe} />
        <Meta label="Risico" value={tpl.risk} cls={riskColor} />
      </div>

      {previewOpen && <BotPreview tpl={tpl} />}

      <div className="grid grid-cols-[auto_1fr] gap-px border-t border-panel-border/60 bg-panel-border/50">
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          className={`mono px-3 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
            previewOpen ? "bg-primary text-primary-foreground" : "bg-panel text-primary hover:bg-primary/10"
          }`}
        >
          👁 {previewOpen ? "Sluit" : "Preview"}
        </button>
        <button
          onClick={() => {
            installFromTemplate(tpl.id);
            const bound = autoBind(tpl, tpl.symbols[0]);
            if (bound) {
              setInstalled({ broker: brokerLabel(bound.brokerId), symbol: bound.brokerSymbol, leverage: bound.leverage });
            } else {
              setInstalled("no-broker");
            }
            onInstalled?.();
            setTimeout(() => setInstalled(null), 2500);
          }}
          className={`mono py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
            installed ? "bg-bull/20 text-bull" : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {installed === "no-broker"
            ? "✓ Koppel broker in editor"
            : installed
            ? `✓ ${installed.broker} · ${installed.symbol} · ${installed.leverage}x`
            : `+ Installeer · ${tpl.price}`}
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-panel px-2 py-1.5 text-center">
      <div className="mono text-[8px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono text-[11px] font-black ${cls || "text-foreground"}`}>{value}</div>
    </div>
  );
}
