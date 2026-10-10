import { browser } from "$app/env";
import type { EffortId, EffortParams } from "#lib/shared/effort/domain/effort-types.js";
import * as effortHapticMapper from "#lib/shared/effort/services/effort-haptic-mapper.js";
import type { HapticFeedbackConfig, HapticFeedbackType, HapticImpactStyle, HapticNotificationType } from "./types";
import { isNative as isNativePlatform } from "#lib/shared/platform/services/platform-detector.js";

// Single short pulses for web Vibration API fallback (mobile browsers).
// Kept minimal to avoid the "buzzy" feel of complex patterns.
const WEB_IMPACT_MS: Record<HapticImpactStyle, number> = {
  light: 8,
  medium: 15,
  heavy: 25,
};
const WEB_NOTIFICATION_MS = 15;
const WEB_SELECTION_MS = 5;

const DEFAULT_CONFIG: HapticFeedbackConfig = {
  enabled: true,
  respectReducedMotion: true,
  throttleTime: 50,
  customPatterns: {},
};

export class HapticFeedback {
  private lastFeedbackTime: number = 0;
  private config: HapticFeedbackConfig = { ...DEFAULT_CONFIG };
  private _effortMapper = effortHapticMapper;
  private hasVibrate: boolean = false;
  private hasSwitchHaptics: boolean = false;
  private switchLabel: HTMLLabelElement | null = null;

  constructor() {
    if (browser) {

      this.hasVibrate =
        typeof navigator !== "undefined" &&
        // eslint-disable-next-line no-restricted-properties
        typeof navigator.vibrate === "function" &&
        (navigator.maxTouchPoints ?? 0) > 0;
      // WebKit-only: <input type="checkbox" switch> fires the Taptic Engine when
      // toggled (iOS 17.4–26.4; Apple patched programmatic triggering in 26.5,
      // where this degrades to a silent no-op). The "switch" IDL attribute only
      // exists in WebKit, so this branch never activates on Chromium/Android.
      this.hasSwitchHaptics =
        !this.hasVibrate &&
        typeof navigator !== "undefined" &&
        (navigator.maxTouchPoints ?? 0) > 0 &&
        "switch" in document.createElement("input");
    }
    this.setupReducedMotionListener();
  }

  public impact(style: HapticImpactStyle): boolean {
    if (!this.canTrigger()) return false;
    this.lastFeedbackTime = Date.now();
    if (this.isNative()) return this.nativeImpact(style);
    return this.webVibrate(WEB_IMPACT_MS[style]);
  }

  public notification(type: HapticNotificationType): boolean {
    if (!this.canTrigger()) return false;
    this.lastFeedbackTime = Date.now();
    if (this.isNative()) return this.nativeNotification(type);
    return this.webVibrate(WEB_NOTIFICATION_MS);
  }

  public selection(): boolean {
    if (!this.canTrigger()) return false;
    this.lastFeedbackTime = Date.now();
    if (this.isNative()) return this.nativeSelection();
    return this.webVibrate(WEB_SELECTION_MS);
  }

  public trigger(type: HapticFeedbackType = "selection"): boolean {
    switch (type) {
      case "selection":
        return this.impact("medium");
      case "success":
        return this.notification("success");
      case "warning":
        return this.notification("warning");
      case "error":
        return this.notification("error");
      case "custom":
        return false;
    }
  }

  public triggerEffort(
    effortId: EffortId,
    params?: EffortParams,
    durationMs?: number
  ): boolean {
    if (!this.canTrigger()) return false;
    if (!this.isNative()) return false;
    this.lastFeedbackTime = Date.now();

    const pattern = this._effortMapper.generatePattern(effortId, params, durationMs);
    this.playPatternAsNativeImpacts(pattern);
    return true;
  }

  public setCustomPattern(name: string, pattern: number[]): void {
    this.config.customPatterns[name] = [...pattern];
  }

  public triggerCustom(name: string): boolean {
    if (!this.canTrigger()) return false;
    if (!this.isNative()) return false;

    const pattern = this.config.customPatterns[name];
    if (!pattern) return false;

    this.lastFeedbackTime = Date.now();
    this.playPatternAsNativeImpacts(pattern);
    return true;
  }

