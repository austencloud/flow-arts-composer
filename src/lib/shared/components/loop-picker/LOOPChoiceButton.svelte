<!--
  LOOPChoiceButton — the canonical "pick a LOOP transformation" button.

  One object appears in two places: the Extend drawer's Apply LOOP shelf, where
  clicking a choice acts immediately, and Fuse's pairing editor, where a choice
  stays selected until applied. They were drifting into two different-looking
  controls for the same idea, so the presentation lives here and both callers
  render it.

  The glyph is LOOPIconStrip — the same badge the LOOP wears on a sequence card
  and in an export header — and the colours come from the option's own
  primitives via `loopOptionTint`, so Inverted is orange, Rotated is blue, and a
  composite sweeps one into the other.

  Callers own the GRID (choice counts and breakpoints differ per surface) and
  set `--choice-basis`; this button owns everything inside its own box. Its
  responsive tiers key off a `loop-picker` container, so a caller wanting them
  names its grid container `loop-picker`.
-->
<script lang="ts">
  import type { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import type { LoopReflectionAxis } from "@tka/render-composition";
  import LOOPIconStrip from "#lib/shared/components/LOOPIconStrip.svelte";

  interface Props {
    /** Primitives this choice composes. Empty renders `fallbackIcon`. */
    components: Set<LOOPComponent>;
    /** Separates Mirror from Flip — both are `#6F2DA8`. */
    reflectionAxis?: LoopReflectionAxis;
    /** Separates Rotate 90 from Rotate 180 — both are ROTATED. */
    rotationPeriod?: Period;
    /** `--loop-c1 / --loop-c2 / --loop-c2-mix`, from `loopOptionTint`. */
    tint?: string;
    name: string;
    description?: string;
    /**
     * Omit for immediate-action pickers (Extend): the button carries no
     * selected state and stays a plain button. Pass a boolean for pickers with
     * a persistent choice (Fuse) and it becomes a radio.
     */
    selected?: boolean;
    disabled?: boolean;
    onclick: () => void;
    /** Drawn when `components` is empty (the orientation-repeat choice). */
    fallbackIcon?: string;
    glyphSize?: number;
    title?: string;
    /**
     * Glyph beside the name on one short row, description dropped. For shelves
     * with many choices in a narrow panel, where nine tall tiles would be
     * taller than the panel holding them.
     */
    dense?: boolean;
  }

  let {
    components,
    reflectionAxis,
    rotationPeriod,
    tint,
    name,
    description,
    selected,
    disabled = false,
    onclick,
    fallbackIcon,
    glyphSize = 38,
    title,
    dense = false,
  }: Props = $props();

  const selectable = $derived(selected !== undefined);
</script>

<button
  type="button"
  class="loop-button"
  class:selectable
  class:selected
  class:dense
  style={tint}
  role={selectable ? "radio" : undefined}
  aria-checked={selectable ? selected : undefined}
  {disabled}
  {title}
  {onclick}
>
  <span class="loop-glyph" aria-hidden={components.size > 0 ? undefined : "true"}>
    {#if components.size > 0}
      <LOOPIconStrip
        activeComponents={components}
        {reflectionAxis}
        {rotationPeriod}
        size={glyphSize}
        showFreeformWhenEmpty={false}
      />
    {:else if fallbackIcon}
      <i class="fas {fallbackIcon}"></i>
    {/if}
  </span>
  <span class="loop-text">
    <span class="loop-name">{name}</span>
    {#if description}
      <span class="loop-desc">{description}</span>
    {/if}
  </span>
</button>

<style>
  /*
   * --loop-c1 / --loop-c2 come from the option's own primitives (see
   * loop-option-color.ts), so Swapped is green, Inverted is orange, and
   * "Swapped / Inverted" sweeps green into orange — matching the badge the
   * same LOOP carries on a sequence card. The theme accent is the fallback
   * for any option whose type names no known primitive.
   */
  .loop-button {
    --c1: var(--loop-c1, var(--theme-accent, #6366f1));
    --c2: var(--loop-c2, var(--theme-accent, #6366f1));
    --c2-mix: var(--loop-c2-mix, 9%);

    display: flex;
    flex: 0 1 var(--choice-basis, 100%);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: 8.75rem;
    padding: 1rem 0.875rem;
    text-align: center;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--c1) 22%, transparent) 0%,
      color-mix(in srgb, var(--c2) var(--c2-mix), transparent) 100%
    );
    border: 2px solid color-mix(in srgb, var(--c1) 45%, transparent);
    border-radius: var(--settings-radius-md, 12px);
    cursor: pointer;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-md, 16px);
    font-weight: 600;
    transition: all var(--duration-normal) ease;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .loop-button:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--c1) 34%, transparent) 0%,
      color-mix(in srgb, var(--c2) calc(var(--c2-mix) + 10%), transparent) 100%
    );
    border-color: var(--c1);
    transform: translateY(-2px);
    box-shadow: 0 4px 20px color-mix(in srgb, var(--c1) 32%, transparent);
  }

  .loop-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .loop-button:focus-visible {
    outline: 2px solid var(--c1);
    outline-offset: 2px;
  }

  .loop-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* In a picker that HOLDS a choice, colour has to mean selected — and it can't
     if every choice is already wearing it. Mirror and Flip are the same violet
     by brand (the axis in the glyph is what separates them, not the hue), so a
     row where the unselected two are painted 22% violet and the selected one
     38% violet asks the eye to read a difference of degree in one colour. It
     loses. An unselected choice therefore paints the neutral card surface every
     other inactive control on the panel uses, and the selected one is the only
     coloured tile in the row.
     Immediate-action pickers (the Extend shelf) have no selected state to
     signal, so they keep their primitive colours and skip this entirely. */
  .loop-button.selectable:not(.selected) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  /* Dimmed, not colourless: the glyph still says which primitive this is, and
     hover restores the full hue as a preview of what picking it does. */
  .loop-button.selectable:not(.selected) .loop-glyph {
    color: color-mix(in srgb, var(--c1) 55%, var(--theme-text-dim, #9aa0ae));
  }

  .loop-button.selectable:not(.selected):hover:not(:disabled) .loop-glyph {
    color: var(--c1);
  }

  /* Selection is a property of the whole button, so the whole button carries
     it: the accent border at full strength plus a ring. Never a bar down one
     edge — see no-left-edge-accent-bar.md. */
  .loop-button.selected {
    border-color: var(--c1);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--c1) 38%, transparent) 0%,
      color-mix(in srgb, var(--c2) calc(var(--c2-mix) + 14%), transparent) 100%
    );
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--c2) 62%, transparent),
      0 6px 22px -12px var(--c1);
  }

  .loop-glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.375rem;
    font-size: 2rem;
    color: var(--c1);
  }

  .loop-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .loop-name {
    font-size: 1rem;
    line-height: 1.2;
  }

  .loop-desc {
    max-width: 24ch;
    font-size: 0.8125rem;
    font-weight: 400;
    line-height: 1.35;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
  }

  /* A true 4K canvas has no operating-system scale helping it. */
  @container loop-picker (min-width: 90rem) {
    .loop-name {
      font-size: 1.25rem;
    }

    .loop-desc {
      max-width: 28ch;
      font-size: 1rem;
    }

    .loop-button {
      min-height: 10rem;
      padding: 1.25rem 1rem;
    }

    .loop-glyph {
      min-height: 3rem;
      transform: scale(1.25);
    }
  }

  /* Phone-width shelves read faster as compact horizontal rows. */
  @container loop-picker (max-width: 31.999rem) {
    .loop-button {
      flex-direction: row;
      justify-content: flex-start;
      min-height: 5.25rem;
      padding: 0.75rem 1rem;
      text-align: left;
    }

    .loop-glyph {
      flex: 0 0 3rem;
    }

    .loop-text {
      align-items: flex-start;
    }

    .loop-desc {
      max-width: none;
    }
  }

  /* Sequence Actions keeps the pictographs visible above the drawer, so inside
     that compact context the choices give up padding, not touch target. */
  @container sequence-action-subview (max-width: 599px) and (max-height: 430px) {
    .loop-button {
      min-height: 4.75rem;
      padding: 0.75rem;
      gap: 0.25rem;
    }
  }

  /*
   * Descriptions are the first thing to go on a short viewport (a folded phone
   * in landscape). A container query cannot ask this — the picker is
   * `container-type: inline-size`, which answers inline-axis questions only,
   * and switching it to `size` would make its height stop depending on its
   * own content.
   */
  @media (max-height: 34rem) {
    .loop-desc {
      display: none;
    }

    .loop-button {
      min-height: 4.75rem;
      padding: 0.625rem 0.75rem;
      gap: 0.25rem;
    }
  }

  /*
   * Dense is a caller decision, not a width one, so it outranks every tier
   * above by carrying two classes. A nine-choice shelf in a 480px drawer has
   * no room for nine descriptions; the glyph and the name carry the choice and
   * the box drops to a comfortable touch row.
   */
  .loop-button.dense {
    flex-direction: row;
    justify-content: flex-start;
    gap: 0.75rem;
    min-height: 3.75rem;
    padding: 0.625rem 0.75rem;
    text-align: left;
  }

  /* One slot wide enough for a two-primitive composite, so single-primitive
     names still start on the same x as their neighbours'. */
  .dense .loop-glyph {
    flex: 0 0 3.25rem;
    min-height: 0;
  }

  .dense .loop-text {
    align-items: flex-start;
    gap: 0;
  }

  .dense .loop-name {
    font-size: var(--font-size-min, 14px);
  }

  .dense .loop-desc {
    display: none;
  }

  /* A tall panel has the room back, so it spends it on the description rather
     than on empty space below the last choice. Still a row — the panel is only
     as wide as it was. */
  @media (min-height: 1400px) {
    .loop-button.dense {
      min-height: 4.75rem;
    }

    .dense .loop-text {
      gap: 0.125rem;
    }

    .dense .loop-desc {
      display: block;
      max-width: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loop-button {
      transition: none;
    }

    .loop-button:hover:not(:disabled),
    .loop-button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
