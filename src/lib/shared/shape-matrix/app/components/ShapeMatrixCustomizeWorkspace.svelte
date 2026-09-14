<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixCustomizeWorkspace.svelte
  Everything that changes how the animation plays, in one place over the grid
  pane. You are not choosing a shape while you tune its animation, so the grid
  is the one region that can be covered without losing anything you are
  watching: the hero, its relationships, the carousel and the dock stay put,
  and every change is judged against the live pair.

  The body is the canonical Animator inspector, the export sidebar's own
  grammar: a rail naming the four abilities (Effects, Props, Motion, Display)
  beside one page at a time, each page composed for a sidebar's width. The
  earlier overlay poured the dock tray's strips across a pane built for a
  grid, and every section read as a few controls adrift in an empty room.

  One Customize button under the animation opens the workspace on the page
  the rail last showed, and the rail picks the page from there; nothing under
  the animation lists the pages a second time. The way back to the grid is
  the same labelled button every time, the Customize button again, or Escape.
  Opening also rebalances the two panes toward the animation (the shell owns
  that), since the pages here need one sidebar-width column, not a grid's.

  One instance, over the grid pane, for both surfaces: the shell mounts it
  once beside the crossfading grids, so switching surfaces with it open keeps
  the same workspace, rail, page and scroll rather than swapping it for
  another. A surface with no pair yet has nothing to customize over, and the
  workspace closes when it arrives on one.

  Wide hosts only. Compact hosts show one pane at a time, so this pane is off
  screen while the dock is; the compact settings sheet and the canonical prop
  sheet take over there. -->
<script lang="ts">
  import { tick } from "svelte";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import type { PillId } from "$lib/shared/animation-panel/pill-nav/pill-types";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { CANVAS2D_HOSTED_EFFECTS } from "$lib/shared/effects/services/canvas2d-effect-host";
  import { getEscapeLayerManager } from "$lib/shared/keyboard/get-escape-layer-manager";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { getShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import {
    customizeRequest,
    customizeSection,
    surfaceHasPair,
  } from "../state/shape-matrix-customize";

  const appState = getShapeMatrixAppContext();
  const animationState = getShapeMatrixAnimationContext();

  /* The surface changes which effects and marks the pages offer, never the
     workspace itself. */
  const theory = $derived(appState.surface === "theory");
  /* The open page, or null while the workspace is closed: a wide host, a
     requested page, and a pair on the surface that is showing. One owner
     decides it for the workspace, the panes under it and the shell. */
  const section = $derived(customizeSection(appState, animationState));
  const open = $derived(section !== null);

  const theoryEffects = ["trails", ...CANVAS2D_HOSTED_EFFECTS] as const;
  let backButton = $state<HTMLButtonElement | null>(null);

  function close(): void {
    appState.closePropPicker();
    animationState.showRelationships();
  }

  /* The rail's choice is the one open section, so the compact dock would
     agree with it if the host narrowed. */
  function selectSection(next: PillId | null): void {
    if (next === null) {
      close();
      return;
    }
    appState.closePropPicker();
    animationState.setActiveSection(next);
  }

  function onKeydown(event: KeyboardEvent): void {
    // Focus inside a non-modal dialog owns the first Escape; the global
    // shortcut defers to it, so it is answered here.
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  /* Arriving on a surface that has no pair closes a workspace the other
     surface left open, rather than parking it until a cell is picked: the
     grid is what that surface shows first, and the choice to customize is
     made on a pair, not carried over from one that could not translate. */
  $effect(() => {
    if (appState.compact || surfaceHasPair(appState)) return;
    if (customizeRequest(appState, animationState) === null) return;
    close();
  });

  $effect(() => {
    if (!open) return;

    const restoreTo = document.activeElement;
    const unregister = getEscapeLayerManager().register({
      id: "shape-matrix:customize",
      canDismiss: () => true,
      dismiss: close,
    });
    // Focus lands on the way back, not deep inside a page: the workspace
    // opened from a dock pill, and the next Tab reaches the rail.
    void tick().then(() => backButton?.focus({ preventScroll: true }));

    return () => {
      unregister();
      if (restoreTo instanceof HTMLElement && restoreTo.isConnected) {
        restoreTo.focus({ preventScroll: true });
      }
    };
  });
</script>

{#if open}
  <div
    class="customize-workspace"
    role="dialog"
    aria-label="Customize the animation"
    tabindex="-1"
    onkeydown={onKeydown}
    transition:flyFade={{ y: 8 }}
  >
    <header class="workspace-header">
      <PanelButton bind:ref={backButton} onclick={close}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>Back to grid</span>
      </PanelButton>
      <div class="workspace-title">
        <h2>Customize the animation</h2>
        <p>Every change plays live on the right, on the pair you chose.</p>
      </div>
    </header>
    <div class="workspace-body">
      <AnimationPanel
        isExporting={false}
        layout="sidebar"
        controlledSection={section}
        onActiveSectionChange={selectSection}
        isPlaying={animationState.playing}
        bpm={animationState.bpm}
        playbackMode={animationState.playbackMode}
        onPlaybackToggle={animationState.togglePlaying}
        onPlaybackModeChange={animationState.setPlaybackMode}
        onBpmChange={animationState.setBpm}
        showEffectsPlayback={false}
        selectedPropType={appState.propType}
        onPropChange={(propType) => void appState.setPropType(propType)}
        showPathShape={false}
        showMotionVisibility={true}
        showSequenceMarks={!theory}
        availableEffects={theory ? theoryEffects : undefined}
        regionLabel="Animation settings"
      />
    </div>
  </div>
{/if}

<style>
  .customize-workspace {
    position: absolute;
    inset: 0;
    /* Above the grid's sticky headers and corner. */
    z-index: 20;
    /* It covers the whole grid pane, frame and all, so it draws the frame
       the pane sections draw: one stroke, the same radius. */
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    /* The theme panel color may be translucent. The semantic floor guarantees
       that grid labels cannot show through the workspace. */
    background:
      linear-gradient(
        var(--theme-panel-bg, rgb(16 23 33 / 0.96)),
        var(--theme-panel-bg, rgb(16 23 33 / 0.96))
      ),
      var(--theme-bg-deep, #0a0f14);
    color: var(--theme-text, #fff);
  }

  .workspace-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
  }

  .workspace-header :global(.panel-btn) {
    flex: 0 0 auto;
  }

  .workspace-title {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .workspace-title h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .workspace-title p {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
  }

  .workspace-body {
    min-width: 0;
    min-height: 0;
  }

  /* The inspector draws itself as a sidebar: its own panel colour and a rule
     down its left edge. Here it is the whole pane, on the pane's own surface. */
  .workspace-body :global(.animator-inspector) {
    border-left: 0;
    background: transparent;
  }

  /* The sidebar floats a short page mid-column. On a pane this tall that
     strands the page far below its rail item and the header; the screen
     reads top-down, so every page starts under the header. */
  .workspace-body :global(.panel-center-inner) {
    margin-block: 0 auto;
  }
</style>
