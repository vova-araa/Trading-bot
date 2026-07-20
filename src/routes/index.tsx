import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SignalCard } from "@/components/SignalCard";
import { BotCard } from "@/components/BotCard";
import { BotMarketplace } from "@/components/BotMarketplace";
import { BotEditor } from "@/components/BotEditor";
import { BotShareDialog } from "@/components/BotShareDialog";
import { PumpScreener } from "@/components/PumpScreener";
import { TraderList } from "@/components/TraderCard";
import { PortfolioBar } from "@/components/PortfolioBar";
import { BrokerList } from "@/components/BrokerCard";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { BotStatusPanel } from "@/components/BotStatusPanel";
import { NotificationToggle } from "@/components/NotificationToggle";
import { LiveStatusBadge } from "@/components/LiveStatusBadge";
import { TickerTape } from "@/components/TickerTape";
import { ChartTradeTab } from "@/components/ChartTradeTab";
import { MarketPulse } from "@/components/MarketPulse";
import { EdgeTab } from "@/components/EdgeTab";
import { PredictionMarkets } from "@/components/PredictionMarkets";
import { startPositionEngine } from "@/lib/positions";
import {
  buildCandles,
  currentPrice,
  formatPrice,
  onTick,
  startTickStream,
  SYMBOLS,
} from "@/lib/market-data";
import { STRATEGIES, type Setup } from "@/lib/strategies";
import { getBots, startBotEngine, subscribeBots, mergeBotPatch, addRemoteBot, removeBotLocal, type Bot } from "@/lib/bots";
import { bindBotSync, startDeployedMirror } from "@/lib/bot-sync";
import { registerAraServiceWorker } from "@/lib/pwa";
import { cacheSetups } from "@/lib/setup-cache";
import { InstallPwaCard } from "@/components/InstallPwaCard";


import { pushSignal } from "@/lib/notifications";
import { startAlertEngine } from "@/lib/alerts";
import { startNewsNotifier } from "@/lib/news-notifier";
import { AlertsPanel } from "@/components/AlertsPanel";
import { NewsCenter } from "@/components/NewsCenter";
import { ShortcutQuickMenu } from "@/components/ShortcutQuickMenu";
import { PushDebugPanel } from "@/components/PushDebugPanel";

const ALLOWED_TABS: Tab[] = [
  "signals",
  "chart",
  "edge",
  "alerts",
  "news",
  "bots",
  "market",
  "brokers",
  "copy",
  "pump",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ARA TRADES — Signalen, Bots & Copy Trading" },
      { name: "description", content: "Realtime signalen, 24/7 bots, futures & crypto, push notificaties en broker koppelingen (TradingView, cTrader, MT4/MT5, Binance)." },
      { property: "og:title", content: "ARA TRADES — Signalen, Bots & Copy Trading" },
      { property: "og:description", content: "Signalen, bots, brokers en copy trading in één mobiele app." },
      { property: "og:type", content: "website" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" && (ALLOWED_TABS as string[]).includes(s.tab) ? (s.tab as Tab) : undefined,
    src: typeof s.src === "string" ? s.src : undefined,
    bot: typeof s.bot === "string" ? s.bot : undefined,
  }),
  component: Home,
});


