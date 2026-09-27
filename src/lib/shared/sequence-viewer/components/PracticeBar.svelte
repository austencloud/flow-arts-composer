<!--
  PracticeBar.svelte

  Docked cockpit bar for focused practice mode. One full-width strip at the
  bottom of the viewer, with only the LIVE controls:

    play/pause | [−Y Slower]  [ BPM ▾ ]  [+Y Faster] | ❄ Hold
                         caption + fill below

  The Slower/Faster buttons step by Y (the schedule increment) and show that Y
  on their face, so the step is coupled to the action instead of stranded in a
  separate row. The BPM readout opens a popover (presets + exact entry +
  tap-tempo) for jumping straight to any tempo. The auto-climb schedule
  (Every X loops, +Y BPM, Goal) lives in the ⚙ gear in the viewer header — it is
  not duplicated here. The number pulses on each bump; a slim fill bar grows
  toward the next speed-up (or the goal). Exit lives in the header.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { Popover } from "bits-ui";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import type { TempoPracticeProgress } from "../services/tempo-practice-orchestrator";

  interface Props {
    progress: TempoPracticeProgress;
    bpm: number;
    isPlaying: boolean;
    onBpmChange: (bpm: number) => void;
    onPlayPause: () => void;
    /** Step the tempo by Y: +1 dir up, -1 down. */
    onStepLevel: (dir: 1 | -1) => void;
    /** Freeze/resume the auto-climb at the current speed. */
    onToggleHold: () => void;
    /** Stop the ramp and return to the setup screen. */
    onStop: () => void;
    /** Whether the metronome click is currently on. */
    metronomeOn: boolean;
    /** Toggle the metronome click on/off. */
    onToggleMetronome: () => void;
    /** Whether the AR mirror (webcam behind canvas) is on. */
    mirrorOn: boolean;
    /** Toggle the AR mirror on/off. */
    onToggleMirror: () => void;
  }

  let {
    progress,
    bpm,
    isPlaying,
    onBpmChange,
    onStepLevel,
    onToggleHold,
    onPlayPause,
    onStop,
    metronomeOn,
    onToggleMetronome,
    mirrorOn,
    onToggleMirror,
  }: Props = $props();

  let bpmColor = $derived.by(() => {
    if (bpm <= 30) return "var(--semantic-success, #22c55e)";
    if (bpm <= 75) return "var(--theme-accent, #8b5cf6)";
    if (bpm <= 120) return "var(--semantic-warning, #f59e0b)";
    return "var(--semantic-error, #ef4444)";
  });

  // Floor/ceiling shared by the level buttons. Ceiling = the goal when a target
  // is set, else the maxBpm cap (progress.targetBpm carries whichever applies).
  let atFloor = $derived(bpm <= progress.startBpm);
  let atCeiling = $derived(bpm >= progress.targetBpm);

  // Y — the per-step increment, shown on the Slower/Faster buttons so the step
  // amount is visible where the action lives.
  let increment = $derived(progress.increment);

  // BPM popover open state (bits-ui owns dismissal: Esc + outside click).
  let bpmOpen = $state(false);

  // Two knobs + an optional goal. X=1 reads as a continuous creep (no levels).
  let hasTarget = $derived(progress.targetEnabled);
  let isCreep = $derived(progress.roundsPerLevel <= 1);

  // Fill semantics: goal set → real start→goal progress; creep (X=1) → a faded
  // full (breathing) bar; staircase (X>1) → progress toward the next speed-up.
  let fillPct = $derived.by(() => {
    if (hasTarget) {
      const span = progress.targetBpm - progress.startBpm;
      return span > 0
        ? Math.max(0, Math.min(100, ((bpm - progress.startBpm) / span) * 100))
        : 0;
    }
    if (isCreep) return 100;
    return progress.roundsPerLevel > 0
      ? (progress.loopsCompleted / progress.roundsPerLevel) * 100
      : 0;
  });

  // Pulse the BPM number whenever the tempo bumps up, so you feel it tighten.
  let prevBpm = bpm;
  let bumped = $state(false);
  let bumpTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (bpm > prevBpm) {
      bumped = true;
      if (bumpTimer) clearTimeout(bumpTimer);
      bumpTimer = setTimeout(() => (bumped = false), 360);
    }
    prevBpm = bpm;
  });

  // Reduced-motion gate for the JS-driven svelte transitions below (CSS
  // animations are gated by the @media block in styles).
  let reduceMotion = $state(false);
  onMount(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const sync = () => (reduceMotion = mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  });

  // Celebrate a real milestone: crossing a staircase speed-up (suppressed during
  // the X=1 creep so it doesn't fire every loop) OR reaching the goal.
  let prevLevel = progress.currentLevel;
  let prevReached = progress.reachedTarget;
  let celebrate = $state(false);
  let celebrateTimer: ReturnType<typeof setTimeout> | null = null;
  function fireCelebrate() {
    celebrate = true;
    if (celebrateTimer) clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => (celebrate = false), 620);
  }
  $effect(() => {
    const lvl = progress.currentLevel;
    const reached = progress.reachedTarget;
    if ((!isCreep && lvl > prevLevel) || (reached && !prevReached))
      fireCelebrate();
    prevLevel = lvl;
    prevReached = reached;
  });

  let caption = $derived.by(() => {
    if (progress.held) return t("viewer_practice_holding_at", { bpm });
    if (hasTarget) {
      return progress.reachedTarget
        ? t("viewer_practice_reached", { bpm })
        : t("viewer_practice_climbing_to", { bpm: progress.targetBpm });
    }
    if (isCreep)
      return t("viewer_practice_climbing_each_loop", {
        increment: progress.increment,
      });
    const n = progress.loopsRemaining;
    return t(
      n === 1
        ? "viewer_practice_speeds_up_one"
        : "viewer_practice_speeds_up_many",
      { count: n }
    );
  });
