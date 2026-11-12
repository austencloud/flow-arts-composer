<script lang="ts">
  import { T, useTask, useLoader } from "@threlte/core";
  import {
    SphereGeometry,
    ShaderMaterial,
    BackSide,
    Color,
    AdditiveBlending,
    TextureLoader,
  } from "three";
  import type { EarthConfig } from "../../domain/models/scene-configs";
  import { COSMIC_EARTH_TEXTURE_URL } from "../../worlds/cosmic/cosmic-asset-urls";

  interface Props {
    config: EarthConfig;
    onReady?: () => void;
  }

  let { config, onReady }: Props = $props();

  let geometry = $state<SphereGeometry | null>(null);
  let material = $state<ShaderMaterial | null>(null);

  const textureLoader = useLoader(TextureLoader);
  const earthTex = $derived(textureLoader.load(COSMIC_EARTH_TEXTURE_URL));

  $effect(() => {
    if ($earthTex && onReady) onReady();
  });

  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform sampler2D uEarthMap;
    uniform vec3 uRimColor;
    uniform float uRimIntensity;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vViewDir;

    void main() {
      vec4 texColor = texture2D(uEarthMap, vUv);
      float fresnel = 1.0 - dot(vNormal, vViewDir);
      fresnel = pow(fresnel, 3.0);
      vec3 rim = uRimColor * fresnel * uRimIntensity;
      gl_FragColor = vec4(texColor.rgb + rim, 1.0);
    }
  `;

  // Main earth geometry + material (shared dependencies: config.radius, $earthTex, config.rimColor, config.rimIntensity)
  $effect(() => {
    const geo = new SphereGeometry(config.radius, 48, 48);
    geometry = geo;

    const tex = $earthTex;
    if (tex) {
      const mat = new ShaderMaterial({
        uniforms: {
          uEarthMap: { value: tex },
          uRimColor: { value: new Color(config.rimColor) },
          uRimIntensity: { value: config.rimIntensity },
        },
        vertexShader,
        fragmentShader,
      });
      material = mat;

      return () => {
        geo.dispose();
        mat.dispose();
      };
    }

    material = null;
    return () => geo.dispose();
  });

  $effect(() => {
    if (!material) return;
    const rimColorUniform = material.uniforms.uRimColor;
    const rimIntensityUniform = material.uniforms.uRimIntensity;
    if (rimColorUniform) rimColorUniform.value = new Color(config.rimColor);
    if (rimIntensityUniform) rimIntensityUniform.value = config.rimIntensity;
  });

  let rotationY = $state(0);
  useTask((delta) => {
    rotationY += delta * config.rotationSpeed;
  });

  let glowGeometry = $state<SphereGeometry | null>(null);
  let glowMaterial = $state<ShaderMaterial | null>(null);

  // Glow geometry + material
  $effect(() => {
    const geo = new SphereGeometry(config.radius * 1.15, 32, 32);
    const mat = new ShaderMaterial({
      uniforms: {
        uRimColor: { value: new Color(config.rimColor) },
        uRimIntensity: { value: config.rimIntensity * 0.4 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uRimColor;
        uniform float uRimIntensity;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = 1.0 - dot(vNormal, vViewDir);
          fresnel = pow(fresnel, 2.0);
          float alpha = fresnel * uRimIntensity;
          gl_FragColor = vec4(uRimColor, alpha);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      side: BackSide,
      depthWrite: false,
    });
    glowGeometry = geo;
    glowMaterial = mat;

    return () => {
      geo.dispose();
      mat.dispose();
    };
  });
</script>

{#if config.enabled && material && geometry && glowGeometry && glowMaterial}
  <T.Group
    position.x={config.position[0]}
    position.y={config.position[1]}
    position.z={config.position[2]}
  >
    <T.Mesh {geometry} {material} rotation.y={rotationY} />
    <T.Mesh geometry={glowGeometry} material={glowMaterial} />
  </T.Group>
{/if}
