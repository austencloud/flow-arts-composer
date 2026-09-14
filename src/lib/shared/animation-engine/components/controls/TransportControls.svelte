<!--
  TransportControls.svelte

  Transport control buttons for animation playback:
  - Full beat backward (<<)
  - Half beat backward (<)
  - Play/Pause (center)
  - Half beat forward (>)
  - Full beat forward (>>)
-->
<script lang="ts">
  import { onDestroy } from "svelte";

  let {
    isPlaying = false,
    stepGlowMs = 500,
    onPlaybackToggle = () => {},
    onStepHalfBeatBackward,
    onStepHalfBeatForward,
    onStepFullBeatBackward,
    onStepFullBeatForward,
    onRestartToStart,
    disabled = false,
    appearance = "standard",
  }: {
    isPlaying?: boolean;
    /** How long step buttons glow after click (ms). 0 to disable. */
    stepGlowMs?: number;
    onPlaybackToggle?: () => void;
    onStepHalfBeatBackward?: () => void;
    onStepHalfBeatForward?: () => void;
    onStepFullBeatBackward?: () => void;
    onStepFullBeatForward?: () => void;
    /** When provided, replaces the full-beat-backward button with a restart-to-start button */
    onRestartToStart?: () => void;
    disabled?: boolean;
    /** Compact transport embedded in a continuous scrubber row. */
    appearance?: "standard" | "inline";
  } = $props();

  // Step glow state
  let glowingBtn = $state<string | null>(null);
  let glowTimer: ReturnType<typeof setTimeout> | null = null;

  function glow(btn: string) {
    if (!stepGlowMs) return;
    if (glowTimer) clearTimeout(glowTimer);
    glowingBtn = btn;
    glowTimer = setTimeout(() => {
      glowingBtn = null;
      glowTimer = null;
    }, stepGlowMs);
  }

  onDestroy(() => {
    if (glowTimer !== null) clearTimeout(glowTimer);
  });
</script>