  public isSupported(): boolean {
    return this.isNative() || this.hasVibrate || this.hasSwitchHaptics;
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getConfig(): HapticFeedbackConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<HapticFeedbackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private isNative(): boolean {
    return isNativePlatform();
  }

  private nativeImpact(style: HapticImpactStyle): boolean {
    if (!this.isNative()) return false;
    import("@capacitor/haptics").then(({ Haptics, ImpactStyle }) => {
      const styleMap: Record<HapticImpactStyle, typeof ImpactStyle[keyof typeof ImpactStyle]> = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      Haptics.impact({ style: styleMap[style] });
    }).catch(() => {});
    return true;
  }

  private nativeNotification(type: HapticNotificationType): boolean {
    if (!this.isNative()) return false;
    import("@capacitor/haptics").then(({ Haptics, NotificationType }) => {
      const typeMap: Record<HapticNotificationType, typeof NotificationType[keyof typeof NotificationType]> = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      };
      Haptics.notification({ type: typeMap[type] });
    }).catch(() => {});
    return true;
  }

  private nativeSelection(): boolean {
    if (!this.isNative()) return false;
    import("@capacitor/haptics").then(({ Haptics }) => {
      Haptics.selectionChanged();
    }).catch(() => {});
    return true;
  }

  private playPatternAsNativeImpacts(pattern: number[]): void {
    let timeOffset = 0;
    for (let i = 0; i < pattern.length; i++) {
      const duration = pattern[i] ?? 0;
      if (i % 2 === 0 && duration > 0) {
        setTimeout(() => this.nativeImpact("light"), timeOffset);
      }
      timeOffset += duration;
    }
  }

  private webVibrate(ms: number): boolean {
    if (this.hasVibrate) {
      try {
        // eslint-disable-next-line no-restricted-properties
        navigator.vibrate(ms);
        return true;
      } catch {
        return false;
      }
    }
    return this.switchHapticTap();
  }

  // iOS web/PWA path: clicking the label toggles a hidden native switch input,
  // which fires one system haptic tap. Intensity is not controllable — iOS
  // produces the same tap for every style, so `ms` is intentionally unused here.
  private switchHapticTap(): boolean {
    if (!this.hasSwitchHaptics) return false;
    try {
      this.ensureSwitchElements().click();
      return true;
    } catch {
      return false;
    }
  }

  private ensureSwitchElements(): HTMLLabelElement {
    if (this.switchLabel?.isConnected) return this.switchLabel;

    // Exemption from the no-checkboxes design rule: this input is a haptic
    // actuator, never rendered UI — offscreen, aria-hidden, unfocusable.
    // Visually hidden without display:none, which can suppress the toggle.
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = "tka-haptic-switch";

    const label = document.createElement("label");
    label.htmlFor = input.id;

    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    // The programmatic label.click() below fires real DOM click/change events.
    // Without this class PostHog autocapture records them, and rapid haptics
    // register as $rageclick on an element no finger can reach — 95% of all
    // rage-click events were this phantom before it was excluded.
    host.className = "ph-no-capture";
    input.classList.add("ph-no-capture");
    label.classList.add("ph-no-capture");
    host.style.cssText =
      "position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;";
    input.tabIndex = -1;
    label.tabIndex = -1;

    host.appendChild(input);
    host.appendChild(label);
    document.body.appendChild(host);
    this.switchLabel = label;
    return label;
  }

  private canTrigger(): boolean {
    if (!browser) return false;
    if (!this.config.enabled) return false;
    const now = Date.now();
    if (now - this.lastFeedbackTime < this.config.throttleTime) return false;
    return true;
  }

  private setupReducedMotionListener(): void {
    if (!browser || !window.matchMedia) return;
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.matches && this.config.respectReducedMotion) {
        this.config.enabled = false;
      }
      mq.addEventListener("change", (e) => {
        if (this.config.respectReducedMotion && e.matches) {
          this.config.enabled = false;
        }
      });
    } catch { /* ignore */ }
  }
}
