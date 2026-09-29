/**
 * Minimal service worker for Firebase Cloud Messaging in dev mode.
 * In production, /sw.js imports firebase-messaging-handler.js instead.
 * This file exists solely so FCM token registration works on localhost (dev + ADB).
 *
 * It's a thin wrapper: just import the shared handler.
 */

// Import the shared push handler (same one /sw.js uses in production)
importScripts("/firebase-messaging-handler.js");
