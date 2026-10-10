<script lang="ts">
  import { T, useThrelte } from "@threlte/core";
  import { Color, FogExp2 } from "three";

  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import { createDefaultCelestialConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
  import SkyGradient from "#lib/shared/3d/environments/primitives/SkyGradient.svelte";
  import CelestialCloudPanorama from "#lib/shared/3d/environments/scenes/celestial/CelestialCloudPanorama.svelte";
  import CelestialSun from "#lib/shared/3d/environments/scenes/celestial/CelestialSun.svelte";
  import OliveCloudbreakSlice from "#lib/shared/3d/environments/scenes/celestial/OliveCloudbreakSlice.svelte";
  import {
    CLOUDBREAK_LAYOUT,
    CLOUDBREAK_SKY_SUN,
  } from "#lib/shared/3d/environments/scenes/celestial/cloudbreak-layout.js";

  import type { CloudbreakCatalogView } from "./catalog";

  interface Props {
    view: CloudbreakCatalogView;
    onAssetReady?: (id: string) => void;
  }

  let { view, onAssetReady }: Props = $props();

  const config = createDefaultCelestialConfig();
  const { scene } = useThrelte();
  const camera = $derived.by(() => {
    if (view === "front") {
      return {
        position: [2, 7.8, 32] as [number, number, number],
        target: [2, 2, -4.5] as [number, number, number],
        fov: 68,
      };
    }
    if (view === "rear") {
      return {
        position: CLOUDBREAK_LAYOUT.cameraPresets.reverse.position,
        target: CLOUDBREAK_LAYOUT.cameraPresets.reverse.target,
        fov: 66,
      };
    }
    if (view === "plan") {
      return {
        position: CLOUDBREAK_LAYOUT.cameraPresets.plan.position,
        target: CLOUDBREAK_LAYOUT.cameraPresets.plan.target,
        fov: CLOUDBREAK_LAYOUT.cameraPresets.plan.fovDegrees,
      };
    }
    return {
      position: [0, 6.7, 31] as [number, number, number],
      target: [0, 2.1, -1] as [number, number, number],
      fov: 54,
    };
  });

  $effect(() => {
    scene.fog = new FogExp2(config.fog.color, config.fog.density);
    scene.background = new Color(config.sky.topColor);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  });
</script>

<SkyGradient
  topColor={view === "plan" ? "#8fa9ba" : config.sky.topColor}
  midColor={view === "plan" ? "#8fa9ba" : config.sky.midColor}
  bottomColor={view === "plan" ? "#8fa9ba" : config.sky.bottomColor}
  gradientStart={0.08}
  gradientEnd={0.92}
/>
{#if view !== "plan"}
  <CelestialCloudPanorama />
  <CelestialSun
    direction={CLOUDBREAK_SKY_SUN.direction}
    angularDiameterDegrees={CLOUDBREAK_SKY_SUN.angularDiameterDegrees}
    color={CLOUDBREAK_SKY_SUN.color}
  />
{/if}

{#key view}
  <T.PerspectiveCamera
    makeDefault
    position={camera.position}
    fov={camera.fov}
    near={0.1}
    far={240}
  >
    <OrbitControls
      enableDamping
      smoothTime={0.1}
      draggingSmoothTime={0.06}
      target={camera.target}
      minDistance={view === "plan" ? 48 : 9}
      maxDistance={view === "plan" ? 110 : 64}
      maxPolarAngle={Math.PI / 2 + 0.03}
      rotateSpeed={view === "plan" ? 0 : 0.55}
      zoomSpeed={1.05}
      enablePan={view === "plan"}
    />
  </T.PerspectiveCamera>
{/key}

<OliveCloudbreakSlice {view} groundY={0} {onAssetReady} />

<T.HemisphereLight color="#edf4ff" groundColor="#665446" intensity={0.72} />
<T.DirectionalLight
  color="#ffe2ad"
  intensity={4.6}
  position={CLOUDBREAK_LAYOUT.sun.lightPosition}
  castShadow
  shadow.mapSize.width={2048}
  shadow.mapSize.height={2048}
  shadow.camera.near={1}
  shadow.camera.far={180}
  shadow.camera.left={-30}
  shadow.camera.right={30}
  shadow.camera.top={28}
  shadow.camera.bottom={-28}
  shadow.bias={-0.0006}
  shadow.normalBias={0.04}
  shadow.radius={3}
  shadow.intensity={0.82}
/>
<T.DirectionalLight color="#c5d9ee" intensity={0.92} position={[-24, 18, 26]} />
