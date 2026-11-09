<!--
  MandalaColorPane.svelte — the owner's color screen for one saved mandala.

  The art stays on screen beside this pane and follows every pick. Nothing here
  writes: the module saves once, on the way out, because each saved look becomes
  a permanent revision and dragging across the picker would otherwise leave
  hundreds of them behind.
-->
<script lang="ts">
  import type { HandColorPair } from "@tka/render-composition";
  import type { HandSide } from "@tka/tka-types";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { savedMandalaPalette } from "#lib/shared/mandala/domain/mandala-palette.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import LabeledColorPairPicker from "#lib/shared/ui/components/LabeledColorPairPicker.svelte";

  let {
    colors,
    isPublic,
    onchange,
    onback,
  }: {
    /** Null while the mandala is in the one fixed look. */
    colors: HandColorPair | null;
    isPublic: boolean;
    onchange: (colors: HandColorPair | null) => void;
    onback: () => void;
  } = $props();

  // An open color editor takes the room the reset and the note were using.
  let editing = $state<HandSide | null>(null);

  const fixed = savedMandalaPalette(null);
  const shown = $derived<HandColorPair>(
    colors ?? { left: fixed.leftStroke, right: fixed.rightStroke }
  );

  // Picking one hand leaves the other on its fixed color, which is still the
  // default rather than a custom choice.
  const defaultName = $derived(t("viewer_ui_prop_colors_default"));
  const valueNames = $derived({
    left: shown.left === fixed.leftStroke ? defaultName : undefined,
    right: shown.right === fixed.rightStroke ? defaultName : undefined,
  });
</script>

<section class="color-pane" aria-labelledby="mandala-color-title">
  <header class="pane-head">
    <button
      type="button"
      class="pane-back"
      onclick={onback}
      aria-label="Save colors and go back"
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    <h3 id="mandala-color-title">Colors</h3>
  </header>

  <LabeledColorPairPicker
    left={shown.left}
    right={shown.right}
    leftLabel={t("viewer_ui_left")}
    rightLabel={t("viewer_ui_right")}
    groupLabel={t("viewer_ui_pathway_colors")}
    valueLabel="name"
    showPairPreview={false}
    compact
    bind:editing
    {valueNames}
    onchange={(hand, value) => onchange({ ...shown, [hand]: value })}
    onswap={() => onchange({ left: shown.right, right: shown.left })}
  />

  {#if !editing}
    <div class="pane-foot" transition:growFade>
      <button
        type="button"
        class="pane-reset"
        disabled={!colors}
        onclick={() => onchange(null)}
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
        <span>Use default colors</span>
      </button>

      <p class="pane-hint">
        {#if isPublic}
          Saves when you go back. The public copy keeps its current colors until you
          publish the update.
        {:else}
          Saves when you go back.
        {/if}
      </p>
    </div>
  {/if}
</section>

<style>
  .color-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pane-foot {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pane-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .pane-head h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .pane-back {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, var(--ease-standard)),
      border-color var(--duration-fast) var(--ease-out, var(--ease-standard));
  }

  .pane-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 40px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    color: var(--theme-text, white);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out, var(--ease-standard)),
      border-color var(--duration-fast) var(--ease-out, var(--ease-standard)),
      opacity var(--duration-fast) var(--ease-out, var(--ease-standard));
  }
  .pane-reset:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (hover: hover) {
    .pane-back:hover,
    .pane-reset:hover:not(:disabled) {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    }
  }

  .pane-back:focus-visible,
  .pane-reset:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  .pane-hint {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
  }

  /* A phone on its side: every row counts. */
  @media (orientation: landscape) and (max-height: 520px) {
    .color-pane {
      gap: 8px;
    }
    .pane-back {
      min-width: 0;
      min-height: 0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pane-back,
    .pane-reset {
      transition: none;
    }
  }
</style>
