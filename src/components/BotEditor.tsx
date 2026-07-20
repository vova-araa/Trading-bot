import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { findTemplate } from "@/lib/bot-marketplace";
import {
  applyBotConfig,
  removeBot,
  setBotLive,
  updateBotBroker,
  type Bot,
  type BotSettings,
} from "@/lib/bots";
import { mt5Configured } from "@/lib/mt5";
import { SYMBOLS } from "@/lib/market-data";
import { subscribeVersions, type BotVersion } from "@/lib/bot-versions";
import {
  brokerCaps, brokerEmoji, brokerLabel, connectedBrokers, translateSymbol,
  type BrokerBinding,
} from "@/lib/broker-mapping";
import { highestSeverity, issuesFor, validateBot, type Issue } from "@/lib/bot-validation";
import { BotShareDialog } from "@/components/BotShareDialog";

type View = "edit" | "history";

export function BotEditor({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const tpl = bot.templateId ? findTemplate(bot.templateId) : null;
  const [settings, setSettings] = useState<BotSettings>(bot.settings || {});
  const [symbol, setSymbol] = useState(bot.symbol);
  const [broker, setBroker] = useState<BrokerBinding | undefined>(bot.broker);
  const [live, setLive] = useState<boolean>(!!bot.live);
  const [view, setView] = useState<View>("edit");
  const [versions, setVersions] = useState<BotVersion[]>([]);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => subscribeVersions(bot.id, setVersions), [bot.id]);

  const issues = useMemo(() => validateBot(symbol, settings, broker), [symbol, settings, broker]);
  const errorCount = issues.filter((i) => i.severity === "error").length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (errorCount > 0) {
      toast.error(`${errorCount} instelling${errorCount === 1 ? "" : "en"} klopt niet — fix eerst de rode meldingen.`);
      return;
    }
    applyBotConfig(bot.id, symbol, settings, "manual");
    updateBotBroker(bot.id, broker);
    if (live !== !!bot.live) setBotLive(bot.id, live);
    onClose();
  };

  const reset = () => {
    if (!tpl) return;
    const d: BotSettings = {};
    tpl.params.forEach((p) => { d[p.key] = p.default; });
    setSettings(d);
  };

  const restore = (v: BotVersion) => {
    if (!confirm(`Terugzetten naar versie v${v.v} van ${new Date(v.at).toLocaleString()}?`)) return;
    applyBotConfig(bot.id, v.symbol, v.settings, "restore", `Hersteld naar v${v.v}`);
    setSymbol(v.symbol);
    setSettings(v.settings);
    setView("edit");
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-panel-border/70 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel-border/40 text-2xl">
            {bot.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black">{bot.name}</div>
            <div className="mono text-[10px] text-muted-foreground">
              {bot.platform || "Custom"} · {bot.id.slice(0, 12)} · v{versions[0]?.v ?? 1}
            </div>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            title="Deel als template"
            className="mono rounded-md px-2 py-1 text-base text-muted-foreground hover:bg-panel-border/60 hover:text-primary"
          >
            🔗
          </button>
          <button onClick={onClose} className="mono rounded-md px-2 py-1 text-lg text-muted-foreground hover:bg-panel-border/60">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-px border-b border-panel-border/70 bg-panel-border/40">
          <TabBtn active={view === "edit"} onClick={() => setView("edit")}>⚙ Instellingen</TabBtn>
          <TabBtn active={view === "history"} onClick={() => setView("history")}>
            🕘 Historie {versions.length > 0 && <span className="ml-1 opacity-60">({versions.length})</span>}
          </TabBtn>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === "edit" && (
            <>
              <ValidationBanner issues={issues} />

              <BrokerBindingEditor
                symbol={symbol}
                binding={broker}
                onChange={setBroker}
                issues={issuesFor("broker", issues)}
              />

              <LiveExecToggle live={live} onChange={setLive} />

              <Field label="Asset / Symbool" help="Op welke koers deze bot draait" issues={issuesFor("symbol", issues)}>
                <select
                  value={symbol}
                  onChange={(e) => {
                    const s = e.target.value;
                    setSymbol(s);
                    if (broker) setBroker({ ...broker, brokerSymbol: translateSymbol(broker.brokerId, s) });
                  }}
                  className="w-full rounded-md border border-panel-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {SYMBOLS.map((s) => (
                    <option key={s.id} value={s.id}>{s.id} · {s.name}</option>
                  ))}
                </select>
              </Field>

              {tpl?.params.map((p) => {
                const fieldIssues = issuesFor(p.key, issues);
                const sev = highestSeverity(fieldIssues);
                const borderCls =
                  sev === "error" ? "border-bear focus:border-bear"
                  : sev === "warn" ? "border-warn focus:border-warn"
                  : "border-panel-border focus:border-primary";
                return (
                  <Field key={p.key} label={p.label} help={p.help} issues={fieldIssues}>
                    {p.type === "number" && (
                      <input
                        type="number"
                        value={Number(settings[p.key] ?? p.default)}
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        onChange={(e) => setSettings({ ...settings, [p.key]: Number(e.target.value) })}
                        className={`w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums outline-none ${borderCls}`}
                      />
                    )}
                    {p.type === "select" && (
                      <select
                        value={String(settings[p.key] ?? p.default)}
                        onChange={(e) => setSettings({ ...settings, [p.key]: e.target.value })}
                        className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ${borderCls}`}
                      >
                        {p.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                    {p.type === "boolean" && (
                      <button
                        onClick={() => setSettings({ ...settings, [p.key]: !settings[p.key] })}
                        className={`mono relative h-6 w-11 rounded-full transition-colors ${settings[p.key] ? "bg-bull" : "bg-muted"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${settings[p.key] ? "left-[22px]" : "left-0.5"}`}
                        />
                      </button>
                    )}
                  </Field>
                );
              })}

              {!tpl && (
                <div className="rounded-md border border-dashed border-panel-border p-4 text-center text-xs text-muted-foreground">
                  Deze bot is standaard — geen extra parameters om aan te passen.
                </div>
              )}
            </>
          )}

          {view === "history" && (
            <HistoryList versions={versions} currentSymbol={bot.symbol} currentSettings={bot.settings ?? {}} onRestore={restore} />
          )}
        </div>

        {/* Footer */}
        {view === "edit" ? (
          <div className="flex gap-2 border-t border-panel-border/70 p-3">
            <button
              onClick={() => {
                if (confirm("Weet je zeker dat je deze bot wil verwijderen?")) {
                  removeBot(bot.id);
                  onClose();
                }
              }}
              className="mono rounded-md border border-bear/40 px-3 py-2 text-[11px] font-black uppercase text-bear hover:bg-bear/10"
            >
              🗑
            </button>
            {tpl && (
              <button
                onClick={reset}
                className="mono rounded-md border border-panel-border px-3 py-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground"
              >
                ↺ Reset
              </button>
            )}
            <button
              onClick={save}
              disabled={errorCount > 0}
              className={`mono ml-auto flex-1 rounded-md px-3 py-2 text-[12px] font-black uppercase ${
                errorCount > 0
                  ? "cursor-not-allowed bg-bear/30 text-bear"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {errorCount > 0 ? `⛔ Fix ${errorCount} fout${errorCount === 1 ? "" : "en"}` : "✓ Opslaan"}
            </button>
          </div>
        ) : (
          <div className="border-t border-panel-border/70 p-3 text-center text-[10px] text-muted-foreground">
            Laatste {versions.length} versies · Elke wijziging wordt automatisch bewaard
          </div>
        )}
      </div>
    </div>
    {shareOpen && <BotShareDialog bot={bot} onClose={() => setShareOpen(false)} />}
    </>
  );
}

function LiveExecToggle({ live, onChange }: { live: boolean; onChange: (v: boolean) => void }) {
  const configured = typeof window !== "undefined" && mt5Configured();
  return (
    <div
      className={`mb-4 rounded-lg border p-3 ${
        live ? "border-amber-500/60 bg-amber-500/10" : "border-panel-border/70 bg-panel-border/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] font-black uppercase tracking-wider text-amber-400">
            ⚡ Live MT5-executie
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Zet echte MT5-orders bij een <b>bevestigd</b> flow-signaal (volume-spike, uitbraak of
            volatiliteit) in de richting van de bot. Papier-P&amp;L blijft ook lopen.
          </div>
        </div>
        <button
          onClick={() => onChange(!live)}
          aria-pressed={live}
          className={`mono relative h-6 w-11 shrink-0 rounded-full transition-colors ${live ? "bg-amber-500" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${live ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>
      {live && !configured && (
        <div className="mono mt-2 rounded-md border border-bear/40 bg-bear/10 px-2 py-1.5 text-[10px] text-bear">
          MT5 is nog niet gekoppeld — koppel je MetaApi-token in de <b>Brokers</b>-tab en ontgrendel
          de vault, anders worden er geen echte orders verstuurd.
        </div>
      )}
      {live && configured && (
        <div className="mono mt-2 text-[10px] text-amber-400/90">
          ⚠️ Deze bot handelt met <b>echt geld</b>. Max. 1 order per 5 min, in de richting van de
          bias. Zet de bot op <b>deploy</b> zodat hij live meedraait.
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`mono px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-colors ${
        active ? "bg-panel text-foreground" : "bg-panel/60 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function HistoryList({
  versions,
  currentSymbol,
  currentSettings,
  onRestore,
}: {
  versions: BotVersion[];
  currentSymbol: string;
  currentSettings: BotSettings;
  onRestore: (v: BotVersion) => void;
}) {
  if (!versions.length) {
    return (
      <div className="rounded-md border border-dashed border-panel-border p-6 text-center text-xs text-muted-foreground">
        Nog geen versies. Zodra je iets wijzigt en opslaat verschijnt hier de changelog.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {versions.map((v, i) => {
        const isCurrent = i === 0
          && v.symbol === currentSymbol
          && JSON.stringify(v.settings) === JSON.stringify(currentSettings);
        return (
          <div key={v.v} className="rounded-lg border border-panel-border/70 bg-panel-border/20 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="mono rounded bg-panel-border/60 px-1.5 py-0.5 text-[10px] font-black">v{v.v}</span>
                <SourceBadge source={v.source} />
                {isCurrent && (
                  <span className="mono rounded bg-bull/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-bull">
                    Actief
                  </span>
                )}
              </div>
              <span className="mono text-[10px] text-muted-foreground">{timeAgo(v.at)}</span>
            </div>
            <div className="mb-2 text-[11px] leading-snug text-foreground/90">{v.note}</div>
            <div className="mono mb-2 text-[10px] text-muted-foreground">
              {v.symbol} · {Object.keys(v.settings).length} param{Object.keys(v.settings).length === 1 ? "" : "s"}
            </div>
            {!isCurrent && (
              <button
                onClick={() => onRestore(v)}
                className="mono w-full rounded-md border border-primary/40 py-1.5 text-[10px] font-black uppercase text-primary hover:bg-primary/10"
              >
                ↺ Zet terug naar deze versie
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourceBadge({ source }: { source: BotVersion["source"] }) {
  const map: Record<BotVersion["source"], { label: string; cls: string }> = {
    manual:   { label: "handmatig", cls: "bg-panel-border/60 text-muted-foreground" },
    install:  { label: "install",   cls: "bg-primary/20 text-primary" },
    reset:    { label: "reset",     cls: "bg-warn/20 text-warn" },
    restore:  { label: "restore",   cls: "bg-bull/20 text-bull" },
    symbol:   { label: "symbool",   cls: "bg-panel-border/60 text-muted-foreground" },
    auto:     { label: "auto",      cls: "bg-panel-border/60 text-muted-foreground" },
  };
  const s = map[source];
  return <span className={`mono rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${s.cls}`}>{s.label}</span>;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "net";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}u`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function Field({ label, help, children, issues }: { label: string; help?: string; children: React.ReactNode; issues?: Issue[] }) {
  const sev = issues ? highestSeverity(issues) : null;
  const labelCls =
    sev === "error" ? "text-bear"
    : sev === "warn" ? "text-warn"
    : "text-muted-foreground";
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className={`mono text-[10px] font-black uppercase tracking-wider ${labelCls}`}>{label}</label>
        {sev && <span className="mono text-[10px]">{sev === "error" ? "⛔" : sev === "warn" ? "⚠" : "ℹ"}</span>}
      </div>
      {children}
      {issues && issues.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {issues.map((i, idx) => (
            <div
              key={idx}
              className={`text-[10px] leading-snug ${
                i.severity === "error" ? "text-bear" : i.severity === "warn" ? "text-warn" : "text-muted-foreground"
              }`}
            >
              {i.severity === "error" ? "⛔ " : i.severity === "warn" ? "⚠ " : "ℹ "}{i.message}
            </div>
          ))}
        </div>
      )}
      {help && (!issues || issues.length === 0) && <div className="mt-1 text-[10px] text-muted-foreground">{help}</div>}
    </div>
  );
}

function ValidationBanner({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  if (!errors && !warns) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-bull/30 bg-bull/10 px-3 py-2 text-[11px] text-bull">
        <span>✓</span><span className="font-black">Instellingen kloppen — klaar om te draaien.</span>
      </div>
    );
  }
  const tone = errors > 0
    ? "border-bear/40 bg-bear/10 text-bear"
    : "border-warn/40 bg-warn/10 text-warn";
  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-[11px] ${tone}`}>
      <div className="mb-0.5 font-black">
        {errors > 0 ? `⛔ ${errors} fout${errors === 1 ? "" : "en"}` : ""}
        {errors > 0 && warns > 0 ? " · " : ""}
        {warns > 0 ? `⚠ ${warns} waarschuwing${warns === 1 ? "" : "en"}` : ""}
      </div>
      <div className="opacity-80">
        {errors > 0
          ? "Rode meldingen blokkeren opslaan — pas de gemarkeerde velden aan."
          : "Bekijk de gemarkeerde velden — je kan wel opslaan."}
      </div>
    </div>
  );
}

function BrokerBindingEditor({
  symbol,
  binding,
  onChange,
  issues,
}: {
  symbol: string;
  binding: BrokerBinding | undefined;
  onChange: (b: BrokerBinding | undefined) => void;
  issues?: Issue[];
}) {
  const brokers = connectedBrokers();
  if (brokers.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-warn/50 bg-warn/5 p-3 text-[11px] text-warn">
        ⚠ Nog geen broker gekoppeld. Ga naar tab <b>Brokers</b> om er één te koppelen —
        daarna vult ARA automatisch symbool, account en hefboom in.
      </div>
    );
  }
  const caps = binding ? brokerCaps(binding.brokerId) : brokerCaps(brokers[0].id);
  const active = binding ?? {
    brokerId: brokers[0].id,
    brokerSymbol: translateSymbol(brokers[0].id, symbol),
    accountLabel: brokerCaps(brokers[0].id).defaultAccount,
    leverage: brokerCaps(brokers[0].id).defaultLeverage,
  };

  const patch = (p: Partial<BrokerBinding>) => onChange({ ...active, ...p });

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mono mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-primary">
        <span>🔌 Broker mapping</span>
        {!binding && (
          <button
            onClick={() => onChange(active)}
            className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-[9px] hover:bg-primary/30"
          >
            ⚡ auto-vul
          </button>
        )}
        {binding && (
          <button
            onClick={() => onChange(undefined)}
            className="ml-auto rounded bg-panel-border/60 px-2 py-0.5 text-[9px] text-muted-foreground hover:text-foreground"
          >
            ✕ ontkoppel
          </button>
        )}
      </div>

      <div className="mb-2">
        <label className="mono text-[9px] uppercase text-muted-foreground">Broker</label>
        <select
          value={active.brokerId}
          onChange={(e) => {
            const id = e.target.value;
            const c = brokerCaps(id);
            onChange({
              brokerId: id,
              brokerSymbol: translateSymbol(id, symbol),
              accountLabel: c.defaultAccount,
              leverage: Math.min(active.leverage, c.maxLeverage),
            });
          }}
          className="mt-1 w-full rounded-md border border-panel-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        >
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>{b.logo} {b.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mono text-[9px] uppercase text-muted-foreground">Broker-symbool</label>
          <input
            value={active.brokerSymbol}
            onChange={(e) => patch({ brokerSymbol: e.target.value.toUpperCase() })}
            className="mono mt-1 w-full rounded-md border border-panel-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mono text-[9px] uppercase text-muted-foreground">Hefboom · max {caps.maxLeverage}x</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={caps.maxLeverage}
              value={active.leverage}
              onChange={(e) => patch({ leverage: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="mono w-10 text-right text-sm font-black tabular-nums text-primary">{active.leverage}x</span>
          </div>
        </div>
      </div>

      <div>
        <label className="mono text-[9px] uppercase text-muted-foreground">Account label</label>
        <input
          value={active.accountLabel ?? ""}
          onChange={(e) => patch({ accountLabel: e.target.value })}
          placeholder={caps.defaultAccount}
          className="mt-1 w-full rounded-md border border-panel-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="mono mt-2 text-[10px] text-muted-foreground">
        {brokerEmoji(active.brokerId)} {brokerLabel(active.brokerId)} · {active.brokerSymbol} · {active.leverage}x
        {active.accountLabel ? ` · ${active.accountLabel}` : ""}
      </div>

      {issues && issues.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-panel-border/50 pt-2">
          {issues.map((i, idx) => (
            <div
              key={idx}
              className={`text-[10px] leading-snug ${
                i.severity === "error" ? "text-bear" : i.severity === "warn" ? "text-warn" : "text-muted-foreground"
              }`}
            >
              {i.severity === "error" ? "⛔ " : i.severity === "warn" ? "⚠ " : "ℹ "}{i.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
