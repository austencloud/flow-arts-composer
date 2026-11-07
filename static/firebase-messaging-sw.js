/**
 * Minimal service worker for Firebase Cloud Messaging in dev mode.
 * In production, /sw.js imports firebase-messaging-handler.js instead.
 * This file exists solely so FCM token registration works on localhost (dev + ADB).
 *
 * It's a thin wrapper: just import the shared handler.
 */

// The phone's one-tap sign-in notifications. Inside try/catch so a script that
// failed to load costs only that: the handler still shows the notification and
// its tap opens the review page.
try {
  importScripts("/phone-sign-in-worker.js");
} catch {
  // Handled in firebase-messaging-handler.js.
}

// Import the shared push handler (same one /sw.js uses in production)
importScripts("/firebase-messaging-handler.js");
