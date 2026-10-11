<script lang="ts">
  import type { QualityLevel } from "@austencloud/backgrounds";
  import type { CosmicDensityPreset } from "#lib/shared/background-builder/domain/lab-settings-types.js";
  import { ChipToggle, ChipGroup } from '@austencloud/chip-toggle';
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";

  interface LayerState {
    stars: boolean;
    nebula: boolean;
    aurora: boolean;
    milkyWay: boolean;
    meteors: boolean;
    comets: boolean;
    ufo: boolean;
  }

  interface Props {
    quality: QualityLevel;
    layers: LayerState;
    densityPreset: CosmicDensityPreset;
    onQualityChange: (quality: QualityLevel) => void;
    onLayerToggle: (layer: keyof LayerState) => void;
    onDensityChange: (preset: CosmicDensityPreset) => void;
    onTriggerMeteor: () => void;
    onTriggerComet: () => void;
    onRegenerate: () => void;
  }

  let {
    quality,
    layers,
    densityPreset,
    onQualityChange,
    onLayerToggle,
    onDensityChange,
    onTriggerMeteor,
    onTriggerComet,
    onRegenerate,
  }: Props = $props();
</script>

<!-- Quality Chips -->
<ChipGroup>
  <ChipToggle label="High" active={quality === "high"} onclick={() => onQualityChange("high")} />
  <ChipToggle label="Medium" active={quality === "medium"} onclick={() => onQualityChange("medium")} />
  <ChipToggle label="Low" active={quality === "low"} onclick={() => onQualityChange("low")} />
</ChipGroup>

<!-- Layer Chips -->
<ChipGroup>
  <ChipToggle label="Stars" icon="star" active={layers.stars} onclick={() => onLayerToggle("stars")} />
  <ChipToggle label="Nebula" icon="cloud" active={layers.nebula} onclick={() => onLayerToggle("nebula")} />
  <ChipToggle label="Aurora" icon="wind" active={layers.aurora} onclick={() => onLayerToggle("aurora")} />
  <ChipToggle label="Milky Way" icon="star-half-stroke" active={layers.milkyWay} onclick={() => onLayerToggle("milkyWay")} />
  <ChipToggle label="Meteors" icon="meteor" active={layers.meteors} onclick={() => onLayerToggle("meteors")} />
  <ChipToggle label="Comets" icon="fire" active={layers.comets} onclick={() => onLayerToggle("comets")} />
  <ChipToggle label="UFO" icon="satellite" active={layers.ufo} onclick={() => onLayerToggle("ufo")} />
</ChipGroup>

<!-- Trigger Buttons -->
<ChipGroup>
  <ChipToggle label="Meteor" icon="meteor" color="amber" onclick={onTriggerMeteor} />
  <ChipToggle label="Comet" icon="fire" color="cyan" onclick={onTriggerComet} />
</ChipGroup>

<!-- Density Chips -->
<ChipGroup>
  <ChipToggle label="Sparse" active={densityPreset === "sparse"} onclick={() => onDensityChange("sparse")} />
  <ChipToggle label="Normal" active={densityPreset === "normal"} onclick={() => onDensityChange("normal")} />
  <ChipToggle label="Dense" active={densityPreset === "dense"} onclick={() => onDensityChange("dense")} />
  <ChipToggle label="Ultra" active={densityPreset === "ultra"} onclick={() => onDensityChange("ultra")} />
</ChipGroup>

<!-- Regenerate -->
<ActionButton label="Regenerate" icon="fa-wand-magic-sparkles" fullWidth onclick={onRegenerate} />

<!-- Progress Pills -->
<div class="progress-section">
  <span class="label">Progress</span>
  <div class="progress-pills">
    <span class="pill complete">Clean Canvas</span>
    <span class="pill complete">Lab Ready</span>
    <span class="pill complete">Scintillation</span>
    <span class="pill complete">Nebula</span>
    <span class="pill complete">Aurora</span>
    <span class="pill complete">Milky Way</span>
    <span class="pill complete">Meteors</span>
    <span class="pill complete">Comets</span>
    <span class="pill complete">UFO</span>
  </div>
</div>

<style>
  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .progress-section .label {
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .progress-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pill {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .pill.complete {
    background: color-mix(in srgb, var(--theme-success, #34d399) 15%, transparent);
    color: var(--theme-success, #34d399);
  }
</style>
