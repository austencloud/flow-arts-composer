/**
 * Keyboard Inset — reactive on-screen (virtual) keyboard height.
 *
 * Reports how many pixels the software keyboard occupies at the bottom of the
 * viewport so a fixed, bottom-anchored surface (drawer, bottom sheet) can lift
 * its content clear of it. This is the headless detection the feedback and
 * word-input flows already rely on, extracted so any surface can consume it
 * without also rendering a "Done" toolbar:
 *   - VirtualKeyboard API (Chrome Android 94+) via `geometrychange` when present
 *   - visualViewport delta (iOS Safari, other Chromium) as the fallback
 * Height is 0 whenever the keyboard is hidden.
 *
 * Svelte 5 runes composable — call during component initialization. Pass a
 * `getActive` predicate to gate detection (and the VirtualKeyboard opt-in) to
 * the moments a surface is actually on screen; listeners attach only while it
 * returns true and detach (restoring `overlaysContent`) when it flips false.
 */
import { browser } from "$app/env";

const VISIBLE_THRESHOLD = 100; // px — below this the keyboard is treated as hidden
const STABLE_DELTA = 20; // px — ignore sub-threshold jitter during the open/close animation
const DEBOUNCE_MS = 50; // matches the keyboard animation cadence (and the legacy handler)

export function createKeyboardInset(getActive: () => boolean = () => true) {
  let keyboardHeight = $state(0);
  let isKeyboardVisible = $state(false);
  let hasVirtualKeyboardAPI = $state(false);
  let isSimulatedMobile = $state(false);

  // Detect Chrome DevTools mobile emulation once: touch is reported but no real
  // keyboard can push the viewport, so we must never report a phantom height.
  if (browser) {
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const hasVKApi = "virtualKeyboard" in navigator;
    const viewportMatchesWindow =
      !!window.visualViewport &&
      Math.abs(window.visualViewport.height - window.innerHeight) < 10;

    if (hasTouch && !hasVKApi && viewportMatchesWindow) {
      const ua = navigator.userAgent.toLowerCase();
      const isLikelyDesktopBrowser =
        !ua.includes("mobile") &&
        !ua.includes("android") &&
        !ua.includes("iphone") &&
        !ua.includes("ipad");
      if (isLikelyDesktopBrowser) isSimulatedMobile = true;
    }
  }

  $effect(() => {
    // Track the predicate's dependencies every run so the effect re-attaches
    // when the surface opens/closes, even on the first (inactive) pass.
    const active = getActive();
    if (!browser || isSimulatedMobile || !active) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastStableHeight = 0;
    let pendingHeight = 0;

    function commit(next: number) {
      const diff = Math.abs(next - lastStableHeight);
      if (next > VISIBLE_THRESHOLD) {
        if (diff > STABLE_DELTA || !isKeyboardVisible) {
          keyboardHeight = next;
          isKeyboardVisible = true;
          lastStableHeight = next;
        }
      } else if (isKeyboardVisible) {
        keyboardHeight = 0;
        isKeyboardVisible = false;
        lastStableHeight = 0;
      }
    }

    function schedule(next: number) {
      pendingHeight = next;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => commit(pendingHeight), DEBOUNCE_MS);
    }

    function handleGeometryChange(event: Event) {
      const rect = (event.target as { boundingRect?: DOMRect }).boundingRect;
      schedule(rect?.height ?? 0);
    }

    function handleViewportChange() {
      if (!window.visualViewport) return;
      const delta =
        window.innerHeight -
        window.visualViewport.height -
        window.visualViewport.offsetTop;
      schedule(delta);
    }

    const vkApiPresent = "virtualKeyboard" in navigator;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vk: any;
    let previousOverlaysContent: boolean | undefined;

    if (vkApiPresent) {
      hasVirtualKeyboardAPI = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vk = (navigator as any).virtualKeyboard;
      // Opt into manual handling so the keyboard overlays (rather than resizes)
      // content and `geometrychange` reports its geometry. Remember the prior
      // value so we can restore it and avoid contaminating other flows.
      previousOverlaysContent = vk.overlaysContent;
      vk.overlaysContent = true;
      vk.addEventListener("geometrychange", handleGeometryChange);
    } else if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (vkApiPresent && vk) {
        vk.removeEventListener("geometrychange", handleGeometryChange);
        if (previousOverlaysContent !== undefined) {
          vk.overlaysContent = previousOverlaysContent;
        }
      }
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
        window.visualViewport.removeEventListener("scroll", handleViewportChange);
      }
      // Relax reported inset when detaching so consumers release their layout.
      keyboardHeight = 0;
      isKeyboardVisible = false;
    };
  });

  return {
    /** Keyboard height in px (0 when hidden). */
    get height() {
      return keyboardHeight;
    },
    /** True while the software keyboard is up. */
    get isVisible() {
      return isKeyboardVisible;
    },
    /** True on Chrome Android where the VirtualKeyboard API drives detection. */
    get hasVirtualKeyboardAPI() {
      return hasVirtualKeyboardAPI;
    },
    /** True in Chrome DevTools mobile emulation (no real keyboard). */
    get isSimulatedMobile() {
      return isSimulatedMobile;
    },
  };
}
