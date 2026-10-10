<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { downloadBlobToDisk } from "#lib/shared/foundation/services/file-downloader.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { renderTrajectoryMandalaSVG } from "../../../../../shared/mandala/services/trajectory-mandala-renderer";
  import { getThirdOrderContext } from "../context/third-order-context";
  import { THIRD_ORDER_VIEWBOX_SIZE } from "../domain/third-order-math";
  import type { ThirdOrderMandalaMode } from "../state/third-order-state.svelte";

  const thirdOrder = getThirdOrderContext();
  const options: Array<{
    value: ThirdOrderMandalaMode;
    label: string;
    shortLabel: string;
  }> = [
    { value: "off", label: "Mandala off", shortLabel: "Off" },
    { value: "trace", label: "Trace prop tips", shortLabel: "Trace" },
    { value: "full", label: "Full pattern", shortLabel: "Full" },
  ];
  async function saveSVG() {
    const svg = renderTrajectoryMandalaSVG(
      thirdOrder.trajectories,
      THIRD_ORDER_VIEWBOX_SIZE
    );
    const result = await downloadBlobToDisk(
      new Blob([svg], { type: "image/svg+xml" }),
      "third-order-mandala.svg"
    );
    if (!result.success) {
      getErrorHandler().showUserError({
        message: "Couldn't save this Mandala. Try again.",
        technicalDetails: result.error?.message ?? "SVG download failed",
        error: result.error,
        severity: "error",
        context: {
          module: "toys",
          tab: "third-order",
          action: "saveMandalaSVG",
        },
      });
    }
  }
</script>

<div class="mandala-tools" role="group" aria-label="Mandala drawing">
  <div class="drawing-mode">
    <SegmentedControl
      {options}
      value={thirdOrder.mandalaMode}
      onchange={thirdOrder.setMandalaMode}
      semantics="radiogroup"
      ariaLabel="Mandala mode"
      density="tight"
    />
  </div>
  <FilterChipBase
    label="Motion"
    ariaLabel="Show grids and props"
    icon="fa-person"
    mode="toggle"
    labelScale="readable"
    active={thirdOrder.showMotion}
    onclick={() => thirdOrder.setShowMotion(!thirdOrder.showMotion)}
  />
  <PanelButton
    onclick={saveSVG}
    disabled={thirdOrder.trajectories.layers.length === 0}
    ariaLabel="Save full Mandala as SVG"
    ><i class="fas fa-download" aria-hidden="true"></i> SVG</PanelButton
  >
</div>

<style>
  .mandala-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    position: relative;
  }
  .drawing-mode {
    width: 280px;
    max-width: 100%;
  }
  @container (max-width: 620px) {
    .mandala-tools {
      gap: 6px;
    }
    .drawing-mode {
      width: 100%;
    }
  }
</style>