function Home() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "signals");
  useEffect(() => { if (search.tab) setTab(search.tab); }, [search.tab]);

  const [setups, setSetups] = useState<Setup[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(new Date());
  const [bots, setBots] = useState<Bot[]>(() => getBots());
  const [editing, setEditing] = useState<Bot | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [importSeed, setImportSeed] = useState<string | null>(null);

  useEffect(() => {
    if (search.bot) {
      setImportSeed(search.bot);
      setShareOpen(true);
      setTab("bots");
    }
  }, [search.bot]);

  useEffect(() => {
    startTickStream();
    startBotEngine();
    startPositionEngine();
    startAlertEngine();
    startNewsNotifier();
    void registerAraServiceWorker();
  }, []);
  useEffect(() => {
    const unsync = bindBotSync(mergeBotPatch, addRemoteBot, removeBotLocal);
    const unmirror = startDeployedMirror();
    return () => { unsync(); unmirror(); };
  }, []);


  useEffect(() => subscribeBots(setBots), []);
  useEffect(() => { const i = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(i); }, []);

  useEffect(() => {
    const seen = new Set<string>();
    const scan = () => {
      const fresh: Setup[] = [];
      for (const sym of SYMBOLS) {
        const c = buildCandles(sym, "1m");
        for (const st of STRATEGIES) {
          const s = st.detect(c, sym.id);
          if (s && !seen.has(s.id)) { seen.add(s.id); fresh.push(s); }
        }
      }
      if (fresh.length) {
        setSetups((prev) => [...fresh, ...prev].slice(0, 12));
        cacheSetups(fresh);
        // push notification for the first new setup — deep-links into /trade/:id
        const s = fresh[0];
        pushSignal(
          `${s.side === "long" ? "▲ KOOP" : "▼ VERKOOP"} ${s.symbol}`,
          `Entry ${formatPrice(s.symbol, s.entry)} · SL ${formatPrice(s.symbol, s.stop)} · TP ${formatPrice(s.symbol, s.target)}`,
          s.id,
          { kind: "entry", symbol: s.symbol, setupId: s.id },
        );
      }

    };
    scan();
    const iv = setInterval(scan, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const off = onTick((id, p) => {
      setPrices((prev) => (prev[id] === p ? prev : { ...prev, [id]: p }));
    });
    return () => { off(); };
  }, []);

  const now = useMemo(() => clock.toISOString().slice(11, 19), [clock]);
  const deployedCount = bots.filter((b) => b.deployed).length;

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-panel-border/70 bg-panel/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-bull text-sm font-black text-primary-foreground shadow-lg">
              A
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black tracking-tight sm:text-base">
                ARA <span className="text-primary">TRADES</span>
              </div>
              <div className="mono flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <LiveStatusBadge compact />
                <span className="text-panel-border">·</span>
                {now}
                {deployedCount > 0 && (
                  <span className="ml-1 rounded-full bg-bull/15 px-1.5 py-0.5 text-[9px] font-black text-bull">
                    {deployedCount} bot{deployedCount > 1 ? "s" : ""} 24/7
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <NotificationToggle />
            <Link
              to="/settings/notifications"
              title="Notificatie instellingen"
              className="mono shrink-0 rounded-md border border-panel-border px-2 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              ⚙
            </Link>
            <Link
              to="/pro"
              className="mono hidden shrink-0 rounded-md border border-panel-border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary sm:inline-block"
            >
              Pro
            </Link>
          </div>
        </div>
        {/* Desktop tabs */}
        <div className="mx-auto hidden max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:flex">
          {([
            { id: "signals", label: "🎯 Signalen" },
            { id: "chart", label: "📈 Chart" },
            { id: "edge", label: "🐋 Edge" },
            { id: "alerts", label: "🔔 Alarmen" },
            { id: "news", label: "📰 Nieuws" },
            { id: "bots", label: "🤖 Mijn Bots" },
            { id: "market", label: "🛒 Bot Store" },
            { id: "brokers", label: "🔌 Brokers" },
            { id: "copy", label: "👥 Copy" },
            { id: "pump", label: "🚀 Pump" },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`mono shrink-0 rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Live ticker tape */}
      <TickerTape />

      <main className="mx-auto max-w-5xl px-4 py-5">
        {/* Always-on portfolio bar */}
        <div className="mb-3">
          <PortfolioBar />
        </div>
        <InstallPwaCard />
        <div className="mb-3">
          <ShortcutQuickMenu />
        </div>


        {tab === "signals" && (
          <>
            <div className="panel mb-5 grid grid-cols-3 gap-px overflow-hidden bg-panel-border/50">
              <Legend n="1" icon="🎯" text="Koop op deze prijs" tone="primary" />
              <Legend n="2" icon="🛑" text="Stop als het misgaat" tone="bear" />
              <Legend n="3" icon="💰" text="Neem winst hier" tone="bull" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight">
                {setups.length > 0 ? "Trade van nu" : "Aan het scannen…"}
              </h2>
              <span className="mono text-[11px] text-muted-foreground">{setups.length} signalen</span>
            </div>
            {setups.length === 0 ? (
              <div className="panel flex flex-col items-center justify-center gap-3 p-10 text-center">
                <span className="live-dot inline-block h-3 w-3 rounded-full bg-primary" />
                <p className="text-sm text-muted-foreground">
                  We kijken naar {SYMBOLS.length} koersen tegelijk.<br />
                  Zodra er een goede trade komt, zie je hem hier.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {setups.map((s) => (
                  <SignalCard key={s.id} setup={s} live={prices[s.symbol] ?? currentPrice(s.symbol)} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "chart" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">📈 Chart & Trade</h2>
              <p className="text-[12px] text-muted-foreground">
                Live candles van 1 seconde tot 1 dag, met volume. Plaats direct een trade of zet er een bot op.
              </p>
            </div>
            <ChartTradeTab />
          </>
        )}

        {tab === "edge" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">🐋 Smart Money Edge</h2>
              <p className="text-[12px] text-muted-foreground">
                Zie live wanneer walvissen en instituten in- of uitstappen, wie er geliquideerd
                wordt, en wat de markt verwacht <em>vóór</em> het nieuws uitkomt.
              </p>
            </div>
            <EdgeTab />
          </>
        )}

        {tab === "alerts" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">🔔 Prijs alarmen</h2>
              <p className="text-[12px] text-muted-foreground">Krijg een seintje + geluid zodra de prijs jouw entry, TP of SL raakt — of vlakbij komt.</p>
            </div>
            <AlertsPanel />
          </>
        )}
        {tab === "news" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">📰 Nieuws & Kalender</h2>
              <p className="text-[12px] text-muted-foreground">
                Alle economische events op één plek. <span className="mono font-bold text-primary">🔮 Nowcast</span> laat zien wat GDPNow, Cleveland Fed, Truflation, Kalshi en Bloomberg verwachten — <em>voordat</em> het cijfer uitkomt.
              </p>
            </div>
            <MarketPulse />
            <div className="mb-3">
              <PredictionMarkets />
            </div>
            <NewsCenter />
          </>
        )}

        {tab === "bots" && (
          <>
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-black tracking-tight">Mijn Bots</h2>
                <p className="text-[12px] text-muted-foreground">Druk op <span className="mono font-bold text-primary">⚙</span> om instellingen zoals lot, SL, TP en strategie aan te passen.</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => { setImportSeed(null); setShareOpen(true); }}
                  className="mono rounded-md border border-panel-border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-panel-border/40"
                >
                  📥 Import
                </button>
                <button
                  onClick={() => setTab("market")}
                  className="mono rounded-md bg-primary/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/25"
                >
                  + Nieuwe bot
                </button>
              </div>
            </div>
            {bots.length === 0 ? (
              <div className="panel flex flex-col items-center gap-3 p-8 text-center">
                <span className="text-4xl">🛒</span>
                <p className="text-sm text-muted-foreground">Nog geen bots. Ga naar de Store en installeer er één met 1 klik.</p>
                <button onClick={() => setTab("market")} className="mono rounded-md bg-primary px-4 py-2 text-[11px] font-black uppercase text-primary-foreground">
                  Open Bot Store
                </button>
              </div>
            ) : (
              <>
                <BotStatusPanel />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {bots.map((b) => <BotCard key={b.id} bot={b} onEdit={setEditing} />)}
                </div>
              </>
            )}
          </>
        )}

        {tab === "market" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">🛒 Bot Store</h2>
              <p className="text-[12px] text-muted-foreground">Bots uit <span className="mono font-bold">MQL5</span>, <span className="mono font-bold">cTrader</span>, <span className="mono font-bold">TradingView</span> en <span className="mono font-bold">Binance</span>. Werkt op elk platform via ARA. 1 klik = geïnstalleerd.</p>
            </div>
            <BotMarketplace onInstalled={() => { /* stays on market; user kan naar Mijn Bots via nav */ }} />
          </>
        )}

        {tab === "brokers" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">Brokers & Platformen</h2>
              <p className="text-[12px] text-muted-foreground">Koppel je account. ARA stuurt dan trades door naar TradingView, cTrader, MT4/MT5, Binance of Bybit.</p>
            </div>
            <BrokerList />
          </>
        )}

        {tab === "copy" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">Kopieer Top Traders</h2>
              <p className="text-[12px] text-muted-foreground">Druk op "Kopieer" en jouw account doet automatisch dezelfde trades.</p>
            </div>
            <TraderList />
          </>
        )}

        {tab === "pump" && (
          <>
            <div className="mb-3">
              <h2 className="text-lg font-black tracking-tight">Pump Screener</h2>
              <p className="text-[12px] text-muted-foreground">Welke koers gaat nú het hardst?</p>
            </div>
            <PumpScreener />
          </>
        )}
      </main>
      <PushDebugPanel />

      <footer className="mono border-t border-panel-border/70 py-4 text-center text-[10px] text-muted-foreground">
        ARA TRADES · Educatief · geen financieel advies · demo data
      </footer>

      {/* Mobile bottom tab bar */}
      <BottomNav tab={tab} onChange={setTab} />

      {editing && <BotEditor bot={editing} onClose={() => setEditing(null)} />}
      {shareOpen && (
        <BotShareDialog
          initialMode="import"
          initialText={importSeed ?? undefined}
          onClose={() => { setShareOpen(false); setImportSeed(null); }}
          onImported={() => { setShareOpen(false); setImportSeed(null); setTab("bots"); }}
        />
      )}
    </div>
  );
}

function Legend({ n, icon, text, tone }: { n: string; icon: string; text: string; tone: "primary" | "bull" | "bear" }) {
  const bg = tone === "primary" ? "bg-primary text-primary-foreground" : tone === "bull" ? "bg-bull text-background" : "bg-bear text-background";
  return (
    <div className="flex items-center gap-2 bg-panel px-3 py-3">
      <span className={`mono grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ${bg}`}>{n}</span>
      <span className="text-xl">{icon}</span>
      <span className="min-w-0 truncate text-[11px] font-semibold sm:text-xs">{text}</span>
    </div>
  );
}
