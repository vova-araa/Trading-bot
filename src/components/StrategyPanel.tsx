import { STRATEGIES } from "@/lib/strategies";

export function StrategyPanel({
  enabled,
  onToggle,
}: {
  enabled: Record<string, boolean>;
  onToggle: (id: string, v: boolean) => void;
}) {
  return (
    <div className="panel flex h-full flex-col">
      <div className="panel-header">
        <span>Strategies</span>
        <span className="mono text-[10px] normal-case text-muted-foreground">
          {Object.values(enabled).filter(Boolean).length}/{STRATEGIES.length} active
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <ul>
          {STRATEGIES.map((s) => (
            <li key={s.id} className="border-b border-panel-border/40 p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold">{s.name}</div>
                  <div className="mono mt-0.5 text-[10px] text-muted-foreground">{s.tagline}</div>
                  <div className="mono mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                    ref · {s.attribution}
                  </div>
                </div>
                <Toggle checked={!!enabled[s.id]} onChange={(v) => onToggle(s.id, v)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-bull/70" : "bg-muted"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
