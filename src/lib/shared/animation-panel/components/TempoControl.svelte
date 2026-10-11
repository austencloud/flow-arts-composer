<!--
  TempoControl.svelte

  Compact BPM control replacing BpmChips.

  Desktop: [ - ]  60 BPM  [ + ]   [ Slow ] [ Med ] [ Fast ]   [ Practice ]
  Mobile:  [ - ]  60 BPM  [ + ]   [ Practice ]

  Features:
  - +/- buttons with hold-to-repeat (accelerating)
  - Tappable BPM display for tap-tempo
  - Semantic presets (Slow/Med/Fast) hidden on mobile
  - Practice button to start progressive tempo training
  - BPM intensity color coding
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    PLAYBACK_MIN_BPM,
    PLAYBACK_MAX_BPM,
  } from "#lib/shared/animation-engine/domain/constants/timing.js";
  import {
    NUMERIC_TEMPO_PRESETS,
    SEMANTIC_TEMPO_PRESETS,
    TEMPO_TAP_TIMEOUT_MS,
    calculateTapTempo,
    clampTempoBpm,
    recordTempoTap,
  } from "#lib/shared/animation-engine/domain/tempo-behavior.js";
  import ScrubbableNumber from "#lib/shared/ui/components/ScrubbableNumber.svelte";

  // Engine-derived: offering a BPM the playback clamp rejects makes the
  // buttons silent no-ops (readout freezes at the real ceiling).
  const BPM_MIN = PLAYBACK_MIN_BPM;
  const BPM_MAX = PLAYBACK_MAX_BPM;
  const STEP_NORMAL = 5;
  const STEP_FAST = 10;
  const HOLD_DELAY_MS = 500;
  const HOLD_TICK_MS = 100;
  const HOLD_ACCEL_MS = 2000;

  interface Props {
    bpm: number;
    onBpmChange: (bpm: number) => void;
    showPresets?: boolean;
    showPractice?: boolean;
    practiceActive?: boolean;
    onPracticeStart?: () => void;
    onPracticeStop?: () => void;
    /**
     * "inline" (default): tap BPM = tap-tempo; Slow/Med/Fast presets render as chips.
     * "popover": tap BPM opens a popover with numeric presets, custom input, and tap-tempo.
     */
    presetsMode?: "inline" | "popover";
    vertical?: boolean;
  }

  let {
    bpm,
    onBpmChange,
    showPresets = true,
    showPractice = true,
    practiceActive = false,
    onPracticeStart,
    onPracticeStop,
    presetsMode = "inline",
    vertical = false,
  }: Props = $props();

  // Tap tempo state
  let tapTimes: number[] = $state([]);
  let tapTimeout: ReturnType<typeof setTimeout> | null = null;
  let isTapping = $derived(tapTimes.length > 0);

  // Popover state (popover mode only)
  let showPopover = $state(false);

  // Hold-to-repeat state
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdInterval: ReturnType<typeof setInterval> | null = null;
  let holdStartTime = 0;

  // BPM intensity color
  let bpmColor = $derived.by(() => {
    if (bpm <= 30) return "var(--semantic-success, #22c55e)";
    if (bpm <= 75) return "var(--theme-accent, #8b5cf6)";
    if (bpm <= 120) return "var(--semantic-warning, #f59e0b)";
    return "var(--semantic-error, #ef4444)";
  });

  // Active preset
  let activePreset = $derived(
    SEMANTIC_TEMPO_PRESETS.find((preset) => preset.bpm === bpm)?.label ?? null
  );


  function adjustBpm(direction: 1 | -1) {
    const elapsed = performance.now() - holdStartTime;
    const step = elapsed > HOLD_ACCEL_MS ? STEP_FAST : STEP_NORMAL;
    const newBpm = clampTempoBpm(bpm + direction * step);
    if (newBpm !== bpm) {
      onBpmChange(newBpm);
    }
  }

  function startHold(direction: 1 | -1) {
    holdStartTime = performance.now();
    adjustBpm(direction);

    holdTimer = setTimeout(() => {
      holdInterval = setInterval(() => {
        adjustBpm(direction);
      }, HOLD_TICK_MS);
    }, HOLD_DELAY_MS);
  }

  function stopHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdInterval) {
      clearInterval(holdInterval);
      holdInterval = null;
    }
  }

  function handleTap() {
    const now = Date.now();

    if (tapTimeout !== null) {
      clearTimeout(tapTimeout);
    }

    tapTimes = recordTempoTap(tapTimes, now);

    const newBpm = calculateTapTempo(tapTimes);
    if (newBpm !== null) {
      onBpmChange(newBpm);
    }

    tapTimeout = setTimeout(() => {
      tapTimes = [];
    }, TEMPO_TAP_TIMEOUT_MS) as ReturnType<typeof setTimeout>;
  }

  function selectPreset(presetBpm: number) {
    onBpmChange(presetBpm);
  }

  function handleBpmButtonClick() {
    if (presetsMode === "popover") {
      if (showPopover) closePopover();
      else openPopover();
    } else {
      handleTap();
    }
  }

  function openPopover() {
    showPopover = true;
  }

  function closePopover() {
    showPopover = false;
  }

  function selectPresetFromPopover(presetBpm: number) {
    selectPreset(presetBpm);
    closePopover();
  }

  function handlePracticeClick() {
    if (practiceActive) {
      onPracticeStop?.();
    } else {
      onPracticeStart?.();
    }
  }

  // Cleanup on unmount
  $effect(() => {
    return () => {
      stopHold();
      if (tapTimeout) clearTimeout(tapTimeout);
    };
  });
