/*
 * Vegan University service worker — web push only.
 *
 * Deliberately does nothing else: no fetch handler, no caching. An offline
 * shell is its own piece of work (BUILD.md Phase 6), and a service worker that
 * caches pages by accident is how a site ends up serving last week's HTML.
 *
 * Payload shape (lib/notifications/push.ts): { id, title, body, url, tag }.
 * `url` is always a same-site path.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Vegan University";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    // A newer notification with the same tag replaces the old one quietly
    // rather than stacking; renotify makes the replacement still alert.
    renotify: typeof data.tag === "string",
    data: {
      id: typeof data.id === "string" ? data.id : null,
      url: safePath(data.url),
    },
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { id, url } = event.notification.data || {};
  const target = new URL(safePath(url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      if (id) {
        // Mark it read first, so the inbox agrees with what was just opened.
        // Failure is fine: the page still opens.
        await fetch("/api/notifications/read", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        }).catch(() => undefined);
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/notifications";
}
