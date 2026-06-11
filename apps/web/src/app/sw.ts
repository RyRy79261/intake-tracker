/// <reference lib="webworker" />
//
// Serwist service worker (Turbopack-native). Compiled by esbuild via the
// `/serwist/[path]` route handler (see src/app/serwist/[path]/route.ts), not
// by tsc — this file is excluded from the project tsconfig so the WebWorker
// lib above does not collide with the DOM lib used everywhere else.
//
// Replaces the previous next-pwa custom worker (worker/index.js). The push /
// notificationclick / SKIP_WAITING handlers below are ported verbatim from it.
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by Serwist with the precache manifest.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // The app's "update available" prompt is driven by version polling
  // (use-version-check.ts) + a full reload — not by the SW waiting state —
  // so activating immediately is safe and avoids a stale controller.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// --- Custom handlers ported from the previous next-pwa worker ---

// Allow the app (debug panel) to force activation of a waiting worker.
self.addEventListener("message", (event) => {
  // Only honour messages from same-origin clients. A service worker controls
  // same-origin clients, so a mismatched origin means an untrusted sender —
  // reject it before acting (CodeQL js/missing-origin-check).
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Incoming push notifications (medication reminders).
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.svg",
      tag: data.tag,
      requireInteraction: true,
      data: { url: data.url || "/medications?tab=schedule" },
    }),
  );
});

// Notification click — focus an existing medications window or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/medications?tab=schedule";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes("/medications") && "focus" in client) {
            return client.focus().then((focused) => {
              if ("navigate" in focused) {
                return focused.navigate(url);
              }
            });
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
