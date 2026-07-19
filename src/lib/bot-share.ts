// Deelbare bot-presets. Exporteert bot-instellingen (symbol, template, params,
// broker-mapping) naar compacte JSON of een URL-token, en importeert die
// terug tot een nieuwe bot — plaftorm-onafhankelijk. Broker-symbolen worden
// bij import automatisch her-vertaald naar de doel-broker.

import { findTemplate } from "./bot-marketplace";
import { autoBind, translateSymbol, type BrokerBinding } from "./broker-mapping";
import { currentPrice } from "./market-data";
import { pushVersion } from "./bot-versions";
import { addRemoteBot } from "./bots";
import type { Bot, BotKind, BotSettings } from "./bots";

export const SHARE_VERSION = 1;
export const SHARE_MAGIC = "ARA";

export type SharePayload = {
  v: number;              // schema version
  magic: typeof SHARE_MAGIC;
  name: string;
  kind: BotKind;
  symbol: string;
  emoji: string;
  desc?: string;
  templateId?: string;
  platform?: string;
  settings: BotSettings;
  broker?: { brokerId: string; leverage: number; accountLabel?: string };
  exportedAt: number;
  from?: string;          // optional source app id
};

/** Build a shareable payload from a bot. */
export function buildShare(bot: Bot): SharePayload {
  return {
    v: SHARE_VERSION,
    magic: SHARE_MAGIC,
    name: bot.name,
    kind: bot.kind,
    symbol: bot.symbol,
    emoji: bot.emoji,
    desc: bot.desc,
    templateId: bot.templateId,
    platform: bot.platform,
    settings: bot.settings ?? {},
    broker: bot.broker
      ? { brokerId: bot.broker.brokerId, leverage: bot.broker.leverage, accountLabel: bot.broker.accountLabel }
      : undefined,
    exportedAt: Date.now(),
    from: "ara-trades",
  };
}

/** Pretty-printed JSON string of a payload. */
export function toJSON(payload: SharePayload): string {
  return JSON.stringify(payload, null, 2);
}

/** URL-safe base64 token — usable as `?bot=<token>` deeplink. */
export function toToken(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const b64 = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Full share URL that auto-imports on landing. */
export function toShareURL(payload: SharePayload, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?bot=${toToken(payload)}`;
}

export type ParsedShare =
  | { ok: true; payload: SharePayload }
  | { ok: false; error: string };

/** Parse either raw JSON or a URL token into a validated payload. */
export function parseShare(input: string): ParsedShare {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Leeg" };

  // Direct JSON?
  let raw = trimmed;
  if (!raw.startsWith("{")) {
    // Might be a URL — pull ?bot=... out first
    try {
      if (raw.startsWith("http")) {
        const u = new URL(raw);
        const q = u.searchParams.get("bot");
        if (q) raw = q;
      }
    } catch { /* not a URL, treat as token */ }
    // Base64 token
    try {
      const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (raw.length % 4)) % 4);
      const json = typeof atob !== "undefined"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
      raw = json;
    } catch {
      return { ok: false, error: "Kon token niet decoderen." };
    }
  }

  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return { ok: false, error: "Ongeldige JSON." }; }
  if (!obj || typeof obj !== "object") return { ok: false, error: "Geen object." };
  const p = obj as Partial<SharePayload>;
  if (p.magic !== SHARE_MAGIC) return { ok: false, error: "Niet een ARA bot-template." };
  if (typeof p.v !== "number" || p.v > SHARE_VERSION) return { ok: false, error: `Onbekende versie (v${p.v}).` };
  if (!p.name || !p.kind || !p.symbol || !p.settings) return { ok: false, error: "Verplichte velden missen." };
  return { ok: true, payload: p as SharePayload };
}

/** Materialize a payload into a new Bot object (does not persist). */
export function payloadToBot(payload: SharePayload): Bot {
  const id = `${payload.templateId ?? payload.kind}-imp-${Date.now().toString(36)}`;
  // Try to translate broker binding to the target broker's native symbol
  let broker: BrokerBinding | undefined;
  if (payload.broker) {
    broker = {
      brokerId: payload.broker.brokerId,
      brokerSymbol: translateSymbol(payload.broker.brokerId, payload.symbol),
      leverage: payload.broker.leverage,
      accountLabel: payload.broker.accountLabel,
    };
  } else if (payload.templateId) {
    const tpl = findTemplate(payload.templateId);
    if (tpl) broker = autoBind(tpl, payload.symbol) ?? undefined;
  }
  return {
    id,
    kind: payload.kind,
    name: payload.name,
    symbol: payload.symbol,
    emoji: payload.emoji,
    desc: payload.desc ?? "Geïmporteerde bot",
    enabled: false,
    deployed: false,
    pnl: 0,
    trades: 0,
    winRate: 0.55 + Math.random() * 0.25,
    start: currentPrice(payload.symbol) || 0,
    templateId: payload.templateId,
    platform: payload.platform,
    settings: { ...payload.settings },
    broker,
  };
}

/** Import a payload into local bot storage and record a version entry. */
export function importPayload(payload: SharePayload): Bot {
  const bot = payloadToBot(payload);
  addRemoteBot(bot);
  pushVersion(
    bot.id,
    { symbol: bot.symbol, settings: bot.settings ?? {} },
    "install",
    `Geïmporteerd${payload.from ? ` vanaf ${payload.from}` : ""} · ${payload.name}`,
  );
  return bot;
}
