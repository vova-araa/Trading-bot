// Copy-trading style leaderboard (inspired by Wundertrading's marketplace).
// Fictional profiles of well-known style traders — for demo/education only.

export type Trader = {
  id: string;
  name: string;
  handle: string;
  style: string;
  avatar: string;
  roiMonth: number; // %
  roiYear: number; // %
  winRate: number; // %
  followers: number;
  risk: "Laag" | "Middel" | "Hoog";
  bio: string;
};

export const TRADERS: Trader[] = [
  {
    id: "faber",
    name: "Marc Faber Style",
    handle: "@doomboom",
    style: "Macro contrarian",
    avatar: "🎩",
    roiMonth: 8.2,
    roiYear: 74,
    winRate: 62,
    followers: 12480,
    risk: "Middel",
    bio: "Contrair, koopt paniek en verkoopt euforie. Sterk in goud & indices.",
  },
  {
    id: "vaale",
    name: "Vaale Momentum",
    handle: "@vaale",
    style: "Momentum breakouts",
    avatar: "⚡",
    roiMonth: 12.5,
    roiYear: 118,
    winRate: 58,
    followers: 8930,
    risk: "Hoog",
    bio: "Springt op sterke bewegingen. Snelle in-en-uit trades op crypto.",
  },
  {
    id: "smc-queen",
    name: "SMC Queen",
    handle: "@smcqueen",
    style: "Smart Money Concepts",
    avatar: "👑",
    roiMonth: 6.1,
    roiYear: 62,
    winRate: 71,
    followers: 15230,
    risk: "Middel",
    bio: "Order blocks & liquidity sweeps op forex. Hoge winrate, geduldig.",
  },
  {
    id: "swing-dad",
    name: "Swing Dad",
    handle: "@swingdad",
    style: "Trend following",
    avatar: "🧔",
    roiMonth: 4.4,
    roiYear: 48,
    winRate: 66,
    followers: 6210,
    risk: "Laag",
    bio: "Volgt de trend, houdt trades dagen tot weken vast. Rustig en stabiel.",
  },
  {
    id: "scalp-god",
    name: "Scalp God",
    handle: "@scalpgod",
    style: "1m scalping",
    avatar: "🔪",
    roiMonth: 15.8,
    roiYear: 145,
    winRate: 54,
    followers: 21100,
    risk: "Hoog",
    bio: "Tientallen trades per dag op de 1m. Alleen voor snelle vingers.",
  },
];

const KEY = "ara-following-v1";

export function getFollowing(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function toggleFollow(id: string) {
  const cur = new Set(getFollowing());
  cur.has(id) ? cur.delete(id) : cur.add(id);
  localStorage.setItem(KEY, JSON.stringify([...cur]));
  window.dispatchEvent(new Event("ara-follow-change"));
}
