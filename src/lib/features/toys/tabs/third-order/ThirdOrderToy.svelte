<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import PanelGroup from "#lib/shared/panels/PanelGroup.svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import { FALLBACK_DEMO } from "#lib/shared/landing/data/per-visit-demo.js";
  import ThirdOrderSourceRail from "./components/ThirdOrderSourceRail.svelte";
  import ThirdOrderPathControls from "./components/ThirdOrderPathControls.svelte";
  import ThirdOrderStage from "./components/ThirdOrderStage.svelte";
  import ThirdOrderInspector from "./components/ThirdOrderInspector.svelte";
  import ThirdOrderTransport from "./components/ThirdOrderTransport.svelte";
  import { setThirdOrderContext } from "./context/third-order-context";
  import { createThirdOrderState } from "./state/third-order-state.svelte";
  import { getThirdOrderCompositionSampler } from "./services/getThirdOrderCompositionSampler";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";

  let host = $state<HTMLDivElement | null>(null);
  let compact = $state(false);
  let panelSizes = $state([2.4, 0.92]);
  const thirdOrder = setThirdOrderContext(
    createThirdOrderState(getThirdOrderCompositionSampler(), FALLBACK_DEMO)
  );

  $effect(() => {
    thirdOrder.setPropTypes(
      settingsService.settings.leftPropType ?? "staff",
      settingsService.settings.rightPropType ?? "staff"
    );
  });

  onMount(() => {
    if (!host) return;
    const update = () => {
      if (!host) return;
      compact = host.clientWidth < 980 || host.clientHeight < 590;
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    update();
    return () => observer.disconnect();
  });

  onDestroy(() => thirdOrder.destroy());
</script>

{#snippet stage()}
  <ThirdOrderStage {compact} />
{/snippet}

{#snippet setup()}
  <aside class="setup-panel" aria-label="Third Order setup">
    <ThirdOrderPathControls />
    <ThirdOrderSourceRail embedded />
    <ThirdOrderInspector embedded />
  </aside>
{/snippet}

<div class="third-order-toy" bind:this={host}>
  <div class="workspace-main">
    {#if compact}
      {@render stage()}
    {:else}
      <PanelGroup
        direction="horizontal"
        panels={[
          {
            id: "stage",
            content: stage,
            defaultSize: 2.4,
            minSize: 520,
            resizeLabel: "Resize motion stage and setup",
          },
          {
            id: "setup",
            content: setup,
            defaultSize: 0.92,
            preferredSize: "380px",
            minSize: 300,
            maxSize: 420,
          },
        ]}
        bind:sizes={panelSizes}
      />
    {/if}
  </div>
  <ThirdOrderTransport />
</div>

<Drawer
  isOpen={thirdOrder.setupDrawerOpen}
  onOpenChange={thirdOrder.setSetupDrawerOpen}
  placement="right"
  ariaLabel="Third Order setup"
  class="third-order-drawer"
>
  <DrawerHeader
    title="Third Order setup"
    onClose={() => thirdOrder.setSetupDrawerOpen(false)}
  />
  <div class="setup-drawer-body">
    <ThirdOrderPathControls />
    <ThirdOrderSourceRail embedded />
    <ThirdOrderInspector embedded />
  </div>
</Drawer>

<SequencePickerModal
  open={thirdOrder.pickerTarget !== null}
  onClose={thirdOrder.closePicker}
  onSelect={(sequence) => thirdOrder.applyPickedSequence(sequence)}
  title={thirdOrder.pickerTarget === "carrier"
    ? "Choose the carrier sequence"
    : "Choose the inner sequence"}
/>

<style>
  .third-order-toy {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: var(--spacing-sm, 8px);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--spacing-sm, 8px);
    overflow: hidden;
    background: transparent;
    container-type: size;
  }
  .workspace-main {
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .setup-panel {
    height: 100%;
    padding: 16px;
    overflow: auto;
    background: var(--theme-panel-bg);
  }
  .setup-drawer-body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
  }
  :global(.third-order-drawer) {
    --drawer-width: min(92vw, 390px);
  }
  @media (max-width: 767px), (max-height: 620px) {
    .third-order-toy {
      gap: var(--spacing-xs, 6px);
      padding: var(--spacing-xs, 6px);
    }
  }
</style>
