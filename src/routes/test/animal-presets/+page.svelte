<script lang="ts">
  import { Canvas, T } from "@threlte/core";
  import { WebGLRenderer } from "three";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { ANIMAL_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/animal-presets.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import AnimalPresetScene from "./AnimalPresetScene.svelte";

  let showProps = $state(true);
  let playing = $state(true);
  let showLabels = $state(true);
  let centerPlanes = $state(1);
  let viewportWidth = $state(1920);
  let viewportHeight = $state(1080);

  const portraitLayout = $derived(viewportHeight / viewportWidth > 1.15);
  const cameraDistanceScale = $derived(portraitLayout ? 1.5 : 1);
  const cameraPosition = $derived([
    0,
    11.8 * cameraDistanceScale,
    10.8 * cameraDistanceScale,
  ] as const);

  const boolOptions = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
  const planeOptions = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
  ];

  function percent(value: number | undefined, fallback: number): string {
    return `${Math.round((value ?? fallback) * 100)}%`;
  }
</script>

<svelte:head>
  <title>Animal presets | 3D comparison</title>
</svelte:head>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<main class="harness">
  <header>
    <p class="eyebrow">3D EFFECT REVIEW</p>
    <h1>Animal presets</h1>
    <p class="intro">
      Six production looks. Every preset runs the same motion under one camera
      and one light rig. Orbit the stage to inspect the anatomy.
    </p>
  </header>

  <section class="stage" aria-label="Animated comparison of all Animal presets">
    <Canvas
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        })}
    >
      <T.PerspectiveCamera makeDefault position={cameraPosition} fov={50}>
        <OrbitControls
          enableDamping
          target={[0, 0.65, 0]}
          maxPolarAngle={Math.PI / 2}
        />
      </T.PerspectiveCamera>
      <AnimalPresetScene
        {showProps}
        {playing}
        {showLabels}
        {centerPlanes}
        {portraitLayout}
      />
    </Canvas>
  </section>

  <section class="controls" aria-label="Comparison controls">
    <label class="control">
      <span>Props</span>
      <SegmentedControl
        options={boolOptions}
        value={showProps}
        onchange={(value) => (showProps = value)}
        size="sm"
        ariaLabel="Show props"
      />
    </label>
    <label class="control">
      <span>Playing</span>
      <SegmentedControl
        options={boolOptions}
        value={playing}
        onchange={(value) => (playing = value)}
        size="sm"
        ariaLabel="Play Animal presets"
      />
    </label>
    <label class="control">
      <span>Labels</span>
      <SegmentedControl
        options={boolOptions}
        value={showLabels}
        onchange={(value) => (showLabels = value)}
        size="sm"
        ariaLabel="Show preset labels"
      />
    </label>
    <label class="control">
      <span>Overlay</span>
      <SegmentedControl
        options={planeOptions}
        value={centerPlanes}
        onchange={(value) => (centerPlanes = value)}
        size="sm"
        ariaLabel="Overlaid rigs per preset"
      />
    </label>
  </section>

  <ol class="preset-grid" aria-label="Animal preset settings">
    {#each ANIMAL_PRESETS as preset (preset.id)}
      {@const patch = preset.patch}
      <li style:--preset-accent={preset.previewColor}>
        <div class="preset-heading">
          <span class="swatch" aria-hidden="true"></span>
          <strong>{preset.name}</strong>
          <code
            >{patch?.creature ?? DEFAULT_EFFECTS_CONFIG.animal.creature}</code
          >
        </div>
        <dl>
          <div>
            <dt>Palette</dt>
            <dd>{patch?.palette ?? DEFAULT_EFFECTS_CONFIG.animal.palette}</dd>
          </div>
          <div>
            <dt>Body</dt>
            <dd>
              {percent(patch?.width, DEFAULT_EFFECTS_CONFIG.animal.width)}
            </dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>
              {percent(
                patch?.bodyLength,
                DEFAULT_EFFECTS_CONFIG.animal.bodyLength
              )}
            </dd>
          </div>
          <div>
            <dt>Slither</dt>
            <dd>
              {percent(patch?.slither, DEFAULT_EFFECTS_CONFIG.animal.slither)}
            </dd>
          </div>
        </dl>
      </li>
    {/each}
  </ol>
</main>

<style>
  .harness {
    display: flex;
    flex-direction: column;
    gap: 1.15em;
    min-height: 100svh;
    padding: 1.4em;
    background:
      radial-gradient(
        circle at 50% -18%,
        rgba(92, 74, 178, 0.16),
        transparent 38%
      ),
      #070a12;
    color: var(--theme-text, #e8ecf6);
    font-size: clamp(1rem, 0.52rem + 0.42vw, 1.6rem);
  }

  header {
    width: min(72em, 100%);
  }

  .eyebrow {
    margin: 0 0 0.35em;
    color: var(--theme-accent, #9b8cff);
    font-size: 0.75em;
    font-weight: 800;
    letter-spacing: 0.15em;
  }

  h1 {
    margin: 0;
    font-size: 1.75em;
    line-height: 1;
    letter-spacing: -0.025em;
  }

  .intro {
    margin: 0.5em 0 0;
    color: var(--theme-text-secondary, #9fb0cc);
    font-size: 0.95em;
    line-height: 1.45;
  }

  .stage {
    position: relative;
    height: clamp(30rem, 68svh, 118rem);
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.8em;
    background: #04060c;
    box-shadow: 0 1.25em 3.5em rgba(0, 0, 0, 0.28);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75em 1.2em;
  }

  .control {
    display: flex;
    align-items: center;
    gap: 0.55em;
    color: var(--theme-text-secondary, #9fb0cc);
    font-size: 0.9em;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.7em;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .preset-grid li {
    min-width: 0;
    padding: 0.7em 0.8em;
    border: 1px solid color-mix(in srgb, var(--preset-accent) 34%, transparent);
    border-radius: 0.6em;
    background: var(--theme-card-bg, #0d1220);
  }

  .preset-heading {
    display: flex;
    align-items: center;
    gap: 0.45em;
  }

  .preset-heading strong {
    font-size: 0.92em;
  }

  .preset-heading code {
    margin-left: auto;
    color: var(--theme-text-muted, #7d8ba6);
    font-size: 0.75em;
  }

  .swatch {
    width: 0.68em;
    height: 0.68em;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--preset-accent);
    box-shadow: 0 0 0.8em
      color-mix(in srgb, var(--preset-accent) 55%, transparent);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.6em;
    margin: 0.65em 0 0;
  }

  dl div {
    min-width: 0;
  }

  dt {
    color: var(--theme-text-muted, #6f7f9c);
    font-size: 0.68em;
  }

  dd {
    margin: 0.12em 0 0;
    overflow: hidden;
    color: var(--theme-text-secondary, #aebbd0);
    font-size: 0.74em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (min-width: 1680px) {
    .preset-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .harness {
      padding: 1em;
    }

    .preset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .harness {
      padding: 0.8em;
    }

    .stage {
      height: 31rem;
    }

    .preset-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-height: 32rem) and (min-width: 521px) {
    .harness {
      gap: 0.65em;
      padding: 0.7em;
    }

    .intro {
      margin-top: 0.25em;
    }

    .stage {
      height: 18rem;
      min-height: 18rem;
    }
  }
</style>
