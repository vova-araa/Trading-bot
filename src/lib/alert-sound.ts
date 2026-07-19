// Custom alert sounds + vibration patterns per signal type.
// Uses WebAudio (no asset files) so patterns are described declaratively.

import type { NotifyKind } from "./notify-prefs";

export type SoundPreset =
  | "mute"
  | "chime"     // gentle up-arpeggio
  | "ding"      // single bright bell
  | "double"    // two-tone alert
  | "triple"    // three-tone rising
  | "buzz"      // low buzz
  | "siren"     // alternating hi-lo
  | "coin"      // 8-bit success
  | "drop";     // descending

export type VibratePreset =
  | "off"
  | "short"     // 60ms
  | "double"    // 60·60·60
  | "long"      // 220ms
  | "pulse"     // 3× 80
  | "sos";      // ...---... short

type SoundStep = { freq: number; dur: number; gap?: number; type?: OscillatorType };

const SOUND_DEFS: Record<SoundPreset, { label: string; steps: SoundStep[] }> = {
  mute:   { label: "Geen geluid", steps: [] },
  chime:  { label: "Chime",  steps: [{ freq: 880, dur: 0.14 }, { freq: 1175, dur: 0.14 }, { freq: 1568, dur: 0.22 }] },
  ding:   { label: "Ding",   steps: [{ freq: 1320, dur: 0.32, type: "triangle" }] },
  double: { label: "Dubbel", steps: [{ freq: 660, dur: 0.14 }, { freq: 990, dur: 0.14 }] },
  triple: { label: "Triple", steps: [{ freq: 880, dur: 0.14 }, { freq: 1320, dur: 0.14 }, { freq: 1760, dur: 0.2 }] },
  buzz:   { label: "Buzz",   steps: [{ freq: 180, dur: 0.16, type: "square" }, { freq: 180, dur: 0.16, type: "square" }] },
  siren:  { label: "Sirene", steps: [{ freq: 620, dur: 0.16 }, { freq: 980, dur: 0.16 }, { freq: 620, dur: 0.16 }, { freq: 980, dur: 0.16 }] },
  coin:   { label: "Coin",   steps: [{ freq: 988, dur: 0.08, type: "square" }, { freq: 1319, dur: 0.22, type: "square" }] },
  drop:   { label: "Drop",   steps: [{ freq: 1568, dur: 0.12 }, { freq: 1175, dur: 0.12 }, { freq: 784, dur: 0.2 }] },
};

const VIB_DEFS: Record<VibratePreset, { label: string; pattern: number[] }> = {
  off:    { label: "Uit",     pattern: [] },
  short:  { label: "Kort",    pattern: [60] },
  double: { label: "Dubbel",  pattern: [60, 60, 60] },
  long:   { label: "Lang",    pattern: [220] },
  pulse:  { label: "Puls×3",  pattern: [80, 60, 80, 60, 80] },
  sos:    { label: "SOS",     pattern: [80, 60, 80, 60, 80, 120, 220, 60, 220, 60, 220, 120, 80, 60, 80, 60, 80] },
};

export type AlertSoundPrefs = Record<NotifyKind, { sound: SoundPreset; vibrate: VibratePreset; volume: number }>;

const KEY = "ara-alert-sound-v1";

const DEFAULT_PREFS: AlertSoundPrefs = {
  entry: { sound: "triple", vibrate: "double", volume: 0.6 },
  exit:  { sound: "coin",   vibrate: "long",   volume: 0.7 },
  pump:  { sound: "siren",  vibrate: "pulse",  volume: 0.75 },
  other: { sound: "ding",   vibrate: "short",  volume: 0.5 },
};

export function getSoundPrefs(): AlertSoundPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<AlertSoundPrefs>;
    const out: AlertSoundPrefs = { ...DEFAULT_PREFS };
    for (const k of ["entry", "exit", "pump", "other"] as NotifyKind[]) {
      out[k] = { ...DEFAULT_PREFS[k], ...(p?.[k] ?? {}) };
    }
    return out;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setSoundPrefs(p: AlertSoundPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("ara-alert-sound-change"));
}

export const SOUND_LABELS = Object.fromEntries(
  Object.entries(SOUND_DEFS).map(([k, v]) => [k, v.label]),
) as Record<SoundPreset, string>;

export const VIBRATE_LABELS = Object.fromEntries(
  Object.entries(VIB_DEFS).map(([k, v]) => [k, v.label]),
) as Record<VibratePreset, string>;

export const SOUND_KEYS = Object.keys(SOUND_DEFS) as SoundPreset[];
export const VIBRATE_KEYS = Object.keys(VIB_DEFS) as VibratePreset[];

// ─── Playback ─────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function playSound(preset: SoundPreset, volume: number) {
  if (typeof window === "undefined") return;
  const def = SOUND_DEFS[preset];
  if (!def || def.steps.length === 0) return;
  try {
    audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx!;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    let t = ctx.currentTime;
    for (const s of def.steps) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = s.type ?? "sine";
      o.frequency.value = s.freq;
      const peak = Math.max(0.0001, Math.min(0.6, volume * 0.3));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + s.dur + 0.02);
      t += s.dur + (s.gap ?? 0.02);
    }
  } catch {}
}

function playVibrate(preset: VibratePreset) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const p = VIB_DEFS[preset]?.pattern ?? [];
  if (p.length === 0) return;
  try { navigator.vibrate?.(p); } catch {}
}

export function playAlert(kind: NotifyKind) {
  const p = getSoundPrefs()[kind];
  if (!p) return;
  playSound(p.sound, p.volume);
  playVibrate(p.vibrate);
}

export function previewCombo(sound: SoundPreset, vibrate: VibratePreset, volume: number) {
  playSound(sound, volume);
  playVibrate(vibrate);
}
