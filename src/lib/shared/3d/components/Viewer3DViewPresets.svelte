<script lang="ts">
  /**
   * Viewer3DViewPresets
   *
   * Camera angle presets for the 3D viewer: Main, Back, Side, Top, 3/4.
   * All presets look at the grid center. Grid center is mode-dependent:
   * - Wall mode: (0, 0, 0.3) - gridOffset forward of avatar
   * - Dual-wheel: (0, 0, 0) - midpoint between the two lateral grids
   *
   * Distance is computed from FOV + viewport size so the grid fills the view.
   */

  import { getViewer3DContext } from "../context/viewer-3d-context";
  import { PlaneMode } from "@austencloud/scene-3d";
  import { GRID_OFFSETS } from "@austencloud/scene-3d";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { largestHandDistance } from "../domain/performer-hand-distance";
  import { joinedPerformerExtent } from "../camera/viewer-camera-framing";
  import { resolveGridJoin3D } from "../services/grid-join-3d";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    compact?: boolean;
    flat?: boolean;
    grid?: boolean;
    onSettingChange?: ViewerControlSink;
  }
  const {
    compact = false,
    flat = false,
    grid = false,
    onSettingChange,
  }: Props = $props();

  const viewer3DState = getViewer3DContext();
  const characterState = $derived(
    viewer3DState.performerManager.performers[0] ?? null
  );
  const isDualWheel = $derived(
    characterState?.planeMode === PlaneMode.DUAL_WHEEL
  );

  const gridCenter = $derived({
    x: 0,
    y: viewer3DState.stageGroundOffset,
    z: isDualWheel ? 0 : (GRID_OFFSETS[PlaneMode.WALL] ?? 0.3),
  });

  const FOV_DEG = 50;
  const gridRadius = $derived(
    characterState
      ? joinedPerformerExtent(
          characterState.handDistance,
          resolveGridJoin3D(characterState.loadedSequence)
        )
      : largestHandDistance()
  );
  const GRID_FILL_FRACTION = 0.2;
  const dualWheelOffset = $derived(userProportionsState.staffLength / 2);

  function computeDistanceForWidth(sceneWidth: number): number {
    if (typeof document === "undefined") return 3.0;
    const pane = document.querySelector(".viewer-3d-canvas");
    if (!pane) return 3.0;
    const rect = pane.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 3.0;
    const aspect = rect.width / rect.height;
    const vFovRad = ((FOV_DEG / 2) * Math.PI) / 180;
    const hFovHalf = Math.atan(Math.tan(vFovRad) * aspect);
    const visibleWidthPerMeter = 2 * Math.tan(hFovHalf);
    return sceneWidth / (GRID_FILL_FRACTION * visibleWidthPerMeter);
  }

  function computeDistance(): number {
    const sceneWidth = isDualWheel
      ? 2 * (dualWheelOffset + gridRadius)
      : gridRadius * 2;
    return computeDistanceForWidth(sceneWidth);
  }

  function computeSideDistance(): number {
    const singleWidth = gridRadius * 2;
    const dualWidth = 2 * (dualWheelOffset + gridRadius);
    return computeDistanceForWidth((singleWidth + dualWidth) / 2);
  }

  function getPresetPositions(): Record<
    string,
    { x: number; y: number; z: number }
  > {
    const D = computeDistance();
    const S = computeSideDistance();
    const gz = gridCenter.z;
    const gy = gridCenter.y;
    const positions: Record<string, { x: number; y: number; z: number }> = {
      main: { x: 0, y: gy, z: gz + D },
      back: { x: 0, y: gy, z: gz - D * 1.3 },
      left: { x: S, y: gy, z: gz },
      right: { x: -S, y: gy, z: gz },
      top: { x: 0, y: gy + D, z: gz },
      threequarter: { x: D * 0.55, y: gy + D * 0.4, z: gz - D * 0.75 },
    };
    return positions;
  }

  interface ViewPreset {
    id: string;
    label: string;
    icon: string;
  }

  const activePresets: ViewPreset[] = [
    { id: "main", label: "Front", icon: "fa-street-view" },
    { id: "back", label: "Back", icon: "fa-eye" },
    { id: "top", label: "Top", icon: "fa-angles-down" },
    { id: "left", label: "Left", icon: "fa-arrow-left" },
    { id: "right", label: "Right", icon: "fa-arrow-right" },
    { id: "threequarter", label: "3/4", icon: "fa-cube" },
  ];

  const activeCameraPreset = $derived(viewer3DState.activeCameraPreset);

  function getLookTarget(_presetId: string): {
    x: number;
    y: number;
    z: number;
  } {
    return gridCenter;
  }

  function handleCameraPreset(presetId: string) {
    const positions = getPresetPositions();
    const pos = positions[presetId];
    if (!pos) return;

    const spherical =
      presetId === "top" ? { azimuth: Math.PI, polar: 0 } : undefined;

    const previous = viewer3DState.activeCameraPreset;
    viewer3DState.setActiveCameraPreset(presetId);
    viewer3DState.snapCameraTo(pos, getLookTarget(presetId), spherical);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_camera",
      "preset",
      previous,
      presetId
    );
  }

  function handleFrameCast() {
    viewer3DState.frameAllPerformers();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_camera",
      "frame_cast",
      null,
      "requested"
    );
  }
