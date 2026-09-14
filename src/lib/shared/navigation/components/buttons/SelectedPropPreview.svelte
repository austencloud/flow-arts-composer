<script lang="ts">
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getBasePropType } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";

  let { size = 40 }: { size?: number } = $props();
  const settings = $derived(getSettings());
  const left = $derived(settings.leftPropType ?? PropType.STAFF);
  const right = $derived(
    settings.catDogMode ? (settings.rightPropType ?? left) : left
  );
</script>

<PropCompositionPreview
  propType={left}
  rightPropType={right}
  {size}
  pairedGlyph
  darkBackground
  useSavedOverrides={false}
  colors={settings.primaryPropColors}
  appearanceOverride={{
    fanAppearance: settings.fanAppearance,
    propLook: settings.propArtwork,
  }}
  leftFlipped={isBuugengFamilyProp(left) && settings.leftBuugengFlipped}
  rightFlipped={right === PropType.HAND ||
    (isBuugengFamilyProp(right) && settings.rightBuugengFlipped)}
  recipeOverride={settings.compositionRecipeOverrides?.[
    getBasePropType(left)
  ] ?? settings.compositionRecipeOverrides?.[left]}
/>
