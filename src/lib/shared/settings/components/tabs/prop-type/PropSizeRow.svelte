<!--
  PropSizeRow.svelte

  Size as two picture tiles, for a details page whose only setting is Size.
  Each tile draws the blue and red pair of that size in the performer's
  colours and style, the way the tiles one level up do, with the Standard one
  drawn smaller than the Big one in the true ratio of the two props
  (prop-size-art.ts). Both pairs sit on one centre, so the size difference is
  what the eye sees. Selection is the same whole-tile tint and ring the style
  rows use: this composes SegmentedControl as they do.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PropGridPreview from "./PropGridPreview.svelte";
  import {
    isBigVariant,
    toggleBigVariant,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import type { TriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
  import type { BuugengStyle } from "#lib/shared/pictograph/prop/domain/buugeng-appearance.js";
  import type { TriadBuild } from "#lib/shared/pictograph/prop/domain/triad-build.js";
  import type { CompositionRecipe } from "#lib/shared/pictograph/prop/domain/prop-composition-recipes.js";
  import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { sizeArtScales } from "./prop-size-art";

  let {
    propType,
    onChange,
    colors,
    fanAppearance,
    triangleGrip,
    buugengStyle,
    triadBuild,
    recipeOverrides,
  }: {
    /** The current prop, at either size. */
    propType: PropType;
    /** Called with true for Big, false for Standard. */
    onChange: (big: boolean) => void;
    colors?: ViewerCustomColorPair | null;
    fanAppearance: FanAppearance;
    triangleGrip?: TriangleGrip;
    buugengStyle?: BuugengStyle;
    triadBuild?: TriadBuild;
    recipeOverrides?: Partial<Record<PropType, CompositionRecipe>>;
  } = $props();

  const big = $derived(isBigVariant(propType));
  const standardProp = $derived(big ? toggleBigVariant(propType) : propType);
  const bigProp = $derived(big ? propType : toggleBigVariant(propType));
  const scales = $derived(sizeArtScales(standardProp));
  const options = $derived([
    {
      value: "standard",
      label: t("settings_prop_standard"),
      tone: "both" as const,
    },
    { value: "big", label: t("settings_prop_big"), tone: "both" as const },
  ]);
</script>

<div class="size-row" data-testid="prop-size-row">
  <span class="size-label">{t("settings_size")}</span>
  <SegmentedControl
    {options}
    value={big ? "big" : "standard"}
    onchange={(next: string) => {
      if ((next === "big") !== big) onChange(next === "big");
    }}
    color="accent"
    columns={2}
    ariaLabel={t("settings_prop_size")}
  >
    {#snippet optionContent(id)}
      {@const isBig = id === "big"}
      <span class="size-tile" data-testid={`prop-size-${id}`}>
        <span class="size-art" aria-hidden="true">
          <span
            class="size-pair"
            data-size-scale={isBig ? scales.big : scales.standard}
            style:width={`${(isBig ? scales.big : scales.standard) * 100}%`}
          >
            <PropGridPreview
              propType={isBig ? bigProp : standardProp}
              darkBackground
              {colors}
              {fanAppearance}
              {triangleGrip}
              {buugengStyle}
              {triadBuild}
              {recipeOverrides}
            />
          </span>
        </span>
        <span class="size-name">
          {isBig ? t("settings_prop_big") : t("settings_prop_standard")}
        </span>
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .size-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin: 0 12px 12px;
  }

  .size-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text);
  }

  .size-row :global(.segment-label) {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .size-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 2px 0;
  }

  /* One square; both pairs centre in it, so only their size differs. */
  .size-art {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: 150px;
    aspect-ratio: 1;
    pointer-events: none;
  }

  .size-pair {
    display: block;
    aspect-ratio: 1;
  }

  .size-pair :global(.prop-composition-preview) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .size-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1.2;
  }
</style>
