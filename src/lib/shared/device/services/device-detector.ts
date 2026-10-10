import { createComponentLogger } from "../../utils/debug-logger";
import { DeviceType } from "../domain/enums/device-enums";
import type {
  DeviceCapabilities,
  ResponsiveSettings,
} from "../domain/models/device-models";
import { BREAKPOINTS, LANDSCAPE_THRESHOLDS } from "../domain/constants/device-constants";
import type { ViewportManager } from '#lib/shared/device/services/viewport-manager.svelte.js'
/**
 * Device Detector Implementation
 *
 * Detects device capabilities and characteristics using browser APIs.
 */
export class DeviceDetector {
  private logger = createComponentLogger("DeviceDetector");
  private capabilitiesCallbacks: ((caps: DeviceCapabilities) => void)[] = [];
  private _cachedDeviceType: DeviceType | null = null;
  private _lastViewportWidth: number = 0;
  private _lastViewportHeight: number = 0;

  constructor(private viewportService: ViewportManager) {
    // Subscribe to viewport changes to make device detection reactive
    this.viewportService.onViewportChange(() => {
      // Clear cached device type to force recalculation
      this._cachedDeviceType = null;

      // Get fresh capabilities with new viewport dimensions
      const newCapabilities = this.getCapabilities();

      // Notify all registered callbacks about the change
      this.capabilitiesCallbacks.forEach((callback) => {
        callback(newCapabilities);
      });

      this.logger.log("Viewport changed, notified callbacks", {
        width: this.viewportService.width,
        height: this.viewportService.height,
        callbackCount: this.capabilitiesCallbacks.length,
      });
    });
  }

  detectDeviceType(): DeviceType {
    const viewportWidth = this.viewportService.width;
    const viewportHeight = this.viewportService.height;

    // Check if we can use cached result
    if (
      this._cachedDeviceType !== null &&
      this._lastViewportWidth === viewportWidth &&
      this._lastViewportHeight === viewportHeight
    ) {
      return this._cachedDeviceType;
    }

    const hasTouch = "ontouchstart" in window;
    let deviceType: DeviceType;

    // Mobile detection (for testing, use viewport width instead of screen width)
    if (viewportWidth < BREAKPOINTS.MOBILE) {
      deviceType = DeviceType.MOBILE;
    }
    // Tablet detection
    else if (hasTouch && viewportWidth >= BREAKPOINTS.MOBILE && viewportWidth < BREAKPOINTS.DESKTOP) {
      deviceType = DeviceType.TABLET;
    }
    // Desktop detection
    else {
      deviceType = DeviceType.DESKTOP;
    }

    // Cache the result
    this._cachedDeviceType = deviceType;
    this._lastViewportWidth = viewportWidth;
    this._lastViewportHeight = viewportHeight;

    this.logger.log(`Detected device type: ${deviceType}`);
    return deviceType;
  }

  /**
   * Whether the device's PRIMARY input is touch.
   *
   * Returns false for touchscreen desktops/laptops (Surface, Dell touchscreen, etc.)
   * where the user primarily uses mouse/trackpad. Those devices have touch hardware
   * but the UX should remain desktop (side drawers, keyboard hints, etc.).
   *
   * For raw hardware touch capability, use `hasTouchHardware()`.
   */
  isTouchDevice(): boolean {
    const hasTouch = this.hasTouchHardware();
    if (!hasTouch) return false;

    // Desktop-class viewport with touch = touchscreen laptop/monitor, not a phone
    // These users primarily use mouse/keyboard, touch is secondary
    if (this.detectDeviceType() === DeviceType.DESKTOP) return false;

    // Simulated mobile (Chrome DevTools) should not count as touch
    if (this.isSimulatedMobile()) return false;

    return true;
  }

