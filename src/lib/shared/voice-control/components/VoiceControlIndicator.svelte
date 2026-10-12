<!--
  VoiceControlIndicator

  Floating overlay showing the "Hey Tika" listening state.
  Fixed to bottom-left, always visible when voice control is active.

  Two modes with very different visual weight:

  1. Wake word mode (default):
     Small, dim mic icon. Barely noticeable. User knows voice is available
     but the mic isn't "hot" for arbitrary speech - only the wake phrase triggers it.

  2. Command mode (mic is hot):
     Expanded pill with bright animated border, "Listening..." label, and
     a dismiss button. Impossible to miss. User clearly knows their mic
     is actively interpreting everything they say.

  Also shows transient feedback (success/error) after commands execute.
  Respects prefers-reduced-motion.
-->
<script lang="ts">
  import { voiceControlState } from "../state/voice-control-state.svelte";

  const state = voiceControlState;

  const isVisible = $derived(state.supported);
  const isActive = $derived(state.enabled && state.supported);
  const isInactive = $derived(state.supported && !state.enabled);
  const inCommandMode = $derived(state.commandMode);
  const isProcessing = $derived(state.detectorState === "processing");
  const hasError = $derived(state.detectorState === "error");
  const hasFeedback = $derived(state.feedback !== null);

  // Icon logic
  const iconClass = $derived(
    hasFeedback
      ? state.feedback?.type === "success"
        ? "fa-check"
        : state.feedback?.type === "info"
          ? "fa-circle-notch fa-spin"
          : "fa-xmark"
      : isProcessing
        ? "fa-circle-notch fa-spin"
        : hasError
          ? "fa-exclamation"
          : "fa-microphone"
  );

  // Visual state class
  const stateClass = $derived(
    hasFeedback
      ? state.feedback?.type === "success"
        ? "feedback-success"
        : state.feedback?.type === "info"
          ? "feedback-info"
          : "feedback-error"
      : inCommandMode
        ? "command-mode"
        : isProcessing
          ? "processing"
          : hasError
            ? "error"
            : "wake-word"
  );

  function handleActivate() {
    state.startListening();
  }

  function handleDismiss() {
    state.exitCommandMode();
  }
</script>

