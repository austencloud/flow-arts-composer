<script lang="ts">
  import MobileSceneControls from "../MobileSceneControls.svelte";
  import BottomSheet from "./BottomSheet.svelte";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import {
    resolveSceneControlLayout,
    type SceneControlHostTool,
    type SceneControlLayout,
    type SceneControlTool,
  } from "../../domain/scene-control-layout";
  import type {
    ViewerActionSink,
    ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import { dockSlide } from "#lib/shared/transitions/dock-slide.js";
  import { createSheetDismiss } from "./sheet-dismiss";
  import { shouldDeferEscapeShortcut } from "#lib/shared/keyboard/domain/escape-shortcut-target.js";
  import SaveSceneModal from "#lib/features/scene-3d-collection/components/SaveSceneModal.svelte";
  import PerformerSpine from "./PerformerSpine.svelte";
  import SelectionToolbar from "#lib/shared/components/selection/SelectionToolbar.svelte";
  import SceneControlInspector from "./SceneControlInspector.svelte";
  import SceneControlRail from "./SceneControlRail.svelte";
  import type { PerformerEditSink } from "./performer-hub-types";
  import { onMount, type Snippet } from "svelte";
  import { flyFade, growFade } from "#lib/shared/transitions/motion.js";
  import {
    DIRECT_PERFORMER_SELECTION_EVENT,
    type DirectPerformerSelectionDetail,
  } from "../performer-interaction/performer-pointer-interaction.svelte";

  interface Props {
    bpm?: number;
    onSettingChange?: ViewerControlSink;
    onAction?: ViewerActionSink;
    onLayoutChange?: (layout: SceneControlLayout) => void;
    showCompactPlayback?: boolean;
    isPlaying?: boolean;
    onPlaybackToggle?: () => void;
    onStepForward?: () => void;
    onStepBackward?: () => void;
    /** Leaves room for host-owned close/fullscreen controls above the rail. */
    topOffset?: string;
    /**
     * The same reservation, but for the top-LEFT corner alone, where the
     * performer bar pins itself. A host whose top band is occupied only on the
     * right — commands there, nothing over the corner — publishes a smaller
     * number here and lets the bar sit up in the corner while the inspector
     * still clears the chrome opposite it. Unset, the bar follows topOffset.
     */
    topLeftOffset?: string;
    /**
     * Leaves room for host-owned chrome below the rail, such as a transport.
     * Left unset, each surface keeps its own default sized for the sequence
     * viewer's bar.
     */
    bottomOffset?: string;
    /**
     * Leaves room for host-owned chrome in the stage's top-left corner, where
     * the performer bar sits. The Film Director's back-to-Films button lands
     * there; without this the bar renders underneath it.
     */
    leftOffset?: string;
    /**
     * Whether this host offers saving the live viewer state as a reusable look.
     * The Director turns it off: its artifact is the film document, and a
     * viewer snapshot taken there records one instant of a playing film with no
     * relationship to what is being authored.
     */
    allowSaveScene?: boolean;
    /** Forwarded to the performer tool — see PerformerHubDetail's Props. */
    onPerformerEdit?: PerformerEditSink;
    /** Fires with the tool being inspected, or null when the inspector closes. */
    onInspectorChange?: (tool: SceneControlTool | null) => void;
    /**
     * One rail entry and one panel this host contributes, for a surface the
     * viewer has no concept of. Both are required together; the panel renders
     * in the inspector's own column and is mutually exclusive with the viewer's
     * tools, so the right edge never holds two open panels.
     */
    hostTool?: SceneControlHostTool | null;
    /**
     * Receives a close callback, because this component owns whether the panel
     * is open. A host panel's own close button has to route back through that
     * owner rather than keeping a second copy of the open state.
     */
    hostPanel?: Snippet<[() => void, boolean]>;
    hostPanelTitle?: string;
    hostPanelOpen?: boolean;
    /** Fires when the host panel opens or closes. */
    onHostPanelChange?: (open: boolean) => void;
    /** Compact sheets are independent from the desktop rail. Hosts can use
     *  this signal to animate surrounding chrome out of their way. */
    onCompactSheetChange?: (sheet: "performer" | "scene" | null) => void;
  }

  let {
    bpm,
    onSettingChange,
    onAction,
    onLayoutChange,
    showCompactPlayback = false,
    isPlaying = false,
    onPlaybackToggle,
    onStepForward,
    onStepBackward,
    topOffset = "12px",
    topLeftOffset,
    bottomOffset,
    leftOffset = "0.75rem",
    allowSaveScene = true,
    onPerformerEdit,
    onInspectorChange,
    onCompactSheetChange,
    hostTool = null,
    hostPanel,
    hostPanelTitle = "Scene editor",
    hostPanelOpen = $bindable(false),
    onHostPanelChange,
  }: Props = $props();

  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let workspaceEl = $state<HTMLElement | null>(null);
  let activeTool = $state<SceneControlTool | null>(null);
  let panelEl = $state<HTMLElement | null>(null);
  let saveSceneOpen = $state(false);
  let showInteractionHint = $state(false);
  let interactionAnnouncement = $state("");
  let compactSheet = $state<"performer" | "scene" | null>(null);
  let performerOpenRequest = $state(0);
  let performerCloseRequest = $state(0);
  let closeSheetsRequest = $state(0);
  const viewer = getViewer3DContext();

  onMount(() => {
    showInteractionHint =
      localStorage.getItem("tka-performer-direct-manipulation-hint") !==
      "dismissed";
    const dismissHint = () => (showInteractionHint = false);
    const announce = (event: Event) => {
      interactionAnnouncement = (event as CustomEvent<string>).detail;
    };
    const openDirectlySelectedPerformer = (event: Event) => {
      const { selectedPerformerIndices, openInspector } = (
        event as CustomEvent<DirectPerformerSelectionDetail>
      ).detail;
      if (workspaceEl?.closest("[inert], [aria-hidden='true']")) return;

      if (selectedPerformerIndices.length === 0 || !openInspector) {
        if (activeTool === "performer") activeTool = null;
        performerCloseRequest += 1;
        return;
      }

      if (layout.presentation === "compact") performerOpenRequest += 1;
      else chooseTool("performer");
    };
    window.addEventListener(
      "tka-performer-interaction-hint-dismissed",
      dismissHint
    );
    window.addEventListener("tka-performer-interaction-announcement", announce);
    window.addEventListener(
      DIRECT_PERFORMER_SELECTION_EVENT,
      openDirectlySelectedPerformer
    );
    return () => {
      window.removeEventListener(
        "tka-performer-interaction-hint-dismissed",
        dismissHint
      );
      window.removeEventListener(
        "tka-performer-interaction-announcement",
        announce
      );
      window.removeEventListener(
        DIRECT_PERFORMER_SELECTION_EVENT,
        openDirectlySelectedPerformer
      );
    };
  });

  function openSaveScene(): void {
    activeTool = null;
    hostPanelOpen = false;
    saveSceneOpen = true;
  }

  // One panel at a time in the right column. Choosing a viewer tool closes the
  // host's panel and choosing the host's closes the viewer tool, so the edge
  // never stacks two.
  function chooseTool(tool: SceneControlTool | null): void {
    activeTool = tool;
    if (tool !== null) hostPanelOpen = false;
  }

  function toggleHostPanel(): void {
    hostPanelOpen = !hostPanelOpen;
    if (hostPanelOpen) activeTool = null;
  }

  function closeHostPanel(): void {
    hostPanelOpen = false;
  }

  const inspectorUsesDock = $derived(
    activeTool === "performer" || activeTool === "dev" || hostPanelOpen
  );
  const rightColumnOpen = $derived(activeTool !== null || hostPanelOpen);

  const layout = $derived(
    resolveSceneControlLayout(
      workspaceWidth,
      workspaceHeight,
      rightColumnOpen,
      inspectorUsesDock
    )
  );

  function isModalTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest(
        "dialog, [role='dialog'], [role='alertdialog'], [data-dialog-content]"
      ) !== null
    );
  }

  function closeInspector(): void {
    activeTool = null;
    hostPanelOpen = false;
  }

  function finishMultiSelection(): void {
    if (viewer.selectedPerformerIndices.length === 0) return;
    viewer.setPerformerSelectionMode(false);
    if (layout.presentation === "compact") performerOpenRequest += 1;
    else chooseTool("performer");
  }

  function cancelMultiSelection(): void {
    viewer.setPerformerSelectionMode(false);
    viewer.clearPerformerSelection();
    if (activeTool === "performer") activeTool = null;
    performerCloseRequest += 1;
  }

  function handleCompactSheetChange(sheet: "performer" | "scene" | null): void {
    compactSheet = sheet;
    if (sheet !== null) hostPanelOpen = false;
  }

  let reportedCompactSheet: "performer" | "scene" | null = null;
  $effect(() => {
    // A host editor needs the same room above the transport as scene settings.
    const sheet =
      layout.presentation === "compact" && hostPanelOpen
        ? "scene"
        : compactSheet;
    if (sheet === reportedCompactSheet) return;
    reportedCompactSheet = sheet;
    onCompactSheetChange?.(sheet);
  });

  const dismiss = createSheetDismiss(
    closeInspector,
    () => panelEl,
    isModalTarget
  );

  // activeTool moves from four places (rail selection, close, save-scene, and
  // the compact reset below), so the notification hangs off the value rather
  // than off each mutation site.
  let lastReportedTool: SceneControlTool | null = null;
  $effect(() => {
    const current = activeTool;
    if (current === lastReportedTool) return;
    lastReportedTool = current;
    onInspectorChange?.(current);
  });

  let lastReportedHostPanel = false;
  $effect(() => {
    const current = hostPanelOpen;
    if (current === lastReportedHostPanel) return;
    lastReportedHostPanel = current;
    if (current) {
      activeTool = null;
      closeSheetsRequest += 1;
    }
    onHostPanelChange?.(current);
  });

  let lastLayoutSignature = "";
  $effect(() => {
    const current = layout;
    const signature = `${current.presentation}:${current.panelWidth}:${current.reservedWidth}`;
    if (signature === lastLayoutSignature) return;
    lastLayoutSignature = signature;
    onLayoutChange?.(current);
  });

  // A compact workspace has its own sheet state. Clearing the desktop tool
  // prevents a stale inspector from reopening when a split pane grows again.
  $effect(() => {
    if (layout.presentation === "compact") {
      activeTool = null;
    }
  });

  let selectionModeWasActive = false;
  $effect(() => {
    const isActive = viewer.performerSelectionMode;
    if (!isActive || selectionModeWasActive) {
      selectionModeWasActive = isActive;
      return;
    }
    selectionModeWasActive = true;
    if (activeTool === "performer") activeTool = null;
    if (hostPanelOpen) hostPanelOpen = false;
    performerCloseRequest += 1;
  });

  let dockWasOpen = false;
  $effect(() => {
    const dockIsOpen =
      layout.presentation === "docked" && layout.reservedWidth > 0;
    if (dockIsOpen !== dockWasOpen && workspaceHeight > 0) {
      const stageWidth = Math.max(
        1,
        workspaceWidth - (dockIsOpen ? layout.reservedWidth : 0)
      );
      viewer.frameAllPerformers(stageWidth / workspaceHeight, true);
    }
    dockWasOpen = dockIsOpen;
  });
