<script lang="ts">
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getBasePropType } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { isBuugengFamilyProp } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
  import { captureActivePropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";

  let {
    size = 40,
    box,
    propType,
  }: {
    /** Square drawing size. Ignored when `box` is set. */
    size?: number;
    /** The width x height of the picture area. The pair crops to what it
     *  paints and fits this box, centred, never larger. */
    box?: { width: number; height: number };
    /** Show this prop in both hands instead of the chosen pair (a surface that
     *  stands for one picked prop rather than the app-wide choice). */
    propType?: PropType;
  } = $props();
  const settings = $derived(getSettings());
  const pair = $derived(captureActivePropConfig(settings));
  const left = $derived(propType ?? pair.leftPropType);
  const right = $derived(propType ?? pair.rightPropType);
</script>

<PropCompositionPreview
  propType={left}
  rightPropType={right}
  {size}
  {box}
  pairedGlyph
  darkBackground
  useSavedOverrides={false}
  colors={settings.primaryPropColors}
  appearanceOverride={{
    fanAppearance: settings.fanAppearance,
    triangleGrip: settings.triangleGrip,
    buugengStyle: settings.buugengStyle,
    triadBuild: settings.triadBuild,
  }}
  leftFlipped={isBuugengFamilyProp(left) && settings.leftBuugengFlipped}
  rightFlipped={right === PropType.HAND ||
    (isBuugengFamilyProp(right) && settings.rightBuugengFlipped)}
  recipeOverride={settings.compositionRecipeOverrides?.[
    getBasePropType(left)
  ] ?? settings.compositionRecipeOverrides?.[left]}
/>
