<script lang="ts">
  import {
    type BreathingPatternId,
    type AmbientTrack,
    type SessionDuration,
    type BreathingPattern,
    type MeditationSessionStatus,
    BREATHING_PATTERNS,
    AMBIENT_TRACKS,
    SESSION_DURATIONS,
    makeCoherencePattern,
    makeCustomPattern,
  } from "../domain/meditation-types";

  interface Props {
    status: MeditationSessionStatus;
    onStart: (pattern: BreathingPattern, durationMinutes: number) => void;
    onStop: () => void;
    onExit: () => void;
    onAmbientChange: (track: AmbientTrack) => void;
    onVolumeChange: (volume: number) => void;
  }

  let {
    status,
    onStart,
    onStop,
    onExit,
    onAmbientChange,
    onVolumeChange,
  }: Props = $props();

  let patternId: BreathingPatternId = $state("coherence");
  let coherenceBpm: number = $state(6);
  let sessionDuration: SessionDuration = $state(10);
  let customInhale: number = $state(4);
  let customHoldIn: number = $state(4);
  let customExhale: number = $state(4);
  let customHoldOut: number = $state(4);
  let soundOpen: boolean = $state(false);
  let soundEnabled: boolean = $state(false);
  let ambientTrack: AmbientTrack = $state("ocean");
  let volume: number = $state(60);

  const PATTERN_OPTIONS: {
    id: BreathingPatternId;
    label: string;
    shortLabel: string;
  }[] = [
    { id: "coherence", label: "Coherence", shortLabel: "Coherence" },
    { id: "box", label: "Box", shortLabel: "Box" },
    { id: "4-7-8", label: "4-7-8", shortLabel: "4-7-8" },
    {
      id: "physiological-sigh",
      label: "Physiological Sigh",
      shortLabel: "Sigh",
    },
    { id: "custom", label: "Custom", shortLabel: "Custom" },
  ];

  const BPM_OPTIONS = [3, 4, 5, 6, 7, 8];

  const patternAnnotation = $derived.by(() => {
    switch (patternId) {
      case "box":
        return "4s · 4s · 4s · 4s";
      case "4-7-8":
        return "4s · 7s · 8s";
      case "physiological-sigh":
        return "2s + 1s · 6s";
      default:
        return null;
    }
  });

  function getActivePattern(): BreathingPattern {
    if (patternId === "coherence") return makeCoherencePattern(coherenceBpm);
    if (patternId === "custom")
      return makeCustomPattern(
        customInhale,
        customHoldIn,
        customExhale,
        customHoldOut
      );
    return BREATHING_PATTERNS[patternId]!;
  }

  function handleStart() {
    if (soundEnabled && ambientTrack !== "none") {
      onAmbientChange(ambientTrack);
    }
    onStart(getActivePattern(), sessionDuration);
  }

  function handleStop() {
    onStop();
  }

  function handleVolumeInput(e: Event) {
    const val = Number((e.target as HTMLInputElement).value);
    volume = val;
    onVolumeChange(val / 100);
  }

  function handleSoundToggle() {
    soundEnabled = !soundEnabled;
    if (!soundEnabled) {
      onAmbientChange("none");
    }
  }
</script>