</script>

<svelte:window
  onpointerdowncapture={(event) => {
    if (rightColumnOpen && layout.presentation === "overlay") {
      dismiss.onBackdropPointerDown(event);
    }
  }}
  onkeydown={(event) => {
    if (
      event.key === "Escape" &&
      viewer.performerSelectionMode &&
      !shouldDeferEscapeShortcut(document) &&
      !isModalTarget(event.target)
    ) {
      viewer.setPerformerSelectionMode(false);
      event.preventDefault();
      event.stopPropagation();
    } else if (
      rightColumnOpen &&
      !shouldDeferEscapeShortcut(document) &&
      !isModalTarget(event.target)
    ) {
      dismiss.onKeydown(event);
    }
  }}
/>

<div
  class="scene-control-workspace"
  class:docked={layout.presentation === "docked"}
  class:overlay={layout.presentation === "overlay"}
  class:compact={layout.presentation === "compact"}
  class:compact-sheet-open={compactSheet !== null ||
    (hostPanelOpen && layout.presentation === "compact")}
  bind:this={workspaceEl}
  bind:clientWidth={workspaceWidth}
  bind:clientHeight={workspaceHeight}
  data-scene-control-workspace
  data-presentation={layout.presentation}
  data-open={rightColumnOpen || undefined}
  style:--scene-controls-top={topOffset}
  style:--scene-performer-bar-top={topLeftOffset ?? topOffset}
  style:--scene-controls-bottom={bottomOffset}
  style:--scene-controls-left={leftOffset}
  style:--scene-inspector-width="{layout.panelWidth}px"
  style:--scene-right-occupied={rightColumnOpen
    ? `calc(4.75rem + ${layout.panelWidth}px)`
    : "4.75rem"}
