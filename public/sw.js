/* ARA TRADES notification service worker.
 * Messaging-only: no app-shell caching. Handles push events (when a real
 * push server is wired later), rich notifications with action buttons,
 * and notification-click deep links so one tap opens the trade flow. */

const NOTIF_TAG_PREFIX = "ara-signal-";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Accept messages from the app to display a notification while the tab
// is backgrounded or the PWA is closed but the SW is alive.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "SHOW_NOTIFICATION") return;
  const { title, body, tag, url, actions, priority } = data.payload || {};
  const requireInteraction = priority ? priority === "high" : true;
  event.waitUntil(
    self.registration.showNotification(title || "ARA TRADES", {
      body: body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag || NOTIF_TAG_PREFIX + Date.now(),
      renotify: true,
      requireInteraction,
      silent: priority === "low",
      data: { url: url || "/", ...data.payload },
      actions: actions || [
        { action: "take", title: "🎯 Neem trade" },
        { action: "skip", title: "Skip" },
      ],
    })
  );
});

// Real web push (payload from a future push server).
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "ARA", body: event.data ? event.data.text() : "" }; }
  const { title = "ARA TRADES", body = "", tag, url = "/", actions } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag || NOTIF_TAG_PREFIX + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: { url, ...payload },
      actions: actions || [
        { action: "take", title: "🎯 Neem trade" },
        { action: "skip", title: "Skip" },
      ],
    })
  );
});

// Handle notification click and action buttons.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const baseUrl = data.url || "/";
  let target = baseUrl;

  if (event.action === "take") {
    const sep = baseUrl.includes("?") ? "&" : "?";
    target = `${baseUrl}${sep}action=take&src=notif`;
  } else if (event.action === "skip") {
    return; // dismissed
  } else {
    const sep = baseUrl.includes("?") ? "&" : "?";
    target = `${baseUrl}${sep}src=notif`;
  }

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        } catch { /* try next */ }
      }
      await self.clients.openWindow(target);
    })()
  );
});
