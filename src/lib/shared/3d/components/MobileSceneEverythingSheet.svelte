<script lang="ts">
  /**
   * The compact scene drill-down. It reuses the same control bodies as the
   * desktop inspector while giving a phone one focused editor at a time.
   */
  import FormationPopover from "./controls/FormationPopover.svelte";
  import CameraPopover from "./CameraPopover.svelte";
  import SceneSelectorPopover from "./SceneSelectorPopover.svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import { loadedAuthState } from "#lib/shared/auth/state/loaded-auth-state.svelte.js";
  import type { ViewerControlSink } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    onSettingChange?: ViewerControlSink;
  }

  let { onSettingChange }: Props = $props();

  const loadDevTools = () => import("./controls/DevToolsPopover.svelte");

  type SceneSection = "scene" | "formation" | "camera" | "dev";
  const sections: {
    id: SceneSection;
    label: string;
    description: string;
    icon: string;
  }[] = [
    {
      id: "scene",
      label: "Scene",
      description: "Environment and stage appearance",
      icon: "fa-mountain-sun",
    },
    {
      id: "formation",
      label: "Formation",
      description: "Cast count, spacing, and arrangement",
      icon: "fa-people-arrows-left-right",
    },
    {
      id: "camera",
      label: "Camera",
      description: "Viewpoint, movement, and navigation",
      icon: "fa-video",
    },
  ];
  let active = $state<SceneSection | null>(null);

  const activeLabel = $derived(
    sections.find((section) => section.id === active)?.label ??
      (active === "dev" ? "Developer tools" : "Scene")
  );
</script>

<div class="everything-sheet">
  {#if active}
    <div class="drilldown-header">
      <button type="button" class="back-button" onclick={() => (active = null)}>
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
        <span>Scene controls</span>
      </button>
      <strong>{activeLabel}</strong>
    </div>

    <div class="section-body">
      {#if active === "scene"}<SceneSelectorPopover {onSettingChange} />{/if}
      {#if active === "formation"}<FormationPopover {onSettingChange} />{/if}
      {#if active === "camera"}<CameraPopover {onSettingChange} />{/if}
      {#if active === "dev" && loadedAuthState.isAdmin}
        <LazyMount
          loader={loadDevTools}
          active
          keepAlive={false}
          debugName="3D developer tools"
        />
      {/if}
    </div>
  {:else}
    <div class="section-list" aria-label="Scene control categories">
      {#each sections as section}
        <button
          type="button"
          class="section-button"
          onclick={() => (active = section.id)}
        >
          <span class="section-icon" aria-hidden="true">
            <i class="fas {section.icon}"></i>
          </span>
          <span class="section-copy">
            <strong>{section.label}</strong>
            <small>{section.description}</small>
          </span>
          <i class="fas fa-chevron-right section-chevron" aria-hidden="true"
          ></i>
        </button>
      {/each}
      {#if loadedAuthState.isAdmin}
        <button
          type="button"
          class="section-button"
          onclick={() => (active = "dev")}
        >
          <span class="section-icon" aria-hidden="true">
            <i class="fas fa-terminal"></i>
          </span>
          <span class="section-copy">
            <strong>Developer tools</strong>
            <small>Scene diagnostics and internal controls</small>
          </span>
          <i class="fas fa-chevron-right section-chevron" aria-hidden="true"
          ></i>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .everything-sheet {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .drilldown-header {
    display: flex;
    align-items: center;
    min-height: 44px;
    gap: 12px;
  }

  .drilldown-header strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .back-button,
  .section-button {
    min-height: 44px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .section-list {
    display: grid;
    gap: 8px;
  }

  .section-button {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 14px;
    text-align: left;
  }

  .section-button:hover,
  .section-button:focus-visible,
  .back-button:hover,
  .back-button:focus-visible {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }

  .section-button:focus-visible,
  .back-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .section-icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: var(--theme-accent);
  }

  .section-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .section-copy strong {
    font-size: var(--font-size-min, 14px);
  }

  .section-copy small {
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-chevron {
    color: var(--theme-text-dim);
    font-size: 12px;
  }
</style>
