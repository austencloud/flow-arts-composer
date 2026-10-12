<script lang="ts">
  import ParamPanel from "./ParamPanel.svelte";
  import ParamSlider from "./ParamSlider.svelte";
  import ParamColor from "./ParamColor.svelte";
  import { getSceneLabContext } from "../context/scene-lab-context";

  const { state } = getSceneLabContext();
  const cfg = $derived(
    state.cosmicVariant === "night"
      ? state.cosmicNightConfig
      : state.cosmicAuroraConfig
  );

  function mut() {
    return state.cosmicVariant === "night"
      ? state.cosmicNightConfig
      : state.cosmicAuroraConfig;
  }
</script>

<div class="variant-strip">
  <button
    class:active={state.cosmicVariant === "night"}
    onclick={() => state.setCosmicVariant("night")}>Night</button
  >
  <button
    class:active={state.cosmicVariant === "aurora"}
    onclick={() => state.setCosmicVariant("aurora")}>Aurora</button
  >
</div>

<ParamPanel title="Sky">
  <ParamColor
    label="Top"
    value={cfg.sky.topColor}
    onChange={(v) => (mut().sky.topColor = v)}
  />
  <ParamColor
    label="Mid"
    value={cfg.sky.midColor ?? "#000000"}
    onChange={(v) => (mut().sky.midColor = v)}
  />
  <ParamColor
    label="Bottom"
    value={cfg.sky.bottomColor}
    onChange={(v) => (mut().sky.bottomColor = v)}
  />
</ParamPanel>

<ParamPanel title="Fog">
  <ParamColor
    label="Color"
    value={cfg.fog.color}
    onChange={(v) => (mut().fog.color = v)}
  />
  <ParamSlider
    label="Density"
    value={cfg.fog.density}
    min={0}
    max={0.05}
    step={0.001}
    onChange={(v) => (mut().fog.density = v)}
  />
</ParamPanel>

<ParamPanel title="Ground">
  <ParamColor
    label="Color"
    value={cfg.ground.color}
    onChange={(v) => (mut().ground.color = v)}
  />
  <ParamSlider
    label="Size"
    value={cfg.ground.size}
    min={5}
    max={60}
    step={1}
    onChange={(v) => (mut().ground.size = v)}
  />
</ParamPanel>

<ParamPanel
  title="Station Platform"
  enabled={cfg.platform.enabled}
  onToggle={(v) => (mut().platform.enabled = v)}
