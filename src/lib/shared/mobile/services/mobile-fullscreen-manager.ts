import { createComponentLogger } from "$lib/shared/utils/debug-logger";

const debug = createComponentLogger("MobileFullscreenManager");

/**
 * Type definitions for vendor-prefixed fullscreen APIs
 */
interface VendorDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element;
  mozFullScreenElement?: Element;
  msFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

interface VendorHTMLElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface VendorNavigator extends Navigator {
  standalone?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /**
     * Set by the inline capture script in src/app.html, which listens for
     * beforeinstallprompt before this manager exists (it's only created
     * lazily). The constructor below adopts it so an event that fired during
     * initial page load isn't lost.
     */
    __tkaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

/**
 * Mobile Fullscreen Service Implementation
 *
 * Provides comprehensive fullscreen management for mobile devices
 */
export class MobileFullscreenManager {
  private fullscreenCallbacks: ((isFullscreen: boolean) => void)[] = [];
  private installCallbacks: ((canInstall: boolean) => void)[] = [];
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (typeof window !== "undefined" && window.__tkaInstallPrompt) {
      this.deferredPrompt = window.__tkaInstallPrompt;
    }
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (typeof window === "undefined") return;

    // Listen for fullscreen changes
    const fullscreenEvents = [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "msfullscreenchange",
    ];

    fullscreenEvents.forEach((event) => {
      document.addEventListener(event, () => {
        const isFullscreen = this.isFullscreen();
        this.fullscreenCallbacks.forEach((callback) => callback(isFullscreen));
      });
    });

