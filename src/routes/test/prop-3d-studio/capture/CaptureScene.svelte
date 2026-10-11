<!--
  Build-preview capture scene. Renders one prop through the real Prop3D
  dispatcher (same models the studio shows), auto-framed against the picker
  tile's background so screenshots drop straight into
  static/images/props/build-previews/.

  The camera re-frames every task tick: GLTF-tier props stream in after
  mount, so a one-shot fit would frame an empty box. Once the bounding box
  has been non-empty and stable for FRAMES_STABLE ticks, the page flags
  document.body.dataset.captureReady for the capture driver.
-->
<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import EffectOrchestrator3D from "#lib/shared/3d/effects/EffectOrchestrator3D.svelte";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import {
    Box3,
    Color,
    Group,
    PerspectiveCamera,
    Vector3,
    Quaternion,
  } from "three";
  import {
    Plane,
    Prop3D,
    propFinishState,
    type PropType,
  } from "@austencloud/scene-3d";

  interface Props {
    propType: PropType;
    /** Presentation rotation of the whole prop, degrees. */
    rotationDeg: { x: number; y: number; z: number };
    /** Multiplier on the auto-framed camera distance. <1 zooms in. */
    zoom: number;
    /** Mount the production LED effect path for optical-reference captures. */
    ledActive: boolean;
    /** Addressable pattern used by the live LED capture. */
    ledPattern: "prop-colors" | "rainbow-sweep";
  }

  let { propType, rotationDeg, zoom, ledActive, ledPattern }: Props = $props();

  const effectsConfig = createEffectsConfigState(
    {
      ...DEFAULT_EFFECTS_CONFIG,
      led: {
        ...DEFAULT_EFFECTS_CONFIG.led,
        pattern: {
          ...DEFAULT_EFFECTS_CONFIG.led.pattern,
          generatorId: ledPattern,
        },
        look: { ...DEFAULT_EFFECTS_CONFIG.led.look, brightness: 5 },
      },
      tipEffectMap: { "*": { effect: "led" } },
      activeEffect: "led",
    },
    { persist: false }
  );
  setEffectsConfigContext(effectsConfig);

  const LED_TIP_EFFECT_MAP: TipEffectMap = { "*": { effect: "led" } };

  const FOV_DEG = 28;
  const MARGIN = 1.1;
  const FRAMES_STABLE = 30;

  const { scene, size: canvasSize } = useThrelte();
  scene.background = new Color("#070911");

  const propState = {
    centerPathAngle: 0,
    staffRotationAngle: 0,
    plane: Plane.WALL,
    worldPosition: new Vector3(0, 0, 0),
    worldRotation: new Quaternion(),
  };

  let propGroup = $state<Group | undefined>(undefined);
  let effectsGroup = $state<Group | undefined>(undefined);
  let camera = $state<PerspectiveCamera | undefined>(undefined);
  const propBuild = $derived(propFinishState.build);

  const rotationRad = $derived({
    x: (rotationDeg.x * Math.PI) / 180,
    y: (rotationDeg.y * Math.PI) / 180,
    z: (rotationDeg.z * Math.PI) / 180,
  });

  const box = new Box3();
  const center = new Vector3();
  const size = new Vector3();
  let lastSizeKey = "";
  let stableFrames = 0;

  useTask(() => {
    if (!propGroup || !camera) return;

    // Frame the physical prop only. Imperative effect renderers keep warm
    // meshes and zero-count buffers at the origin; including those invisible
    // allocations would pull the camera off the visible fan.
    box.setFromObject(propGroup);
    if (box.isEmpty()) return;

    box.getCenter(center);
    box.getSize(size);

    const halfFov = (FOV_DEG * Math.PI) / 360;
    const aspect =
      $canvasSize.height > 0 ? $canvasSize.width / $canvasSize.height : 1;
    const halfHFov = Math.atan(Math.tan(halfFov) * aspect);
    const distForHeight = size.y / 2 / Math.tan(halfFov);
    const distForWidth = size.x / 2 / Math.tan(halfHFov);
    const distance =
      (Math.max(distForHeight, distForWidth) * MARGIN + size.z / 2) * zoom;

    camera.position.set(center.x, center.y, center.z + distance);
    camera.lookAt(center);

    const sizeKey = `${size.x.toFixed(3)}:${size.y.toFixed(3)}:${size.z.toFixed(3)}`;
    if (sizeKey === lastSizeKey) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      lastSizeKey = sizeKey;
    }

    document.body.dataset.captureSize = sizeKey;
    document.body.dataset.captureStableFrames = String(stableFrames);
    document.body.dataset.captureReady =
      stableFrames >= FRAMES_STABLE ? "1" : "0";
  });
</script>

<T.PerspectiveCamera
  bind:ref={camera}
  makeDefault
  fov={FOV_DEG}
  near={0.01}
  far={100}
  position={[0, 0, 4]}
/>

<T.AmbientLight intensity={0.7} color="#ffffff" />
<T.DirectionalLight position={[2.5, 3, 4]} intensity={1.5} color="#ffffff" />
<T.DirectionalLight position={[-3, 1, 2]} intensity={0.55} color="#dfe6ff" />
<T.DirectionalLight position={[0, 2, -4]} intensity={0.8} color="#ffffff" />

<T.Group rotation={[rotationRad.x, rotationRad.y, rotationRad.z]}>
  <T.Group bind:ref={propGroup}>
    <Prop3D
      {propType}
      {propState}
      color="blue"
      isActivePlayer
      build={propBuild}
    />
  </T.Group>
  <T.Group bind:ref={effectsGroup}>
    {#if ledActive && effectsGroup}
      <EffectOrchestrator3D
        leftPropState={propState}
        rightPropState={null}
        leftPropType={propType}
        rightPropType={propType}
        isPlaying
        {propBuild}
        tipEffectMap={LED_TIP_EFFECT_MAP}
        effectsParentRef={effectsGroup}
        qualityTierOverride="high"
      />
    {/if}
  </T.Group>
</T.Group>
