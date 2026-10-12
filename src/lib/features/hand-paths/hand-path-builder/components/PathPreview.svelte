<!--
  PathPreview.svelte - Live path name display for both hands

  Shows the current path name as locations are tapped.
  Updates live during construction. Both names shown side by side.
-->
<script lang="ts">
  import { getBuilderContext } from "../context/builder-context";

  const builder = getBuilderContext();
</script>

<div class="path-preview">
  <div class="hand-preview" class:active={builder.phase === "left"}>
    <div class="hand-label blue-label">Left</div>
    <div class="path-name">
      {#if builder.leftPathName}
        <span class="name-text">{builder.leftPathName}</span>
      {:else}
        <span class="placeholder">tap to start</span>
      {/if}
    </div>
    <div class="location-count">
      {builder.leftLocations.length}
      {builder.leftLocations.length === 1 ? "point" : "points"}
    </div>
  </div>

  <div class="divider" aria-hidden="true">→</div>

  <div
    class="hand-preview"
    class:active={builder.phase === "right"}
    class:locked={builder.phase === "left"}
  >
    <div class="hand-label red-label">Right</div>
    <div class="path-name">
      {#if builder.rightPathName}
        <span class="name-text">{builder.rightPathName}</span>
      {:else}
        <span class="placeholder"
          >{builder.phase === "left" ? "next" : "tap to start"}</span
        >
      {/if}
    </div>
    <div class="location-count">
      {builder.rightLocations.length}
      {builder.rightLocations.length === 1 ? "point" : "points"}
      {#if builder.phase === "right" && builder.leftLocations.length > 0}
        <span class="count-target"> / {builder.leftLocations.length}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .path-preview {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    width: 100%;
  }

  .hand-preview {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    opacity: 0.5;
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  .hand-preview.active {
    opacity: 1;
  }

  .hand-preview.locked {
    opacity: 0.35;
  }

  .hand-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .blue-label {
    color: var(--prop-blue, #2e8bf0);
  }

  .red-label {
    color: var(--prop-red, #ed1c24);
  }

  .path-name {
    font-size: var(--font-size-min, 14px);
    font-family: monospace;
    min-height: 1.4em;
  }

  .name-text {
    color: var(--theme-text, #fff);
    letter-spacing: 0.05em;
  }

  .placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
    font-style: italic;
    font-family: inherit;
  }

  .location-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .count-target {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .divider {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.25));
    font-size: var(--font-size-min, 14px);
    flex-shrink: 0;
  }
</style>
