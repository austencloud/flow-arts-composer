<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { onDestroy } from "svelte";
  import {
    AdditiveBlending,
    Color,
    PlaneGeometry,
    ShaderMaterial,
    Vector2,
    type WebGLRenderer,
  } from "three";
  import type { MeteorStreaksConfig } from "../../domain/models/scene-configs";

  interface Props {
    config: MeteorStreaksConfig;
    /** Increment to launch a meteor immediately in visual-test harnesses. */
    trigger?: number;
  }

  interface Meteor {
    active: boolean;
    age: number;
    duration: number;
    startX: number;
    startY: number;
    angle: number;
    horizontalDirection: -1 | 1;
    travelDistance: number;
    material: ShaderMaterial;
  }

  let { config, trigger = 0 }: Props = $props();

  const { renderer } = useThrelte() as unknown as {
    renderer: WebGLRenderer;
  };

  const POOL_SIZE = 5;
  const viewportSize = new Vector2();
  const streakGeometry = new PlaneGeometry(1, 1);

  const vertexShader = /* glsl */ `
    uniform vec2 uHead;
    uniform vec2 uDirection;
    uniform vec2 uNormal;
    uniform float uTrailLength;
    uniform float uTrailWidth;

    varying vec2 vUv;

    void main() {
      vUv = uv;

      // The head and tail share one rigid screen-space axis. Since every pixel
      // comes from this single quad, the trail cannot kink when the camera moves.
      float behindHead = (position.x - 0.5) * uTrailLength;
      vec2 clipPosition = uHead
        + uDirection * behindHead
        + uNormal * position.y * uTrailWidth;

      // Sky depth lets foreground geometry hide the meteor while keeping the
      // streak independent of the viewer's position inside the scene.
      gl_Position = vec4(clipPosition, 0.9999, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform vec3 uColor;
    uniform float uBrightness;
    uniform float uOpacity;
    uniform float uTrailLength;
    uniform float uTrailWidth;

    varying vec2 vUv;

    void main() {
      float across = abs(vUv.y - 0.5) * 2.0;
      float halo = exp(-across * across * 7.0);
      float core = exp(-across * across * 105.0);

      // A continuous longitudinal fade replaces the old chain of line samples.
      // The result is one tapered tail, with no joints or point-sized beads.
      float taper = pow(smoothstep(0.0, 1.0, vUv.x), 1.7);
      float tail = taper * (core * 0.88 + halo * 0.12);

      float lengthToWidth = uTrailLength / max(uTrailWidth, 0.0001);
      vec2 fromHead = vec2(
        (vUv.x - 0.965) * lengthToWidth,
        (vUv.y - 0.5) * 2.0
      );
      float headGlow = exp(-dot(fromHead, fromHead) * 2.6);
      float headCore = exp(-dot(fromHead, fromHead) * 22.0);

      float light = tail + headGlow * 0.5 + headCore * 1.25;
      float alpha = min(light, 1.0) * uOpacity;
      if (alpha < 0.002) discard;

      gl_FragColor = vec4(uColor * uBrightness * light, alpha);
    }
  `;

  function createMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uHead: { value: new Vector2() },
        uDirection: { value: new Vector2(1, 0) },
        uNormal: { value: new Vector2(0, 1) },
        uTrailLength: { value: 0.2 },
        uTrailWidth: { value: 0.01 },
        uColor: { value: new Color("#ffffff") },
        uBrightness: { value: 1 },
        uOpacity: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
  }

  const pool: Meteor[] = Array.from({ length: POOL_SIZE }, () => ({
    active: false,
    age: 0,
    duration: 1,
    startX: 0,
    startY: 0,
    angle: 0,
    horizontalDirection: 1,
    travelDistance: 1,
    material: createMaterial(),
  }));

  let timeSinceSpawn = 0;
  let nextSpawnIn = randomSpawnInterval();
  let lastTrigger = trigger;

  function randomSpawnInterval(): number {
    return config.frequency * (0.65 + Math.random() * 0.7);
  }

  function spawnMeteor(meteor: Meteor, makeEasyToSee = false): void {
    const horizontalDirection: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const color =
      config.colors[Math.floor(Math.random() * config.colors.length)] ??
      "#ffffff";

    meteor.active = true;
    meteor.age = 0;
    meteor.duration = Math.max(0.55, Math.min(1.2, 1.4 - config.speed * 0.04));
    meteor.angle = 0.16 + Math.random() * 0.18;
    meteor.horizontalDirection = horizontalDirection;
    meteor.travelDistance = 0.95 + Math.random() * 0.35;
    meteor.startX = makeEasyToSee
      ? horizontalDirection * -0.4
      : horizontalDirection * (-0.9 + Math.random() * 0.45);
    meteor.startY = makeEasyToSee
      ? 0.35 + Math.random() * 0.35
      : 0.18 + Math.random() * 0.62;
    meteor.material.uniforms.uColor!.value.set(color);
    meteor.material.uniforms.uBrightness!.value = config.brightness ?? 1;
  }

  function hideMeteor(meteor: Meteor): void {
    meteor.active = false;
    meteor.material.uniforms.uOpacity!.value = 0;
  }

  $effect(() => {
    if (trigger === lastTrigger) return;
    lastTrigger = trigger;

    if (!config.enabled) return;
    const meteor = pool.find((candidate) => !candidate.active) ?? pool[0];
    if (meteor) spawnMeteor(meteor, true);
  });

  useTask((delta) => {
    if (!config.enabled) {
      for (const meteor of pool) hideMeteor(meteor);
      return;
    }

    renderer.getSize(viewportSize);
    const width = Math.max(1, viewportSize.x);
    const height = Math.max(1, viewportSize.y);
    const aspect = width / height;

    timeSinceSpawn += delta;
    if (timeSinceSpawn >= nextSpawnIn) {
      const idle = pool.find((meteor) => !meteor.active);
      if (idle) spawnMeteor(idle);
      timeSinceSpawn = 0;
      nextSpawnIn = randomSpawnInterval();
    }

    for (const meteor of pool) {
      if (!meteor.active) continue;

      meteor.age += delta;
      const progress = meteor.age / meteor.duration;
      if (progress >= 1) {
        hideMeteor(meteor);
        continue;
      }

      const cos = Math.cos(meteor.angle);
      const sin = Math.sin(meteor.angle);
      const directionX = (meteor.horizontalDirection * cos) / aspect;
      const directionY = -sin;
      const normalX = sin / aspect;
      const normalY = meteor.horizontalDirection * cos;
      const headX =
        meteor.startX + directionX * meteor.travelDistance * progress;
      const headY =
        meteor.startY + directionY * meteor.travelDistance * progress;
      const fadeIn = smoothstep(0, 0.08, progress);
      const fadeOut = 1 - smoothstep(0.7, 1, progress);
      const trailLength = Math.max(
        0.16,
        Math.min(0.34, 0.1 + config.trailLength * 0.012)
      );
      const trailWidthPixels = Math.max(4, (config.headSize ?? 7) * 0.85);

      meteor.material.uniforms.uHead!.value.set(headX, headY);
      meteor.material.uniforms.uDirection!.value.set(directionX, directionY);
      meteor.material.uniforms.uNormal!.value.set(normalX, normalY);
      meteor.material.uniforms.uTrailLength!.value = trailLength;
      meteor.material.uniforms.uTrailWidth!.value =
        (trailWidthPixels * 2) / height;
      meteor.material.uniforms.uBrightness!.value = config.brightness ?? 1;
      meteor.material.uniforms.uOpacity!.value = fadeIn * fadeOut;
    }
  });

  function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  onDestroy(() => {
    streakGeometry.dispose();
    for (const meteor of pool) meteor.material.dispose();
  });
</script>

{#each pool as meteor}
  <T.Mesh
    geometry={streakGeometry}
    material={meteor.material}
    renderOrder={-0.5}
    frustumCulled={false}
  />
{/each}
