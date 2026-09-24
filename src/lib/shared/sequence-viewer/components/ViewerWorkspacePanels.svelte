<script lang="ts">
  import type { Snippet } from "svelte";
  import PanelGroup, {
    type PanelDefinition,
  } from "$lib/shared/panels/PanelGroup.svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    VIEWER_INSPECTOR_HANDLE_SIZE,
    VIEWER_STAGE_MIN_WIDTH,
    viewerInspectorConstraints,
    type ViewerInspectorProfile,
  } from "../services/viewer-shell-model";

  interface Props {
    direction: "horizontal" | "vertical";
    inspectorActive: boolean;
    inspectorCollapsed: boolean;
    inspectorProfile: ViewerInspectorProfile;
    stage: Snippet;
    inspector: Snippet;
    takeover?: Snippet;
    takeoverActive?: boolean;
    stackedInspectorSize?: string;
    /** The stage's drag floor; Post Studio's 9:16 frame needs far less. */
    stageMinSize?: number;
  }

  let {
    direction,
    inspectorActive,
    inspectorCollapsed,
    inspectorProfile,
    stage,
    inspector,
    takeover,
    takeoverActive = false,
    stackedInspectorSize = "auto",
    stageMinSize = VIEWER_STAGE_MIN_WIDTH,
  }: Props = $props();

  // With one panel the axis is visually irrelevant, so retain the last axis
  // that actually hosted an inspector. Otherwise closing a stacked inspector
  // can flip the group to horizontal while its outro is still present, turning
  // its former full width into a horizontal flex basis that crushes the stage.
  let workspaceDirection = $state(direction);
  $effect(() => {
    if (inspectorActive) workspaceDirection = direction;
  });

  const inspectorConstraints = $derived(
    viewerInspectorConstraints(inspectorProfile)
  );
  const inspectorResizable = $derived(
    direction === "horizontal" && inspectorActive && !inspectorCollapsed
  );
  // The profile's own width token, not --active-inspector-width. The shell
  // switches that variable with a class on an ancestor, and that class can
  // land after this panel list has already mounted a new track. The track
  // then measured the previous profile's width: opening share on a 707px
  // Fold grew the column toward 560px and then snapped it back to 360px.
  const inspectorWidthToken = $derived(
    inspectorProfile === "card"
      ? "var(--card-sidebar-width)"
      : inspectorProfile === "performance"
        ? "var(--performance-sidebar-width)"
        : inspectorProfile === "share"
          ? "var(--share-sidebar-width)"
          : "var(--export-sidebar-width)"
  );

  const panels = $derived.by(() => {
    const definitions: PanelDefinition[] = [
      {
        id: "viewer-stage",
        content: stage,
        defaultSize: 1,
        minSize: stageMinSize,
        resizable: inspectorResizable,
        resizeLabel:
          inspectorProfile === "performance"
            ? "Resize viewer and performances"
            : inspectorProfile === "share"
              ? "Resize viewer and share panel"
              : `Resize viewer and ${inspectorProfile} settings`,
      },
    ];

    if (direction === "horizontal") {
      definitions.push({
        // Keep the inspector track mounted at zero between desktop visits. A
        // conditional second panel starts its intro one lifecycle boundary
        // after the Card begins collapsing, which makes one mode change read as
        // two swipes. The persistent track lets both allocations change in the
        // same PanelGroup layout frame, then hands its seam to the resize handle.
        id: "export-inspector",
        content: inspector,
        defaultSize: 1,
        minSize: inspectorConstraints.minWidth,
        maxSize: inspectorConstraints.maxWidth,
        fixedSize: !inspectorActive || inspectorCollapsed ? "0px" : undefined,
        preferredSize:
          inspectorActive && !inspectorCollapsed
            ? inspectorWidthToken
            : undefined,
      });
    } else if (inspectorActive) {
      // A stacked dock discovers its intrinsic open height from its contents.
      // Keep the canonical flexPresence mount here: CSS cannot interpolate a
      // persistent track from 0px to `auto` without a measured endpoint.
      definitions.push({
        id: "export-inspector-stacked",
        content: inspector,
        defaultSize: 1,
        preferredSize: inspectorCollapsed ? undefined : stackedInspectorSize,
      });
    }

    return definitions;
  });
</script>

{#snippet panelWorkspace()}
  <div
    class="panel-workspace-source viewer-motion-stage-layer"
    data-active={!takeoverActive}
    data-persistent-viewer-stage
  >
    <PanelGroup
      direction={workspaceDirection}
      {panels}
      gap={inspectorResizable ? VIEWER_INSPECTOR_HANDLE_SIZE : 0}
    />
  </div>
{/snippet}

{#if takeover}
  <div class="panel-workspace-transition-stage">
    <DualSourceCrossfade
      active={takeoverActive ? "second" : "first"}
      first={panelWorkspace}
      second={takeover}
      duration={DURATION.emphasis}
      profile="soft-dissolve"
    />
  </div>
{:else}
  {@render panelWorkspace()}
{/if}

<style>
  /* A full-workspace takeover must not inherit the stage track while that track
     is changing size. Both live sources resolve against this fixed allocation,
     then the canonical crossfade owns the only visible handoff between them. */
  .panel-workspace-transition-stage,
  .panel-workspace-source {
    display: flex;
    flex: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
