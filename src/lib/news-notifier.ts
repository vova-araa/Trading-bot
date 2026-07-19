// Push notificaties voor high-impact economisch nieuws.
// - T-15 min: waarschuwing dat het aankomt (inclusief nowcast + verwachting)
// - T-1 min:  laatste seintje vlak voor release
// - Release:  beat/miss/inline status zodra "actual" bekend is
//
// Dedupe via localStorage zodat we niet spammen bij elke tick / reload.

import { getWeekCalendar, type NewsItem } from "./news";
import { pushSignal } from "./notifications";

const KEY = "ara-news-notify-fired-v1";
type Phase = "pre15" | "pre1" | "release";

function loadFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); }
  catch { return new Set(); }
}
function saveFired(fired: Set<string>) {
  if (typeof window === "undefined") return;
  // Bewaar max ±500 keys om storage klein te houden.
  const arr = Array.from(fired).slice(-500);
  localStorage.setItem(KEY, JSON.stringify(arr));
}
function key(id: string, phase: Phase) { return `${id}:${phase}`; }

/** Parse "3.2%" / "-185K" / "1.75" → number. */
function parseNum(s?: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

type Verdict = { emoji: string; label: string; kind: "beat" | "miss" | "inline" };
function verdict(item: NewsItem): Verdict | null {
  const a = parseNum(item.actual);
  const f = parseNum(item.forecast);
  if (a === null || f === null) return null;
  const diff = a - f;
  const rel = f !== 0 ? Math.abs(diff / f) : Math.abs(diff);
  if (rel < 0.01) return { emoji: "🎯", label: "INLINE", kind: "inline" };
  if (diff > 0) return { emoji: "🟢", label: "BEAT", kind: "beat" };
  return { emoji: "🔴", label: "MISS", kind: "miss" };
}

function relevantEvents(now: number): NewsItem[] {
  const nowSec = Math.floor(now / 1000);
  return getWeekCalendar(now)
    .flatMap((d) => d.items)
    .filter((e) => e.impact === "high")
    .filter((e) => e.time > nowSec - 15 * 60 && e.time < nowSec + 30 * 60);
}

function tick(fired: Set<string>) {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  let changed = false;

  for (const e of relevantEvents(now)) {
    const secondsUntil = e.time - nowSec;
    const flag = e.country + " " + e.currency;

    // T-15 min (fire in window 14..15.5 min)
    if (secondsUntil <= 15 * 60 && secondsUntil > 60 && !fired.has(key(e.id, "pre15"))) {
      const nc = e.prediction ? ` · Nowcast ${e.prediction.value} (${e.prediction.bias})` : "";
      const fc = e.forecast ? ` · Verwacht ${e.forecast}` : "";
      pushSignal(
        `⏰ 15 min · ${flag} ${e.title}`,
        `High-impact release in ${Math.round(secondsUntil / 60)} min${fc}${nc}`,
        `news-${e.id}-pre15`,
        { kind: "other", priority: "normal", url: "/news" },
      );
      fired.add(key(e.id, "pre15"));
      changed = true;
    }

    // T-1 min (fire in window 0..90s)
    if (secondsUntil <= 90 && secondsUntil > 0 && !fired.has(key(e.id, "pre1"))) {
      const nc = e.prediction ? ` · Nowcast ${e.prediction.value}` : "";
      const fc = e.forecast ? ` · Verw. ${e.forecast}` : "";
      pushSignal(
        `🚨 1 min · ${flag} ${e.title}`,
        `Release NU vlakbij${fc}${nc} — sluit exposure of check spread.`,
        `news-${e.id}-pre1`,
        { kind: "other", priority: "high", url: "/news" },
      );
      fired.add(key(e.id, "pre1"));
      changed = true;
    }

    // Release: actual known
    if (e.actual && !fired.has(key(e.id, "release"))) {
      const v = verdict(e);
      const tag = v ? `${v.emoji} ${v.label}` : "📊 RELEASED";
      const fc = e.forecast ? ` · Verwacht ${e.forecast}` : "";
      const prev = e.previous ? ` · Prev ${e.previous}` : "";
      pushSignal(
        `${tag} · ${flag} ${e.title}`,
        `Actual ${e.actual}${fc}${prev}`,
        `news-${e.id}-release`,
        { kind: "other", priority: v?.kind === "inline" ? "normal" : "high", url: "/news" },
      );
      fired.add(key(e.id, "release"));
      changed = true;
    }
  }

  if (changed) saveFired(fired);
}

let started = false;
export function startNewsNotifier() {
  if (started || typeof window === "undefined") return;
  started = true;
  const fired = loadFired();
  // Doe een eerste tick meteen zodat gemiste releases direct binnenkomen,
  // en daarna elke 15s (fijn genoeg voor 1-min accuraatheid).
  tick(fired);
  setInterval(() => tick(fired), 15_000);
}
