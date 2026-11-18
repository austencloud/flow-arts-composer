<script module lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  export type PropHandChoice = "both" | "left" | "right";

  /**
   * Per-hand picking for hosts whose props live in settings: one always-visible
   * Both / Left / Right choice above the grid. Both sets one prop for both
   * hands; Left or Right changes that hand only. Hosts open it on Both and do
   * not save it. Hosts with one local prop (Post Studio, profile photo,
   * landing) omit this and keep the single grid.
   */
  export interface HandPropToolbarProps {
    hand: PropHandChoice;
    leftPropType: PropType;
    rightPropType: PropType;
    onHandChange: (hand: PropHandChoice) => void;
  }
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PropGridPreview from "./PropGridPreview.svelte";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { normalizeFanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import { DEFAULT_TRIANGLE_GRIP } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
  import { DEFAULT_BUUGENG_STYLE } from "#lib/shared/pictograph/prop/domain/buugeng-appearance.js";
  import { DEFAULT_TRIAD_BUILD } from "#lib/shared/pictograph/prop/domain/triad-build.js";

  let {
    handProps,
    compact = false,
    line,
    disabled = false,
    ariaLabel,
  }: {
    handProps: HandPropToolbarProps;
    compact?: boolean;
    /**
     * One-line size for lists that carry the choice among other rows: 36px
     * tall, a 20px prop picture, a 6px gap and the word beside it. "tight" is
     * the 32px height for the smallest phone. The prop sheets leave it unset.
     */
    line?: "regular" | "tight";
    /** Not pressable, still in place: the segments dim as every disabled
     *  segment does (Effects off in the list). */
    disabled?: boolean;
    /** The group's name, when the host's question is not the prop sheet's. */
    ariaLabel?: string;
  } = $props();

  const settings = $derived(getSettings());

  const options = $derived([
    {
      value: "both" as const,
      label: t("viewer_ui_both"),
      tone: "both" as const,
      disabled,
    },
    {
      value: "left" as const,
      label: t("viewer_ui_left"),
      tone: "blue" as const,
      disabled,
    },
    {
      value: "right" as const,
      label: t("viewer_ui_right"),
      tone: "red" as const,
      disabled,
    },
  ]);

  const artSize = $derived(line ? 20 : 56);
</script>

<!-- One choice, always there: which hand the grid below sets. -->
<div
  class="hand-toolbar"
  class:compact
  class:line={!!line}
  class:tight={line === "tight"}
>
  <SegmentedControl
    {options}
    value={handProps.hand}
    onchange={handProps.onHandChange}
    ariaLabel={ariaLabel ?? t("prop_pair_which_hand")}
    semantics="radiogroup"
    columns={3}
  >
    {#snippet optionContent(choice)}
      <span class="hand-card" data-testid={`hand-choice-${choice}`}>
        <span class="hand-art" aria-hidden="true">
          {#if choice === "both"}
            <PropCompositionPreview
              propType={handProps.leftPropType}
              rightPropType={handProps.rightPropType}
              size={artSize}
              pairedGlyph
              darkBackground
              colors={settings.primaryPropColors}
              useSavedOverrides={false}
            />
          {:else}
            <PropGridPreview
              size={artSize}
              propType={choice === "left"
                ? handProps.leftPropType
                : handProps.rightPropType}
              darkBackground
              colors={settings.primaryPropColors}
              singleHand={choice}
              fanAppearance={normalizeFanAppearance(settings.fanAppearance)}
              triangleGrip={settings.triangleGrip ?? DEFAULT_TRIANGLE_GRIP}
              buugengStyle={settings.buugengStyle ?? DEFAULT_BUUGENG_STYLE}
              triadBuild={settings.triadBuild ?? DEFAULT_TRIAD_BUILD}
              recipeOverrides={settings.compositionRecipeOverrides}
            />
          {/if}
        </span>
        <span class="hand-word">
          {choice === "both"
            ? t("viewer_ui_both")
            : choice === "left"
              ? t("viewer_ui_left")
              : t("viewer_ui_right")}
        </span>
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .hand-toolbar {
    padding: 8px 16px 4px;
    flex-shrink: 0;
    min-width: 0;
  }
  .hand-toolbar.compact {
    padding: 0;
  }

  .hand-toolbar :global(.segment-label) {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .hand-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    padding: 2px 0;
  }

  /* One square for every option, so the row keeps one height. */
  .hand-art {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 72px;
    aspect-ratio: 1;
    pointer-events: none;
  }

  .hand-art :global(.prop-composition-preview) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .hand-word {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
  }

  .hand-toolbar.compact .hand-art {
    max-width: 52px;
  }

  /* One-line size: the whole row is 36px (32px tight), picture and word side
     by side. The segment track is the row, so its own padding and border sit
     inside that height. If a word needs the room, the picture gives way
     before the word is cut. */
  .hand-toolbar.line {
    --hand-line-height: 36px;
    padding: 0;
    height: var(--hand-line-height);
  }
  .hand-toolbar.line.tight {
    --hand-line-height: 32px;
  }
  .hand-toolbar.line :global(.ui-segments) {
    height: var(--hand-line-height);
    align-items: stretch;
  }
  .hand-toolbar.line :global(.ui-segments button) {
    min-width: 0;
    min-height: 0;
    padding: 0 4px;
    /* The lit segment and the dimmed (Effects off) state change on the same
       fast transition the effect tiles use. */
    --ui-motion-duration: var(--duration-fast, 150ms);
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }
  @media (prefers-reduced-motion: reduce) {
    .hand-toolbar.line :global(.ui-segments button) {
      transition: none;
    }
  }
  .hand-toolbar.line .hand-card {
    flex-direction: row;
    justify-content: center;
    gap: 6px;
    padding: 0;
    min-width: 0;
  }
  .hand-toolbar.line .hand-art {
    flex: 0 1 20px;
    width: 20px;
    min-width: 0;
    max-width: 20px;
    overflow: hidden;
  }
  .hand-toolbar.line .hand-word {
    flex: 0 0 auto;
    max-width: none;
    overflow: visible;
    text-overflow: clip;
  }
</style>
