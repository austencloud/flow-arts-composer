/**
 * Toggle Card State - Svelte 5 runes
 *
 * Reactive state management for toggle card behavior.
 * Handles service resolution, event handling, and responsive state.
 * Follows TKA architecture: services handle business logic, runes handle reactivity.
 *
 * Touch tolerance: Allows clicks with small finger movements (lazy tapping)
 * by tracking pointer position and using a generous movement threshold.
 */

import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
import { attachRipple } from "#lib/shared/application/services/ripple-effect.js";
import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
import type { DeviceDetector } from '#lib/shared/device/services/device-detector.js'
import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";

// Touch tolerance constants
// 75px is very generous for lazy/casual taps on mobile
const MOVEMENT_THRESHOLD = 75; // px - generous tolerance for lazy taps
const TAP_DURATION_THRESHOLD = 500; // ms - max duration for a tap

/**
 * Creates reactive state for toggle card behavior
 *
 * IMPORTANT: All props are now getters to prevent state recreation.
 * The state object is created ONCE and getters are called at runtime
 * to get current values. This fixes the bug where $derived would
 * recreate the state on every activeOption change, breaking touch
 * tracking and causing double-toggle issues.
 */
export function createToggleCardState<T>(props: {
  getOption1: () => { value: T };
  getOption2: () => { value: T };
  getActiveOption: () => T;
  getOnToggle: () => (value: T) => void;
}) {
  // Services
  let hapticService = $state<HapticFeedback | null>(null);
  let deviceDetector = $state<DeviceDetector | null>(null);

  // Reactive state
  let isLandscapeMobile = $state(false);
  let cardElement = $state<HTMLButtonElement | null>(null);
  let optionsAreSideBySide = $state(false); // Track if options are in horizontal layout

  // Touch tracking for lazy tap tolerance
  const touchState = {
    isTracking: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    handledByTouch: false, // Prevents double-firing between touch and click
  };

  /**
   * Initialize services and setup listeners
   * Returns cleanup function
   */
  async function initialize(): Promise<() => void> {
    try {
      // Resolve services from DI container
      hapticService = getHapticFeedback();
      deviceDetector = getDeviceDetector();

      // Set initial layout state
      isLandscapeMobile = deviceDetector?.isLandscapeMobile() ?? false;

      // Subscribe to device capability changes
      const cleanupDeviceListener = deviceDetector?.onCapabilitiesChanged(() => {
        const detector = getDeviceDetector();
        if (detector) {
          isLandscapeMobile = detector.isLandscapeMobile();
        }
      }) ?? (() => {});

      // Track card dimensions to determine if options are side-by-side
      let resizeObserver: ResizeObserver | null = null;
      if (cardElement) {
        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            const { width, height } = entry.contentRect;
            // Options go side-by-side when aspect-ratio > 3.5 (matches CSS)
            optionsAreSideBySide = width / height > 3.5;
          }
        });
        resizeObserver.observe(cardElement);
      }

      // Attach subtle ripple effect to card
      const cleanupRipple = cardElement
          ? attachRipple(cardElement, {
              color: "rgba(255, 255, 255, 0.25)",
              duration: 350,
              opacity: 0.15,
            })
          : () => {};

      // Return consolidated cleanup function
      return () => {
        cleanupDeviceListener();
        cleanupRipple();
        resizeObserver?.disconnect();
      };
    } catch (error) {
      console.warn("ToggleCardState: Failed to initialize services:", error);
      // Return empty cleanup function on error
      return () => {};
    }
  }

  function handleToggle(value: T) {
    const activeOption = props.getActiveOption();
    if (value !== activeOption) {
      hapticService?.trigger("selection");
      props.getOnToggle()(value);
    }
  }

  /**
   * Handle card click - toggles to inactive option
   */
  function handleCardClick() {
    hapticService?.trigger("selection");
    const activeOption = props.getActiveOption();
    const option1 = props.getOption1();
    const option2 = props.getOption2();
    const newValue =
      activeOption === option1.value ? option2.value : option1.value;
    props.getOnToggle()(newValue);
  }

  /**
   * Handle keyboard navigation
   */
  function handleKeydown(event: KeyboardEvent, value?: T) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (value !== undefined) {
        handleToggle(value);
      } else {
        handleCardClick();
      }
    }
  }

  /**
   * Handle touch start - start tracking for lazy tap tolerance
   */
  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;

    touchState.isTracking = true;
    touchState.startX = touch.clientX;
    touchState.startY = touch.clientY;
    touchState.startTime = Date.now();
    touchState.handledByTouch = false;
  }

  /**
   * Handle touch end - check if it's a valid tap (within tolerance)
   * Fires the toggle even if there was small movement during the tap
   */
  function handleTouchEnd(event: TouchEvent) {
    if (!touchState.isTracking) return;

    const touch = event.changedTouches[0];
    if (!touch) {
      touchState.isTracking = false;
      return;
    }

    const deltaX = Math.abs(touch.clientX - touchState.startX);
    const deltaY = Math.abs(touch.clientY - touchState.startY);
    const duration = Date.now() - touchState.startTime;

    touchState.isTracking = false;

    // If movement is within tolerance and duration is short enough, treat as tap
    const withinTolerance =
      deltaX <= MOVEMENT_THRESHOLD &&
      deltaY <= MOVEMENT_THRESHOLD &&
      duration <= TAP_DURATION_THRESHOLD;

    if (withinTolerance) {
      // Mark that we handled this touch - prevents double-firing with onclick
      touchState.handledByTouch = true;

      // Fire the toggle action
      handleCardClick();

      // Reset the flag after a short delay (allows onclick to check it)
      setTimeout(() => {
        touchState.handledByTouch = false;
      }, 100);
    }
  }

  /**
   * Handle touch cancel - reset tracking state
   */
  function handleTouchCancel() {
    touchState.isTracking = false;
    touchState.handledByTouch = false;
  }

  /**
   * Handle click - fires for mouse clicks and as fallback
   * Checks if touch already handled this to prevent double-firing
   */
  function handleClick() {
    // If touch already handled this interaction, skip
    if (touchState.handledByTouch) {
      return;
    }
    handleCardClick();
  }

  return {
    // State getters/setters
    get cardElement() {
      return cardElement;
    },
    set cardElement(value: HTMLButtonElement | null) {
      cardElement = value;
    },
    get isLandscapeMobile() {
      return isLandscapeMobile;
    },
    get optionsAreSideBySide() {
      return optionsAreSideBySide;
    },

    // Event handlers
    handleToggle,
    handleCardClick,
    handleKeydown,
    handleClick,
    // Touch events for lazy tap tolerance (allows taps with small movement)
    handleTouchStart,
    handleTouchEnd,
    handleTouchCancel,

    // Initialization
    initialize,
  };
}