</script>

{#if flat}
  <button
    class="preset-button frame-cast"
    onclick={handleFrameCast}
    aria-label="Frame the complete cast"
  >
    <i class="fas fa-expand" aria-hidden="true"></i>
    Frame cast
  </button>
  {#each activePresets as preset}
    <button
      class="preset-button"
      class:active={activeCameraPreset === preset.id}
      onclick={() => handleCameraPreset(preset.id)}
      aria-label={`Camera: ${preset.label}`}
    >
      <i class="fas {preset.icon}"></i>
      {preset.label}
    </button>
  {/each}
{:else}
  <div class="presets-bar" class:compact class:grid>
    <button
      class="preset-button frame-cast"
      onclick={handleFrameCast}
      aria-label="Frame the complete cast"
    >
      <i class="fas fa-expand" aria-hidden="true"></i>
      <span class="preset-label">Frame cast</span>
    </button>
    {#each activePresets as preset}
      <button
        class="preset-button"
        class:active={activeCameraPreset === preset.id}
        onclick={() => handleCameraPreset(preset.id)}
        aria-label={`Camera: ${preset.label}`}
      >
        <i class="fas {preset.icon}"></i>
        <span class="preset-label">{preset.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .presets-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
  }

  .preset-button {
    padding: 6px 11px;
    min-height: var(--min-touch-target-compact, 32px);
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .preset-button i {
    font-size: 11px;
    opacity: 0.5;
    transition: opacity var(--transition-fast);
  }

  .compact .preset-button {
    min-height: var(--min-touch-target-compact, 32px);
    padding: 4px 9px;
  }

  .preset-button:hover {
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }

  .preset-button:hover i {
    opacity: 0.85;
  }

  .preset-button.active {
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 40%, #ffffff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 40%,
      transparent
    );
    box-shadow: 0 2px 12px
      color-mix(in srgb, var(--theme-accent, #4a9eff) 20%, transparent);
  }

  .preset-button.active i {
    opacity: 1;
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 60%, #ffffff);
  }

  .frame-cast {
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 45%, #ffffff);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 28%,
      transparent
    );
  }

  .presets-bar.grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
    padding: 6px;
    background: transparent;
    border: none;
    backdrop-filter: none;
  }

  .grid .preset-button {
    min-height: 52px;
    padding: 10px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    flex-direction: column;
    gap: 5px;
    justify-content: center;
  }

  .grid .frame-cast {
    grid-column: 1 / -1;
    min-height: var(--min-touch-target, 44px);
    flex-direction: row;
  }

  .grid .preset-button i {
    font-size: 14px;
  }

  .grid .preset-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .grid .preset-button.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 22%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 55%,
      transparent
    );
    box-shadow: 0 4px 16px
      color-mix(in srgb, var(--theme-accent, #4a9eff) 25%, transparent);
  }
</style>