>
  <ParamSlider
    label="Radius"
    value={cfg.platform.radius}
    min={0.5}
    max={8}
    step={0.25}
    onChange={(v) => (mut().platform.radius = v)}
  />
  <ParamSlider
    label="Height"
    value={cfg.platform.height}
    min={0.02}
    max={0.5}
    step={0.01}
    onChange={(v) => (mut().platform.height = v)}
  />
  <ParamSlider
    label="Metallic"
    value={cfg.platform.metallic}
    min={0}
    max={1}
    step={0.05}
    onChange={(v) => (mut().platform.metallic = v)}
  />
  <ParamSlider
    label="Roughness"
    value={cfg.platform.roughness}
    min={0}
    max={1}
    step={0.05}
    onChange={(v) => (mut().platform.roughness = v)}
  />
  <ParamColor
    label="Base color"
    value={cfg.platform.baseColor}
    onChange={(v) => (mut().platform.baseColor = v)}
  />
  <ParamColor
    label="Emissive color"
    value={cfg.platform.emissiveColor}
    onChange={(v) => (mut().platform.emissiveColor = v)}
  />
  <ParamSlider
    label="Emissive intensity"
    value={cfg.platform.emissiveIntensity}
    min={0}
    max={3}
    step={0.05}
    onChange={(v) => (mut().platform.emissiveIntensity = v)}
  />
  <ParamSlider
    label="Edge glow width"
    value={cfg.platform.edgeGlowWidth}
    min={0}
    max={0.5}
    step={0.01}
    onChange={(v) => (mut().platform.edgeGlowWidth = v)}
  />
  <ParamSlider
    label="Pulse speed"
    value={cfg.platform.pulseSpeed}
    min={0}
    max={3}
    step={0.1}
    onChange={(v) => (mut().platform.pulseSpeed = v)}
  />
  <ParamSlider
    label="Grid density"
    value={cfg.platform.gridDensity}
    min={0}
    max={20}
    step={1}
    onChange={(v) => (mut().platform.gridDensity = v)}
  />
  <ParamSlider
    label="Grid intensity"
    value={cfg.platform.gridIntensity}
    min={0}
    max={1}
    step={0.05}
    onChange={(v) => (mut().platform.gridIntensity = v)}
  />
  <ParamSlider
    label="Accent lights"
    value={cfg.platform.accentLightCount}
    min={0}
    max={16}
    step={1}
    onChange={(v) => (mut().platform.accentLightCount = v)}
  />
  <ParamSlider
    label="Light intensity"
    value={cfg.platform.accentLightIntensity}
    min={0}
    max={30}
    step={1}
    onChange={(v) => (mut().platform.accentLightIntensity = v)}
  />
  <ParamSlider
    label="Light distance"
    value={cfg.platform.accentLightDistance}
    min={1}
    max={15}
    step={1}
    onChange={(v) => (mut().platform.accentLightDistance = v)}
  />
  <ParamSlider
    label="Seating"
    value={cfg.platform.seatingEnabled ? 1 : 0}
    min={0}
    max={1}
    step={1}
    onChange={(v) => (mut().platform.seatingEnabled = v > 0.5)}
  />
  <ParamSlider
    label="Seat rows"
    value={cfg.platform.seatingRows}
    min={1}
    max={5}
    step={1}
    onChange={(v) => (mut().platform.seatingRows = v)}
  />
  <ParamColor
    label="Seat accent"
    value={cfg.platform.seatingAccentColor}
    onChange={(v) => (mut().platform.seatingAccentColor = v)}
  />
</ParamPanel>

<ParamPanel
  title="Earth"
  defaultOpen={false}
  enabled={cfg.earth.enabled}
  onToggle={(v) => (mut().earth.enabled = v)}
>
  <ParamSlider
    label="Pos X"
    value={cfg.earth.position[0]}
    min={-80}
    max={80}
    step={1}
    onChange={(v) => (mut().earth.position[0] = v)}
  />
  <ParamSlider
    label="Pos Y"
    value={cfg.earth.position[1]}
    min={-20}
    max={40}
    step={1}
    onChange={(v) => (mut().earth.position[1] = v)}
  />
  <ParamSlider
    label="Pos Z"
    value={cfg.earth.position[2]}
    min={-80}
    max={80}
    step={1}
    onChange={(v) => (mut().earth.position[2] = v)}
  />
  <ParamSlider
    label="Radius"
    value={cfg.earth.radius}
    min={1}
    max={20}
    step={0.5}
    onChange={(v) => (mut().earth.radius = v)}
  />
  <ParamColor
    label="Rim color"
    value={cfg.earth.rimColor}
    onChange={(v) => (mut().earth.rimColor = v)}
  />
  <ParamSlider
    label="Rim intensity"
    value={cfg.earth.rimIntensity}
    min={0}
    max={3}
    step={0.1}
    onChange={(v) => (mut().earth.rimIntensity = v)}
  />
  <ParamSlider
    label="Rotation speed"
    value={cfg.earth.rotationSpeed}
    min={0}
    max={0.2}
    step={0.005}
    onChange={(v) => (mut().earth.rotationSpeed = v)}
  />
</ParamPanel>

<ParamPanel
  title="Nebula"
  defaultOpen={false}
  enabled={cfg.nebula.enabled}
  onToggle={(v) => (mut().nebula.enabled = v)}