</script>

<div class="tempo-wrapper">
<div class="tempo-control" class:vertical>
  <!-- +/- with BPM display -->
  <div class="bpm-adjuster">
    <button
      class="adjust-btn"
      onpointerdown={() => startHold(-1)}
      onpointerup={stopHold}
      onpointerleave={stopHold}
      onpointercancel={stopHold}
      disabled={bpm <= BPM_MIN}
      aria-label={t("compose_decrease_bpm")}
      type="button"
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>

    <button
      class="bpm-display"
      onclick={handleBpmButtonClick}
      type="button"
      aria-label={presetsMode === "popover" ? t("compose_custom_bpm") : t("compose_tap_to_set_tempo")}
      title={presetsMode === "popover" ? t("compose_custom_bpm") : t("compose_tap_tempo_hint")}
      aria-haspopup={presetsMode === "popover" ? "dialog" : undefined}
      aria-expanded={presetsMode === "popover" ? showPopover : undefined}
      style="--bpm-color: {bpmColor}"
    >
      <span class="bpm-value">{bpm}</span>
      <span class="bpm-label">{isTapping ? t("compose_tap") : t("compose_bpm")}</span>
    </button>

    <button
      class="adjust-btn"
      onpointerdown={() => startHold(1)}
      onpointerup={stopHold}
      onpointerleave={stopHold}
      onpointercancel={stopHold}
      disabled={bpm >= BPM_MAX}
      aria-label={t("compose_increase_bpm")}
      type="button"
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Semantic presets (hidden on mobile / in popover mode) -->
  {#if showPresets && presetsMode === "inline"}
    <div class="presets">
      {#each SEMANTIC_TEMPO_PRESETS as preset}
        <button
          class="preset-btn"
          class:active={activePreset === preset.label}
          data-ghost={activePreset === preset.label ? undefined : "safe"}
          data-ghost-kind={activePreset === preset.label ? undefined : "tempo"}
          data-ghost-label={preset.label}
          onclick={() => selectPreset(preset.bpm)}
          type="button"
          aria-label={t("compose_set_bpm_to", { bpm: preset.bpm })}
        >
          {preset.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Practice button -->
  {#if showPractice}
    <button
      class="practice-btn"
      class:active={practiceActive}
      onclick={handlePracticeClick}
      type="button"
      aria-label={practiceActive ? "Stop practice training" : "Start practice training"}
    >
      <i class="fas {practiceActive ? 'fa-stop' : 'fa-signal'}" aria-hidden="true"></i>
      <span>{practiceActive ? "Stop" : "Practice"}</span>
    </button>
  {/if}
</div>

{#if showPopover && presetsMode === "popover"}
  <div class="bpm-popover" role="dialog" tabindex="-1" aria-label={t("compose_custom_bpm")} onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closePopover(); } }}>
    <ScrubbableNumber
      label={t("compose_custom_bpm")}
      value={bpm}
      min={BPM_MIN}
      max={BPM_MAX}
      step={1}
      unit=" BPM"
      onchange={onBpmChange}
    />
    <div class="bpm-popover-presets">
      {#each NUMERIC_TEMPO_PRESETS as preset}
        <button
          type="button"
          class="preset-btn"
          class:active={bpm === preset}
          onclick={() => selectPresetFromPopover(preset)}
          aria-label={t("compose_set_bpm_to", { bpm: preset })}
        >
          {preset}
        </button>
      {/each}
    </div>


    <button
      type="button"
      class="bpm-popover-tap"
      class:tapping={isTapping}
      onclick={handleTap}
      aria-label={t("compose_tap_to_set_tempo")}
    >
      <i class="fas fa-hand-pointer" aria-hidden="true"></i>
      <span>{isTapping ? `${t("compose_tap")} · ${tapTimes.length}` : t("compose_tap_to_set_tempo")}</span>
    </button>

  </div>
{/if}
</div>

<style>
  .tempo-control {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
  }

  .tempo-control.vertical {
    flex-direction: column;
    gap: 14px;
  }

  .tempo-control.vertical .bpm-adjuster {
    gap: 14px;
  }

  .tempo-control.vertical .bpm-display {
    min-width: 88px;
    padding: 10px 20px;
  }

  .tempo-control.vertical .bpm-value {
    font-size: 1.6rem;
  }

  .tempo-control.vertical .presets {
    width: 100%;
    justify-content: center;
  }

  .tempo-control.vertical .preset-btn {
    flex: 1;
  }

  /* ===========================
     BPM ADJUSTER (+/- and display)
     =========================== */

  .bpm-adjuster {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .adjust-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.75rem;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .adjust-btn:hover:not(:disabled) {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      color: var(--theme-text, white);
      transform: scale(1.05);
    }
  }

  .adjust-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .adjust-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .adjust-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* ===========================
     BPM DISPLAY (tappable)
     =========================== */

  .bpm-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 16px;
    min-width: 72px;
    background: color-mix(in srgb, var(--bpm-color) 12%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--bpm-color) 30%, transparent);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  @media (hover: hover) and (pointer: fine) {
    .bpm-display:hover {
      background: color-mix(in srgb, var(--bpm-color) 18%, transparent);
      border-color: color-mix(in srgb, var(--bpm-color) 40%, transparent);
      transform: scale(1.02);
    }
  }

  .bpm-display:active {
    transform: scale(0.98);
    background: color-mix(in srgb, var(--bpm-color) 22%, transparent);
  }

  .bpm-display:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .bpm-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--bpm-color);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .bpm-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }


  .presets {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .preset-btn {
    padding: 8px 14px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
  }

  .preset-btn.active {
    background: color-mix(in srgb, var(--theme-accent, #8b5cf6) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #8b5cf6) 40%, transparent);
    color: var(--theme-accent, #a78bfa);
    box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent, #8b5cf6) 15%, transparent);
  }

  @media (hover: hover) and (pointer: fine) {
    .preset-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      color: var(--theme-text, white);
      transform: translateY(-1px);
    }

    .preset-btn.active:hover {
      background: color-mix(in srgb, var(--theme-accent, #8b5cf6) 20%, transparent);
      border-color: color-mix(in srgb, var(--theme-accent, #8b5cf6) 50%, transparent);
    }
  }

  .preset-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .preset-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }


  .practice-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
  }

  .practice-btn.active {
    background: var(--semantic-error-dim, rgba(239, 68, 68, 0.15));
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
    box-shadow: 0 0 12px color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    animation: practice-pulse 2s ease-in-out infinite;
  }

  @keyframes practice-pulse {
    0%, 100% { box-shadow: 0 0 12px color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent); }
    50% { box-shadow: 0 0 20px color-mix(in srgb, var(--semantic-error, #ef4444) 35%, transparent); }
  }

  @media (hover: hover) and (pointer: fine) {
    .practice-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      color: var(--theme-text, white);
      transform: translateY(-1px);
    }

    .practice-btn.active:hover {
      background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
      border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 50%, transparent);
    }
  }

  .practice-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .practice-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .practice-btn i {
    font-size: 14px;
  }


  @media (max-width: 480px) {
    .bpm-display {
      min-width: 64px;
      padding: 6px 12px;
    }

    .bpm-value {
      font-size: 1.1rem;
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .adjust-btn,
    .bpm-display,
    .preset-btn,
    .practice-btn,
    .practice-btn.active {
      transition: none;
      animation: none;
    }

    .adjust-btn:hover,
    .adjust-btn:active,
    .bpm-display:hover,
    .bpm-display:active,
    .preset-btn:hover,
    .preset-btn:active,
    .practice-btn:hover,
    .practice-btn:active {
      transform: none;
    }
  }

  /* ===========================
     BPM POPOVER (popover mode)
     =========================== */

  /* Wrapper stacks the BPM row above the inline popover so they share width
     and the popover expands in place rather than floating. */
  .tempo-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  /* Inline popover - expands in place below the BPM row. No backdrop. */
  .bpm-popover {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 6%, var(--theme-card-bg, rgba(255, 255, 255, 0.04)));
    border: 1px solid color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    animation: bpm-popIn 180ms cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: top center;
  }

  @keyframes bpm-popIn {
    from { opacity: 0; transform: translateY(-6px) scaleY(0.94); }
    to { opacity: 1; transform: translateY(0) scaleY(1); }
  }

  .bpm-popover-presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .bpm-popover-presets .preset-btn {
    min-height: var(--min-touch-target);
    padding: 8px 6px;
    text-align: center;
  }

  .bpm-popover-tap {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .bpm-popover-tap:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .bpm-popover-tap.tapping {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 18%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    color: var(--theme-accent, #a78bfa);
  }

  .bpm-popover-tap:active {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .bpm-popover {
      animation: none;
    }
    .bpm-popover-tap:active {
      transform: none;
    }
  }
</style>
