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
  }: { handProps: HandPropToolbarProps; compact?: boolean } = $props();

  const settings = $derived(getSettings());

  const options = $derived([
    { value: "both" as const, label: t("viewer_ui_both"), tone: "both" as const },
    { value: "left" as const, label: t("viewer_ui_left"), tone: "blue" as const },
    { value: "right" as const, label: t("viewer_ui_right"), tone: "red" as const },
  ]);
</script>

<!-- One choice, always there: which hand the grid below sets. -->
<div class="hand-toolbar" class:compact>
  <SegmentedControl
    {options}
    value={handProps.hand}
    onchange={handProps.onHandChange}
    ariaLabel={t("prop_pair_which_hand")}
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
              size={56}
              pairedGlyph
              darkBackground
              colors={settings.primaryPropColors}
              useSavedOverrides={false}
            />
          {:else}
            <PropGridPreview
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
</style>