>
  <ParamColor
    label="Color 1"
    value={cfg.nebula.color1}
    onChange={(v) => (mut().nebula.color1 = v)}
  />
  <ParamColor
    label="Color 2"
    value={cfg.nebula.color2}
    onChange={(v) => (mut().nebula.color2 = v)}
  />
  <ParamSlider
    label="Opacity"
    value={cfg.nebula.opacity}
    min={0}
    max={0.5}
    step={0.01}
    onChange={(v) => (mut().nebula.opacity = v)}
  />
  <ParamSlider
    label="Scale"
    value={cfg.nebula.scale}
    min={0.2}
    max={3}
    step={0.1}
    onChange={(v) => (mut().nebula.scale = v)}
  />
  <ParamSlider
    label="Animation speed"
    value={cfg.nebula.animationSpeed}
    min={0}
    max={0.1}
    step={0.005}
    onChange={(v) => (mut().nebula.animationSpeed = v)}
  />
</ParamPanel>

<ParamPanel title="Star Drift">
  <ParamSlider
    label="Count"
    value={cfg.particles.starDrift.count}
    min={0}
    max={500}
    step={10}
    onChange={(v) => (mut().particles.starDrift.count = v)}
  />
  <ParamSlider
    label="Speed"
    value={cfg.particles.starDrift.speed}
    min={0}
    max={0.2}
    step={0.005}
    onChange={(v) => (mut().particles.starDrift.speed = v)}
  />
  {#each cfg.particles.starDrift.colors as _, i}
    <ParamColor
      label={`Star ${i + 1}`}
      value={cfg.particles.starDrift.colors[i]!}
      onChange={(v) => (mut().particles.starDrift.colors[i] = v)}
    />
  {/each}
</ParamPanel>

<ParamPanel title="Cosmic Dust" defaultOpen={false}>
  {#if cfg.particles.cosmicDust}
    <ParamSlider
      label="Count"
      value={cfg.particles.cosmicDust.count}
      min={0}
      max={300}
      step={10}
      onChange={(v) => {
        const p = mut().particles.cosmicDust;
        if (p) p.count = v;
      }}
    />
    <ParamSlider
      label="Speed"
      value={cfg.particles.cosmicDust.speed}
      min={0}
      max={0.1}
      step={0.005}
      onChange={(v) => {
        const p = mut().particles.cosmicDust;
        if (p) p.speed = v;
      }}
    />
  {/if}
</ParamPanel>

{#if cfg.particles.energyParticles}
  <ParamPanel
    title="Energy Particles"
    defaultOpen={false}
    enabled={cfg.particles.energyParticles.enabled}
    onToggle={(v) => {
      const p = mut().particles.energyParticles;
      if (p) p.enabled = v;
    }}
  >
    <ParamSlider
      label="Count"
      value={cfg.particles.energyParticles.count}
      min={0}
      max={200}
      step={5}
      onChange={(v) => {
        const p = mut().particles.energyParticles;
        if (p) p.count = v;
      }}
    />
    <ParamSlider
      label="Rise speed"
      value={cfg.particles.energyParticles.riseSpeed}
      min={0}
      max={2}
      step={0.05}
      onChange={(v) => {
        const p = mut().particles.energyParticles;
        if (p) p.riseSpeed = v;
      }}
    />
    <ParamSlider
      label="Max height"
      value={cfg.particles.energyParticles.maxHeight}
      min={1}
      max={10}
      step={0.5}
      onChange={(v) => {
        const p = mut().particles.energyParticles;
        if (p) p.maxHeight = v;
      }}
    />
    {#each cfg.particles.energyParticles.colors as _, i}
      <ParamColor
        label={`Glow ${i + 1}`}
        value={cfg.particles.energyParticles.colors[i]!}
        onChange={(v) => {
          const p = mut().particles.energyParticles;
          if (p) p.colors[i] = v;
        }}
      />
    {/each}
  </ParamPanel>
{/if}

{#if cfg.particles.meteorStreaks}
  <ParamPanel
    title="Meteor Streaks"
    defaultOpen={false}
    enabled={cfg.particles.meteorStreaks.enabled}
    onToggle={(v) => {
      const p = mut().particles.meteorStreaks;
      if (p) p.enabled = v;
    }}
  >
    <ParamSlider
      label="Frequency"
      value={cfg.particles.meteorStreaks.frequency}
      min={1}
      max={30}
      step={1}
      onChange={(v) => {
        const p = mut().particles.meteorStreaks;
        if (p) p.frequency = v;
      }}
    />
    <ParamSlider
      label="Speed"
      value={cfg.particles.meteorStreaks.speed}
      min={5}
      max={40}
      step={1}
      onChange={(v) => {
        const p = mut().particles.meteorStreaks;
        if (p) p.speed = v;
      }}
    />
    <ParamSlider
      label="Trail length"
      value={cfg.particles.meteorStreaks.trailLength}
      min={0.5}
      max={10}
      step={0.5}
      onChange={(v) => {
        const p = mut().particles.meteorStreaks;
        if (p) p.trailLength = v;
      }}
    />
  </ParamPanel>
{/if}

<ParamPanel title="Hemisphere Light" defaultOpen={false}>
  <ParamColor
    label="Sky"
    value={cfg.lighting.ambient.skyColor}
    onChange={(v) => (mut().lighting.ambient.skyColor = v)}
  />
  <ParamColor
    label="Ground"
    value={cfg.lighting.ambient.groundColor}
    onChange={(v) => (mut().lighting.ambient.groundColor = v)}
  />
  <ParamSlider
    label="Intensity"
    value={cfg.lighting.ambient.intensity}
    min={0}
    max={3}
    step={0.05}
    onChange={(v) => (mut().lighting.ambient.intensity = v)}
  />
</ParamPanel>

<ParamPanel
  title="Cold Directional Light"
  defaultOpen={false}
  enabled={cfg.lighting.coldDirectional.enabled}
  onToggle={(v) => (mut().lighting.coldDirectional.enabled = v)}
>
  <ParamColor
    label="Color"
    value={cfg.lighting.coldDirectional.color}
    onChange={(v) => (mut().lighting.coldDirectional.color = v)}
  />
  <ParamSlider
    label="Intensity"
    value={cfg.lighting.coldDirectional.intensity}
    min={0}
    max={3}
    step={0.05}
    onChange={(v) => (mut().lighting.coldDirectional.intensity = v)}
  />
</ParamPanel>

<ParamPanel
  title="Warm Station Glow"
  defaultOpen={false}
  enabled={cfg.lighting.warmStation.enabled}
  onToggle={(v) => (mut().lighting.warmStation.enabled = v)}
>
  <ParamColor
    label="Color"
    value={cfg.lighting.warmStation.color}
    onChange={(v) => (mut().lighting.warmStation.color = v)}
  />
  <ParamSlider
    label="Intensity"
    value={cfg.lighting.warmStation.intensity}
    min={0}
    max={50}
    step={1}
    onChange={(v) => (mut().lighting.warmStation.intensity = v)}
  />
  <ParamSlider
    label="Distance"
    value={cfg.lighting.warmStation.distance}
    min={1}
    max={30}
    step={1}
    onChange={(v) => (mut().lighting.warmStation.distance = v)}
  />
  <ParamSlider
    label="Height"
    value={cfg.lighting.warmStation.heightOffset}
    min={0}
    max={3}
    step={0.1}
    onChange={(v) => (mut().lighting.warmStation.heightOffset = v)}
  />
</ParamPanel>

<ParamPanel
  title="Accent Emissive"
  defaultOpen={false}
  enabled={cfg.lighting.accentEmissive.enabled}
  onToggle={(v) => (mut().lighting.accentEmissive.enabled = v)}
>
  <ParamColor
    label="Color"
    value={cfg.lighting.accentEmissive.color}
    onChange={(v) => (mut().lighting.accentEmissive.color = v)}
  />
  <ParamSlider
    label="Intensity"
    value={cfg.lighting.accentEmissive.intensity}
    min={0}
    max={3}
    step={0.05}
    onChange={(v) => (mut().lighting.accentEmissive.intensity = v)}
  />
  <ParamSlider
    label="Pulse speed"
    value={cfg.lighting.accentEmissive.pulseSpeed}
    min={0}
    max={3}
    step={0.1}
    onChange={(v) => (mut().lighting.accentEmissive.pulseSpeed = v)}
  />
</ParamPanel>

<style>
  .variant-strip {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
  }

  .variant-strip button {
    flex: 1;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .variant-strip button.active {
    background: var(--theme-accent, #38bdf8);
    color: white;
    border-color: transparent;
  }
</style>
