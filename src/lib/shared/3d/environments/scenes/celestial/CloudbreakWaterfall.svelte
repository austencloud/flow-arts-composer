<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { DoubleSide, MeshBasicMaterial, ShaderMaterial } from "three";

  interface Props {
    position: [number, number, number];
    width: number;
    height: number;
    rotationY?: number;
    crestDepth?: number;
    opacity?: number;
    speed?: number;
    pulse?: number;
  }

  let {
    position,
    width,
    height,
    rotationY = 0,
    crestDepth = 0,
    opacity = 0.78,
    speed = 1,
    pulse = 0,
  }: Props = $props();

  const uniforms = { uTime: { value: 0 }, uOpacity: { value: opacity } };
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;

      void main() {
        vUv = uv;
        vec3 displaced = position;
        displaced.x += sin(uv.y * 21.0 - uTime * 1.7) * 0.035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uOpacity;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        float falling = vUv.y * 9.0 + uTime * 2.15;
        float broadFlow = noise(vec2(vUv.x * 5.5, falling));
        float fineFlow = noise(vec2(vUv.x * 19.0, falling * 2.4));
        float strands = smoothstep(0.38, 0.86, broadFlow * 0.7 + fineFlow * 0.5);
        float edge = smoothstep(0.0, 0.13, vUv.x) * smoothstep(0.0, 0.13, 1.0 - vUv.x);
        float crown = smoothstep(0.0, 0.06, 1.0 - vUv.y);
        float baseMist = smoothstep(0.83, 1.0, vUv.y) * (0.55 + fineFlow * 0.45);
        float alpha = (0.19 + strands * 0.62 + baseMist * 0.28) * edge * crown * uOpacity;
        vec3 water = mix(vec3(0.43, 0.74, 0.82), vec3(0.96, 0.99, 1.0), strands + baseMist * 0.5);
        gl_FragColor = vec4(water, alpha);
      }
    `,
  });

  const lipMaterial = new MeshBasicMaterial({
    color: "#e7fbff",
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: DoubleSide,
  });
  const mistMaterial = new MeshBasicMaterial({
    color: "#e9f8fb",
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  let pulseEnergy = 0;

  $effect(() => {
    void pulse;
    if (pulse > 0) pulseEnergy = 1;
  });

  useTask((delta) => {
    uniforms.uTime.value += Math.min(delta, 1 / 20) * speed;
    pulseEnergy = Math.max(0, pulseEnergy - delta * 0.7);
    uniforms.uOpacity.value = opacity * (1 + pulseEnergy * 0.08);
  });

  onDestroy(() => {
    material.dispose();
    lipMaterial.dispose();
    mistMaterial.dispose();
  });
</script>

<T.Group {position} rotation.y={rotationY}>
  <T.Mesh {material} renderOrder={3}>
    <T.PlaneGeometry args={[width, height, 10, 40]} />
  </T.Mesh>
  <T.Mesh position.z={-0.09} rotation.y={0.12} {material} renderOrder={3}>
    <T.PlaneGeometry args={[width * 0.9, height * 0.98, 8, 36]} />
  </T.Mesh>
  {#if crestDepth > 0}
    <T.Mesh
      position={[0, height / 2 + 0.018, crestDepth * 0.5]}
      rotation.x={-Math.PI / 2}
      {material}
      renderOrder={3}
    >
      <T.PlaneGeometry args={[width * 0.94, crestDepth, 10, 12]} />
    </T.Mesh>
    <T.Mesh
      position={[0, height / 2 + 0.035, 0.18]}
      rotation.x={-Math.PI / 2}
      material={lipMaterial}
      renderOrder={4}
    >
      <T.PlaneGeometry args={[width * 1.04, 0.44]} />
    </T.Mesh>
  {/if}
  <T.Mesh
    position={[0, -height / 2 + 0.28, 0.12]}
    scale.x={width * 0.62}
    scale.y={0.34}
    scale.z={0.7}
    material={mistMaterial}
    renderOrder={4}
  >
    <T.SphereGeometry args={[1, 24, 12]} />
  </T.Mesh>
</T.Group>
