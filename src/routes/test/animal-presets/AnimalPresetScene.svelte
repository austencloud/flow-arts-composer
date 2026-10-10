<script lang="ts">
  import { T } from "@threlte/core";
  import SceneEffectsCoordinator3D from "#lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte";
  import { setSceneEffectsContext } from "#lib/shared/3d/effects/scene-effects/scene-effects-context.js";
  import { SceneEffectsManager3D } from "#lib/shared/3d/effects/scene-effects/scene-effects-manager-3d.js";
  import { ANIMAL_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/animal-presets.js";
  import CellLabel3D from "../effect-grid/CellLabel3D.svelte";
  import AnimalPresetStation from "./AnimalPresetStation.svelte";

  interface Props {
    showProps: boolean;
    playing: boolean;
    showLabels: boolean;
    centerPlanes: number;
    portraitLayout: boolean;
  }

  const props: Props = $props();
  const sceneEffectsManager = setSceneEffectsContext(
    new SceneEffectsManager3D()
  );

  const SPACING_X = 8.8;
  const SPACING_Z = 6.2;

  function position(index: number): { x: number; z: number } {
    const columns = props.portraitLayout ? 2 : 3;
    const rows = Math.ceil(ANIMAL_PRESETS.length / columns);
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      x: (col - (columns - 1) / 2) * SPACING_X,
      z: (row - (rows - 1) / 2) * SPACING_Z,
    };
  }

  function labelColor(previewColor: string): string {
    if (previewColor === "rainbow") return "#ffffff";
    const rgb = Number.parseInt(previewColor.slice(1), 16);
    const brightestChannel = Math.max(
      (rgb >> 16) & 0xff,
      (rgb >> 8) & 0xff,
      rgb & 0xff
    );
    return brightestChannel < 72 ? "#7f8dbd" : previewColor;
  }
</script>

<SceneEffectsCoordinator3D manager={sceneEffectsManager} />

<!-- Neutral lighting keeps palette differences visible without flattening the anatomy. -->
<T.AmbientLight intensity={0.22} color="#172033" />
<T.DirectionalLight position={[7, 15, 10]} intensity={0.42} color="#d7e1ff" />
<T.DirectionalLight position={[-9, 8, -6]} intensity={0.16} color="#9a78ff" />

{#each ANIMAL_PRESETS as preset, index (preset.id)}
  {@const pos = position(index)}

  <T.Mesh position={[pos.x, 0.01, pos.z]} rotation.x={-Math.PI / 2}>
    <T.RingGeometry args={[2.05, 2.18, 64]} />
    <T.MeshBasicMaterial
      color={preset.previewColor === "rainbow"
        ? "#ffffff"
        : preset.previewColor}
      transparent
      opacity={0.32}
    />
  </T.Mesh>

  {#if props.showLabels}
    <CellLabel3D
      text={preset.name}
      color={labelColor(preset.previewColor)}
      position={[pos.x, 0.35, pos.z + 2.5]}
      height={0.66}
    />
  {/if}

  <AnimalPresetStation
    {preset}
    stationId={`animal-preset-${preset.id}`}
    worldX={pos.x}
    worldZ={pos.z}
    showProps={props.showProps}
    playing={props.playing}
    centerPlanes={props.centerPlanes}
  />
{/each}
