<!--
  PropChiralityRow.svelte

  Chirality picker for buugeng-family props, docked at the bottom of
  BentoPropGrid so every surface that mounts the picker inherits it.

  Chirality used to live on an unlabelled 36px icon button in two places only
  (the Create step-editor row and the Settings readout) while the picker itself
  — mounted in eleven surfaces — had no way to express it at all. Moving the
  control into the picker is what makes it reachable from the Animation Panel,
  the Arena drawer, My Props and Tunnel art settings without adding a twelfth
  copy of the button.

  Buugeng chirality is a statement about the PAIR: two of the same handedness
  stay apart, two of opposite handedness nest into one shape. So a host that
  sets both hands gets one control per hand rather than a single control
  writing both — the relationship is the whole point, and a shared control
  cannot express it. Prop type still travels together in those hosts.

  Exactly one of two states is always active per hand, so this routes to
  SegmentedControl per .claude/rules/chip-primitives.md. Each segment renders
  the selected prop's own art in its hand's canonical colour, one upright and one mirrored,
  — through the primitive's existing optionContent slot. The hand cards keep
  visible Left/Right labels as well as their aria-labels because this choice is a
  primary part of selecting a buugeng, not an expert-only adjustment.

  The two are named A and B, matching what pictograph-inspect already prints
  (sequence-actions/pictograph-inspect/formatters.ts). Neither handedness is
  the canonical one — which SVG happens to be the base asset is the only thing
  that would make one "standard" — so a neutral index tells the truth where
  Standard/Mirrored implied a deviation from a norm that does not exist.
-->
<script lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type {
    ChiralityHand,
    PropChiralityHandState,
  } from "./prop-chirality-seam";

  type Chirality = "a" | "b";

  let {
    propType,
    hands,
    onChange,
    colors,
    propLook,
  }: {
    /** The prop whose art the segments preview. */
    propType: PropType;
    /** One entry per hand this picker governs, left first. */
    hands: readonly PropChiralityHandState[];
    onChange: (hand: ChiralityHand, flipped: boolean) => void;
    colors?: ViewerCustomColorPair | null;
    propLook?: PropLook;
  } = $props();

  const palette = $derived(resolveViewerCustomColorPair(colors));

  const options = [
    { value: "a" as const, label: "A" },
    { value: "b" as const, label: "B" },
  ];

  function valueFor(flipped: boolean): Chirality {
    return flipped ? "b" : "a";
  }
</script>

<div class="chirality-row">
  <div class="chirality-heading">
    <span class="chirality-label">Buugeng chirality</span>
    <span class="chirality-hint">Choose A or B for each prop</span>
  </div>
  <div class="chirality-controls">
    {#each hands as state (state.hand)}
      <div
        class="chirality-hand"
        class:red={state.hand === "right"}
        style:--dm-motion-blue={palette.left}
        style:--dm-motion-red={palette.right}
      >
        <span class="chirality-hand-label">
          <span class="chirality-hand-dot" aria-hidden="true"></span>
          {state.hand === "right" ? "Right prop" : "Left prop"}
        </span>
        <SegmentedControl
          {options}
          value={valueFor(state.flipped)}
          onchange={(next) => onChange(state.hand, next === "b")}
          color={palette[state.hand]}
          semantics="radiogroup"
          ariaLabel="{state.hand === 'right'
            ? 'Right'
            : 'Left'} buugeng chirality"
        >
          {#snippet optionContent(option)}
            <PropCompositionPreview
              {propType}
              size={40}
              pairedGlyph
              singleHand={state.hand}
              darkBackground
              useSavedOverrides={false}
              colors={palette}
              appearanceOverride={{ propLook }}
              leftFlipped={option === "b"}
              rightFlipped={option === "b"}
            />
            <span class="chirality-word">{option === "b" ? "B" : "A"}</span>
          {/snippet}
        </SegmentedControl>
      </div>
    {/each}
  </div>
</div>

<style>
  .chirality-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    margin: 0 12px 12px;
    padding: 12px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 16px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 8%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.75))
    );
  }

  .chirality-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .chirality-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text);
    white-space: nowrap;
  }

  .chirality-hint {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
    text-align: right;
  }

  .chirality-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    /* Wide enough that two controls read as two groups. At 10px the four
       segments ran together as one A/B/A/B bar. */
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  /* Each hand's control is a two-option selector, not a progress bar. Without
     a ceiling it stretches to whatever the host panel is wide — the exact
     failure .claude/rules/visual-verification-mandatory.md opens with. The
     ceiling is sized for a glyph and a letter: once the words became A and B
     the shape is what the segment is really showing, so the control hugs it
     instead of stranding 250px of empty track. The 11rem basis is what still
     wraps the pair one per line on the narrowest sheet. */
  .chirality-hand {
    flex: 0 1 11rem;
    min-width: 0;
    max-width: 13rem;
    padding: 8px;
    border-radius: 14px;
    /* The wash and ring repeat the visible hand label in the control's chrome,
       so the identity stays clear while attention moves between A and B. */
    background: color-mix(
      in srgb,
      var(--dm-motion-blue, #3d44b8) 12%,
      transparent
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--dm-motion-blue, #3d44b8) 38%, transparent);
  }

  .chirality-hand.red {
    background: color-mix(
      in srgb,
      var(--dm-motion-red, #dc2626) 12%,
      transparent
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--dm-motion-red, #dc2626) 38%, transparent);
  }

  .chirality-hand-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 20px;
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .chirality-hand-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dm-motion-blue, #3d44b8);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--dm-motion-blue, #3d44b8) 70%, transparent);
  }

  .chirality-hand.red .chirality-hand-dot {
    background: var(--dm-motion-red, #dc2626);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--dm-motion-red, #dc2626) 70%, transparent);
  }

  .chirality-row :global(.segment-label) {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .chirality-word {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The summary becomes one readable block before either phrase is forced
     below the 12px typography floor. */
  @container prop-grid (max-width: 340px) {
    .chirality-heading {
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .chirality-hint {
      text-align: center;
    }
  }
</style>
