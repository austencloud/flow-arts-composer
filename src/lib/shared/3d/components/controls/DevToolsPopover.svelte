<script lang="ts">
  import { Vector3 } from "three";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import { oceanQualityOverride } from "#lib/shared/3d/environments/scenes/ocean/quality/ocean-quality-override.svelte.js";
  import { oceanDebugToggles } from "#lib/shared/3d/environments/scenes/ocean/quality/ocean-debug-toggles.svelte.js";
  import type { OceanQualityTier } from "#lib/shared/3d/environments/scenes/ocean/quality/ocean-quality.js";

  const viewer = getViewer3DContext();
  let copiedCamera = $state(false);

  const TIER_OPTIONS: Array<{ value: OceanQualityTier | "auto"; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "ultra", label: "Ultra" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];
  const activeTier = $derived(oceanQualityOverride.tier);
  function setTier(v: OceanQualityTier | "auto") {
    oceanQualityOverride.tier = v;
  }

  // Live A/B toggles to isolate which ocean effect causes an observed change.
  type FxKey =
    | "sway"
    | "caustics"
    | "godRayShafts"
    | "underwaterDistortion"
    | "fog"
    | "waterTint"
    | "hemiLight"
    | "ibl"
    | "particles"
    | "bloom";
  const FX_TOGGLES: Array<{ key: FxKey; label: string }> = [
    { key: "sway", label: "Sway" },
    { key: "caustics", label: "Caustics" },
    { key: "godRayShafts", label: "Shafts" },
    { key: "underwaterDistortion", label: "Distortion" },
  ];
  // The veil/flatten suspects — flip these to find what washes the scene out.
  const WASHOUT_TOGGLES: Array<{ key: FxKey; label: string }> = [
    { key: "fog", label: "Fog" },
    { key: "waterTint", label: "Water Tint" },
    { key: "hemiLight", label: "Hemi Light" },
    { key: "ibl", label: "IBL" },
    { key: "particles", label: "Particles" },
    { key: "bloom", label: "Bloom" },
  ];
  function toggleFx(key: FxKey) {
    oceanDebugToggles[key] = !oceanDebugToggles[key];
  }

  function copyCameraState(): void {
    const controls = viewer.cameraChoreography.controls;
    if (!controls) return;

    const pos = new Vector3();
    const tgt = new Vector3();
    controls.getPosition(pos);
    controls.getTarget(tgt);

    const data = {
      position: { x: r(pos.x), y: r(pos.y), z: r(pos.z) },
      target: { x: r(tgt.x), y: r(tgt.y), z: r(tgt.z) },
      azimuth: r(controls.azimuthAngle),
      polar: r(controls.polarAngle),
      distance: r(controls.distance),
    };

    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    copiedCamera = true;
    setTimeout(() => { copiedCamera = false; }, 1500);
  }

  function r(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
</script>

<div class="dev-tools">
  <button class="dev-action" onclick={copyCameraState}>
    <i class="fas" class:fa-clipboard={!copiedCamera} class:fa-check={copiedCamera}></i>
    <span>{copiedCamera ? "Copied!" : "Copy Camera State"}</span>
  </button>

  <button class="dev-action" onclick={() => viewer.togglePerf()}>
    <i class="fas fa-gauge-high"></i>
    <span>{viewer.showPerf ? "Hide Performance Stats" : "Show Performance Stats"}</span>
  </button>

  <div class="tier-group" role="group" aria-label="Ocean quality tier">
    <span class="tier-label">Ocean tier</span>
    <div class="tier-pills">
      {#each TIER_OPTIONS as opt (opt.value)}
        <button
          type="button"
          class="tier-pill"
          class:active={activeTier === opt.value}
          aria-pressed={activeTier === opt.value}
          onclick={() => setTier(opt.value)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="tier-group" role="group" aria-label="Ocean effects A/B toggles">
    <span class="tier-label">Ocean FX (A/B)</span>
    <div class="tier-pills">
      {#each FX_TOGGLES as fx (fx.key)}
        <button
          type="button"
          class="tier-pill"
          class:active={oceanDebugToggles[fx.key]}
          aria-pressed={oceanDebugToggles[fx.key]}
          onclick={() => toggleFx(fx.key)}
        >
          {fx.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="tier-group" role="group" aria-label="Ocean washout A/B toggles">
    <span class="tier-label">Washout (A/B)</span>
    <div class="tier-pills washout-pills">
      {#each WASHOUT_TOGGLES as fx (fx.key)}
        <button
          type="button"
          class="tier-pill"
          class:active={oceanDebugToggles[fx.key]}
          aria-pressed={oceanDebugToggles[fx.key]}
          onclick={() => toggleFx(fx.key)}
        >
          {fx.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="tier-group" role="group" aria-label="Ocean strength sliders">
    <span class="tier-label">Strength</span>
    <label class="slider-row">
      <span class="slider-name">Caustics</span>
      <input
        type="range"
        min="0"
        max="0.6"
        step="0.01"
        value={oceanDebugToggles.causticStrength}
        oninput={(e) => (oceanDebugToggles.causticStrength = +e.currentTarget.value)}
      />
      <span class="slider-val">{oceanDebugToggles.causticStrength.toFixed(2)}</span>
    </label>
    <label class="slider-row">
      <span class="slider-name">Water Tint</span>
      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={oceanDebugToggles.waterTintStrength}
        oninput={(e) => (oceanDebugToggles.waterTintStrength = +e.currentTarget.value)}
      />
      <span class="slider-val">{oceanDebugToggles.waterTintStrength.toFixed(2)}</span>
    </label>
  </div>
</div>

<style>
  .dev-tools {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dev-action {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 160ms;
  }
  .dev-action:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.18);
    color: white;
  }
  .dev-action i {
    width: 18px;
    text-align: center;
    font-size: 14px;
    opacity: 0.7;
  }
  .tier-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
  }
  .tier-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.45);
  }
  .tier-pills {
    display: flex;
    gap: 4px;
  }
  /* Six wider labels — wrap to a 3-column grid so none get clipped. */
  .washout-pills {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }
  .tier-pill {
    flex: 1;
    padding: 6px 4px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 140ms;
  }
  .tier-pill:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
  .tier-pill.active {
    background: rgba(99, 179, 237, 0.22);
    border-color: rgba(99, 179, 237, 0.55);
    color: white;
  }
  .slider-row {
    display: grid;
    grid-template-columns: 70px 1fr 36px;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }
  .slider-name {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  .slider-val {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: rgba(99, 179, 237, 0.95);
  }
  .slider-row input[type="range"] {
    width: 100%;
    accent-color: rgba(99, 179, 237, 0.9);
    cursor: pointer;
  }
</style>