</script>

<div
  class="practice-bar"
  role="region"
  aria-label={t("viewer_ui_practice_controls")}
>
  <div class="pb-group">
    <button
      class="pb-btn pb-play"
      type="button"
      onclick={onPlayPause}
      aria-label={isPlaying ? t("viewer_practice_pause") : t("learn_play")}
    >
      <span class="pb-icon-stack">
        {#key isPlaying}
          <i
            class="fas {isPlaying ? 'fa-pause' : 'fa-play'}"
            aria-hidden="true"
            in:fade|local={{ duration: reduceMotion ? 0 : 160 }}
            out:fade|local={{ duration: reduceMotion ? 0 : 160 }}
          ></i>
        {/key}
      </span>
    </button>

    <div class="pb-tempo" style="--bpm-color: {bpmColor}">
      <button
        class="pb-btn pb-level down"
        type="button"
        onclick={() => onStepLevel(-1)}
        disabled={atFloor}
        aria-label={t("viewer_practice_slower_by", { increment })}
      >
        <span class="pb-step-num">&minus;{increment}</span>
        <span class="pb-level-label">{t("train_timed_slower")}</span>
      </button>

      <Popover.Root bind:open={bpmOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="pb-readout-btn"
              class:bumped
              type="button"
              aria-label={t("viewer_practice_set_tempo", { bpm })}
            >
              <span class="pb-bpm-value">{bpm}</span>
              <span class="pb-bpm-unit"
                >BPM <i class="fas fa-caret-up" aria-hidden="true"></i></span
              >
            </button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="center"
            sideOffset={12}
            collisionPadding={12}
            class="pb-bpm-pop"
          >
            <BpmChips
              {bpm}
              min={progress.startBpm}
              max={progress.maxBpm}
              variant="full"
              {onBpmChange}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        class="pb-btn pb-level up"
        class:celebrate
        type="button"
        onclick={() => onStepLevel(1)}
        disabled={atCeiling}
        aria-label={t("viewer_practice_faster_by", { increment })}
      >
        <span class="pb-step-num">+{increment}</span>
        <span class="pb-level-label">{t("train_timed_faster")}</span>
      </button>
    </div>

    <!-- Auxiliary controls grouped so mobile can drop them to their own row
         instead of letting the whole strip flex-wrap arbitrarily. -->
    <div class="pb-aux">
      <button
        class="pb-btn pb-hold"
        class:held={progress.held}
        type="button"
        onclick={onToggleHold}
        aria-label={progress.held
          ? t("viewer_practice_resume_speeding")
          : t("viewer_practice_hold_speed")}
        aria-pressed={progress.held}
      >
        <i class="fas fa-snowflake" aria-hidden="true"></i>
        <span
          >{progress.held
            ? t("viewer_practice_held")
            : t("viewer_practice_hold")}</span
        >
      </button>

      <button
        class="pb-btn pb-sound"
        class:on={metronomeOn}
        type="button"
        onclick={onToggleMetronome}
        aria-label={metronomeOn
          ? t("viewer_practice_mute_metronome")
          : t("viewer_practice_play_metronome")}
        aria-pressed={metronomeOn}
      >
        <i
          class="fas {metronomeOn ? 'fa-volume-high' : 'fa-volume-xmark'}"
          aria-hidden="true"
        ></i>
        <span
          >{metronomeOn
            ? t("viewer_practice_sound")
            : t("viewer_practice_muted")}</span
        >
      </button>

      <!-- data-ghost-kind="mirror": the presenter turns the camera on itself.
           The mirror defaults to off, so entering practice alone shows no
           camera — this button is what makes "you, behind the props" happen in
           front of a passerby. Only annotated while OFF (pressing it on would
           turn the camera back off), and the presenter only reaches for it when
           the camera permission is already granted. -->
      <button
        class="pb-btn pb-mirror"
        class:on={mirrorOn}
        type="button"
        data-ghost={mirrorOn ? undefined : "safe"}
        data-ghost-kind={mirrorOn ? undefined : "mirror"}
        data-ghost-label="Mirror"
        onclick={onToggleMirror}
        aria-label={mirrorOn
          ? t("viewer_practice_hide_camera_mirror")
          : t("viewer_practice_show_camera_mirror")}
        aria-pressed={mirrorOn}
      >
        <i
          class="fas {mirrorOn ? 'fa-video' : 'fa-video-slash'}"
          aria-hidden="true"
        ></i>
        <span>{t("viewer_ui_mirror")}</span>
      </button>

      <span class="pb-divider" aria-hidden="true"></span>

      <!-- The presenter's bounded exit from practice: an unattended laptop must
           not hold the camera open all night. -->
      <button
        class="pb-btn pb-stop"
        type="button"
        data-ghost="safe"
        data-ghost-kind="practice-stop"
        data-ghost-label="Stop"
        onclick={onStop}
        aria-label={t("viewer_ui_stop_and_return_to_setup")}
      >
        <i class="fas fa-stop" aria-hidden="true"></i>
        <span>{t("viewer_ui_stop")}</span>
      </button>
    </div>
  </div>

  <!-- Status line: caption above a slim fill bar, full-width below the controls. -->
  <div class="pb-status">
    <span class="pb-caption-wrap">
      {#key caption}
        <span
          class="pb-caption"
          class:ready={progress.reachedTarget}
          in:fade|local={{ duration: reduceMotion ? 0 : 150 }}
          out:fade|local={{ duration: reduceMotion ? 0 : 150 }}>{caption}</span
        >
      {/key}
    </span>
    <div class="pb-fill-track" aria-hidden="true">
      <div
        class="pb-fill"
        class:creep={isCreep && !hasTarget}
        class:ready={progress.reachedTarget}
        style="width:{fillPct}%"
      ></div>
    </div>
  </div>
</div>

<style>
  .practice-bar {
    --ctrl-h: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 14px 16px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    background: var(--theme-panel-bg, rgba(12, 14, 22, 0.98));
    border-top: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 45%, transparent);
    box-shadow: 0 -6px 28px rgba(0, 0, 0, 0.45);
    flex-shrink: 0;
    container-type: inline-size;
    container-name: practice-bar;
  }

  /* Centered control cluster. */
  .pb-group {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Hold · Sound · Stop grouped so they wrap/drop together, not one at a time.
     On desktop they sit inline with the same 16px rhythm as the rest of the row. */
  .pb-aux {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  /* Every interactive control in the strip shares one height. */
  .pb-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--ctrl-h);
    border-radius: 14px;
    border: 2px solid transparent;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }
  .pb-btn:active:not(:disabled) {
    transform: scale(0.95);
  }
  .pb-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .pb-btn:focus-visible {
    outline: 3px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Thin separator between the live controls and the settings gear. */
  .pb-divider {
    width: 1px;
    height: var(--ctrl-h);
    background: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    flex-shrink: 0;
  }

  /* Hold — toggle that freezes the climb; lights up when active */
  .pb-hold {
    flex-direction: column;
    gap: 1px;
    width: 62px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .pb-hold i {
    font-size: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-hold:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
      color: var(--theme-text, #fff);
    }
  }
  .pb-hold.held {
    background: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 26%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 55%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #7dd3fc) 75%, white);
  }

  /* Sound — toggle that plays a beat click; lights up when active, mirrors Hold */
  .pb-sound {
    flex-direction: column;
    gap: 1px;
    width: 62px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .pb-sound i {
    font-size: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-sound:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
      color: var(--theme-text, #fff);
    }
  }
  .pb-sound.on {
    background: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 26%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 55%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #7dd3fc) 75%, white);
  }

  /* Mirror — toggle that shows the webcam behind the canvas; mirrors Hold/Sound. */
  .pb-mirror {
    flex-direction: column;
    gap: 1px;
    width: 62px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .pb-mirror i {
    font-size: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-mirror:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
      color: var(--theme-text, #fff);
    }
  }
  .pb-mirror.on {
    background: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 26%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #38bdf8) 55%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #7dd3fc) 75%, white);
  }

  /* Stop — ends the ramp and returns to the setup screen. */
  .pb-stop {
    flex-direction: column;
    gap: 1px;
    width: 62px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 38%,
      var(--theme-stroke, rgba(255, 255, 255, 0.14))
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 78%, white);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .pb-stop i {
    font-size: 16px;
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-stop:hover {
      background: color-mix(
        in srgb,
        var(--semantic-error, #ef4444) 18%,
        transparent
      );
      color: #fff;
    }
  }

  /* Play/pause — neutral square */
  .pb-play {
    width: var(--ctrl-h);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
  }
  .pb-play i {
    font-size: 18px;
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-play:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #8b5cf6) 50%,
        transparent
      );
      box-shadow: 0 0 14px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent);
    }
  }

  /* Tempo cluster: [−Y Slower]  readout  [+Y Faster] — all share --ctrl-h */
  .pb-tempo {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  /* Big level buttons — the primary tempo control; the step (Y) sits on the face */
  .pb-level {
    flex-direction: column;
    gap: 1px;
    width: 68px;
  }
  .pb-step-num {
    font-size: 1.15rem;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .pb-level-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    opacity: 0.85;
  }
  .pb-level.down {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    color: var(--theme-text, #fff);
  }
  .pb-level.up {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 22%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 45%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 70%, white);
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-level.down:hover:not(:disabled) {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    }
    .pb-level.up:hover:not(:disabled) {
      background: color-mix(
        in srgb,
        var(--semantic-success, #22c55e) 32%,
        transparent
      );
      color: #fff;
    }
  }

  /* BPM readout — a button that opens the tempo popover; same height as the
     level buttons. A caret hints it's openable. */
  .pb-readout-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: var(--ctrl-h);
    min-width: 84px;
    padding: 0 14px;
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
  }
  @media (hover: hover) and (pointer: fine) {
    .pb-readout-btn:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
      border-color: color-mix(
        in srgb,
        var(--bpm-color) 40%,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
    }
  }
  .pb-readout-btn:active {
    transform: scale(0.97);
  }
  .pb-readout-btn:focus-visible {
    outline: 3px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .pb-readout-btn[aria-expanded="true"] {
    border-color: color-mix(in srgb, var(--bpm-color) 55%, transparent);
    background: color-mix(in srgb, var(--bpm-color) 12%, transparent);
  }

  .pb-bpm-value {
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1;
    color: var(--bpm-color);
    font-variant-numeric: tabular-nums;
    display: inline-block;
  }
  /* Bump pulse — the number pops when the tempo climbs. Transform only, so it
     never nudges layout. */
  .pb-readout-btn.bumped .pb-bpm-value {
    animation: pb-bump 360ms ease-out;
  }
  @keyframes pb-bump {
    0% {
      transform: scale(1);
    }
    35% {
      transform: scale(1.22);
    }
    100% {
      transform: scale(1);
    }
  }
  .pb-bpm-unit {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-top: 3px;
  }
  .pb-bpm-unit i {
    font-size: 9px;
    opacity: 0.8;
  }

  /* The canonical BPM selector supplies the controls; this wrapper only owns
     popover geometry and keeps the portalled surface above app chrome. */
  :global(.pb-bpm-pop) {
    z-index: var(--z-dropdown, 1000);
    width: min(22rem, calc(100vw - 1.5rem));
    padding: 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
    transform-origin: bottom center;
  }
  /* Entrance animation via bits-ui data-state — the popover rises + fades in
     from the readout instead of snapping open. */
  :global(.pb-bpm-pop[data-state="open"]) {
    animation: pb-bpm-pop-in 170ms
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  @keyframes pb-bpm-pop-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.pb-bpm-pop[data-state="open"]) {
      animation: none;
    }
  }

  /* Status line below the controls: caption + slim fill, full-width but capped
     so the line stays centred and readable. */
  .pb-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
    max-width: 30rem;
  }

  .pb-fill-track {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.12));
    overflow: hidden;
  }
  .pb-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--theme-accent, #8b5cf6);
    transition: width var(--duration-normal, 200ms) ease;
  }
  /* Creep-mode fill breathes so the steady per-loop climb reads as alive. */
  .pb-fill.creep {
    opacity: 0.45;
    animation: pb-fill-breathe 2.6s ease-in-out infinite;
  }
  @keyframes pb-fill-breathe {
    0%,
    100% {
      opacity: 0.35;
      box-shadow: 0 0 4px 0
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, transparent);
    }
    50% {
      opacity: 0.6;
      box-shadow: 0 0 12px 1px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 60%, transparent);
    }
  }
  /* When the goal is reached the fill settles to full with a playful overshoot. */
  .pb-fill.ready {
    background: var(--semantic-success, #22c55e);
    transition: width var(--duration-normal, 200ms)
      var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  }

  /* Caption crossfades on change; the wrap reserves a line so swaps never
     reflow. The keyed span stacks absolutely inside it. */
  .pb-caption-wrap {
    position: relative;
    display: block;
    width: 100%;
    height: 1.25em;
  }
  .pb-caption {
    position: absolute;
    inset: 0;
    width: 100%;
    text-align: center;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .pb-caption.ready {
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 60%, white);
  }

  /* Play/pause glyph crossfade — old and new stack and fade so it morphs
     instead of blinking. */
  .pb-icon-stack {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
  }
  .pb-icon-stack i {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* One-shot celebration when the tempo crosses a staircase speed-up. */
  .pb-level.up.celebrate {
    animation: pb-celebrate 620ms
      var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  }
  @keyframes pb-celebrate {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--semantic-success, #22c55e) 60%, transparent);
    }
    35% {
      transform: scale(1.16);
      filter: brightness(1.25);
      box-shadow: 0 0 22px 6px
        color-mix(in srgb, var(--semantic-success, #22c55e) 65%, transparent);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--semantic-success, #22c55e) 0%, transparent);
    }
  }

  /* Narrow: two tidy rows instead of an arbitrary flex-wrap. Row 1 = play +
     tempo cluster; row 2 = Hold · Sound · Stop, centered and spanning. Drop the
     divider (the row break already separates the live controls from the aux). */
  @container practice-bar (max-width: 600px) {
    .pb-group {
      display: grid;
      grid-template-columns: auto auto;
      justify-content: center;
      align-items: center;
      gap: 12px;
    }
    .pb-aux {
      grid-column: 1 / -1;
      justify-content: center;
      gap: 12px;
    }
    .pb-divider {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pb-btn,
    .pb-fill,
    .pb-readout-btn {
      transition: none;
    }
    .pb-level.up.celebrate,
    .pb-fill.creep {
      animation: none;
    }
    .pb-readout-btn.bumped .pb-bpm-value {
      animation: none;
    }
    .pb-btn:active,
    .pb-readout-btn:active {
      transform: none;
    }
  }
</style>
