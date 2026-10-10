<!--
  PracticeConfigPopover.svelte

  A small settings popover for tuning the practice tempo ramp. Owns its own
  gear trigger so it can sit next to the Practice button in any viewer header.

  One model, no modes: every X loops, raise BPM by Y, optionally up to a goal.
  Writes through onUpdate (which persists to userConfig). Tweaking mid-session is
  fine — the bar's inline controls apply live; this sets the next run's defaults.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Popover } from "bits-ui";
  import type { TempoPracticeConfig } from "../services/tempo-practice-orchestrator";
  import {
    PLAYBACK_MIN_BPM,
    PLAYBACK_MAX_BPM,
  } from "#lib/shared/animation-engine/domain/constants/timing.js";

  interface Props {
    config: Partial<TempoPracticeConfig>;
    onUpdate: (patch: Partial<TempoPracticeConfig>) => void;
    /** Bindable: lets a parent (e.g. the setup bar's Custom chip) open it. */
    open?: boolean;
    /** When set, positions the panel over this element instead of the gear
     *  trigger — so opening via the Custom preset appears at the preset rather
     *  than over on the far-right gear. */
    customAnchor?: HTMLElement | null;
  }

  let {
    config,
    onUpdate,
    open = $bindable(false),
    customAnchor = null,
  }: Props = $props();

  // Display values fall back to the orchestrator defaults.
  let startBpm = $derived(config.startBpm ?? 15);
  let increment = $derived(config.increment ?? 1);
  let roundsPerLevel = $derived(config.roundsPerLevel ?? 1);
  let targetBpm = $derived(config.targetBpm ?? 60);
  let targetEnabled = $derived(config.targetEnabled ?? false);
  let maxBpm = $derived(config.maxBpm ?? PLAYBACK_MAX_BPM);

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function setStartBpm(next: number) {
    onUpdate({ startBpm: clamp(next, PLAYBACK_MIN_BPM, 120) });
  }
  function setIncrement(next: number) {
    onUpdate({ increment: clamp(next, 1, 30) });
  }
  function setRounds(next: number) {
    onUpdate({ roundsPerLevel: clamp(next, 1, 20) });
  }
  function setTargetBpm(next: number) {
    onUpdate({ targetBpm: clamp(next, startBpm + 5, maxBpm) });
  }
  function toggleTarget() {
    onUpdate({ targetEnabled: !targetEnabled });
  }

  // Plain-language summary of the current ramp.
  let everyPhrase = $derived(
    roundsPerLevel === 1 ? "every loop" : `every ${roundsPerLevel} loops`
  );
  let hint = $derived(
    targetEnabled
      ? `Climbs +${increment} BPM ${everyPhrase} up to ${clamp(targetBpm, startBpm + 5, maxBpm)} BPM, then stops.`
      : `Climbs +${increment} BPM ${everyPhrase} up to ${maxBpm} BPM.`
  );
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="practice-config-trigger"
        class:open
        aria-label={t("viewer_ui_practice_settings")}
        title={t("viewer_ui_practice_settings")}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      side="bottom"
      align={customAnchor ? "center" : "end"}
      sideOffset={8}
      collisionPadding={12}
      customAnchor={customAnchor ?? undefined}
      class="practice-config-panel"
    >
      <header class="config-header">{t("viewer_detail_practice_ramp")}</header>

      <div class="config-body">
        {@render stepper(
          t("viewer_detail_start_tempo"),
          startBpm,
          "BPM",
          () => setStartBpm(startBpm - 5),
          () => setStartBpm(startBpm + 5)
        )}
        {@render stepper(
          t("viewer_detail_loops_per_speed_up"),
          roundsPerLevel,
          "",
          () => setRounds(roundsPerLevel - 1),
          () => setRounds(roundsPerLevel + 1)
        )}
        {@render stepper(
          "BPM per speed-up",
          increment,
          "",
          () => setIncrement(increment - 1),
          () => setIncrement(increment + 1)
        )}

        <div class="config-row">
          <span class="config-label">{t("viewer_ui_stop_at_a_goal")}</span>
          <button
            type="button"
            class="goal-toggle"
            class:on={targetEnabled}
            onclick={toggleTarget}
            aria-pressed={targetEnabled}
            aria-label={targetEnabled ? t("viewer_detail_goal_on") : t("viewer_detail_goal_off")}
          >
            <span class="goal-knob"></span>
          </button>
        </div>

        {#if targetEnabled}
          {@render stepper(
            t("viewer_detail_goal_tempo"),
            clamp(targetBpm, startBpm + 5, maxBpm),
            "BPM",
            () => setTargetBpm(targetBpm - 5),
            () => setTargetBpm(targetBpm + 5)
          )}
        {/if}

        <p class="config-hint">{hint}</p>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

{#snippet stepper(
  label: string,
  value: number,
  unit: string,
  onMinus: () => void,
  onPlus: () => void
)}
  <div class="config-row">
    <span class="config-label">{label}</span>
    <div class="stepper">
      <button
        type="button"
        class="step-btn"
        onclick={onMinus}
        aria-label={`Decrease ${label}`}
      >
        <i class="fas fa-minus" aria-hidden="true"></i>
      </button>
      <span class="step-value"
        >{value}{#if unit}<span class="step-unit">{unit}</span>{/if}</span
      >
      <button
        type="button"
        class="step-btn"
        onclick={onPlus}
        aria-label={`Increase ${label}`}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>
  </div>
{/snippet}

<style>
  .practice-config-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .practice-config-trigger i {
    font-size: 15px;
  }

  @media (hover: hover) and (pointer: fine) {
    .practice-config-trigger:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      color: var(--theme-text, white);
    }
  }

  .practice-config-trigger.open {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 16%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 45%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
  }

  .practice-config-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* :global because bits-ui portals the Content node out of this component's
     scope (the class is passed as a string prop, so it carries no scope hash).
     The inner rows below stay scoped — they're authored in-template. */
  :global(.practice-config-panel) {
    width: 280px;
    background: var(--theme-panel-bg, #0c0e16);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    z-index: var(--z-dropdown, 1000);
    /* Entrance: scale + fade from the trigger corner (side=bottom align=end). */
    transform-origin: top right;
    animation: -global-practice-config-in var(--duration-fast, 150ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }
  @keyframes -global-practice-config-in {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(-6px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.practice-config-panel) {
      animation: none;
    }
  }

  .config-header {
    padding: 12px 16px 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .config-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px 16px;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .config-label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 9px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: 0.7rem;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .step-btn:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      color: var(--theme-text, white);
    }
  }

  .step-btn:active {
    transform: scale(0.92);
  }

  .step-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .step-value {
    min-width: 56px;
    text-align: center;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    color: var(--theme-text, white);
    font-variant-numeric: tabular-nums;
  }

  .step-unit {
    font-size: var(--font-size-compact, 11px);
    font-weight: 600;
    opacity: 0.55;
    margin-left: 3px;
  }

  /* Goal on/off — a switch (button + sliding knob), never a checkbox. */
  .goal-toggle {
    position: relative;
    width: 46px;
    height: 28px;
    flex-shrink: 0;
    padding: 0;
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }
  .goal-toggle .goal-knob {
    position: absolute;
    top: 50%;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    transform: translate(0, -50%);
    transition:
      transform var(--duration-fast, 150ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      background var(--duration-fast, 150ms) ease;
  }
  .goal-toggle.on {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 55%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 70%,
      transparent
    );
  }
  .goal-toggle.on .goal-knob {
    transform: translate(18px, -50%);
    background: #fff;
  }
  .goal-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .goal-toggle,
    .goal-toggle .goal-knob {
      transition: none;
    }
  }

  .config-hint {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
</style>
