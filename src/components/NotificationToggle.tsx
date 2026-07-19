import { useEffect, useState } from "react";
import { disableNotifications, enableNotifications, notifyEnabled, notifyPermission } from "@/lib/notifications";

export function NotificationToggle() {
  const [on, setOn] = useState(false);
  const [sup, setSup] = useState(true);

  useEffect(() => {
    const sync = () => {
      setSup(notifyPermission() !== "unsupported");
      setOn(notifyEnabled());
    };
    sync();
    window.addEventListener("ara-notify-change", sync);
    return () => window.removeEventListener("ara-notify-change", sync);
  }, []);

  if (!sup) return null;

  return (
    <button
      onClick={() => (on ? disableNotifications() : void enableNotifications())}
      className={`mono flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
        on ? "border-bull/60 bg-bull/10 text-bull" : "border-panel-border text-muted-foreground hover:border-primary/50 hover:text-primary"
      }`}
      title={on ? "Notificaties aan" : "Notificaties uit"}
    >
      <span className="text-sm leading-none">{on ? "🔔" : "🔕"}</span>
      <span className="hidden sm:inline">{on ? "Aan" : "Push"}</span>
    </button>
  );
}