  /**
   * Whether the device has touch hardware at all.
   * True for touchscreen laptops, tablets, phones, and Chrome DevTools emulation.
   * Use `isTouchDevice()` instead for UX decisions.
   */
  hasTouchHardware(): boolean {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Detect if we're in a simulated mobile environment (e.g., Chrome DevTools)
   *
   * Chrome DevTools touch simulation:
   * - Sets maxTouchPoints > 0 (makes isTouchDevice() return true)
   * - Does NOT provide VirtualKeyboard API
   * - User agent may or may not be changed depending on device selection
   *
   * The key insight: if touch is enabled but no virtual keyboard will ever appear,
   * we should treat it as desktop for UX purposes (show keyboard hints, etc.)
   *
   * Detection strategy:
   * - If VirtualKeyboard API exists, it's real mobile Chrome
   * - If no VirtualKeyboard API AND viewport is large (>1024px), it's simulated
   * - Small viewport without VirtualKeyboard could be iOS Safari (which doesn't have VK API)
   *   so we check for Safari-specific indicators
   */
  isSimulatedMobile(): boolean {
    const hasTouch = this.hasTouchHardware();
    if (!hasTouch) return false;

    // Real Chrome Android has VirtualKeyboard API
    if ("virtualKeyboard" in navigator) return false;

    // Check viewport size - real phones are typically < 500px wide in portrait
    // If viewport is large AND no VirtualKeyboard API, it's likely desktop with touch sim
    const viewportWidth = this.viewportService.width;
    const viewportHeight = this.viewportService.height;

    // Large viewport + touch + no VirtualKeyboard = simulated
    // Real tablets would either have VirtualKeyboard (Chrome) or be iOS Safari
    if (viewportWidth >= BREAKPOINTS.DESKTOP || viewportHeight >= BREAKPOINTS.DESKTOP) {
      // Check if this might be iOS Safari on iPad
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOSSafari =
        (userAgent.includes("safari") && !userAgent.includes("chrome")) &&
        (userAgent.includes("ipad") || userAgent.includes("macintosh"));

      if (!isIOSSafari) {
        this.logger.log("Detected simulated mobile (large viewport, no VK API)", {
          viewportWidth,
          viewportHeight,
          hasTouch,
        });
        return true;
      }
    }

    // Medium viewport - could be real mobile or narrow desktop window
    // Check for clear desktop browser signatures
    const userAgent = navigator.userAgent.toLowerCase();
    const hasDesktopSignature =
      (userAgent.includes("windows") || userAgent.includes("macintosh") || userAgent.includes("linux")) &&
      !userAgent.includes("android") &&
      !userAgent.includes("iphone") &&
      !userAgent.includes("ipad");

    if (hasDesktopSignature) {
      this.logger.log("Detected simulated mobile (desktop UA with touch)", {
        viewportWidth,
        viewportHeight,
        hasTouch,
        userAgent: userAgent.substring(0, 100),
      });
      return true;
    }

    return false;
  }

  isMobile(): boolean {
    return this.detectDeviceType() === DeviceType.MOBILE;
  }

  isTablet(): boolean {
    return this.detectDeviceType() === DeviceType.TABLET;
  }

  isDesktop(): boolean {
    return this.detectDeviceType() === DeviceType.DESKTOP;
  }

  /**
   * Check if device is in landscape mobile mode
   * Detects phone-like landscape viewports that should use side navigation
   *
   * Criteria for landscape mobile navigation:
   * - Currently in landscape orientation (width > height)
   * - Very wide aspect ratio (> 1.7:1) indicating phone-like proportions
   * - Low height (<= 600px) indicating phone/small tablet, not desktop
   *
   * This works for:
   * - Actual mobile phones rotated sideways (e.g., 844x390, 932x430)
   * - Small tablets in landscape (e.g., 1024x600)
   * - Desktop windows resized to phone-like proportions (for testing)
   *
   * This excludes (all use bottom navigation):
   * - Large tablets in landscape (e.g., 1024x768)
   * - Large foldables (e.g., 2208x1768)
   * - Desktop displays
   *
   * Note: This is intentionally independent of touch detection to allow desktop testing
   */
  isLandscapeMobile(): boolean {
    const viewportWidth = this.viewportService.width;
    const viewportHeight = this.viewportService.height;
    const aspectRatio = this.viewportService.getAspectRatio();

    // Check if in landscape orientation
    const isLandscape = this.viewportService.isLandscape();

    // Phone landscape criteria - wider aspect ratio threshold to include iPhone 6/7/8 landscape (1.78:1)
    const isWideAspectRatio = aspectRatio > LANDSCAPE_THRESHOLDS.WIDE_ASPECT_RATIO;
    const isLowHeight = viewportHeight <= LANDSCAPE_THRESHOLDS.MAX_PHONE_HEIGHT;

    // Only phones and small tablets in landscape should use side navigation
    const result = isLandscape && isWideAspectRatio && isLowHeight;

    if (result) {
      this.logger.log(`Landscape mobile layout active (phone-like):`, {
        viewportWidth,
        viewportHeight,
        aspectRatio: aspectRatio.toFixed(2),
        isWideAspectRatio,
        isLowHeight,
        reason: "Phone-like proportions in landscape orientation",
      });
    }

    return result;
  }

  /**
   * Check if device is in portrait mobile mode
   * Detects narrow portrait viewports that should use horizontal navigation
   *
   * Criteria for portrait mobile navigation:
   * - Currently in portrait orientation (height > width)
   * - Viewport width is relatively narrow (< 600px typical phone width)
   * - This ensures navigation gets maximum horizontal space
   *
   * This works for:
   * - Phones held upright (portrait mode)
   * - Desktop windows resized narrow for testing
   * - Foldable phones on front screen in portrait
   */
  isPortraitMobile(): boolean {
    const viewportWidth = this.viewportService.width;
    const viewportHeight = this.viewportService.height;

    // Check if in portrait orientation
    const isPortrait = this.viewportService.isPortrait();

    // Check if width is narrow (typical phone portrait width)
    const hasNarrowWidth = viewportWidth < BREAKPOINTS.PORTRAIT_MOBILE;

    // Combine conditions
    const result = isPortrait && hasNarrowWidth;

    if (result) {
      this.logger.log(`Portrait mobile layout active:`, {
        viewportWidth,
        viewportHeight,
        reason: "Narrow width in portrait - using horizontal navigation",
      });
    }

    return result;
  }

  getScreenInfo() {
    return {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  supportsFoldable(): boolean {
    // Check for actual foldable APIs (Device Posture API or Screen Fold API)
    // screen.orientation exists on virtually all browsers, so that alone is meaningless
    return "devicePosture" in navigator ||
      ("screen" in window && "fold" in (window.screen as unknown as Record<string, unknown>));
  }

  getCapabilities(): DeviceCapabilities {
    const screenInfo = this.getScreenInfo();
    const deviceType = this.detectDeviceType();
    const hasTouch = this.isTouchDevice();

    // Keyboard detection: desktops always have keyboards, tablets may
    // (iPad + Magic Keyboard), mobiles rarely do. Touch-only != no keyboard.
    const hasKeyboard = deviceType === DeviceType.DESKTOP ||
      deviceType === DeviceType.TABLET ||
      (!hasTouch);

    return {
      primaryInput: hasTouch && !this.isDesktop() ? "touch" : hasTouch ? "hybrid" : "mouse",
      screenSize: this.getScreenSizeCategory(deviceType),
      hasTouch,
      hasPrecisePointer: !hasTouch || this.isDesktop(),
      hasKeyboard,
      viewport: {
        width: this.viewportService.width,
        height: this.viewportService.height,
      },
      pixelRatio: screenInfo.pixelRatio,
      colorDepth: window.screen.colorDepth || 24,
      supportsHDR: false,
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
    };
  }

  /**
   * Get navigation layout immediately without caching
   * This ensures navigation layout responds instantly to viewport changes
   *
   * ORIENTATION-BASED NAVIGATION (2026 Best Practice)
   * ==================================================
   * Navigation placement optimizes for screen real estate based on orientation:
   * - Portrait: Bottom nav (preserves precious vertical space)
   * - Landscape: Left nav (preserves precious horizontal space)
   * - Desktop: Top nav (traditional web convention)
   *
   * Layout Types:
   * - "top": Desktop-class devices (≥1024px) - traditional web convention
   * - "left": Landscape touch devices - maximizes vertical space
   * - "bottom": Portrait touch devices - maximizes horizontal space, thumb-optimized
   *
   * Decision Tree:
   * 1. Desktop (≥1024px OR non-touch) → Top nav
   * 2. Portrait orientation + touch → Bottom nav
   * 3. Landscape orientation + touch → Left nav
   *
   * Rationale:
   * - Simpler logic based on natural screen usage patterns
   * - Orientation determines the constraint (vertical vs horizontal space)
   * - Works perfectly for all device types including foldables
   */
  getNavigationLayoutImmediate(): "top" | "left" | "bottom" {
    const viewportWidth = this.viewportService.width;
    const viewportHeight = this.viewportService.height;
    const deviceType = this.detectDeviceType();
    const hasTouch = this.isTouchDevice();
    const isPortrait = viewportHeight > viewportWidth;
    const isLandscape = viewportWidth > viewportHeight;

    // ============================================================================
    // RULE 1: Desktop-Class Devices → Top Navigation
    // ============================================================================
    // Large displays (≥1024px) or non-touch devices use traditional top navigation.
    // Rationale:
    // - Desktop mental model: Users expect navigation at top on large screens
    // - Professional web app appearance
    // - Mouse/trackpad optimized: Easy to target at top of screen
    // - Ample screen real estate in both dimensions
    // Covers:
    // - Desktop monitors and laptops (≥1024px)
    // - Large tablets in landscape (iPad Pro 12.9" at 1366px, iPad 10.9" at 1180px)
    // - Non-touch displays
    if (deviceType === DeviceType.DESKTOP || !hasTouch) {
      this.logger.log(`Navigation layout: top (desktop-class)`, {
        deviceType,
        viewportWidth,
        viewportHeight,
        hasTouch,
        reason:
          deviceType === DeviceType.DESKTOP
            ? "Desktop-class device (≥1024px) - web convention"
            : "Non-touch device - mouse-optimized placement",
      });
      return "top";
    }

    // ============================================================================
    // RULE 2: Portrait Orientation → Bottom Navigation
    // ============================================================================
    // All touch devices in portrait use bottom navigation.
    // Rationale:
    // - Vertical space is the constraint in portrait
    // - Bottom nav uses minimal vertical space (50-70px)
    // - Thumb-optimized: Easy to reach at bottom of screen
    // - Industry standard: iOS HIG, Material Design 3
    // Covers:
    // - Phones in portrait (e.g., iPhone 393×851, Pixel 412×915)
    // - Tablets in portrait (e.g., iPad 834×1194, Galaxy Tab 800×1280)
    // - Foldables in portrait (e.g., Z Fold unfolded 619×720)
    // - Foldable cover screens in portrait (e.g., Z Fold cover 344×884)
    if (isPortrait && hasTouch) {
      this.logger.log(`Navigation layout: bottom (portrait orientation)`, {
        deviceType,
        viewportWidth,
        viewportHeight,
        orientation: "portrait",
        hasTouch,
        reason:
          "Portrait orientation - preserving vertical space, thumb-optimized",
      });
      return "bottom";
    }

    // ============================================================================
    // RULE 3: Landscape Orientation → Left Navigation
    // ============================================================================
    // All touch devices in landscape use left navigation rail.
    // Rationale:
    // - Horizontal space is the constraint in landscape
    // - Left nav uses minimal horizontal space (60-72px)
    // - Preserves maximum vertical space for content
    // - Consistent with Material Design 3 navigation rail pattern
    // Covers:
    // - Phones in landscape (e.g., iPhone 851×393, Pixel 915×412)
    // - Foldable cover screens in landscape (e.g., Z Fold cover 884×344)
    // - Foldables unfolded in landscape (e.g., Z Fold 720×619)
    // - Small tablets in landscape (< 1024px width)
    if (isLandscape && hasTouch) {
      this.logger.log(`Navigation layout: left (landscape orientation)`, {
        deviceType,
        viewportWidth,
        viewportHeight,
        orientation: "landscape",
        hasTouch,
        reason:
          "Landscape orientation - preserving vertical space with navigation rail",
      });
      return "left";
    }

    // ============================================================================
    // FALLBACK: Default to Top Navigation
    // ============================================================================
    // Safety fallback for any edge cases not caught by above rules.
    this.logger.log(`Navigation layout: top (fallback)`, {
      deviceType,
      viewportWidth,
      viewportHeight,
      hasTouch,
      reason: "Fallback to top navigation",
    });
    return "top";
  }

  getResponsiveSettings(): ResponsiveSettings {
    const capabilities = this.getCapabilities();
    const isMobile = this.isMobile();
    const isTablet = this.isTablet();
    const isDesktop = this.isDesktop();
    const isLandscapeMobile = this.isLandscapeMobile();

    // Use immediate navigation layout detection to avoid timing issues
    const navigationLayout = this.getNavigationLayoutImmediate();

    // Enhanced dual-density spacing for better desktop optimization
    // Mobile: 4px (optimized for touch, user-confirmed perfect)
    // Tablet: 8px (balanced middle ground)
    // Desktop: 10px base (aggressively reduced from 16px for compact desktop layout)
    // Note: CSS media queries in components will further compact (×0.6, ×0.5, ×0.4)
    const elementSpacing = isMobile ? 4 : isTablet ? 8 : 10;

    return {
      minTouchTarget: capabilities.hasTouch ? 44 : 32,
      elementSpacing,
      allowScrolling: true,
      layoutDensity: isMobile
        ? "compact"
        : isTablet
          ? "comfortable"
          : "spacious",
      fontScaling: isMobile ? 1.1 : 1.0,
      isMobile,
      isTablet,
      isDesktop,
      screenWidth: capabilities.viewport.width,
      screenHeight: capabilities.viewport.height,
      devicePixelRatio: capabilities.pixelRatio,
      touchSupported: capabilities.hasTouch,
      orientation:
        capabilities.viewport.width > capabilities.viewport.height
          ? "landscape"
          : "portrait",
      navigationLayout,
      isLandscapeMobile,
    };
  }

  onCapabilitiesChanged(
    callback: (caps: DeviceCapabilities) => void
  ): () => void {
    this.capabilitiesCallbacks.push(callback);

    // Return cleanup function
    return () => {
      const index = this.capabilitiesCallbacks.indexOf(callback);
      if (index > -1) {
        this.capabilitiesCallbacks.splice(index, 1);
      }
    };
  }

  private getScreenSizeCategory(
    deviceType: DeviceType
  ): "mobile" | "tablet" | "desktop" | "largeDesktop" {
    switch (deviceType) {
      case DeviceType.MOBILE:
        return "mobile";
      case DeviceType.TABLET:
        return "tablet";
      case DeviceType.DESKTOP:
        return window.screen.width > BREAKPOINTS.LARGE_DESKTOP ? "largeDesktop" : "desktop";
      default:
        return "desktop";
    }
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { viewportManager } from "./viewport-manager.svelte";

export const deviceDetector = new DeviceDetector(viewportManager);
