import { useEffect, useState } from "react";
import { ownerKey } from "@/lib/bot-sync";

// Shows the user's personal TradingView webhook URL + a ready-to-paste alert
// payload. This is the real, standard path to "trade via TradingView": paste
// the URL into a TradingView alert, and firing it drives your ARA bots.
export function TradingViewWebhookCard() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState<"url" | "body" | null>(null);
  const [health, setHealth] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  useEffect(() => {
    const origin = window.location.origin;
    setUrl(`${origin}/api/webhooks/tradingview?t=${ownerKey()}`);
  }, []);

  const sampleBody = JSON.stringify(
    { action: "buy", symbol: "XAUUSD", price: "{{close}}", note: "{{strategy.order.comment}}" },
    null,
    2,
  );

  async function copy(text: string, which: "url" | "body") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — user can still select manually */
    }
  }

  async function testWebhook() {
    setHealth("checking");
    try {
      const res = await fetch(url, { method: "GET" });
      const j = (await res.json()) as { ok?: boolean; live?: boolean };
      setHealth(j?.ok && j?.live ? "ok" : "fail");
    } catch {
      setHealth("fail");
    }
  }

  return (
    <div className="panel overflow-hidden ring-1 ring-primary/30">
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-2xl">
          📊
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black">TradingView → Auto-trade</span>
            <span className="mono rounded bg-bull/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-bull">
              live koppeling
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Plak deze URL in een TradingView-alert. Als de alert afgaat, voeren jouw bots hem uit.
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-t border-panel-border/60 bg-panel-border/20 p-3">
        <label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Jouw persoonlijke webhook URL
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="mono min-w-0 flex-1 rounded-md border border-panel-border bg-background px-2 py-1.5 text-[11px] outline-none"
          />
          <button
            onClick={() => copy(url, "url")}
            className="mono shrink-0 rounded-md bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground"
          >
            {copied === "url" ? "✓" : "Kopieer"}
          </button>
        </div>

        <label className="mono mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          Alert-bericht (plak in het “Message”-veld)
        </label>
        <div className="relative">
          <pre className="mono overflow-x-auto rounded-md border border-panel-border bg-background px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
            {sampleBody}
          </pre>
          <button
            onClick={() => copy(sampleBody, "body")}
            className="mono absolute right-1.5 top-1.5 rounded border border-panel-border bg-panel px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground hover:text-foreground"
          >
            {copied === "body" ? "✓" : "Kopieer"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testWebhook}
            className="mono rounded-md border border-panel-border bg-background px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:border-primary/50"
          >
            {health === "checking" ? "Testen…" : "🛰 Test webhook"}
          </button>
          {health === "ok" && (
            <span className="mono text-[10px] font-black text-bull">✓ bereikbaar & live</span>
          )}
          {health === "fail" && (
            <span className="mono text-[10px] font-black text-bear">✕ niet bereikbaar</span>
          )}
        </div>

        <ol className="mono mt-1 list-decimal space-y-0.5 pl-4 text-[10px] leading-snug text-muted-foreground">
          <li>Open in TradingView een chart → Alert (klok-icoon) → Create Alert.</li>
          <li>
            Onderaan bij “Notifications” → zet <b>Webhook URL</b> aan → plak de URL hierboven.
          </li>
          <li>Zet het bericht (Message) op de JSON hierboven en pas symbool/actie aan.</li>
          <li>
            Zorg dat je een bot voor dat symbool hebt <b>gedeployed</b> — die pikt het signaal op.
          </li>
        </ol>
      </div>
    </div>
  );
}
