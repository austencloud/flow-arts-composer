<script lang="ts">
  import CameraPopover from "../CameraPopover.svelte";
  import SceneSelectorPopover from "../SceneSelectorPopover.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import FormationPopover from "./FormationPopover.svelte";
  import PerformerHubDetail from "./PerformerHubDetail.svelte";
  import PresetsPanel from "./PresetsPanel.svelte";
  import type { SceneControlTool } from "../../domain/scene-control-layout";
  import type { ViewerControlSink } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import type { PerformerEditSink } from "./performer-hub-types";

  interface Props {
    tool: SceneControlTool;
    onClose: () => void;
    onSettingChange?: ViewerControlSink;
    onOpenSaveScene?: () => void;
    /** Forwarded to the performer tool — see PerformerHubDetail's Props. */
    onPerformerEdit?: PerformerEditSink;
  }

  let {
    tool,
    onClose,
    onSettingChange,
    onOpenSaveScene,
    onPerformerEdit,
  }: Props = $props();

  const loadDevTools = () => import("./DevToolsPopover.svelte");

  const titles: Record<SceneControlTool, string> = {
    performer: "Performers",
    formation: "Formation",
    camera: "Camera",
    scene: "Scene",
    presets: "Presets",
    dev: "Developer tools",
  };

  /**
   * The performer hub is a full editor with its own bottom-anchored tab bar and
   * its own scrolling pane. It fills the panel and owns the scroll; every other
   * tool is a short stack of controls the panel scrolls for it. Letting both
   * scroll nests two scrollers on one axis, which leaves the bottom of the
   * inner pane unreachable.
   */
  const fillsPanel = $derived(tool === "performer");

  const icons: Record<SceneControlTool, string> = {
    performer: "fa-user-group",
    formation: "fa-people-arrows-left-right",
    camera: "fa-video",
    scene: "fa-mountain-sun",
    presets: "fa-swatchbook",
    dev: "fa-terminal",
  };
</script>

<section
  class="scene-control-inspector"
  class:fills={fillsPanel}
  data-scene-inspector
  aria-labelledby="scene-control-inspector-title"
>
  <header class="inspector-header">
    <span class="inspector-icon" aria-hidden="true">
      <i class="fas {icons[tool]}"></i>
    </span>
    <h2 id="scene-control-inspector-title">{titles[tool]}</h2>
    <button
      type="button"
      class="inspector-close"
      aria-label="Close {titles[tool]} controls"
      onclick={onClose}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  <div class="inspector-body" class:fills={fillsPanel}>
    {#if tool === "performer"}
      <PerformerHubDetail {onSettingChange} {onPerformerEdit} />
    {:else if tool === "formation"}
      <FormationPopover {onSettingChange} />
    {:else if tool === "camera"}
      <CameraPopover {onSettingChange} />
    {:else if tool === "scene"}
      <SceneSelectorPopover {onSettingChange} />
    {:else if tool === "presets"}
      <PresetsPanel {onOpenSaveScene} {onSettingChange} />
    {:else}
      <LazyMount
        loader={loadDevTools}
        active={tool === "dev"}
        keepAlive={false}
        debugName="3D developer tools"
      />
    {/if}
  </div>
</section>

<style>
  .scene-control-inspector {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: auto;
    max-height: inherit;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: var(--theme-panel-shadow, 0 1.25rem 4rem rgba(0, 0, 0, 0.62));
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
  }

  /* Keep the performer tabs in one place as panels with different amounts of
     content open. The hub scrolls its content inside this bounded height. */
  .scene-control-inspector.fills {
    height: 100%;
  }

  .inspector-header {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
    align-items: center;
    gap: 0.625rem;
    min-height: 4rem;
    padding: 0.625rem 0.625rem 0.625rem 0.875rem;
    border-bottom: 1px solid var(--theme-stroke);
    flex: none;
  }

  .inspector-icon {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
  }

  .inspector-header h2 {
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: 1rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-close {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .inspector-close:hover,
  .inspector-close:focus-visible {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .inspector-close:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .inspector-body {
    flex: 0 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.875rem;
  }

  /* The performer hub is its own editor: a scrolling pane above a
     bottom-anchored tab bar. It brings its own padding and its own scroller,
     so the body hands it the space and stops scrolling. The panel still hugs
     its content and only grows to the column's height when the hub needs it —
     a tall empty panel over a short tool reads as broken. */
  .inspector-body.fills {
    flex: 1 1 auto;
    display: flex;
    overflow: hidden;
    padding: 0;
  }

  .inspector-body > :global(*) {
    width: 100%;
  }
</style>
