<script lang="ts">
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { TipEffectMap } from "../domain/types/tip-effect-types";
  import { DEFAULT_FIRE_CONFIG } from "../domain/types/fire-types";
  import CanvasSurface from "./CanvasSurface.svelte";

  const leftProp: PropState = {
    centerPathAngle: Math.PI,
    staffRotationAngle: 0,
  };
  const rightProp: PropState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
  };
  const tipEffectMap: TipEffectMap = { "*": { effect: "fire" } };
  const fireConfig = { ...DEFAULT_FIRE_CONFIG, disableFrameCache: true };

  let propType = $state("staff");
  let initialized = $state(false);
</script>

<button type="button" onclick={() => (propType = "hand")}>Hands</button>
<button type="button" onclick={() => (propType = "staff")}>Staffs</button>
<output data-testid="prop-type">{propType}</output>
<output data-testid="initialized">{initialized ? "ready" : "loading"}</output>

<div class="stage">
  <CanvasSurface
    {leftProp}
    {rightProp}
    leftPropType={propType}
    rightPropType={propType}
    {fireConfig}
    {tipEffectMap}
    gridVisible={false}
    contextId="mounted-fire-switch-review"
    initialQualityTier="low"
    onInitialized={() => (initialized = true)}
  />
</div>

<style>
  .stage {
    width: 320px;
    height: 320px;
  }
</style>
