<!--
TraceSettings — six independent switches for how the round presents itself.

On the control choice: this repo has NO shared switch primitive. Grepping
`role="switch"`, `aria-pressed`, and `*Toggle*.svelte` turns up ~15 components
(AnimationSettings, GridModeToggle, TriGridControls, SaveSceneModal, …) that all
hand-build the same `<button role="switch" aria-checked>` + thumb span locally.
There is nothing to import, so this follows that established pattern rather than
inventing a sixteenth shape. Extracting the shared primitive is worth doing, but
it is a shared-layer change and does not belong inside one game.

No checkboxes anywhere, per the design system. Each row is a real button, keyboard
operable, with a visible focus ring and a 44px target.

None of these gate content. Tap Route and the step-through preview complete a
challenge on their own terms — they simply don't claim a traced score.
-->
<script lang="ts">
  import {
    getTracePaths,
    type TraceSettingKey,
  } from "../state/trace-paths-state.svelte";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  const trace = getTracePaths();

  interface Row {
    key: TraceSettingKey;
  }

  const ROWS: Row[] = [
    {
      key: "reducedMotion",
    },
    {
      key: "lowStimulus",
    },
    {
      key: "haptics",
    },
    {
      key: "sound",
    },
    {
      key: "oneHandMode",
    },
    {
      key: "tapRouteMode",
    },
  ];
</script>

<fieldset class="trace-settings">
  <legend>{tDynamic("learn_trace_round_options")}</legend>

  {#each ROWS as row (row.key)}
    {@const on = trace.settings[row.key]}
    <div class="row">
      <div class="copy">
        <span class="label" id="trace-setting-{row.key}"
          >{tDynamic(`learn_trace_setting_${row.key}_label`)}</span
        >
        <span class="description"
          >{tDynamic(`learn_trace_setting_${row.key}_description`)}</span
        >
      </div>
      <button
        type="button"
        class="switch"
        class:on
        role="switch"
        aria-checked={on}
        aria-labelledby="trace-setting-{row.key}"
        onclick={() => trace.toggleSetting(row.key)}
      >
        <span class="thumb"></span>
      </button>
    </div>
  {/each}
</fieldset>

<style>
  .trace-settings {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    max-width: 42rem;
    margin: 0 auto;
    padding: 0.75rem;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  legend {
    padding: 0 0.375rem;
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.375rem;
  }

  .row + .row {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    line-height: 1.4;
  }

  /* The track is the touch target: 44px tall even though the visible rail is
     thinner, so the control is as easy to hit as it is to see. */
  .switch {
    position: relative;
    flex-shrink: 0;
    width: 3.25rem;
    height: var(--min-touch-target);
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .switch::before {
    content: "";
    position: absolute;
    inset: 50% 0 auto 0;
    height: 1.75rem;
    transform: translateY(-50%);
    border-radius: 999px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    background: var(--theme-panel-bg, rgba(255, 255, 255, 0.06));
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .switch.on::before {
    background: color-mix(
      in srgb,
      var(--game-accent, #818cf8) 55%,
      transparent
    );
    border-color: var(--game-accent, #818cf8);
  }

  .thumb {
    position: absolute;
    top: 50%;
    left: 0.25rem;
    width: 1.25rem;
    height: 1.25rem;
    transform: translateY(-50%);
    border-radius: 50%;
    background: var(--theme-text, #fff);
    transition: left var(--duration-fast) ease;
  }

  .switch.on .thumb {
    left: 1.75rem;
  }

  .switch:focus-visible {
    outline: 2px solid var(--theme-accent, #818cf8);
    outline-offset: 3px;
    border-radius: 999px;
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb,
    .switch::before {
      transition: none;
    }
  }

  @media (min-width: 1680px) {
    .trace-settings {
      max-width: 56rem;
      padding: 1rem;
    }

    .label {
      font-size: var(--font-size-base);
    }

    .description {
      font-size: var(--font-size-sm);
    }
  }
</style>
