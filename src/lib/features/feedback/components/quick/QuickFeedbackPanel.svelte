<!--
  QuickFeedbackPanel - Desktop hotkey-triggered feedback drawer

  Opens via 'f' hotkey on desktop, slides in from the right as a side panel.
  Uses container queries for intelligent responsive sizing.
  
  Shares state with FeedbackSubmitTab so drafts persist between panel and tab.
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import { quickFeedbackState } from "$lib/shared/feedback/state/quick-feedback-state.svelte";
  import {
    getSharedFeedbackSubmitState,
    resetSharedFeedbackSubmitState,
  } from "../../state/feedback-submit-state.svelte";
  import FeedbackForm from "../submit/FeedbackForm.svelte";
  import { TYPE_CONFIG } from "$lib/shared/feedback/domain/models/feedback-models";
  import type { FeedbackType } from "$lib/shared/feedback/domain/models/feedback-models";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { ResponsiveSettings } from "$lib/shared/device/domain/models/device-models";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { detectPlatform } from "$lib/shared/mobile/services/platform-detector";
  import { computeQuickFeedbackInputMode } from "./quick-feedback-input-mode";

  const debug = createComponentLogger("QuickFeedbackPanel");

  // Use shared form state so drafts persist between panel and tab
  const formState = getSharedFeedbackSubmitState();
  const deviceDetector = getDeviceDetector();
  let responsiveSettings = $state<ResponsiveSettings | null>(null);
  let hasShownSuccessToast = $state(false);
  let isInputFocused = $state(false);
  let keyboardHeight = $state(0);
  let isIOSPlatform = $state(false);
  // Initialize synchronously to prevent placement flip during drawer animation
  // This MUST have the correct value before first render, not in onMount
  let isTouchDevice = $state(deviceDetector.isTouchDevice());

  // Touch devices always get full-screen bottom sheet for better mobile UX
  // Only true desktop (non-touch) gets the side drawer from right
  // This handles Z Fold landscape (touch + left nav) correctly - still gets full screen
  const isBottomSheet = $derived(isTouchDevice);
  const drawerPlacement = $derived(isBottomSheet ? "bottom" : "right");
  // Note: No snap points - we always want 100% height, and removing snap points
  // eliminates animation timing issues observed on Z Fold devices

  // Input mode gates on the on-screen keyboard actually being present
  // (keyboardHeight > 0), not just touch capability - see
  // quick-feedback-input-mode.ts for why (fixes feedback item AmvXbY8i:
  // dismissing the keyboard on a Z Fold while focus stayed on the textarea
  // used to strand the panel in full-screen input mode with no submit
  // button). iOS keeps the capability gate there since it has no
  // keyboardHeight signal; that also preserves the Z Fold landscape
  // side-drawer + touch keyboard case for Android.
  // Stay in input mode while submitting to avoid UI flash before panel closes
  const isInputMode = $derived(
    computeQuickFeedbackInputMode({
      isInputFocused,
      isSubmitting: formState.isSubmitting,
      isIOSPlatform,
      isTouchDevice,
      keyboardHeight,
    })
  );

  // Show keyboard hints only on non-touch devices (true desktop with physical keyboard)
  const showKeyboardHints = $derived(!isTouchDevice);

  const hapticService = getHapticFeedback();

  function handleTypeChange(event: PointerEvent, type: FeedbackType) {
    // Prevent focus loss from textarea when clicking type buttons
    event.preventDefault();
    hapticService?.trigger("selection");
    formState.setType(type);
  }

  function closePanel() {
    quickFeedbackState.close();
  }

  function handleInputModeClose(event: PointerEvent) {
    // Closing on pointer-down keeps iOS from blurring and unmounting this
    // compact header before the later click event can reach the button.
    event.preventDefault();
    closePanel();
  }

  function handleDrawerClosed() {
    debug.log(
      "handleDrawerClosed called, current isOpen:",
      quickFeedbackState.isOpen
    );

    // Show "draft saved" toast if user had content and closed without submitting
    const hasContent = formState.formData.description.trim().length > 0;
    const wasSubmitted = formState.submitStatus === "success";

    closePanel();
    debug.log("After close(), isOpen:", quickFeedbackState.isOpen);

    // Reset the toast flag when panel closes
    hasShownSuccessToast = false;

    // Show recovery hint if they had content but didn't submit
    if (hasContent && !wasSubmitted) {
      toast.info(t("feedback_draft_saved_hint"), 3000);
    }
    // Don't reset form state - drafts should persist!
  }

  function syncResponsiveSettings() {
    try {
      responsiveSettings = deviceDetector?.getResponsiveSettings() ?? null;
    } catch (error) {
      console.warn(
        "QuickFeedbackPanel: failed to read responsive settings",
        error
      );
    }
  }

  onMount(() => {
    isIOSPlatform = detectPlatform() === "ios";
    syncResponsiveSettings();
    // Note: isTouchDevice is initialized synchronously above, no need to set here
    // Only subscribe to changes for dynamic updates (e.g., connecting/disconnecting touch input)

    const cleanup = deviceDetector.onCapabilitiesChanged(() => {
      syncResponsiveSettings();
      // Only update if drawer is closed to prevent mid-animation placement changes
      if (!quickFeedbackState.isOpen) {
        isTouchDevice = deviceDetector.isTouchDevice();
      }
    });

    return () => {
      cleanup();
    };
  });

  // Watch for successful submission to show toast and auto-close
  $effect(() => {
    if (formState.submitStatus === "success" && !hasShownSuccessToast) {
      // Mark as shown to prevent infinite loop
      hasShownSuccessToast = true;

      // Dismiss keyboard first by blurring active element
      // This syncs the keyboard dismiss with the drawer close animation
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // Brief delay for keyboard to start closing, then close panel
      // This makes both animations happen together instead of sequentially
      setTimeout(() => {
        closePanel();
        toast.success(t("feedback_submitted_toast"), 3000);

        // Reset the shared state after panel is closed
        resetSharedFeedbackSubmitState();
      }, 50);
    }
  });