>
  {#if layout.presentation === "compact"}
    <div class="compact-controls">
      <MobileSceneControls
        showPlayback={showCompactPlayback}
        {isPlaying}
        {onPlaybackToggle}
        {onStepForward}
        {onStepBackward}
        {onSettingChange}
        {onPerformerEdit}
        openPerformerRequest={performerOpenRequest}
        closePerformerRequest={performerCloseRequest}
        {closeSheetsRequest}
        onSheetChange={handleCompactSheetChange}
      />
      {#if hostPanel}
        <BottomSheet
          open={hostPanelOpen}
          title={hostPanelTitle}
          onClose={closeHostPanel}
        >
          {@render hostPanel(closeHostPanel, true)}
        </BottomSheet>
      {/if}
    </div>
  {:else}
    <!-- Choosing who you are editing changes the 3D scene, not just a panel, so
         it lives beside the scene and stays put while tools come and go. The
         canvas already selects performers on click
         (Viewer3DScene's onPointerDown); this is the same act, reachable
         without hunting for a performer in the frame. -->
    <div class="performer-bar-anchor">
      <PerformerSpine
        {onSettingChange}
        onScopeSelect={() =>
          chooseTool(
            viewer.selectedPerformerIndices.length > 0 ? "performer" : null
          )}
      />
      {#if showInteractionHint}
        <p class="interaction-hint" transition:flyFade>
          Click to edit · Ctrl/Cmd-click to select several · drag to move
        </p>
      {/if}
    </div>

    <SceneControlRail
      renderMode="3d"
      {activeTool}
      {onSettingChange}
      {topOffset}
      {bottomOffset}
      onToolSelect={chooseTool}
      onOpenSaveScene={allowSaveScene ? openSaveScene : undefined}
      hostTool={hostPanel ? hostTool : null}
      hostToolActive={hostPanelOpen}
      onHostToolSelect={toggleHostPanel}
    />

    {#if activeTool}
      <div
        class="inspector-anchor"
        data-tool={activeTool}
        bind:this={panelEl}
        transition:dockSlide={{ duration: 280, distance: 24 }}
      >
        <SceneControlInspector
          tool={activeTool}
          onClose={closeInspector}
          {onSettingChange}
          {onPerformerEdit}
          onOpenSaveScene={allowSaveScene ? openSaveScene : undefined}
        />
      </div>
    {:else if hostPanelOpen && hostPanel}
      <div
        class="inspector-anchor"
        data-tool={hostTool?.id ?? "host"}
        bind:this={panelEl}
        transition:dockSlide={{ duration: 280, distance: 24 }}
      >
        {@render hostPanel(closeHostPanel, false)}
      </div>
    {/if}
  {/if}

  {#if viewer.performerSelectionMode}
    <div class="selection-toolbar-anchor" transition:growFade={{ axis: "y" }}>
      <SelectionToolbar
        selectedCount={viewer.selectedPerformerIndices.length}
        totalCount={viewer.performerManager.performers.length}
        primaryLabel="Done"
        primaryIcon="fa-check"
        onPrimaryAction={finishMultiSelection}
        secondaryLabel="Cancel"
        secondaryIcon="fa-xmark"
        onSecondaryAction={cancelMultiSelection}
        secondaryDisabledWhenEmpty={false}
        showExitAction={false}
        onSelectAll={() => viewer.selectAllPerformers()}
        onClearSelection={() => viewer.clearPerformerSelection()}
        onExitSelection={cancelMultiSelection}
      />
    </div>
  {/if}
</div>

<div class="sr-only" aria-live="polite">{interactionAnnouncement}</div>

{#if allowSaveScene}
  <SaveSceneModal
    bind:open={saveSceneOpen}
    {bpm}
    {onSettingChange}
    {onAction}
  />
{/if}

<style>
  .scene-control-workspace {
    position: absolute;
    inset: 0;
    z-index: 20;
    min-width: 0;
    min-height: 0;
    pointer-events: none;
  }

  /* Compact sheets own the stage while they are open. A host transport may
     otherwise sit above this entire stacking context and cover the sheet's
     tabs even though the sheet itself has a higher local z-index. */
  .scene-control-workspace.compact-sheet-open {
    z-index: 40;
  }

  .scene-control-workspace :global(button),
  .scene-control-workspace :global([role="button"]),
  .scene-control-workspace :global([role="dialog"]),
  .inspector-anchor {
    pointer-events: auto;
  }

  /* Sits opposite the rail, clear of the inspector column when one is open, and
     content-sized so a solo scene shows two chips rather than an empty strip. */
  .performer-bar-anchor {
    position: absolute;
    top: var(--scene-performer-bar-top, var(--scene-controls-top, 0.75rem));
    left: var(--scene-controls-left, 0.75rem);
    z-index: 28;
    display: flex;
    max-width: calc(
      100% - var(--scene-controls-left, 0.75rem) -
        var(--scene-right-occupied, 4.75rem)
    );
    min-width: 0;
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: var(--theme-panel-shadow, 0 1.25rem 4rem rgba(0, 0, 0, 0.62));
    pointer-events: auto;
  }

  .interaction-hint {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    width: max-content;
    max-width: min(22rem, 80vw);
    margin: 0;
    padding: 0.45rem 0.7rem;
    border-radius: 0.65rem;
    background: var(--theme-panel-bg, #0c0e16);
    color: var(--theme-text, #fff);
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.5));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
    pointer-events: none;
  }

  .sr-only {
    position: fixed;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .performer-bar-anchor > :global(*) {
    min-width: 0;
  }

  .inspector-anchor {
    position: absolute;
    top: var(--scene-controls-top, 0.75rem);
    right: 4.75rem;
    bottom: var(--scene-controls-bottom, 5.5rem);
    z-index: 29;
    width: var(--scene-inspector-width);
    min-width: 0;
    overflow: visible;
  }

  .inspector-anchor > :global(*) {
    width: var(--scene-inspector-width);
    max-height: 100%;
  }

  /* Spans the workspace so the bottom sheets (absolute descendants) are
     bounded by the 3D pane, never the viewport — a viewport-fixed sheet
     slides under the app shell's side/bottom navigation. The action bar
     positions itself inside via MobileSceneControls' bar cluster. */
  .compact-controls {
    position: absolute;
    inset: 0;
    z-index: 30;
    pointer-events: none;
  }

  .selection-toolbar-anchor {
    position: absolute;
    right: max(0.75rem, env(safe-area-inset-right));
    bottom: calc(var(--scene-controls-bottom, 5.5rem) + 0.75rem);
    left: max(0.75rem, env(safe-area-inset-left));
    z-index: 35;
    max-width: 46rem;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 1rem;
    background: var(--theme-panel-bg);
    box-shadow: var(--theme-panel-shadow);
    pointer-events: auto;
    container: gallery / inline-size;
  }

  @media (prefers-reduced-motion: reduce) {
    .inspector-anchor {
      transition: none;
    }
  }
</style>
