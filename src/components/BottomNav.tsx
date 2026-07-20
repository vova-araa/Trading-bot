type Tab =
  | "signals"
  | "chart"
  | "edge"
  | "alerts"
  | "news"
  | "bots"
  | "market"
  | "brokers"
  | "copy"
  | "pump";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "signals", label: "Signalen", icon: "🎯" },
  { id: "chart", label: "Chart", icon: "📈" },
  { id: "edge", label: "Edge", icon: "🐋" },
  { id: "alerts", label: "Alarmen", icon: "🔔" },
  { id: "bots", label: "Bots", icon: "🤖" },
  { id: "news", label: "Nieuws", icon: "📰" },
];

export function BottomNav({ tab, onChange }: { tab: string; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-panel-border/70 bg-panel/95 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-6">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span
                className={`text-lg leading-none ${active ? "scale-110" : ""} transition-transform`}
              >
                {t.icon}
              </span>
              <span className="mono text-[9px] font-black uppercase tracking-wider">{t.label}</span>
              {active && <span className="mt-0.5 h-0.5 w-6 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export type { Tab };
