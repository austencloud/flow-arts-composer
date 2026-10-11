<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";
  import { markViewer3DIntroSeen } from "#lib/shared/onboarding/state/viewer3d-intro-state.js";
  import { resolveSceneControlLayout } from "#lib/shared/3d/domain/scene-control-layout.js";

  interface Props {
    onSettingChange?: ViewerControlSink;
    force?: boolean;
    onDismiss?: () => void;
  }

  let { onSettingChange, force = false, onDismiss }: Props = $props();

  // The rail's own groups, in rail order. Naming the real buttons is the whole
  // point — this is a pointer, not a summary.
  const railTools = [
    {
      icon: "fa-mountain-sun",
      label: "Scene",
      detail: "Swap the world you are performing in.",
    },
    {
      icon: "fa-user-group",
      label: "Performers",
      detail: "Add bodies. Everyone performs this sequence.",
    },
    {
      icon: "fa-swatchbook",
      label: "Presets",
      detail: "Load a saved look, or save this one.",
    },
  ];

  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);

  const presentation = $derived(
    resolveSceneControlLayout(workspaceWidth, workspaceHeight, false)
      .presentation
  );

  function dismiss(): void {
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_rail_hint",
      "dismiss",
      false,
      true,
      { count: true }
    );
    if (!force) markViewer3DIntroSeen();
    onDismiss?.();
  }
</script>

<div
  class="hint-workspace"
  bind:clientWidth={workspaceWidth}
  bind:clientHeight={workspaceHeight}
>
  <!-- Compact viewports replace the rail with MobileSceneControls, so a
       pointer at the rail has nothing to point at. -->
  {#if workspaceWidth > 0 && workspaceHeight > 0 && presentation !== "compact"}
    <aside class="hint-card" aria-labelledby="viewer-3d-rail-hint-heading">
      <h2 id="viewer-3d-rail-hint-heading">Everything is on that rail</h2>
      <ul class="hint-list">
        {#each railTools as tool (tool.label)}
          <li>
            <span class="hint-icon" aria-hidden="true">
              <i class="fas {tool.icon}"></i>
            </span>
            <span class="hint-text">
              <span class="hint-label">{tool.label}</span>
              <span class="hint-detail">{tool.detail}</span>
            </span>
          </li>
        {/each}
      </ul>
      <div class="hint-footer">
        <PanelButton variant="primary" onclick={dismiss}>Got it</PanelButton>
      </div>
    </aside>
  {/if}
</div>

<style>
  .hint-workspace {
    position: absolute;
    inset: 0;
    z-index: 28;
    min-width: 0;
    min-height: 0;
    pointer-events: none;
    container-type: size;
  }

  .hint-card {
    position: absolute;
    /* Sits beside the rail rather than under it: the rail is 48px wide at
       right: 0.75rem, so clear both plus a gutter. Anchoring to the vertical
       middle keeps the card out of the transport band at the bottom and the
       Record Scene pill in the bottom-right corner entirely. */
    right: calc(0.75rem + 48px + 0.75rem);
    /* Aligned with the rail's top cluster, not the rail's midpoint: the rail
       splits into a top tool group and a bottom utility group with a gap
       between them, and a caret aimed at that gap points at nothing. */
    top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    width: min(21rem, calc(100% - 6rem));
    min-width: 0;
    padding: 1.125rem 1.25rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: var(--theme-panel-shadow, 0 1.25rem 4rem rgba(0, 0, 0, 0.62));
    color: var(--theme-text, rgba(255, 255, 255, 0.94));
    pointer-events: auto;
  }

  /* The caret is what turns a floating card into a pointer. */
  .hint-card::after {
    content: "";
    position: absolute;
    top: 50%;
    right: -0.4rem;
    width: 0.75rem;
    height: 0.75rem;
    transform: translateY(-50%) rotate(45deg);
    border-top: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-right: 1px solid
      var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    background: var(--theme-panel-bg, #0c0e16);
  }

  .hint-card h2 {
    margin: 0;
    font-size: var(--font-size-lg, 1.0625rem);
    font-weight: 650;
    line-height: 1.25;
  }

  .hint-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hint-list li {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-width: 0;
  }

  .hint-icon {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.625rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
    font-size: 0.875rem;
  }

  .hint-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }

  .hint-label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
  }

  .hint-detail {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.35;
  }

  .hint-footer {
    display: flex;
    justify-content: flex-end;
  }

  @container (max-height: 34rem) {
    .hint-card {
      gap: 0.625rem;
      padding: 0.875rem 1rem;
    }

    .hint-list {
      gap: 0.5rem;
    }
  }
</style>
