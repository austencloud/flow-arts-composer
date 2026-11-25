<script lang="ts">
  /**
   * The sky over the site, and the light it sheds.
   *
   * Draws the dome (gradient, sun, moon, then stars, then lit clouds over them)
   * and captures that same sky, with the ground's own colour under the horizon,
   * as the scene's environment. Everything standing on the site is then lit by
   * the sky it stands under: warm from the sun's side, cool from the other.
   */
  import { onDestroy, untrack } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import {
    BackSide,
    Mesh,
    PMREMGenerator,
    Scene,
    ShaderMaterial,
    SphereGeometry,
    SRGBColorSpace,
    TextureLoader,
    Vector3,
    type Camera,
    type Texture,
    type WebGLRenderer,
    type WebGLRenderTarget,
  } from "three";
  import Starfield from "#lib/shared/3d/environments/primitives/Starfield.svelte";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { JAM_MOON_DIRECTION } from "../../flow-fest-jam/flow-fest-jam-light";
  import type { LookRecipe } from "./site-walk-look";
  import {
    SKY_BASE_GLSL,
    SKY_CLOUD_GLSL,
    applySky,
    createSkyUniforms,
  } from "./site-walk-sky-shader";

  interface Props {
    look: LookRecipe;
  }
  const props: Props = $props();

  const { scene, renderer, camera } = useThrelte() as unknown as {
    scene: Scene;
    renderer: WebGLRenderer;
    camera: { current: Camera };
  };

  const RADIUS = 9000;
  const uniforms = createSkyUniforms();
  const moonTexture = new TextureLoader().load(
    "/textures/autumn/moon-512.png",
    (t: Texture) => {
      t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
    }
  );

  const vertexShader = /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const domeMaterial = new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uMoonMap: { value: moonTexture },
      uMoonDir: { value: new Vector3(...JAM_MOON_DIRECTION).normalize() },
      uMoon: { value: 0 },
    },
    vertexShader,
    fragmentShader: /* glsl */ `
      ${SKY_BASE_GLSL}
      uniform vec3 uDisk;
      uniform float uDiskCos;
      uniform sampler2D uMoonMap;
      uniform vec3 uMoonDir;
      uniform float uMoon;
      uniform sampler2D uNoise;
      uniform vec3 uGround;
      varying vec3 vDir;

      // Woods a long way off, mostly air by now: the horizon is never a ruled line.
      float woods(float turn, float repeats, float shift) {
        float broad = texture2D(uNoise, vec2(turn * repeats, shift)).r;
        float crowns = texture2D(uNoise, vec2(turn * repeats * 6.0, shift + 0.31)).g;
        float twigs = texture2D(uNoise, vec2(turn * repeats * 38.0, shift + 0.7)).b;
        return smoothstep(0.2, 0.75, broad) * 0.5 + crowns * 0.4 + (twigs - 0.5) * 0.22;
      }

      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyBase(d, 1.0);
        float mu = dot(d, uSunDir);
        float edge = (1.0 - uDiskCos) * 0.18 + 1e-6;
        col += uDisk * smoothstep(uDiskCos - edge, uDiskCos + edge, mu) * smoothstep(-0.005, 0.01, d.y);
        float facing = dot(d, uMoonDir);
        if (uMoon > 0.001 && facing > 0.9) {
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
          vec3 up = cross(uMoonDir, right);
          vec2 p = vec2(dot(d, right), dot(d, up)) / 0.0155;
          float r = length(p);
          vec4 m = texture2D(uMoonMap, p * vec2(0.5, 0.5) + 0.5);
          float disk = 1.0 - smoothstep(0.96, 1.0, r);
          vec3 face = pow(max(m.rgb, vec3(0.0)), vec3(0.8)) * vec3(0.92, 0.96, 1.05) * 2.4;
          col = mix(col, face, disk * m.a * uMoon);
          col += vec3(0.55, 0.68, 0.95) * uMoon * (1.0 - disk) * (0.16 * exp(-max(r - 1.0, 0.0) * 0.9) + 0.05 * exp(-max(r - 1.0, 0.0) * 0.14));
        }
        if (d.y < 0.05) {
          float turn = atan(d.z, d.x) / 6.2831853;
          vec3 air = skyBase(normalize(vec3(d.x, 0.012, d.z)), 0.75);
          vec3 dark = uGround * 0.16;
          // Tall twigs thin out toward the top, so the edge is brushed rather than cut.
          float far = 0.004 + 0.012 * woods(turn, 3.0, 0.13);
          float near = 0.001 + 0.017 * woods(turn, 5.0, 0.57);
          col = mix(col, mix(air, dark, 0.26), smoothstep(far + 0.0022, far - 0.0022, d.y));
          col = mix(col, mix(air, dark, 0.44), smoothstep(near + 0.0030, near - 0.0026, d.y));
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

  const cloudMaterial = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${SKY_BASE_GLSL}
      ${SKY_CLOUD_GLSL}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        gl_FragColor = cloudsAt(d, skyBase(d, 1.0));
      }
    `,
    side: BackSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

  const geometry = new SphereGeometry(RADIUS, 48, 32);

  // ------------------------------------------------------------ the sky as light

  const captureMaterial = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: /* glsl */ `
      ${SKY_BASE_GLSL}
      ${SKY_CLOUD_GLSL}
      uniform vec3 uGround;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        // The key light already stands for the sun, so only its wide glow goes into the sky light.
        vec3 sky = skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z)), 0.45);
        vec4 c = cloudsAt(d, sky);
        sky = sky * (1.0 - c.a) + c.rgb;
        vec3 col = mix(uGround, sky, smoothstep(-0.06, 0.04, d.y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const captureGeometry = new SphereGeometry(40, 48, 32);
  const captureScene = new Scene();
  captureScene.add(new Mesh(captureGeometry, captureMaterial));
  let captured: WebGLRenderTarget | null = null;

  function capture(): void {
    const pmrem = new PMREMGenerator(renderer);
    const next = pmrem.fromScene(captureScene, 0.015, 0.1, 100);
    pmrem.dispose();
    scene.environment = next.texture;
    captured?.dispose();
    captured = next;
  }

  $effect(() => {
    const look = props.look;
    applySky(uniforms, look);
    domeMaterial.uniforms.uMoon!.value = look.sky.moon;
    scene.environmentIntensity = look.environment;
    untrack(capture);
  });

  let domes = $state.raw<Mesh[]>([]);
  const dome = new Mesh(geometry, domeMaterial);
  const clouds = new Mesh(geometry, cloudMaterial);
  for (const mesh of [dome, clouds]) mesh.frustumCulled = false;
  domes = [dome, clouds];

  const still = reducedMotion();
  useTask((delta) => {
    const at = camera.current?.position;
    if (at) for (const mesh of domes) mesh.position.copy(at);
    if (!still) uniforms.uTime!.value += Math.min(delta, 0.1);
  });

  onDestroy(() => {
    if (captured && scene.environment === captured.texture)
      scene.environment = null;
    captured?.dispose();
    geometry.dispose();
    captureGeometry.dispose();
    domeMaterial.dispose();
    cloudMaterial.dispose();
    captureMaterial.dispose();
    moonTexture.dispose();
  });

  const stars = $derived({
    enabled: props.look.sky.stars > 0.02,
    count: 2600,
    radius: 4000,
    sizeRange: [0.6, 2.2] as [number, number],
    twinkleSpeed: 0.6,
    intensity: props.look.sky.stars,
    horizonSpread: 0.5,
  });
</script>

<!-- Group order: the dome, the stars on it, the clouds in front of both, then the site. -->
<T.Group renderOrder={-3}><T is={dome} /></T.Group>
<T.Group renderOrder={-2}><Starfield config={stars} /></T.Group>
<T.Group renderOrder={-1}><T is={clouds} /></T.Group>
