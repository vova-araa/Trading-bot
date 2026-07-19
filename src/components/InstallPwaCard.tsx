import { useEffect, useState } from "react";
import { isStandalone } from "@/lib/pwa";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "ara-install-dismissed-v1";

export function InstallPwaCard() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(DISMISS_KEY) === "1";
  });
  const [standalone, setStandalone] = useState<boolean>(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    const ua = navigator.userAgent || "";
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window));
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (standalone || dismissed) return null;
  if (!evt && !isIos) return null; // no install path available on this browser

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const res = await evt.userChoice;
    if (res.outcome === "accepted") {
      localStorage.setItem(DISMISS_KEY, "1");
      setDismissed(true);
    }
    setEvt(null);
  }
  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="mx-3 mt-2 rounded-2xl border border-primary/40 bg-primary/10 p-3 flex gap-3 items-start">
      <div className="text-2xl">📲</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Installeer ARA op je homescreen</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {isIos && !evt
            ? "Tap het delen-icoon en kies “Zet op beginscherm” voor push + snelmenu."
            : "Krijg push notificaties bij nieuwe signalen en long-press voor 1-tap snelmenu."}
        </div>
        <div className="mt-2 flex gap-2">
          {evt && (
            <button onClick={install} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold">
              Installeer
            </button>
          )}
          <button onClick={dismiss} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