<div class="transport-controls" class:inline={appearance === "inline"}>
  <!-- Each button renders only when its handler is provided, so consumers
       can compose any subset without dead controls. -->
  {#if onStepHalfBeatBackward}
    <!-- Half Beat Back (secondary - outer position) -->
    <button
      class="step-btn step-half"
      class:stepping={glowingBtn === "hb"}
      onclick={() => {
        glow("hb");
        onStepHalfBeatBackward?.();
      }}
      type="button"
      aria-label="Previous half step"
      {disabled}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
  {/if}

  <!-- Full Step Back / Restart (primary - adjacent to play) -->
  {#if onRestartToStart}
    <button
      class="step-btn step-full"
      class:stepping={glowingBtn === "fb"}
      onclick={() => {
        glow("fb");
        onRestartToStart();
      }}
      type="button"
      aria-label="Restart from beginning"
      {disabled}
    >
      <i class="fas fa-backward-fast" aria-hidden="true"></i>
    </button>
  {:else if onStepFullBeatBackward}
    <button
      class="step-btn step-full"
      class:stepping={glowingBtn === "fb"}
      onclick={() => {
        glow("fb");
        onStepFullBeatBackward?.();
      }}
      type="button"
      aria-label="Previous full step"
      {disabled}
    >
      <i class="fas fa-angles-left" aria-hidden="true"></i>
    </button>
  {/if}

  <!-- Play/Pause -->
  <button
    class="play-pause-btn large"
    class:playing={isPlaying}
    onclick={onPlaybackToggle}
    aria-label={isPlaying ? "Pause animation" : "Play animation"}
    type="button"
    {disabled}
  >
    <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
  </button>

  {#if onStepFullBeatForward}
    <!-- Full Step Forward (primary - adjacent to play) -->
    <button
      class="step-btn step-full"
      class:stepping={glowingBtn === "ff"}
      onclick={() => {
        glow("ff");
        onStepFullBeatForward?.();
      }}
      type="button"
      aria-label="Next full step"
      {disabled}
    >
      <i class="fas fa-angles-right" aria-hidden="true"></i>
    </button>
  {/if}

  {#if onStepHalfBeatForward}
    <!-- Half Step Forward (secondary - outer position) -->
    <button
      class="step-btn step-half"
      class:stepping={glowingBtn === "hf"}
      onclick={() => {
        glow("hf");
        onStepHalfBeatForward?.();
      }}
      type="button"
      aria-label="Next half step"
      {disabled}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  {/if}
</div>

<style>
  /* Transport controls - centered group */
  .transport-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: fit-content;
    margin: 0 auto;
  }

  /* Step buttons - 48px for WCAG AAA touch target */
  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1.5px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  /* Full beat step buttons - same 48px touch target, slightly more prominent styling */
  .step-btn.step-full {
    font-size: var(--font-size-sm);
    color: var(--theme-text, var(--theme-text-dim));
  }

  @media (hover: hover) and (pointer: fine) {
    .step-btn:hover:not(:disabled) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text, var(--theme-text));
      transform: scale(1.05);
    }
  }

  .step-btn:active {
    transform: scale(0.9);
    background: var(--theme-card-hover-bg);
    transition-duration: 0ms;
  }

  .step-btn:disabled,
  .play-pause-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  .step-btn.stepping {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    color: var(--theme-text);
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  /* Play/Pause Button - Uses semantic success/error colors */
  .play-pause-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-accent, rgba(139, 92, 246, 0.4));
    border-radius: 50%;
    color: var(--theme-accent, rgba(139, 92, 246, 1));
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow:
      0 2px 8px var(--theme-shadow),
      inset 0 1px 0 var(--theme-stroke);
    -webkit-tap-highlight-color: transparent;
    font-size: var(--font-size-base);
  }

  .play-pause-btn.playing {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    box-shadow:
      0 2px 8px var(--theme-shadow),
      inset 0 1px 0 var(--theme-stroke);
  }

  @media (hover: hover) and (pointer: fine) {
    .play-pause-btn:hover:not(:disabled) {
      transform: scale(1.05);
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-accent, rgba(139, 92, 246, 0.6));
      box-shadow:
        0 4px 14px var(--theme-shadow),
        inset 0 1px 0 var(--theme-card-hover-bg);
    }

    .play-pause-btn.playing:hover:not(:disabled) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-accent, rgba(139, 92, 246, 0.7));
      color: var(--theme-accent, #a78bfa);
      box-shadow:
        0 4px 16px var(--theme-shadow),
        0 0 16px
          color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, transparent),
        inset 0 1px 0 var(--theme-card-hover-bg);
    }
  }

  .play-pause-btn:active {
    transform: scale(0.92);
    transition-duration: 0ms;
  }

  /* Larger play button in expanded mode */
  .play-pause-btn.large {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    font-size: var(--font-size-lg);
  }

  @media (max-width: 480px) {
    .transport-controls {
      gap: 4px;
    }

    /* Touch targets must remain 48px on mobile for WCAG AAA */
    .step-btn {
      font-size: var(--font-size-compact);
    }

    .step-btn.step-full {
      font-size: var(--font-size-compact);
    }

    .play-pause-btn {
      font-size: var(--font-size-sm);
    }
  }

  /* Extra small devices (iPhone SE) - maintain 48px touch targets for WCAG AAA */
  @media (max-width: 375px) and (max-height: 670px) {
    .transport-controls {
      gap: 3px;
    }

    .step-btn {
      font-size: var(--font-size-compact);
    }

    .step-btn.step-full {
      font-size: var(--font-size-compact);
    }

    .play-pause-btn {
      font-size: var(--font-size-sm);
    }

    .play-pause-btn.large {
      font-size: var(--font-size-sm);
    }
  }
  /* Inline: the media-player idiom. A bare glyph at the head of a scrubber
     row, sharing the row's background. Keeps the full touch target but drops
     the card border, shadow, and hover scale that make the standard button
     read as a separate widget. */
  .transport-controls.inline {
    flex: 0 0 auto;
    margin: 0;
    gap: 0;
  }

  .transport-controls.inline .play-pause-btn,
  .transport-controls.inline .play-pause-btn.large,
  .transport-controls.inline .play-pause-btn.playing {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 0;
    border-radius: 50%;
    background: transparent;
    box-shadow: none;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    transition:
      background var(--duration-fast) ease-out,
      opacity var(--duration-fast) ease-out;
  }

  /* The play triangle is visually left-heavy; nudge it onto the optical
     centre so play and pause sit on the same spot. */
  .transport-controls.inline .play-pause-btn:not(.playing) i {
    transform: translateX(1px);
  }

  @media (hover: hover) and (pointer: fine) {
    .transport-controls.inline .play-pause-btn:hover:not(:disabled),
    .transport-controls.inline .play-pause-btn.playing:hover:not(:disabled) {
      background: color-mix(in srgb, currentColor 14%, transparent);
      border: 0;
      box-shadow: none;
      color: var(--theme-text);
      transform: none;
    }
  }

  .transport-controls.inline .play-pause-btn:active:not(:disabled) {
    transform: none;
    opacity: 0.6;
  }

  .transport-controls.inline .play-pause-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -4px;
  }
</style>
