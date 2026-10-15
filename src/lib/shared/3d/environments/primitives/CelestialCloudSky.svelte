<script lang="ts">
  /** Projects the existing 2D Celestial cloud system onto the shared 3D sky. */

  import { T, useTask, useThrelte } from "@threlte/core";
  import { CelestialBackgroundSystem } from "@austencloud/backgrounds";
  import { onDestroy, onMount, untrack } from "svelte";
  import {
    BackSide,
    CanvasTexture,
    ClampToEdgeWrapping,
    Color,
    RepeatWrapping,
    ShaderMaterial,
    SphereGeometry,
    SRGBColorSpace,
    Vector2,
    type Mesh,
  } from "three";
  import type { SkyCloudConfig } from "../domain/models/environment-models";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "./motion-preference";

  interface Props {
    config: SkyCloudConfig;
    radius?: number;
  }

  let { config, radius = 188 }: Props = $props();

  const logicalDimensions = { width: 2048, height: 1024 };
  const textureDimensions = { width: 1280, height: 640 };
  const textureFrameInterval = 1 / 15;
  const geometry = untrack(() => new SphereGeometry(radius, 64, 36));
  const { camera } = useThrelte();

  let cloudMesh = $state<Mesh>();
  let cloudSystem: CelestialBackgroundSystem | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let texture: CanvasTexture | null = null;
  let material = $state<ShaderMaterial | undefined>();
  let elapsedSinceTextureFrame = textureFrameInterval;

  function prepareCanvasContext(target: CanvasRenderingContext2D): void {
    target.setTransform(
      textureDimensions.width / logicalDimensions.width,
      0,
      0,
      textureDimensions.height / logicalDimensions.height,
      0,
      0
    );
  }

  onMount(() => {
    const canvas = document.createElement("canvas");
    canvas.width = textureDimensions.width;
    canvas.height = textureDimensions.height;
    context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    cloudSystem = new CelestialBackgroundSystem();
    cloudSystem.initialize(logicalDimensions, "high");
    cloudSystem.setLayerVisibility({
      gradient: false,
      clouds: true,
      sunGlow: false,
      atmosphere: false,
      vignette: false,
    });
    cloudSystem.setAccessibility({
      reducedMotion: prefersReducedMotion(),
      highContrast: false,
    });
    prepareCanvasContext(context);
    cloudSystem.draw(context, logicalDimensions);

    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    material = new ShaderMaterial({
      uniforms: {
        uCloudTexture: { value: texture },
        uTint: { value: new Color(config.litColor) },
        uOpacity: { value: config.opacity },
        uOffset: { value: new Vector2(...(config.offset ?? [0, 0])) },
        uHorizonFade: { value: config.horizonFade ?? -0.08 },
        uZenithFade: { value: config.zenithFade ?? 0.9 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vCloudUv;
        varying vec3 vSkyDirection;

        void main() {
          vCloudUv = uv;
          vSkyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uCloudTexture;
        uniform vec3 uTint;
        uniform float uOpacity;
        uniform vec2 uOffset;
        uniform float uHorizonFade;
        uniform float uZenithFade;
        varying vec2 vCloudUv;
        varying vec3 vSkyDirection;

        void main() {
          vec2 cloudUv = vec2(
            fract(vCloudUv.x + uOffset.x),
            clamp(vCloudUv.y + uOffset.y, 0.0, 1.0)
          );
          vec4 cloud = texture2D(uCloudTexture, cloudUv);
          float seamDistance = min(cloudUv.x, 1.0 - cloudUv.x);
          float seamBlend = 1.0 - smoothstep(0.0, 0.1, seamDistance);
          vec4 seamCloud = texture2D(
            uCloudTexture,
            vec2(fract(cloudUv.x + 0.5), cloudUv.y)
          );
          cloud = mix(cloud, seamCloud, seamBlend);
          float horizonMask = smoothstep(
            uHorizonFade,
            uHorizonFade + 0.16,
            normalize(vSkyDirection).y
          );
          float zenithMask = 1.0 - smoothstep(
            uZenithFade,
            min(1.0, uZenithFade + 0.1),
            normalize(vSkyDirection).y
          );
          float alpha = cloud.a * uOpacity * horizonMask * zenithMask;
          gl_FragColor = vec4(cloud.rgb * uTint, alpha);
        }
      `,
      side: BackSide,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
  });

  $effect(() => {
    if (material) {
      material.uniforms.uTint!.value.set(config.litColor);
      material.uniforms.uOpacity!.value = config.opacity;
      material.uniforms.uOffset!.value.set(...(config.offset ?? [0, 0]));
      material.uniforms.uHorizonFade!.value = config.horizonFade ?? -0.08;
      material.uniforms.uZenithFade!.value = config.zenithFade ?? 0.9;
    }
  });

  useTask((delta) => {
    if (cloudMesh && camera.current) {
      cloudMesh.position.copy(camera.current.position);
    }
    if (!config.enabled || !cloudSystem || !context || !texture) return;

    elapsedSinceTextureFrame += delta;
    if (elapsedSinceTextureFrame < textureFrameInterval) return;

    const motionScale = resolveMotionScale(prefersReducedMotion());
    const speedScale = config.driftSpeed / 0.014;
    cloudSystem.update(
      logicalDimensions,
      elapsedSinceTextureFrame * 60 * motionScale * speedScale
    );
    prepareCanvasContext(context);
    cloudSystem.draw(context, logicalDimensions);
    texture.needsUpdate = true;
    elapsedSinceTextureFrame = 0;
  });

  onDestroy(() => {
    cloudSystem?.cleanup();
    texture?.dispose();
    material?.dispose();
    geometry.dispose();
  });
</script>

{#if config.enabled && material}
  <T.Mesh
    bind:ref={cloudMesh}
    {geometry}
    {material}
    renderOrder={-0.5}
    frustumCulled={false}
  />
{/if}
