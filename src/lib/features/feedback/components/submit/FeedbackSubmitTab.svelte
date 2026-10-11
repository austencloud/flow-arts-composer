<!-- FeedbackSubmitTab - Fluid container-query based layout -->
<script lang="ts">
  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import { onMount } from "svelte";
  import FeedbackForm from "./FeedbackForm.svelte";
  import { getSharedFeedbackSubmitState } from "../../state/feedback-submit-state.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // Use shared state so drafts persist between tab and quick panel
  const submitState = getSharedFeedbackSubmitState();
  const deviceDetector = getDeviceDetector();

  // Track focus state for input mode
  let isInputFocused = $state(false);
  let keyboardHeight = $state(0);

  // BULLETPROOF: Only enter input mode when a real virtual keyboard appears
  // - Default: false (don't expand)
  // - True only when: keyboard height > 0 reported from MobileInputToolbar
  // - This prevents expansion in Chrome DevTools simulation
  let hasVirtualKeyboard = $state(false);

  // Input mode: distraction-free typing - ONLY when real virtual keyboard is present
  const isInputMode = $derived(
    (isInputFocused || submitState.isSubmitting) && hasVirtualKeyboard
  );

  // We still need to know if touch is possible (to render the toolbar that detects keyboard)
  let hasTouchCapability = $state(false);

  onMount(() => {
    hasTouchCapability = deviceDetector.isTouchDevice();
  });

  function handleInputFocusChange(focused: boolean) {
    isInputFocused = focused;
  }

  function handleKeyboardHeightChange(height: number) {
    // When keyboard appears (height > 0), enable input mode
    hasVirtualKeyboard = height > 0;
    keyboardHeight = height;
  }
</script>

<div class="submit-tab" class:input-mode={isInputMode}
  style={isInputMode && keyboardHeight > 0 ? `height: calc(100% - ${keyboardHeight}px)` : ''}
>
  <div class="submit-container">
    <!-- Centered header - collapses in input mode -->
    <header class="submit-header" class:collapsed={isInputMode}>
      <div class="header-icon">
        <i class="fas fa-paper-plane" aria-hidden="true"></i>
      </div>
      <h1 class="header-title">{t("feedback_submit_title")}</h1>
      <p class="header-subtitle">{t("feedback_submit_subtitle")}</p>
    </header>

    <!-- Form Content -->
    <FeedbackForm
      formState={submitState}
      {isInputMode}
      isTouchDevice={hasTouchCapability}
      onInputFocusChange={handleInputFocusChange}
      onKeyboardHeightChange={handleKeyboardHeightChange}
    />
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     CONTAINER-QUERY BASED FLUID LAYOUT
     ═══════════════════════════════════════════════════════════════════════════ */
  .submit-tab {
    /* Establish as container for queries */
    container-type: size;
    container-name: submit-tab;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow-y: auto; /* Allow scrolling on small viewports */
    -webkit-overflow-scrolling: touch;

    /* Fluid padding that scales with container */
    padding: clamp(12px, 3cqi, 32px);
    padding-bottom: calc(
      clamp(12px, 3cqi, 32px) + env(safe-area-inset-bottom, 0px)
    );
  }

  .submit-container {
    width: min(100%, 740px);
    max-height: 100%;

    display: flex;
    flex-direction: column;
    gap: clamp(8px, 2cqh, 20px);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HEADER - Centered, fluid sizing
     ═══════════════════════════════════════════════════════════════════════════ */
  .submit-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    /* Fluid gap based on container */
    gap: clamp(4px, 1cqh, 12px);
    /* Reduce header space when container is tight */
    padding-bottom: clamp(4px, 1.5cqh, 16px);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(32px, 5cqi, 40px);
    height: clamp(32px, 5cqi, 40px);
    background: rgba(16, 185, 129, 0.10);
    border: 1px solid rgba(16, 185, 129, 0.20);
    border-radius: clamp(8px, 1.5cqi, 12px);
    color: var(--semantic-success);
    font-size: clamp(13px, 2cqi, 18px);
  }

  .header-title {
    margin: 0;
    font-size: clamp(1rem, 2.5cqi, 1.25rem);
    font-weight: 600;
    color: var(--theme-text);
    letter-spacing: -0.01em;
  }

  .header-subtitle {
    margin: 0;
    font-size: clamp(0.8125rem, 1.8cqi, 0.875rem);
    color: var(--theme-text-dim);
    line-height: 1.4;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTAINER QUERIES - Adapt to actual available space
     ═══════════════════════════════════════════════════════════════════════════ */

  /* When container is very short - minimize header */
  @container submit-tab (max-height: 500px) {
    .submit-tab {
      justify-content: flex-start;
      padding-top: clamp(8px, 2cqh, 16px);
    }

    .submit-header {
      flex-direction: row;
      text-align: left;
      gap: 10px;
      padding-bottom: 0;
    }

    .header-icon {
      width: 28px;
      height: 28px;
      font-size: var(--font-size-compact);
      border-radius: 8px;
    }

    .header-title {
      font-size: 0.9375rem;
    }

    .header-subtitle {
      display: none;
    }
  }

  /* Phone - full bleed */
  @container submit-tab (max-width: 500px) {
    .submit-container {
      width: 100%;
    }
  }

  /* Desktop - generous center column */
  @container submit-tab (min-width: 900px) {
    .submit-container {
      width: min(90%, 740px);
    }
  }

  /* Ultrawide / 4K - slightly wider */
  @container submit-tab (min-width: 1400px) {
    .submit-container {
      width: min(85%, 800px);
    }
  }

  /* Landscape phones: wide + short - use full width */
  @container submit-tab (min-width: 600px) and (max-height: 420px) {
    .submit-tab {
      justify-content: flex-start;
      padding-top: 8px;
    }

    .submit-container {
      width: min(100%, 720px);
      flex-direction: row;
      align-items: flex-start;
      gap: 16px;
    }

    .submit-header {
      flex-direction: column;
      text-align: left;
      align-items: flex-start;
      gap: 4px;
      padding-bottom: 0;
      flex-shrink: 0;
      width: auto;
    }

    .header-icon {
      width: 28px;
      height: 28px;
      font-size: var(--font-size-compact);
      border-radius: 8px;
    }

    .header-title {
      font-size: 0.9375rem;
    }

    .header-subtitle {
      display: none;
    }
  }

  /* Hide scrollbar but allow if absolutely needed */
  .submit-tab::-webkit-scrollbar {
    width: 4px;
  }

  .submit-tab::-webkit-scrollbar-track {
    background: transparent;
  }

  .submit-tab::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INPUT MODE - Distraction-free typing on touch devices
     ═══════════════════════════════════════════════════════════════════════════ */

  /* Header collapse animation */
  .submit-header {
    transition:
      max-height var(--duration-fast, 150ms) ease-out,
      opacity var(--duration-fast, 150ms) ease-out,
      padding var(--duration-fast, 150ms) ease-out,
      margin var(--duration-fast, 150ms) ease-out;
    max-height: 200px;
    overflow: hidden;
  }

  .submit-header.collapsed {
    max-height: 0;
    opacity: 0;
    padding: 0;
    margin: 0;
  }

  /* In input mode, form should expand to fill available space */
  .submit-tab.input-mode {
    justify-content: flex-start;
    padding-top: 8px;
    overflow: hidden; /* Force flex children to fill space, not scroll */
  }

  .submit-tab.input-mode .submit-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: none;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .submit-header {
      transition: none;
    }
  }
</style>