</script>

<Drawer
  isOpen={quickFeedbackState.isOpen}
  placement={drawerPlacement}
  onclose={handleDrawerClosed}
  onbackdropclick={(e) => {
    // Don't close while user is typing - they might accidentally tap outside
    if (isInputFocused && isBottomSheet) {
      return false;
    }
    return true;
  }}
  closeOnBackdrop={true}
  closeOnEscape={true}
  ariaLabel={t("feedback_quick_title")}
  showHandle={isBottomSheet}
  dismissible={!isInputFocused}
  class={`quick-feedback-drawer ${isBottomSheet ? "bottom-sheet" : ""} ${isInputMode && isIOSPlatform ? "ios-input-mode" : ""}`}
>
  <div
    class="quick-feedback-panel"
    class:bottom-sheet={isBottomSheet}
    class:input-mode={isInputMode}
    style={isInputMode && !isIOSPlatform && keyboardHeight > 0
      ? `height: calc(100% - ${keyboardHeight}px)`
      : ""}
  >
    <!-- Left edge drag handle for swipe-to-dismiss -->
    <div class="swipe-edge" class:hidden={isBottomSheet} aria-hidden="true">
      <div class="swipe-indicator"></div>
    </div>

    <!-- Main content column -->
    <div class="panel-content">
      <!-- Default header - hidden in input mode -->
      <header class="panel-header" class:hidden={isInputMode}>
        <div class="header-title">
          <i class="fas fa-comment-dots" aria-hidden="true"></i>
          <h2>{t("feedback_quick_title")}</h2>
        </div>
        <button
          class="close-btn"
          onclick={closePanel}
          aria-label={t("feedback_close_panel")}
          type="button"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </header>

      <!-- Compact header for input mode - inline type selector -->
      {#if isInputMode}
        <header class="input-mode-header">
          <div class="input-mode-types">
            {#each Object.entries(TYPE_CONFIG) as [type, config]}
              <button
                type="button"
                class="type-chip"
                class:selected={formState.formData.type === type}
                onpointerdown={(e) => handleTypeChange(e, type as FeedbackType)}
                style="--type-color: {config.color}"
              >
                <i class="fas {config.icon}" aria-hidden="true"></i>
                <span
                  >{t(
                    type === "bug"
                      ? "feedback_type_bug_short"
                      : type === "feature"
                        ? "feedback_type_feature_short"
                        : "feedback_type_general_short"
                  )}</span
                >
              </button>
            {/each}
          </div>
          <button
            class="close-btn input-mode-close"
            onpointerdown={handleInputModeClose}
            onclick={closePanel}
            aria-label={t("feedback_close_panel")}
            type="button"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </header>
      {/if}

      <!-- Keyboard hints - only on non-touch devices (desktop with physical keyboard) -->
      {#if showKeyboardHints}
        <div class="keyboard-hint" aria-hidden="true">
          <kbd>f</kbd>
          <span>{t("auth_escape_or")}</span>
          <kbd>Esc</kbd>
          <span>{t("feedback_to_close")}</span>
        </div>
      {/if}

      <main class="panel-body" data-swipe-block>
        <FeedbackForm
          {formState}
          hideSuccessState={true}
          {isInputMode}
          {isTouchDevice}
          onInputFocusChange={(focused) => {
            isInputFocused = focused;
          }}
          onKeyboardHeightChange={(height) => {
            keyboardHeight = height;
          }}
        />
      </main>
    </div>
  </div>
</Drawer>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     QUICK FEEDBACK PANEL - Container Query Based Layout
     ═══════════════════════════════════════════════════════════════════════════ */
  .quick-feedback-panel {
    /* Establish container for queries */
    container-type: inline-size;
    container-name: quick-feedback;

    /* Layout - row to accommodate swipe edge */
    display: flex;
    flex-direction: row;
    height: 100%;
    overflow: hidden;
    position: relative;

    /* Fluid spacing based on container width */
    --panel-padding: clamp(16px, 5cqi, 24px);
    --panel-gap: clamp(12px, 4cqi, 20px);

    /* Colors */
    --accent: var(--theme-accent-strong);
    --text-primary: var(--theme-text);
    --text-secondary: var(--theme-text-dim);
    --text-muted: color-mix(in srgb, var(--theme-text-dim) 80%, transparent);
    --border-subtle: var(--theme-stroke, var(--theme-stroke));
    --bg-subtle: var(--theme-card-bg);
    --bg-hover: var(--theme-card-hover-bg);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SWIPE EDGE - Left edge for drag-to-dismiss
     ═══════════════════════════════════════════════════════════════════════════ */
  .swipe-edge {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    z-index: 10;
    touch-action: pan-x;
  }

  .swipe-edge:hover .swipe-indicator {
    opacity: 0.6;
    height: 60px;
  }

  .swipe-indicator {
    width: 4px;
    height: 40px;
    background: var(--accent);
    border-radius: 2px;
    opacity: 0.3;
    transition: all var(--duration-normal) ease;
  }

  .hidden {
    display: none;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PANEL CONTENT - Main content wrapper
     ═══════════════════════════════════════════════════════════════════════════ */
  .panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    margin-left: 20px; /* Space for swipe edge */
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HEADER - Fixed at top
     ═══════════════════════════════════════════════════════════════════════════ */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--panel-gap);
    padding: var(--panel-padding);
    padding-bottom: clamp(12px, 3cqi, 16px);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: clamp(8px, 2.5cqi, 12px);
  }

  .header-title i {
    font-size: clamp(1rem, 5cqi, 1.25rem);
    color: var(--accent);
  }

  .header-title h2 {
    margin: 0;
    /* Minimum 16px for accessibility, scales with container */
    font-size: clamp(1rem, 5cqi, 1.25rem);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  /* Close button - 48px minimum touch target */
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    width: clamp(var(--min-touch-target), 12cqi, var(--min-touch-target));
    height: clamp(var(--min-touch-target), 12cqi, var(--min-touch-target));
    background: var(--bg-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: clamp(8px, 2cqi, 12px);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    border-color: var(--theme-stroke-strong, var(--theme-stroke-strong));
    color: var(--text-primary);
  }

  .close-btn:active {
    transform: scale(0.96);
  }

  .close-btn i {
    font-size: clamp(0.875rem, 4cqi, 1rem);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     KEYBOARD HINT
     ═══════════════════════════════════════════════════════════════════════════ */
  .keyboard-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 1.5cqi, 8px);
    padding: clamp(8px, 2cqi, 12px) var(--panel-padding);
    /* Minimum 14px for readability */
    font-size: clamp(0.875rem, 3.5cqi, 0.9375rem);
    color: var(--text-muted);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 8%, transparent) 0%,
      transparent 100%
    );
    flex-shrink: 0;
  }

  .keyboard-hint kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: clamp(24px, 6cqi, 28px);
    min-height: clamp(24px, 6cqi, 28px);
    padding: clamp(2px, 0.5cqi, 4px) clamp(6px, 2cqi, 10px);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: clamp(4px, 1cqi, 6px);
    font-family: inherit;
    /* Minimum 12px */
    font-size: clamp(0.75rem, 3cqi, 0.8125rem);
    font-weight: 600;
    color: color-mix(in srgb, var(--accent) 90%, white);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PANEL BODY - Scrollable content area, vertically centered
     ═══════════════════════════════════════════════════════════════════════════ */
  .panel-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--panel-padding);

    /* Smooth scrolling */
    scroll-behavior: smooth;
    overscroll-behavior: contain;

    /* Custom scrollbar */
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .panel-body::-webkit-scrollbar {
    width: 6px;
  }

  .panel-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .panel-body::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .panel-body::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTAINER QUERIES - Responsive adjustments
     ═══════════════════════════════════════════════════════════════════════════ */

  /* Narrow panel (< 320px) - tighter spacing */
  @container quick-feedback (max-width: 320px) {
    .panel-header {
      flex-wrap: wrap;
    }

    .keyboard-hint {
      flex-wrap: wrap;
    }
  }

  /* Wide panel (> 400px) - more breathing room */
  @container quick-feedback (min-width: 400px) {
    .panel-header {
      padding: clamp(20px, 6cqi, 28px);
      padding-bottom: clamp(16px, 4cqi, 20px);
    }

    .panel-body {
      padding: clamp(20px, 6cqi, 28px);
      padding-top: clamp(16px, 4cqi, 20px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     GLOBAL DRAWER OVERRIDES
     ═══════════════════════════════════════════════════════════════════════════ */
  :global(.quick-feedback-drawer) {
    /* Responsive width with min/max bounds */
    width: clamp(320px, 30vw, 420px);
    max-width: 90vw;
    /* Uses default solid background from Drawer.css */
  }

  :global(.quick-feedback-drawer.bottom-sheet) {
    width: 100%;
    max-width: none;
    height: 100vh;
    height: 100dvh; /* Modern: accounts for iPhone browser chrome */
  }

  /* iOS pans the visual viewport when its keyboard opens. Anchor the sheet to
     the live visible rectangle instead of subtracting a second keyboard inset. */
  :global(.quick-feedback-drawer.bottom-sheet.ios-input-mode) {
    top: var(--viewport-offset-top, 0px);
    bottom: auto;
    height: var(--viewport-height, 100dvh);
    min-height: var(--viewport-height, 100dvh);
    max-height: var(--viewport-height, 100dvh);
  }

  .quick-feedback-panel.bottom-sheet {
    flex-direction: column;
    /* Use 100% to fill drawer-inner, not viewport units which overflow past the handle */
    height: 100%;
    max-height: none;
    padding-top: max(12px, env(safe-area-inset-top));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }

  .quick-feedback-panel.bottom-sheet .panel-content {
    margin-left: 0;
    height: 100%;
  }

  .quick-feedback-panel.bottom-sheet .panel-body {
    padding-bottom: clamp(12px, 4cqi, 18px);
    flex: 1;
  }

  /* Input mode - reduce padding, form fills space above toolbar */
  .quick-feedback-panel.input-mode {
    padding-top: 0;
  }

  .quick-feedback-panel.input-mode .panel-body {
    padding-top: 8px;
    padding-bottom: 8px;
    justify-content: flex-start;
    flex: 1;
    min-height: 0; /* Allow flex shrinking */
    overflow: hidden; /* Prevent content spilling */
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INPUT MODE - Distraction-free mobile input
     ═══════════════════════════════════════════════════════════════════════════ */

  /* Input mode compact header with inline type selector */
  .input-mode-header {
    display: flex;
    align-items: center;
    padding: 6px var(--panel-padding);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
    animation: fadeSlideDown 150ms ease-out;
    gap: 8px;
  }

  @keyframes fadeSlideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .input-mode-types {
    display: flex;
    gap: 8px;
    flex-wrap: nowrap;
    justify-content: space-between;
    width: 100%;
    min-width: 0;
  }

  .input-mode-close {
    flex: 0 0 var(--min-touch-target);
  }

  .input-mode-types::-webkit-scrollbar {
    display: none;
  }

  .type-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    min-height: var(--min-touch-target); /* WCAG AAA touch target */
    min-width: var(--min-touch-target);
    flex: 1; /* Equal width distribution */
    background: transparent;
    border: 1.5px solid var(--border-subtle);
    border-radius: 10px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    white-space: nowrap;
  }

  @container quick-feedback (max-width: 399px) {
    .type-chip {
      gap: 4px;
      padding-inline: 6px;
    }
  }

  .type-chip:hover {
    border-color: color-mix(in srgb, var(--type-color) 50%, transparent);
    color: var(--text-primary);
  }

  .type-chip.selected {
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
    border-color: var(--type-color);
    color: var(--text-primary);
  }

  .type-chip.selected i {
    color: var(--type-color);
  }

  .type-chip i {
    font-size: 0.75rem;
  }

  /* Panel header transitions for input mode */
  .panel-header {
    transition:
      opacity var(--duration-fast) ease-out,
      transform var(--duration-fast) ease-out,
      max-height var(--duration-fast) ease-out;
    max-height: 100px;
    overflow: hidden;
  }

  .panel-header.hidden {
    opacity: 0;
    transform: translateY(-12px);
    max-height: 0;
    padding: 0;
    border: none;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .close-btn {
      transition: none;
    }

    .panel-body {
      scroll-behavior: auto;
    }

    .input-mode-header {
      animation: none;
    }

    .panel-header {
      transition: none;
    }

    .type-chip {
      transition: none;
    }
  }
</style>