<div class="meditation-panel">
  <div class="panel-header">
    <button
      type="button"
      class="back-btn"
      onclick={onExit}
      aria-label="Exit meditation mode"
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span>Exit</span>
    </button>
    <span class="panel-title">Meditate</span>
  </div>

  <div class="panel-body">
    <div class="control-group">
      <span class="setting-label">Pattern</span>
      <div class="chip-grid cols-3">
        {#each PATTERN_OPTIONS as p}
          <button
            type="button"
            class="chip"
            class:active={patternId === p.id}
            onclick={() => {
              patternId = p.id;
            }}
            aria-pressed={patternId === p.id}
            disabled={status === "running"}
            title={p.id === "physiological-sigh"
              ? "Double nasal inhale + long exhale. Stanford 2023 study: most effective pattern for acute stress."
              : undefined}
          >
            <span class="chip-label-long">{p.label}</span>
            <span class="chip-label-short">{p.shortLabel}</span>
          </button>
        {/each}
      </div>

      {#if patternId === "coherence"}
        <div class="sub-control">
          <span class="sub-label">BPM</span>
          <div class="chip-grid cols-6">
            {#each BPM_OPTIONS as bpm}
              <button
                type="button"
                class="chip mini-chip"
                class:active={coherenceBpm === bpm}
                onclick={() => {
                  coherenceBpm = bpm;
                }}
                aria-pressed={coherenceBpm === bpm}
                disabled={status === "running"}>{bpm}</button
              >
            {/each}
          </div>
        </div>
      {/if}

      {#if patternAnnotation}
        <div class="pattern-annotation">{patternAnnotation}</div>
      {/if}

      {#if patternId === "custom"}
        <div class="custom-fields">
          <label class="custom-field">
            <span>Inhale</span>
            <input
              type="number"
              min="1"
              max="30"
              bind:value={customInhale}
              disabled={status === "running"}
              class="num-input"
            />
            <span class="unit">s</span>
          </label>
          <label class="custom-field">
            <span>Hold In</span>
            <input
              type="number"
              min="0"
              max="30"
              bind:value={customHoldIn}
              disabled={status === "running"}
              class="num-input"
            />
            <span class="unit">s</span>
          </label>
          <label class="custom-field">
            <span>Exhale</span>
            <input
              type="number"
              min="1"
              max="30"
              bind:value={customExhale}
              disabled={status === "running"}
              class="num-input"
            />
            <span class="unit">s</span>
          </label>
          <label class="custom-field">
            <span>Hold Out</span>
            <input
              type="number"
              min="0"
              max="30"
              bind:value={customHoldOut}
              disabled={status === "running"}
              class="num-input"
            />
            <span class="unit">s</span>
          </label>
        </div>
      {/if}
    </div>

    <div class="control-group">
      <span class="setting-label">Session</span>
      <div class="chip-grid cols-5">
        {#each SESSION_DURATIONS as dur}
          <button
            type="button"
            class="chip mini-chip"
            class:active={sessionDuration === dur}
            onclick={() => {
              sessionDuration = dur;
            }}
            aria-pressed={sessionDuration === dur}
            disabled={status === "running"}>{dur}m</button
          >
        {/each}
      </div>
    </div>

    <div class="control-group">
      <button
        type="button"
        class="disclosure-btn"
        onclick={() => {
          soundOpen = !soundOpen;
        }}
        aria-expanded={soundOpen}
      >
        <i
          class="fas fa-chevron-{soundOpen ? 'down' : 'right'} disclosure-icon"
          aria-hidden="true"
        ></i>
        <span class="setting-label">Sound</span>
      </button>

      {#if soundOpen}
        <div class="sound-controls">
          <div class="sound-toggle-row">
            <span class="sub-label">Audio</span>
            <button
              type="button"
              class="chip mini-chip toggle-chip"
              class:active={soundEnabled}
              onclick={handleSoundToggle}
              aria-pressed={soundEnabled}>{soundEnabled ? "On" : "Off"}</button
            >
          </div>

          {#if soundEnabled}
            <div class="ambient-selector">
              <span class="sub-label">Ambient</span>
              <div class="chip-grid cols-3">
                {#each AMBIENT_TRACKS.filter((t) => t.id !== "none") as t}
                  <button
                    type="button"
                    class="chip mini-chip"
                    class:active={ambientTrack === t.id}
                    onclick={() => {
                      ambientTrack = t.id;
                    }}
                    aria-pressed={ambientTrack === t.id}>{t.label}</button
                  >
                {/each}
              </div>
            </div>

            <div class="volume-row">
              <span class="sub-label">Volume</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={volume}
                oninput={handleVolumeInput}
                class="slider"
              />
              <span class="slider-value">{volume}%</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="panel-footer">
    {#if status === "idle" || status === "complete"}
      <button type="button" class="start-btn" onclick={handleStart}>
        <i class="fas fa-play" aria-hidden="true"></i>
        <span>Start</span>
      </button>
    {:else}
      <button type="button" class="stop-btn" onclick={handleStop}>
        <i class="fas fa-stop" aria-hidden="true"></i>
        <span>End Session</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .meditation-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 14px;
    background: none;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-out, var(--ease-standard)),
      color var(--duration-fast) var(--ease-out, var(--ease-standard));
  }

  @media (hover: hover) {
    .back-btn:hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, white);
    }
  }

  .panel-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--theme-text, white);
    letter-spacing: 0.02em;
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
    overflow-y: auto;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setting-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .sub-label {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .sub-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }

  .chip-grid {
    display: grid;
    gap: 6px;
  }

  .chip-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .chip-grid.cols-5 {
    grid-template-columns: repeat(5, 1fr);
  }
  .chip-grid.cols-6 {
    grid-template-columns: repeat(6, 1fr);
  }

  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 6px;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 70%,
      transparent
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, var(--ease-standard)),
      border-color var(--duration-fast) var(--ease-out, var(--ease-standard)),
      color var(--duration-fast) var(--ease-out, var(--ease-standard)),
      transform var(--duration-fast) var(--ease-out, var(--ease-standard)),
      box-shadow var(--duration-fast) var(--ease-out, var(--ease-standard)),
      opacity var(--duration-fast) var(--ease-out, var(--ease-standard));
    -webkit-tap-highlight-color: transparent;
  }

  .chip:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .chip:active:not(:disabled) {
    transform: scale(0.92);
    transition-duration: var(--duration-instant);
  }

  .chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 60%,
      transparent
    );
    color: white;
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--theme-accent, #6366f1) 25%, transparent);
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chip:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  .mini-chip {
    min-height: var(--min-touch-target, 44px);
    padding: 4px 10px;
    font-size: 12px;
  }

  .chip-label-short {
    display: none;
  }

  @media (max-width: 360px) {
    .chip-label-long {
      display: none;
    }
    .chip-label-short {
      display: inline;
    }
  }

  .pattern-annotation {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .custom-fields {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .custom-field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .num-input {
    width: 48px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: white;
    font-size: 13px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .num-input:disabled {
    opacity: 0.5;
  }

  .unit {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-size: 12px;
  }

  .disclosure-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: inherit;
  }

  .disclosure-icon {
    font-size: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .sound-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-left: 4px;
  }

  .sound-toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle-chip {
    min-width: 44px;
  }

  .ambient-selector {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .volume-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .slider {
    flex: 1;
    height: 6px;
    appearance: none;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--theme-accent, #6366f1);
    border: 2px solid var(--theme-panel-bg, rgba(10, 10, 26, 0.9));
    cursor: pointer;
  }

  .slider-value {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
  }

  .panel-footer {
    margin-top: auto;
    padding-top: 16px;
  }

  .start-btn,
  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, var(--ease-standard)),
      border-color var(--duration-fast) var(--ease-out, var(--ease-standard)),
      transform var(--duration-fast) var(--ease-out, var(--ease-standard));
  }

  .start-btn {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 60%, transparent);
    color: white;
  }

  .start-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 50%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 70%,
      transparent
    );
  }

  .stop-btn {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    color: rgba(255, 255, 255, 0.9);
  }

  .stop-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      transparent
    );
  }

  .start-btn:active,
  .stop-btn:active {
    transform: scale(0.96);
    transition-duration: var(--duration-instant);
  }

  .start-btn:focus-visible,
  .stop-btn:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip,
    .start-btn,
    .stop-btn,
    .back-btn {
      transition: none !important;
    }
    .chip:active,
    .start-btn:active,
    .stop-btn:active {
      transform: none !important;
    }
  }
</style>
