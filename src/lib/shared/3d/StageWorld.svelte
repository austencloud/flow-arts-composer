<script lang="ts">
  /**
   * StageWorld
   *
   * Unified entry point for the performance stage within an explorable forest world.
   * Unified entry point for the Stage + Infinite Worlds experience.
   *
   * Users can perform sequences on the stage grid at the center, then walk away
   * into the procedural forest terrain. The forest is the default (and only)
   * environment for now.
   *
   * Usage:
   * <StageWorld />
   * or with custom props:
   * <StageWorld showDebug={true} />
   */

  import WorldScene from "#lib/shared/3d/procedural-engine/components/WorldScene.svelte";
  import { PERFORMANCE_STAGE_CONFIG } from "#lib/shared/3d/procedural-engine/core/world-definitions.js";

  interface Props {
    /** Show debug info overlay */
    showDebug?: boolean;
  }

  let { showDebug = false }: Props = $props();
</script>

<WorldScene
  realmConfig={PERFORMANCE_STAGE_CONFIG}
  stageMode={true}
  {showDebug}
/>
