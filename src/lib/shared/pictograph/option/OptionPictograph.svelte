<!--
  OptionPictograph - Visibility-aware wrapper around PictographRenderer.
  Subscribes to VisibilityStateManager so option picker pictographs
  reflect all user visibility preferences (motions, grid, glyphs, etc.).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { PreparedPictographData } from "../shared/domain/models/prepared-pictograph-data";
  import { isVisibleMotion } from "../shared/domain/models/motion-data";
  import PictographRenderer from "../shared/components/PictographRenderer.svelte";
  import { getVisibilityStateManager } from "../shared/state/visibility-state.svelte";
  import { getAnimationVisibilityManager } from "../../animation-engine/state/animation-visibility-state.svelte";
  import type { GridLocation } from "../grid/domain/enums/grid-enums";

  let {
    pictograph,
    leftReversal = false,
    rightReversal = false,
  } = $props<{
    pictograph: PreparedPictographData;
    leftReversal?: boolean;
    rightReversal?: boolean;
  }>();

  const vm = getVisibilityStateManager();
  const animationVisibilityManager = getAnimationVisibilityManager();

  let showGrid = $state(vm.getGridVisibility());
  let showTKA = $state(vm.getGlyphVisibility("tkaGlyph"));
  let showReversals = $state(vm.getGlyphVisibility("reversalIndicators"));
  let showNonRadialPoints = $state(vm.getNonRadialVisibility());
  let showTnD = $state(vm.getGlyphVisibility("tndGlyph"));
  let showElemental = $state(vm.getGlyphVisibility("elementalGlyph"));
  let showPlacements = $state(vm.getGlyphVisibility("placementsGlyph"));
  let handPointVisibility = $state<"all" | "active" | "none">(vm.getHandPointVisibility());
  let darkMode = $state(animationVisibilityManager.isDarkMode());

  function syncAll() {
    showGrid = vm.getGridVisibility();
    showTKA = vm.getGlyphVisibility("tkaGlyph");
    showReversals = vm.getGlyphVisibility("reversalIndicators");
    showNonRadialPoints = vm.getNonRadialVisibility();
    showTnD = vm.getGlyphVisibility("tndGlyph");
    showElemental = vm.getGlyphVisibility("elementalGlyph");
    showPlacements = vm.getGlyphVisibility("placementsGlyph");
    handPointVisibility = vm.getHandPointVisibility();
  }

  function syncDarkMode() {
    darkMode = animationVisibilityManager.isDarkMode();
  }

  onMount(() => {
    vm.registerObserver(syncAll, ["all"]);
    animationVisibilityManager.registerObserver(syncDarkMode);
    return () => {
      vm.unregisterObserver(syncAll);
      animationVisibilityManager.unregisterObserver(syncDarkMode);
    };
  });

  // Compute active locations from motion end positions (where props are)
  const activeLocations = $derived.by(() => {
    const locations: GridLocation[] = [];
    const left = pictograph.motions?.left;
    const right = pictograph.motions?.right;
    if (isVisibleMotion(left) && left.endLocation) locations.push(left.endLocation as GridLocation);
    if (isVisibleMotion(right) && right.endLocation) locations.push(right.endLocation as GridLocation);
    return locations;
  });
</script>

<PictographRenderer
  {pictograph}
  {leftReversal}
  {rightReversal}
  leftMotionVisible={true}
  rightMotionVisible={true}
  {showGrid}
  {showTKA}
  {showReversals}
  {showNonRadialPoints}
  {showTnD}
  {showElemental}
  {showPlacements}
  {handPointVisibility}
  {activeLocations}
  {darkMode}
/>
