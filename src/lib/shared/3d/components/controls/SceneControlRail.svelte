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
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    renderMode: "2d" | "3d";
    activeTool?: SceneControlTool | null;
    onSettingChange?: ViewerControlSink;
    onToolSelect?: (tool: SceneControlTool | null) => void;
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
  }

  let {
    renderMode,
    activeTool = null,
    onSettingChange,
    onToolSelect,
    onOpenSaveScene,
    hostTool = null,
    hostToolActive = false,
    onHostToolSelect,
    topOffset = "12px",
    bottomOffset = "max(5rem, calc(5rem + env(safe-area-inset-bottom)))",
  }: Props = $props();

  const viewer = getViewer3DContext();

  type RailTool = {
    id: Exclude<SceneControlTool, "dev">;
    label: string;
    icon: string;
  };

  const subjectTools: RailTool[] = [
    { id: "performer", label: "Performers", icon: "fa-user-group" },
    {
      id: "formation",
      label: "Formation",
      icon: "fa-people-arrows-left-right",
    },
  ];

  const shotTools: RailTool[] = [
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
    style:--scene-control-rail-top={topOffset}
    style:--scene-control-rail-bottom={bottomOffset}
    role="toolbar"
    aria-label="Scene controls"
  >
    <EditHistoryShortcutBridge
      onUndo={() => viewer.undo()}
      onRedo={() => viewer.redo()}
      canUndo={viewer.canUndo}
      canRedo={viewer.canRedo}
      undoLabel="3D scene change"
      redoLabel="3D scene change"
    />

    <div class="rail-group" role="group" aria-label="Performers and formation">
      {#each subjectTools as tool}
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

    <div class="rail-separator" aria-hidden="true"></div>

    <div class="rail-group" role="group" aria-label="Camera and scene">
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
</style>
