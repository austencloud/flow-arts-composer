<script lang="ts">
  import { t, tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import { saveMandalaToCollection } from "$lib/features/mandala/tabs/collection/services/save-mandala-to-collection";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type {
    MandalaPathShape,
    MandalaRenderOptions,
  } from "$lib/shared/mandala/domain/mandala-types";
  import PanelHeader from "$lib/shared/create/components/PanelHeader.svelte";
  import MandalaPane from "$lib/shared/sequence-viewer/components/MandalaPane.svelte";
  import type { ControlDockAction } from "$lib/shared/sequence-viewer/components/ControlDock.svelte";
  import { MandalaViewerController } from "$lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";

  interface Props {
    sequence: SequenceData;
    variant: MandalaRenderOptions["show"];
    pathShape: MandalaPathShape;
    leftPropType: string;
    rightPropType: string;
    isMobile?: boolean;
    onClose: () => void;
  }

  let {
    sequence,
    variant,
    pathShape,
    leftPropType,
    rightPropType,
    isMobile = false,
    onClose,
  }: Props = $props();

  let saving = $state(false);

  const ctrl = new MandalaViewerController(
    {
      getSequence: () => sequence,
      getLeftPropType: () => leftPropType,
      getRightPropType: () => rightPropType,
      pathPolicy: getAnimationVisibilityManager(),
    },
    {
      // This focused viewer owns no other lasting Mandala look, but its Custom
      // palette is the same authored pair available from Tunnel.
      viewOverrides: {
        colorMode: "solid",
        preset: "custom",
      },
      persistViewState: false,
      persistCustomColors: true,
    }
  );

  $effect(() => {
    ctrl.show = variant;
    ctrl.pathShape = pathShape;
  });

  async function handleSave(): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      const name = await saveMandalaToCollection({
        steps: sequence.steps ?? [],
        variant: ctrl.show,
        leftPropType,
        rightPropType,
        pathShape: ctrl.pathShape,
        sequenceWord: sequence.word ?? "",
      });
      if (name)
        toast.success(
          tDynamic("create_action_saved_mandala_to_collection", { name })
        );
    } finally {
      saving = false;
    }
  }

  const saveAction = $derived<ControlDockAction>({
    icon: "fa-folder-plus",
    label: saving
      ? tDynamic("create_action_saving_mandala")
      : tDynamic("create_action_save_mandala_to_collection"),
    onClick: () => void handleSave(),
    disabled: saving,
    busy: saving,
    accent: true,
  });
</script>

<div class="mandala-viewer-panel">
  <PanelHeader title={t("create_ui_mandala")} {isMobile} {onClose} />
  <div class="mandala-stage">
    <MandalaPane
      {sequence}
      {leftPropType}
      {rightPropType}
      {ctrl}
      showDownload={false}
      dockAction={saveAction}
    />
  </div>
</div>

<style>
  .mandala-viewer-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--theme-panel-bg);
  }

  .mandala-stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
</style>
