<!--
  MirrorRenderer.svelte

  Mirror mode renderer showing original and mirrored sides.
  Currently displays placeholder split view - will be enhanced with actual mirroring logic.
-->
<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import CanvasControls from "../components/CanvasControls.svelte";

  type MirrorAxis = "vertical" | "horizontal";

  // Placeholder renderer: `sequence` stays in the prop contract for the real
  // mirroring implementation (callers already pass it), but nothing consumes
  // it yet, so it is intentionally not destructured.
  let {
    axis = "vertical",
    onOpenSettings,
  }: {
    sequence: SequenceData | null;
    axis?: MirrorAxis;
    onOpenSettings: (canvasId: string) => void;
  } = $props();
</script>

<div class="mirror-renderer">
  <CanvasControls canvasId="mirror" {onOpenSettings} />

  <div class="unavailable-notice" role="status">
    <i class="fas fa-circle-info" aria-hidden="true"></i>
    <span>Mirror mode isn't available yet. This is a preview of the split layout.</span>
  </div>

  <div class="canvas-split">
    <!-- Original Side -->
    <div class="canvas-panel original">
      <div class="panel-label">
        <i class="fas fa-user" aria-hidden="true"></i>
        Original
      </div>
      <div class="canvas-area">
        <div class="placeholder-visual">
          <i class="fas fa-person-walking" aria-hidden="true"></i>
        </div>
      </div>
    </div>

    <!-- Divider with Indicator -->
    <div class="split-divider">
      <div class="divider-line"></div>
      <div class="divider-icon">
        <i
          class="fas fa-{axis === 'vertical'
            ? 'arrows-left-right'
            : 'arrows-up-down'}"
          aria-hidden="true"
        ></i>
      </div>
      <div class="divider-line"></div>
    </div>

    <!-- Mirrored Side -->
    <div class="canvas-panel mirrored">
      <div class="panel-label">
        <i class="fas fa-clone" aria-hidden="true"></i>
        Mirrored
      </div>
      <div class="canvas-area">
        <div
          class="placeholder-visual"
          style="transform: scale{axis === 'vertical' ? 'X' : 'Y'}(-1);"
        >
          <i class="fas fa-person-walking" aria-hidden="true"></i>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .mirror-renderer {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-primary, #1a1a1a);
    overflow: hidden;
  }

  .canvas-split {
    flex: 1;
    display: flex;
    overflow: hidden;
    background: linear-gradient(
      135deg,
      rgba(15, 20, 30, 0.5) 0%,
      rgba(10, 15, 25, 0.5) 100%
    );
    width: 100%;
    height: 100%;
  }

  .canvas-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .panel-label {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.8rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    z-index: 1;
  }

  .canvas-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .unavailable-notice {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: min(90%, 28rem);
    padding: 0.625rem 1rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-min); /* essential messaging, 14px floor */
  }

  .unavailable-notice i {
    color: var(--semantic-info-text, #60a5fa);
    flex-shrink: 0;
  }

  .placeholder-visual {
    font-size: 6rem;
    opacity: 0.1;
    transition: transform var(--duration-emphasis) ease;
  }

  .split-divider {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem 0;
    width: 40px;
    flex-shrink: 0;
  }

  .divider-line {
    flex: 1;
    width: 2px;
    background: linear-gradient(
      to bottom,
      transparent,
      color-mix(in srgb, var(--feature-view, #06b6d4) 40%, transparent),
      transparent
    );
  }

  .divider-icon {
    width: 36px;
    height: 36px;
    background: color-mix(in srgb, var(--feature-view, #06b6d4) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--feature-view, #06b6d4) 40%, transparent);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--feature-view, #22d3ee);
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .canvas-split {
      flex-direction: column;
    }

    .split-divider {
      flex-direction: row;
      width: 100%;
      height: 40px;
      padding: 0 1rem;
    }

    .divider-line {
      flex: 1;
      height: 2px;
      width: auto;
      background: linear-gradient(
        to right,
        transparent,
        color-mix(in srgb, var(--feature-view, #06b6d4) 40%, transparent),
        transparent
      );
    }
  }
</style>
