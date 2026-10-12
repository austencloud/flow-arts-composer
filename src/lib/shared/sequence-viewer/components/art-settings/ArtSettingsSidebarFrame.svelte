<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    exporting: boolean;
    /**
     * False where the host already names this panel immediately above it.
     * Repeating the name costs a header band and says nothing new.
     */
    showLabel?: boolean;
    children: Snippet;
  }

  let { label, exporting, showLabel = true, children }: Props = $props();
</script>

<div class="art-settings-panel" class:exporting inert={exporting || undefined}>
  {#if showLabel}
    <div class="panel-header">
      <span class="section-label">{label}</span>
    </div>
  {/if}
  {@render children()}
</div>

<style>
  /* Card chrome mirrors `.horizontal-sidebar` (the 2D animation rail). */
  .art-settings-panel {
    display: flex;
    flex-direction: column;
    width: clamp(300px, 38%, 420px);
    min-width: 300px;
    height: 100%;
    flex-shrink: 0;
    box-sizing: border-box;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 14px;
    overflow: hidden;
    container-type: size;
    container-name: art-sidebar;
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  /* Frozen while a tunnel export bakes — `inert` blocks interaction; the dim is
     the visual signal. Changing fold/mirror/spectrum now would desync from the
     offscreen engine's pre-loaded layer textures. */
  .art-settings-panel.exporting {
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .art-settings-panel {
      transition: none;
    }
  }
  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    padding: clamp(12px, 3cqh, 18px) clamp(14px, 3cqh, 18px);
    border-bottom: 1px solid var(--theme-stroke);
  }
  .section-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.5;
    font-weight: 600;
  }
</style>