    // Listen for PWA install prompt
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.installCallbacks.forEach((callback) => callback(true));
      debug.log("PWA install prompt available");
    });

    // Listen for PWA install completion
    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      this.installCallbacks.forEach((callback) => callback(false));
    });
  }

  isPWA(): boolean {
    if (typeof window === "undefined") return false;

    // Check if running in standalone mode (PWA)
    // Multiple display modes indicate PWA: standalone, fullscreen, minimal-ui
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    const isFullscreenMode = window.matchMedia(
      "(display-mode: fullscreen)"
    ).matches;
    const isMinimalUI = window.matchMedia("(display-mode: minimal-ui)").matches;
    const iOSStandalone =
      (window.navigator as VendorNavigator).standalone === true;
    const isAndroidTWA = document.referrer.includes("android-app://");

    return (
      isStandalone ||
      isFullscreenMode ||
      isMinimalUI ||
      iOSStandalone ||
      isAndroidTWA
    );
  }

  canInstallPWA(): boolean {
    return this.deferredPrompt !== null;
  }

  async promptInstallPWA(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.warn("PWA install prompt not available");
      return false;
    }

    try {
      void this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;

      if (outcome === "accepted") {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      debug.error("PWA install prompt failed", {
        operation: "promptInstallPWA",
        error,
      });
      return false;
    } finally {
      this.deferredPrompt = null;
      if (typeof window !== "undefined") {
        window.__tkaInstallPrompt = null;
      }
    }
  }

  isFullscreenSupported(): boolean {
    if (typeof document === "undefined") return false;

    const vendorDoc = document as VendorDocument;
    return !!(
      document.fullscreenEnabled ||
      vendorDoc.webkitFullscreenEnabled ||
      vendorDoc.mozFullScreenEnabled ||
      vendorDoc.msFullscreenEnabled
    );
  }

  isFullscreen(): boolean {
    if (typeof document === "undefined") return false;

    const vendorDoc = document as VendorDocument;
    return !!(
      document.fullscreenElement ||
      vendorDoc.webkitFullscreenElement ||
      vendorDoc.mozFullScreenElement ||
      vendorDoc.msFullscreenElement
    );
  }

  async requestFullscreen(): Promise<boolean> {
    if (!this.isFullscreenSupported()) {
      console.warn("Fullscreen API not supported");
      return false;
    }

    try {
      const element = document.documentElement as VendorHTMLElement;

      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        await element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
      }

      return true;
    } catch (error) {
      debug.error("Failed to enter fullscreen", {
        operation: "requestFullscreen",
        error,
      });
      return false;
    }
  }

  async exitFullscreen(): Promise<boolean> {
    if (!this.isFullscreen()) {
      return true; // Already not in fullscreen
    }

    try {
      const vendorDoc = document as VendorDocument;
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (vendorDoc.webkitExitFullscreen) {
        await vendorDoc.webkitExitFullscreen();
      } else if (vendorDoc.mozCancelFullScreen) {
        await vendorDoc.mozCancelFullScreen();
      } else if (vendorDoc.msExitFullscreen) {
        await vendorDoc.msExitFullscreen();
      }

      return true;
    } catch (error) {
      debug.error("Failed to exit fullscreen", {
        operation: "exitFullscreen",
        error,
      });
      return false;
    }
  }

  async toggleFullscreen(): Promise<boolean> {
    if (this.isFullscreen()) {
      return await this.exitFullscreen();
    } else {
      return await this.requestFullscreen();
    }
  }

  showFullscreenPrompt(): void {
    const strategy = this.getRecommendedStrategy();

    switch (strategy) {
      case "pwa":
        this.showPWAPrompt();
        break;
      case "fullscreen-api":
        this.showFullscreenAPIPrompt();
        break;
      case "viewport-only":
        this.showViewportPrompt();
        break;
      default:
        break;
    }
  }

  private showPWAPrompt(): void {
    // This would show a custom UI prompt for PWA installation
    debug.log("Showing PWA install prompt");
    // Implementation would depend on your UI framework
  }

  private showFullscreenAPIPrompt(): void {
    // This would show a custom UI prompt for fullscreen API
    // Implementation would depend on your UI framework
  }

  private showViewportPrompt(): void {
    // This would show tips for manual fullscreen (browser menu)
    // Implementation would depend on your UI framework
  }

  onFullscreenChange(callback: (isFullscreen: boolean) => void): () => void {
    this.fullscreenCallbacks.push(callback);

    return () => {
      const index = this.fullscreenCallbacks.indexOf(callback);
      if (index > -1) {
        this.fullscreenCallbacks.splice(index, 1);
      }
    };
  }

  onInstallPromptAvailable(
    callback: (canInstall: boolean) => void
  ): () => void {
    this.installCallbacks.push(callback);

    return () => {
      const index = this.installCallbacks.indexOf(callback);
      if (index > -1) {
        this.installCallbacks.splice(index, 1);
      }
    };
  }

  getRecommendedStrategy():
    | "pwa"
    | "fullscreen-api"
    | "viewport-only"
    | "not-supported" {
    if (this.isPWA()) {
      return "pwa"; // Already installed as PWA
    }

    if (this.canInstallPWA()) {
      return "pwa"; // Can be installed as PWA
    }

    if (this.isFullscreenSupported()) {
      return "fullscreen-api"; // Use Fullscreen API
    }

    // Check if mobile browser supports viewport optimization
    if (typeof window !== "undefined" && "ontouchstart" in window) {
      return "viewport-only"; // Mobile browser, suggest manual fullscreen
    }

    return "not-supported";
  }

  async handleInstallRequest(): Promise<boolean> {
    if (this.canInstallPWA()) {
      // Try native install
      try {
        const accepted = await this.promptInstallPWA();
        if (accepted) {
          return true;
        }
        // If user dismissed, fall back to showing guide
        this.showInstallGuide();
        return true;
      } catch (error) {
        debug.error("Failed to show native install prompt", {
          operation: "handleInstallRequest",
          error,
        });
        // Fall back to showing guide
        this.showInstallGuide();
        return true;
      }
    } else {
      // No native prompt available, show guide
      this.showInstallGuide();
      return true;
    }
  }

  private showInstallGuide(): void {
    // Dispatch event for PWA install guide to be shown
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pwa:open-install-guide"));
    }
  }
}
