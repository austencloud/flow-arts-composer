<script lang="ts">
  import type {
    BreathPhase,
    BreathingPattern,
    MeditationSessionStatus,
  } from "../domain/meditation-types";
  import {
    PHASE_COLORS,
    getPatternCycleTime,
  } from "../domain/meditation-types";

  interface Props {
    status: MeditationSessionStatus;
    currentPhase: BreathPhase;
    phaseElapsed: number;
    phaseDuration: number;
    pattern: BreathingPattern;
    elapsedSeconds: number;
    durationMinutes: number;
    breathCount: number;
    onMeditateAgain: () => void;
    onBackToMandala: () => void;
  }

  let {
    status,
    currentPhase,
    phaseElapsed,
    phaseDuration,
    pattern,
    elapsedSeconds,
    durationMinutes,
    breathCount,
    onMeditateAgain,
    onBackToMandala,
  }: Props = $props();

  const reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const phaseLabel = $derived.by(() => {
    if (
      pattern?.inhaleSubCueAt != null &&
      currentPhase === "inhale" &&
      phaseElapsed >= pattern.inhaleSubCueAt
    ) {
      return "Inhale Again";
    }
    switch (currentPhase) {
      case "inhale":
        return "Inhale";
      case "hold-in":
        return "Hold";
      case "exhale":
        return "Exhale";
      case "hold-out":
        return "Rest";
    }
  });

  const ariaLabel = $derived.by(() => {
    if (
      pattern?.inhaleSubCueAt != null &&
      currentPhase === "inhale" &&
      phaseElapsed >= pattern.inhaleSubCueAt
    ) {
      return "Inhale again";
    }
    switch (currentPhase) {
      case "inhale":
        return "Inhale";
      case "hold-in":
        return "Hold";
      case "exhale":
        return "Exhale";
      case "hold-out":
        return "Rest";
    }
  });

  const phaseProgress = $derived(
    phaseDuration > 0 ? Math.min(phaseElapsed / phaseDuration, 1) : 0
  );
  const phaseColor = $derived(PHASE_COLORS[currentPhase]);

  const arcPath = $derived.by(() => {
    const r = 16;
    const cx = 16;
    const cy = 16;
    const angle = phaseProgress * 2 * Math.PI;
    if (angle <= 0) return "";
    if (angle >= 2 * Math.PI - 0.01) {
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`;
    }
    const startX = cx;
    const startY = cy - r;
    const endX = cx + r * Math.sin(angle);
    const endY = cy - r * Math.cos(angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
  });

  const timerDisplay = $derived.by(() => {
    const remaining = Math.max(0, durationMinutes * 60 - elapsedSeconds);
    const min = Math.floor(remaining / 60);
    const sec = Math.floor(remaining % 60);
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  });

  const completionSummary = $derived(
    `${durationMinutes} minutes · ${breathCount} breath${breathCount !== 1 ? "s" : ""}`
  );

  let prevPhaseLabel = $state("");
  let announcementText = $state("");

  $effect(() => {
    const label = phaseLabel;
    if (label !== prevPhaseLabel) {
      prevPhaseLabel = label;
      if (status === "running") {
        announcementText = label;
      }
    }
  });

  $effect(() => {
    if (status === "complete") {
      announcementText = `Session complete. You completed ${breathCount} breaths in ${durationMinutes} minutes.`;
    }
  });
</script>

{#if status === "running"}
  <div class="meditation-overlay">
    <div class="timer-display">{timerDisplay}</div>

    <div class="breath-prompt">
      <div
        class="phase-label"
        class:no-transition={reducedMotion}
        aria-hidden="true"
      >
        {phaseLabel}
      </div>

      {#if reducedMotion}
        <div class="phase-text-counter">
          {Math.ceil(phaseElapsed)} / {Math.ceil(phaseDuration)}s
        </div>
      {:else}
        <svg
          class="phase-arc"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="16"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            stroke-width="2"
          />
          {#if arcPath}
            <path
              d={arcPath}
              fill="none"
              stroke={phaseColor}
              stroke-width="2"
              stroke-linecap="round"
            />
          {/if}
        </svg>
      {/if}
    </div>
  </div>
{/if}

{#if status === "complete"}
  <div class="completion-overlay" class:no-transition={reducedMotion}>
    <div class="completion-backdrop"></div>
    <div class="completion-content">
      <h2 class="completion-title">Session Complete</h2>
      <p class="completion-summary">{completionSummary}</p>
      <div class="completion-actions">
        <button
          type="button"
          class="completion-btn primary"
          onclick={onMeditateAgain}>Meditate Again</button
        >
        <button
          type="button"
          class="completion-btn secondary"
          onclick={onBackToMandala}>Back to Mandala</button
        >
      </div>
    </div>
  </div>
{/if}

<div class="sr-only" aria-live="polite" aria-atomic="true">
  {announcementText}
</div>

<style>
  .meditation-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding-bottom: 48px;
    pointer-events: none;
    z-index: 10;
  }

  .timer-display {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 14px;
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.05em;
  }

  .breath-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .phase-label {
    font-size: 18px;
    font-weight: 500;
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .phase-label.no-transition {
    transition: none;
  }

  .phase-arc {
    opacity: 0.9;
  }

  .phase-text-counter {
    font-size: 14px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-variant-numeric: tabular-nums;
  }

  .completion-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    animation: fadeIn var(--duration-dramatic) var(--ease-standard) forwards;
  }

  .completion-overlay.no-transition {
    animation: none;
  }

  .completion-backdrop {
    position: absolute;
    inset: 0;
    background: var(--theme-overlay-bg-hover, rgba(0, 0, 0, 0.7));
    backdrop-filter: blur(8px);
  }

  .completion-content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px;
    text-align: center;
  }

  .completion-title {
    font-size: 24px;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .completion-summary {
    font-size: 15px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0;
  }

  .completion-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  .completion-btn {
    min-height: 44px;
    padding: 10px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
    border: 1px solid transparent;
  }

  .completion-btn.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      rgba(0, 0, 0, 0.4)
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 60%,
      transparent
    );
    color: white;
  }

  .completion-btn.primary:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 50%,
      rgba(0, 0, 0, 0.4)
    );
  }

  .completion-btn.secondary {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .completion-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .completion-btn:active {
    transform: scale(0.96);
    transition-duration: var(--duration-instant);
  }

  .completion-btn:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .completion-btn {
      transition: none;
    }
    .completion-btn:active {
      transform: none;
    }
  }

  @media (max-width: 480px) {
    .phase-label {
      font-size: 16px;
    }
    .completion-actions {
      flex-direction: column;
    }
  }
</style>
