<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let { pictographData }: { pictographData: PictographData } = $props();
</script>

<div
  data-testid="placement-pictograph"
  data-left-location={pictographData.motions.left?.endLocation}
  data-right-location={pictographData.motions.right?.endLocation}
  data-beta-swapped={pictographData.betaSwapped === true}
  data-letter={pictographData.letter}
  data-step-number={"stepNumber" in pictographData
    ? pictographData.stepNumber
    : undefined}
  data-grid-mode={pictographData.gridMode}
  data-join={pictographData.conjoined
    ? `${pictographData.conjoined.toward}${pictographData.conjoined.steps}`
    : undefined}
></div>
