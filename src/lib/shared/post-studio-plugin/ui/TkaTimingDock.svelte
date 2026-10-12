<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import EditHistoryShortcutBridge from "#lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import PostTimingTap from "#lib/shared/share/components/post-studio/builder/PostTimingTap.svelte";
  import { useTkaEditor } from "./tka-editor-context";
  import TkaTimingPanel from "./TkaTimingPanel.svelte";

  /**
   * The phone's timing dock: the tap button and Settings, which opens the
   * mapping settings in a sheet. The workspace shows it only while the panel
   * is not beside the stage.
   */
  let {
    editor,
    draftStatus,
  }: { editor: VideoEditorState; draftStatus: Snippet } = $props();

  const tka = useTkaEditor();
  const session = tka.timing;
  const timingUi = tka.timingUi;

  // While the dock is on screen the sheet holds the panel; it closes with
  // the dock.
  onMount(() => {
    timingUi.dockMounted = true;
    return () => {
      timingUi.dockMounted = false;
      timingUi.settingsOpen = false;
    };
  });
</script>

<div class="timing-mobile-actions">
  <PostTimingTap {session} />
  <PanelButton
    onclick={() => (timingUi.settingsOpen = true)}
    ariaExpanded={timingUi.settingsOpen}
  >
    <i class="fa-solid fa-sliders" aria-hidden="true"></i> Settings
  </PanelButton>
</div>

<Drawer
  bind:isOpen={timingUi.settingsOpen}
  title="Mapping settings"
  placement="bottom"
  initialFocusElement={timingUi.animationOpen
    ? timingUi.animationSection
    : null}
>
  <DrawerHeader
    title="Mapping settings"
    onClose={() => (timingUi.settingsOpen = false)}
  />
  <div
    class="timing-drawer-content"
    data-edit-history-shortcut-scope
    data-viewer-keys-ignore
  >
    <EditHistoryShortcutBridge
      onUndo={session.undo}
      onRedo={session.redo}
      canUndo={session.canUndo}
      canRedo={session.canRedo}
    />
    {@render draftStatus()}
    <TkaTimingPanel {editor} showPrimary={false} />
  </div>
</Drawer>

<style>
  .timing-mobile-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .timing-drawer-content {
    padding: 0 1rem 1rem;
    overflow-y: auto;
    max-height: 75dvh;
  }
</style>
