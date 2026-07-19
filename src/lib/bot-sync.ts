// Client-side bridge between the local bot store and the Lovable Cloud
// backend. Deployed bots live in the `bots` table and get ticked by a
// server-side cron worker every minute. Realtime updates stream back here.

import { supabase } from "@/integrations/supabase/client";
import type { Bot, BotAction, BotAlert } from "./bots";
import { getBots, subscribeBots } from "./bots";

const OWNER_KEY_STORAGE = "ara-owner-key-v1";

export function ownerKey(): string {
  if (typeof window === "undefined") return "ssr";
  let k = localStorage.getItem(OWNER_KEY_STORAGE);
  if (!k) {
    k = crypto.randomUUID();
    localStorage.setItem(OWNER_KEY_STORAGE, k);
  }
  return k;
}

// Mutator function passed in by consumer to merge server state into local store.
type Merger = (patch: Partial<Bot> & { id: string }) => void;
type Adder = (bot: Bot) => void;
type Remover = (id: string) => void;

type ServerBotRow = {
  id: string;
  owner_key: string;
  name: string;
  kind: string;
  symbol: string;
  running: boolean;
  deployed: boolean;
  pnl: number | string;
  started_at: string | null;
  last_tick_at: string | null;
  last_action: string | null;
  last_action_at: string | null;
  settings: Record<string, unknown> | null;
};

type ServerAlertRow = {
  id: string;
  owner_key: string;
  bot_id: string;
  level: "info" | "warn" | "error";
  message: string;
  created_at: string;
};

function toBotPatch(row: ServerBotRow): Partial<Bot> & { id: string } {
  const patch: Partial<Bot> & { id: string } = {
    id: row.id,
    pnl: Number(row.pnl) || 0,
    deployed: row.deployed,
    enabled: row.running || row.deployed,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : undefined,
    lastTickAt: row.last_tick_at ? new Date(row.last_tick_at).getTime() : undefined,
  };
  if (row.last_action && row.last_action_at) {
    const action: BotAction = {
      at: new Date(row.last_action_at).getTime(),
      kind: "tick",
      text: row.last_action,
    };
    patch.lastAction = action;
  }
  return patch;
}

export async function pushBotToServer(bot: Bot) {
  if (typeof window === "undefined") return;
  const key = ownerKey();
  const row = {
    id: bot.id,
    owner_key: key,
    name: bot.name,
    kind: bot.kind,
    symbol: bot.symbol,
    running: bot.enabled,
    deployed: bot.deployed,
    pnl: bot.pnl,
    started_at: bot.startedAt ? new Date(bot.startedAt).toISOString() : null,
    settings: JSON.parse(JSON.stringify(bot.settings ?? {})),
  };
  const { error } = await supabase.from("bots").upsert(row as never, { onConflict: "id" });

  if (error) console.warn("[bot-sync] upsert failed", error.message);
}

export async function removeBotFromServer(id: string) {
  if (typeof window === "undefined") return;
  const { error } = await supabase.from("bots").delete().eq("id", id);
  if (error) console.warn("[bot-sync] delete failed", error.message);
}

// Push a locally-created deployed bot to the server. Called from bots.ts
// when the user hits deploy. Server side is the source of truth for
// deployed bots' P&L / heartbeat.
export function bindBotSync(merge: Merger, add: Adder, remove: Remover) {
  const key = ownerKey();

  // Initial load: pull all my server-side bots
  void supabase
    .from("bots")
    .select("*")
    .eq("owner_key", key)
    .then(({ data, error }) => {
      if (error) {
        console.warn("[bot-sync] initial load failed", error.message);
        return;
      }
      const rows = (data ?? []) as ServerBotRow[];
      const localIds = new Set(getBots().map((b) => b.id));
      for (const row of rows) {
        if (localIds.has(row.id)) {
          merge(toBotPatch(row));
        } else {
          // Bot only on server (e.g. installed from another device)
          const bot: Bot = {
            id: row.id,
            kind: row.kind as Bot["kind"],
            name: row.name,
            symbol: row.symbol,
            emoji: "🤖",
            desc: "Draait 24/7 in de cloud",
            enabled: row.running || row.deployed,
            deployed: row.deployed,
            pnl: Number(row.pnl) || 0,
            trades: 0,
            winRate: 0.6,
            start: 0,
            settings: (row.settings ?? {}) as Bot["settings"],
            startedAt: row.started_at ? new Date(row.started_at).getTime() : undefined,
            lastTickAt: row.last_tick_at ? new Date(row.last_tick_at).getTime() : undefined,
            lastAction: row.last_action && row.last_action_at ? {
              at: new Date(row.last_action_at).getTime(), kind: "tick", text: row.last_action,
            } : undefined,
          };
          add(bot);
        }
      }
    });

  // Realtime: bot state updates
  const botsChannel = supabase
    .channel("bots-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bots", filter: `owner_key=eq.${key}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const oldId = (payload.old as { id?: string })?.id;
          if (oldId) remove(oldId);
          return;
        }
        const row = payload.new as ServerBotRow;
        if (!row) return;
        merge(toBotPatch(row));
      },
    )
    .subscribe();

  // Realtime: new alerts → surface as bot alerts
  const alertsChannel = supabase
    .channel("bot-alerts-sync")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bot_alerts", filter: `owner_key=eq.${key}` },
      (payload) => {
        const row = payload.new as ServerAlertRow;
        if (!row?.bot_id) return;
        const alert: BotAlert = { at: new Date(row.created_at).getTime(), level: row.level, text: row.message };
        const current = getBots().find((b) => b.id === row.bot_id);
        if (!current) return;
        merge({ id: row.bot_id, alerts: [alert, ...(current.alerts ?? [])].slice(0, 8) });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(botsChannel);
    void supabase.removeChannel(alertsChannel);
  };
}

// Whenever local bot state that matters server-side changes (deployed flag,
// symbol, settings, running), push the row. Debounced.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const pushQueue = new Map<string, Bot>();

export function schedulePushForBot(bot: Bot) {
  pushQueue.set(bot.id, bot);
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const list = Array.from(pushQueue.values());
    pushQueue.clear();
    for (const b of list) void pushBotToServer(b);
  }, 400);
}

// Watches local store for changes to deployed bots and mirrors them to server.
export function startDeployedMirror() {
  let prev = new Map<string, Bot>();
  return subscribeBots((list) => {
    const next = new Map(list.map((b) => [b.id, b]));
    for (const [id, bot] of next) {
      const before = prev.get(id);
      if (!before && bot.deployed) {
        schedulePushForBot(bot);
      } else if (before) {
        if (
          before.deployed !== bot.deployed ||
          before.enabled !== bot.enabled ||
          before.symbol !== bot.symbol ||
          JSON.stringify(before.settings ?? {}) !== JSON.stringify(bot.settings ?? {})
        ) {
          if (bot.deployed) schedulePushForBot(bot);
          else if (before.deployed && !bot.deployed) void removeBotFromServer(id);
        }
      }
    }
    for (const id of prev.keys()) {
      if (!next.has(id)) void removeBotFromServer(id);
    }
    prev = next;
  });
}
