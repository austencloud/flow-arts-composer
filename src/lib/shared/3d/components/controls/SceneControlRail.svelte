<script lang="ts">
  import { getViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { loadedAuthState } from "#lib/shared/auth/state/loaded-auth-state.svelte.js";
  import EditHistoryShortcutBridge from "#lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import type {
    SceneControlHostTool,
    SceneControlTool,
  } from "#lib/shared/3d/domain/scene-control-layout.js";
  import SceneChromeButton from "./SceneChromeButton.svelte";
  import {
    PERFORMER_TOOLS,
    type PerformerHubTab,
  } from "./performer-hub-types";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    renderMode: "2d" | "3d";
    activeTool?: SceneControlTool | null;
    onSettingChange?: ViewerControlSink;
    onToolSelect?: (tool: SceneControlTool | null) => void;
    /** The performer tool the panel shows while the performer tool is open. */
    performerTab?: PerformerHubTab;
    /** Opens the performer panel on one tool, or closes it if already there. */
    onPerformerToolSelect?: (tab: PerformerHubTab) => void;
    /** Omit to leave Save scene off the rail — see SceneControlWorkspace's
     *  allowSaveScene. */
    onOpenSaveScene?: () => void;
    /** Omit to leave the rail as the viewer defines it. */
    hostTool?: SceneControlHostTool | null;
    hostToolActive?: boolean;
    onHostToolSelect?: () => void;
    /** Leaves room for host-owned close/fullscreen controls above the rail. */
    topOffset?: string;
    /** Leaves room for host-owned chrome below the rail, such as a transport. */
    bottomOffset?: string;
    /**
     * Fires when the rail switches between one and two columns, so the host
     * can move the panel and the performer bar clear of it.
     */
    onColumnsChange?: (columns: 1 | 2) => void;
  }

  let {
    renderMode,
    activeTool = null,
    onSettingChange,
    onToolSelect,
    performerTab = "prop",
    onPerformerToolSelect,
    onOpenSaveScene,
    hostTool = null,
    hostToolActive = false,
    onHostToolSelect,
    topOffset = "12px",
    bottomOffset = "max(5rem, calc(5rem + env(safe-area-inset-bottom)))",
    onColumnsChange,
  }: Props = $props();

  const viewer = getViewer3DContext();

  type RailTool = {
    id: Exclude<SceneControlTool, "dev">;
    label: string;
    icon: string;
  };

  const shotTools: RailTool[] = [
    {
      id: "formation",
      label: "Formation",
      icon: "fa-people-arrows-left-right",
    },
    { id: "camera", label: "Camera", icon: "fa-video" },
    { id: "scene", label: "Scene", icon: "fa-mountain-sun" },
  ];

  function chooseTool(tool: SceneControlTool): void {
    const next = activeTool === tool ? null : tool;
    onToolSelect?.(next);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_rail",
      `${tool}_open`,
      activeTool === tool,
      next === tool,
      { count: next === tool }
    );
  }

  // A short window cannot stack every button in one column, so the rail
  // folds into two. The one-column height is measured while the rail is one
  // column and remembered, so the switch cannot flicker back and forth.
  let railEl = $state<HTMLElement | null>(null);
  let railHeight = $state(0);
  let singleColumnHeight = $state(0);
  let columns = $state<1 | 2>(1);

  $effect(() => {
    const height = railHeight;
    if (!railEl || height <= 0) return;
    if (columns === 1) {
      const needed = measureColumn(railEl);
      singleColumnHeight = needed;
      if (needed > height) columns = 2;
    } else if (singleColumnHeight <= height) {
      columns = 1;
    }
  });

  $effect(() => {
    onColumnsChange?.(columns);
  });

  function measureColumn(rail: HTMLElement): number {
    // The undo and redo shortcut targets sit out of flow; only the stacked
    // groups take up the column.
    const parts = [...rail.children].filter((child) => {
      const element = child as HTMLElement;
      const position = getComputedStyle(element).position;
      return (
        element.offsetHeight > 0 &&
        position !== "absolute" &&
        position !== "fixed"
      );
    }) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(rail).rowGap) || 0;
    return (
      parts.reduce((sum, part) => sum + part.offsetHeight, 0) +
      Math.max(0, parts.length - 1) * gap
    );
  }

  function performerToolOpen(tab: PerformerHubTab): boolean {
    return activeTool === "performer" && performerTab === tab;
  }

  function choosePerformerTool(tab: PerformerHubTab): void {
    const wasOpen = performerToolOpen(tab);
    onPerformerToolSelect?.(tab);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_rail",
      `performer_${tab}_open`,
      wasOpen,
      !wasOpen,
      { count: !wasOpen }
    );
  }

  function openSaveScene(): void {
    onToolSelect?.(null);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_rail",
      "save_scene_open",
      false,
      true
    );
    onOpenSaveScene?.();
  }
