<script lang="ts">
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { getBasePropType } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { CompositionRecipe } from "$lib/shared/pictograph/prop/domain/prop-composition-recipes";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import type { TriangleGrip } from "$lib/shared/pictograph/prop/domain/triangle-appearance";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

  let {
    propType,
    size = 64,
    recipeOverride,
    darkBackground = false,
    neutral = false,
    fanAppearance,
    propLook,
    triangleGrip,
    recipeOverrides = {},
    colors,
    singleHand,
    leftFlipped = false,
    rightFlipped = false,
  }: {
    propType: PropType;
    size?: number;
    recipeOverride?: CompositionRecipe;
    darkBackground?: boolean;
    neutral?: boolean;
    fanAppearance: FanAppearance;
    propLook?: PropLook;
    triangleGrip?: TriangleGrip;
    recipeOverrides?: Partial<Record<PropType, CompositionRecipe>>;
    colors?: ViewerCustomColorPair | null;
    singleHand?: "left" | "right";
    leftFlipped?: boolean;
    rightFlipped?: boolean;
  } = $props();
</script>

<!-- The picker and navigation share their artwork, colors, crops and poses.
     Keep this adapter independent of account state for embedded instruments. -->
<PropCompositionPreview
  {propType}
  {size}
  {darkBackground}
  {neutral}
  {colors}
  pairedGlyph={!neutral}
  {singleHand}
  {leftFlipped}
  {rightFlipped}
  useSavedOverrides={false}
  appearanceOverride={{ fanAppearance, propLook, triangleGrip }}
  recipeOverride={recipeOverride ??
    recipeOverrides[getBasePropType(propType)] ??
    recipeOverrides[propType]}
/>