{#if isVisible}
  <div
    class="voice-indicator {isInactive ? 'inactive' : stateClass}"
    role="status"
    aria-live="polite"
    aria-label={isInactive
      ? "Voice control available. Tap to enable."
      : inCommandMode
        ? "Voice command mode active. Microphone is listening."
        : "Voice control available. Say Hey Tika to activate."}
  >
    <!-- Inactive: tappable mic dot to activate voice control -->
    {#if isInactive}
      <button
        class="wake-dot inactive-dot"
        onclick={handleActivate}
        aria-label="Enable voice control"
      >
        <i class="fas fa-microphone"></i>
      </button>
      <!-- Command mode: expanded pill with animated border -->
    {:else if inCommandMode && !hasFeedback}
      <div class="command-mode-pill">
        <div class="glow-border"></div>
        <div class="pill-content">
          <div class="mic-icon">
            <i class="fas {iconClass}"></i>
            <div class="mic-pulse"></div>
          </div>
          <span class="command-label">Listening...</span>
          <button
            class="dismiss-btn"
            onclick={handleDismiss}
            aria-label="Stop listening"
          >
            <i class="fas fa-xmark"></i>
          </button>
        </div>
      </div>
      <!-- Feedback toast (shown in both modes) -->
    {:else if hasFeedback}
      <div class="feedback-pill">
        <div class="feedback-icon">
          <i class="fas {iconClass}"></i>
        </div>
        <span class="feedback-text">{state.feedback?.message}</span>
      </div>
      <!-- Wake word mode: small subtle dot -->
    {:else}
      <div class="wake-dot">
        <i class="fas {iconClass}"></i>
      </div>
    {/if}
  </div>
{/if}

<style>
  .voice-indicator {
    /* Scoped state palette — mapped to the global semantic tokens, hex fallback.
       Lighter *-text variants are the 400-weight text/icon shades. */
    --vc-active: var(--semantic-success, #22c55e);
    --vc-active-text: #4ade80;
    --vc-error: var(--semantic-error, #ef4444);
    --vc-error-text: #f87171;
    --vc-info: var(--semantic-info, #3b82f6);
    --vc-info-text: #60a5fa;
    --vc-processing: var(--semantic-warning, #f59e0b);

    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: var(--z-toast);
    pointer-events: none;
    transition: opacity var(--duration-emphasis) var(--ease-standard);
  }

  /* Hide on desktop - the sidebar mic button handles it there */
  @media (min-width: 769px) {
    .voice-indicator {
      display: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WAKE WORD MODE: Small, dim, unobtrusive
     ═══════════════════════════════════════════════════════════ */

  .wake-dot {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    background: color-mix(in srgb, var(--vc-active) 8%, transparent);
    color: color-mix(in srgb, var(--vc-active) 50%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--vc-active) 15%, transparent);
    transition:
      background var(--duration-emphasis) var(--ease-standard),
      border-color var(--duration-emphasis) var(--ease-standard),
      color var(--duration-emphasis) var(--ease-standard),
      opacity var(--duration-emphasis) var(--ease-standard),
      transform var(--duration-emphasis) var(--ease-standard),
      box-shadow var(--duration-emphasis) var(--ease-standard),
      width var(--duration-emphasis) var(--ease-standard),
      height var(--duration-emphasis) var(--ease-standard);
  }

  .wake-word:hover .wake-dot {
    background: color-mix(in srgb, var(--vc-active) 14%, transparent);
    color: color-mix(in srgb, var(--vc-active) 70%, transparent);
    border-color: color-mix(in srgb, var(--vc-active) 25%, transparent);
  }

  /* Inactive: dimmer, tappable to activate voice control */
  .wake-dot.inactive-dot {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.08);
    pointer-events: auto;
    cursor: pointer;
  }

  .wake-dot.inactive-dot:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);
    border-color: rgba(255, 255, 255, 0.15);
  }

  /* ═══════════════════════════════════════════════════════════
     COMMAND MODE: Prominent, animated, impossible to miss
     ═══════════════════════════════════════════════════════════ */

  .command-mode-pill {
    position: relative;
    border-radius: 24px;
    pointer-events: auto;
  }

  /* Animated glow border */
  .glow-border {
    position: absolute;
    inset: -2px;
    border-radius: 26px;
    background: conic-gradient(
      from 0deg,
      var(--vc-active),
      var(--vc-info),
      #8b5cf6,
      var(--vc-active)
    );
    animation: glow-spin 3s linear infinite;
    opacity: 0.7;
  }

  @keyframes glow-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Overlay to clip the glow into a border effect */
  .pill-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 8px 10px;
    background: rgba(18, 18, 28, 0.95);
    border-radius: 24px;
    min-height: 44px;
  }

  .mic-icon {
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    background: color-mix(in srgb, var(--vc-active) 15%, transparent);
    color: var(--vc-active);
    flex-shrink: 0;
  }

  .mic-pulse {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--vc-active) 40%, transparent);
    animation: mic-ring 2s ease-out infinite;
  }

  @keyframes mic-ring {
    0% {
      transform: scale(1);
      opacity: 0.6;
    }
    100% {
      transform: scale(1.6);
      opacity: 0;
    }
  }

  .command-label {
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  .dismiss-btn {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    margin: -10px -12px -10px 0;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      width var(--duration-fast) var(--ease-standard),
      height var(--duration-fast) var(--ease-standard);
    flex-shrink: 0;
  }

  .dismiss-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.8);
  }

  /* ═══════════════════════════════════════════════════════════
     FEEDBACK: Transient success/error pill
     ═══════════════════════════════════════════════════════════ */

  .feedback-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px 8px 10px;
    border-radius: 24px;
    min-height: 44px;
    animation: feedback-enter var(--duration-normal) var(--ease-standard-out);
  }

  .feedback-success .feedback-pill {
    background: color-mix(in srgb, var(--vc-active) 12%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--vc-active) 25%, transparent);
  }

  .feedback-error .feedback-pill {
    background: color-mix(in srgb, var(--vc-error) 12%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--vc-error) 25%, transparent);
  }

  .feedback-info .feedback-pill {
    background: color-mix(in srgb, var(--vc-info) 12%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--vc-info) 25%, transparent);
  }

  .feedback-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
  }

  .feedback-success .feedback-icon {
    background: color-mix(in srgb, var(--vc-active) 20%, transparent);
    color: var(--vc-active-text);
  }

  .feedback-error .feedback-icon {
    background: color-mix(in srgb, var(--vc-error) 20%, transparent);
    color: var(--vc-error-text);
  }

  .feedback-info .feedback-icon {
    background: color-mix(in srgb, var(--vc-info) 20%, transparent);
    color: var(--vc-info-text);
  }

  .feedback-text {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    white-space: nowrap;
  }

  .feedback-success .feedback-text {
    color: var(--vc-active-text);
  }

  .feedback-error .feedback-text {
    color: var(--vc-error-text);
  }

  .feedback-info .feedback-text {
    color: var(--vc-info-text);
  }

  @keyframes feedback-enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PROCESSING: amber spin (shown within command mode pill)
     ═══════════════════════════════════════════════════════════ */

  .processing .mic-icon {
    background: color-mix(in srgb, var(--vc-processing) 15%, transparent);
    color: color-mix(in srgb, var(--vc-processing) 90%, transparent);
  }

  .processing .mic-pulse {
    border-color: color-mix(in srgb, var(--vc-processing) 40%, transparent);
  }

  /* ═══════════════════════════════════════════════════════════
     ERROR state
     ═══════════════════════════════════════════════════════════ */

  .error .wake-dot {
    background: color-mix(in srgb, var(--vc-error) 10%, transparent);
    color: color-mix(in srgb, var(--vc-error) 60%, transparent);
    border-color: color-mix(in srgb, var(--vc-error) 15%, transparent);
  }

  /* ═══════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .glow-border {
      animation: none;
      opacity: 0.5;
    }

    .mic-pulse {
      animation: none;
      opacity: 0.3;
    }

    .feedback-pill {
      animation: none;
    }

    .wake-dot,
    .dismiss-btn {
      transition: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     MOBILE: push up above bottom nav
     ═══════════════════════════════════════════════════════════ */

  @media (max-width: 768px) {
    .voice-indicator {
      bottom: 80px;
      left: 16px;
    }
  }
</style>
