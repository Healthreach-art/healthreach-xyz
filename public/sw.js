// HealthReachCareCare service worker — receives scheduled reminder triggers from the
// page and surfaces them as real OS notifications (Android/iOS PWA + desktop).
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SHOW_REMINDER") {
    const { title, body, tag, link } = data.payload || {};
    event.waitUntil(
      self.registration.showNotification(title || "Medication reminder", {
        body: body || "Time to take your medication.",
        tag: tag || "med-reminder",
        icon: "/placeholder.svg",
        badge: "/placeholder.svg",
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400],
        data: { link: link || "/dashboard/patient/reminders" },
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(link).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