</script>

{#if renderMode === "3d"}
  <div
    class="scene-control-rail"
    class:two-column={columns === 2}
    bind:this={railEl}
    bind:clientHeight={railHeight}
    data-rail-columns={columns}
    style:--scene-control-rail-top={topOffset}
    style:--scene-control-rail-bottom={bottomOffset}
    role="toolbar"
    aria-label="Scene controls"
  >
    <EditHistoryShortcutBridge
      onUndo={() => {
        viewer.undo();
      }}
      onRedo={() => {
        viewer.redo();
      }}
      canUndo={viewer.canUndo}
      canRedo={viewer.canRedo}
      undoLabel="3D scene change"
      redoLabel="3D scene change"
    />

    <!-- Each performer tool opens the panel straight onto itself; who it
         edits is chosen in the performer bar at the stage's top-left. -->
    <div class="rail-group" role="group" aria-label="Performer tools">
      {#each PERFORMER_TOOLS as tool (tool.id)}
        <SceneChromeButton
          icon={tool.icon}
          label={tool.label}
          active={performerToolOpen(tool.id)}
          aria-pressed={performerToolOpen(tool.id)}
          data-scene-tool="performer"
          data-performer-tool={tool.id}
          onclick={() => choosePerformerTool(tool.id)}
        />
      {/each}
    </div>

    <div class="rail-separator" aria-hidden="true"></div>

    <div class="rail-group" role="group" aria-label="Formation, camera and scene">
      <SceneChromeButton
        icon="fa-crosshairs"
        label="Focus avatar"
        disabled={viewer.performerManager.performers.length === 0}
        onclick={() => viewer.focusSelectedPerformers()}
      />
      {#each shotTools as tool}
        <SceneChromeButton
          icon={tool.icon}
          label={tool.label}
          active={activeTool === tool.id}
          aria-pressed={activeTool === tool.id}
          data-scene-tool={tool.id}
          onclick={() => chooseTool(tool.id)}
        />
      {/each}
    </div>

    {#if hostTool}
      <div class="rail-separator" aria-hidden="true"></div>

      <div class="rail-group" role="group" aria-label="Film">
        <SceneChromeButton
          icon={hostTool.icon}
          label={hostTool.label}
          active={hostToolActive}
          aria-pressed={hostToolActive}
          data-scene-tool={hostTool.id}
          onclick={() => onHostToolSelect?.()}
        />
      </div>
    {/if}

    <div class="utility-group" role="group" aria-label="Scene utilities">
      <SceneChromeButton
        icon="fa-swatchbook"
        label="Presets"
        active={activeTool === "presets"}
        aria-pressed={activeTool === "presets"}
        data-scene-tool="presets"
        onclick={() => chooseTool("presets")}
      />

      {#if onOpenSaveScene}
        <SceneChromeButton
          icon="fa-bookmark"
          label="Save scene"
          data-save-shortcut
          onclick={openSaveScene}
        />
      {/if}

      {#if loadedAuthState.isAdmin}
        <div class="rail-separator" aria-hidden="true"></div>
        <SceneChromeButton
          icon="fa-terminal"
          label="Developer tools"
          active={activeTool === "dev"}
          aria-pressed={activeTool === "dev"}
          data-scene-tool="dev"
          onclick={() => chooseTool("dev")}
        />
      {/if}
    </div>
  </div>
{/if}

<style>
  .scene-control-rail {
    position: absolute;
    top: var(--scene-control-rail-top, 0.75rem);
    right: 0.75rem;
    /* The host's transport owns the bottom edge; how much it takes varies by
       host, so the default is the sequence viewer's and the Director passes its
       own measured band. */
    bottom: var(
      --scene-control-rail-bottom,
      max(5rem, calc(5rem + env(safe-area-inset-bottom)))
    );
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .rail-group,
  .utility-group {
    display: grid;
    gap: 0.5rem;
  }

  .rail-separator {
    width: 2rem;
    height: 1px;
    margin: 0 auto;
    background: var(--theme-stroke);
  }

  .utility-group {
    margin-top: auto;
  }

  .two-column .rail-group,
  .two-column .utility-group {
    grid-template-columns: repeat(2, auto);
  }

  .two-column .utility-group > .rail-separator {
    grid-column: 1 / -1;
  }
</style>
