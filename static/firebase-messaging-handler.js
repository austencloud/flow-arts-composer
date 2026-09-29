/* eslint-disable no-undef */
/**
 * Push notification handler for the service worker.
 * Imported by /sw.js (and the dev-only /firebase-messaging-sw.js) via importScripts.
 *
 * Handles:
 * - Push messages: hand them to a visible tab, or show a notification
 * - App badge updates
 * - Notification click routing
 *
 * No Firebase SDK here. Our Cloud Functions send data-only FCM messages and the
 * browser decrypts them, so reading one is a single event.data.json() call.
 * Loading Google's compat SDK from gstatic cost every first-time visitor ~20 KB
 * (gzip) of extra worker code, a gstatic connection and a heartbeat IndexedDB,
 * and install failed outright when gstatic was unreachable. The page still gets
 * and saves tokens with the Firebase SDK (fcm-token-manager.ts). A token belongs
 * to this worker's push subscription, so existing subscribers keep working.
 *
 * handlePush mirrors onPush from the SDK version we used to load
 * (firebase 11.4.0): a visible tab receives the payload tagged the way the page
 * SDK's onMessage requires, otherwise we show the notification ourselves. The
 * SDK's pushsubscriptionchange token refresh is deliberately gone: the page's
 * getToken() notices a changed subscription and saves a fresh token the next
 * time a signed-in user opens the app.
 */

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    // Not JSON, so not an FCM message.
  }
  if (!payload || typeof payload !== "object") return;

  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const hasVisibleTab = windowClients.some(
    (client) =>
      client.visibilityState === "visible" &&
      // Extension background pages always report "visible".
      !client.url.startsWith("chrome-extension://")
  );

  // Foreground: every tab gets the message and the page's onMessage listener
  // (foreground-message-handler.ts) shows it. The page SDK drops messages that
  // lack these two markers.
  if (hasVisibleTab) {
    const message = { ...payload, isFirebaseMessaging: true, messageType: "push-received" };
    for (const client of windowClients) client.postMessage(message);
    return;
  }

  await showBackgroundMessage(payload);
}

async function showBackgroundMessage(payload) {
  const data = payload.data || {};
  const notification = payload.notification || {};

  // State-sync messages: dismiss shade notifications + resync the badge when
  // the inbox was cleared on another device. Never display these.
  if (data.action === "dismiss-notifications") {
    await Promise.all([
      self.registration.getNotifications().then((delivered) => {
        for (const n of delivered) {
          // Leave DM notifications alone — message reads sync separately.
          if (n.data?.type !== "message-received") n.close();
        }
      }),
      updateBadge(parseInt(data.unreadCount, 10)),
    ]);
    return;
  }

  const title = notification.title || data.title || "Flow Arts Composer";
  const body = notification.body || data.body || "";
  const unreadCount = parseInt(data.unreadCount, 10);

  // Awaited so Chrome sees the notification before the push event ends;
  // otherwise it may add its own "site updated in the background" notice.
  await Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: "/pwa/icons/icon-192x192.png",
      badge: "/pwa/icons/icon-96x96.png",
      tag: data.tag || "tka-notification",
      // Same-tag notifications REPLACE each other; without renotify the
      // replacement is silent (no sound/vibration/heads-up) — a second QR-scan
      // alert would slip in unnoticed. renotify makes every arrival alert.
      renotify: true,
      data: {
        url: data.url || "/app",
        conversationId: data.conversationId || null,
        notificationId: data.notificationId || null,
        type: data.type || "generic",
      },
      vibrate: [100, 200, 100],
    }),
    // Update app badge with unread count
    unreadCount > 0 ? updateBadge(unreadCount) : null,
  ]);
}

// Sets the badge to count, or clears it when count isn't a positive number.
// The Badging API is missing in some browsers and can reject; a badge failure
// must never fail the push event.
async function updateBadge(count) {
  try {
    if (count > 0) await self.navigator.setAppBadge?.(count);
    else await self.navigator.clearAppBadge?.();
  } catch {
    // Unsupported here.
  }
}

// Notification click handler - focus existing window or open new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Try to focus an existing window
      for (const client of windowClients) {
        if (new URL(client.url).pathname.startsWith("/app") && "focus" in client) {
          if (url !== "/app" && client.url !== new URL(url, self.location.origin).href) {
            client.navigate(url);
          }
          return client.focus();
        }
      }
      // No existing window - open new one
      return self.clients.openWindow(url);
    })
  );
});
