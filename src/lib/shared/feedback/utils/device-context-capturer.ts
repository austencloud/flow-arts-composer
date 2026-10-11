/**
 * Device Context Capturer
 *
 * Captures device, browser, and app context information for feedback submissions.
 * Helps developers understand the user's environment when debugging issues.
 */

import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
import type { DeviceContext } from "#lib/shared/feedback/domain/models/feedback-models.js";

/**
 * Capture current device/browser context
 *
 * Uses the centralized DeviceDetector for touch detection to stay
 * consistent with the rest of the app's device classification.
 */
export function captureDeviceContext(
  currentModule?: string,
  currentTab?: string
): DeviceContext {
  // Get app version from package.json (injected at build time via Vite)
  const appVersion = import.meta.env.VITE_APP_VERSION || "unknown";
  const deviceDetector = getDeviceDetector();

  return {
    // Device & Browser
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    isTouchDevice: deviceDetector.isTouchDevice(),

    // Viewport & Screen
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,

    // App Context
    appVersion,
    currentModule,
    currentTab,

    // Timestamp
    capturedAt: new Date(),
  };
}
