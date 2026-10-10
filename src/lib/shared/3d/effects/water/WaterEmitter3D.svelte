<script lang="ts">
  /**
   * WaterEmitter3D - per-tip velocity-streaked water droplet emitter.
   *
   * Each droplet renders as a small capsule (thin cylinder) oriented along
   * its own velocity vector - "frozen raindrop" read, not floating spheres.
   * Gravity is aggressive (-18 m/s²) and lifetimes are short (0.3-0.7s) so
   * droplets fall fast and die fast, distinct from the buoyant long-life
   * spheres the bubbles effect (1g) will use.
   *
   * 1f.i bail point: "does it read as water?" Answer upstream by watching
   * a spin in the 3D viewer with water enabled.
   */

  import { T, useTask } from "@threlte/core";
  import { Vector3, Quaternion } from "three";
  import type { Goo3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

  interface Props {
    /** World-space position of this tip. null = hidden. */
    position: Vector3 | null;
    /** Tip velocity in metres per second. */
    propVelocity: Vector3;
    /** Resolved water params (palette + rates + gravity). */
    params: Goo3DParams;
    /** Gates mounting. */
    enabled: boolean;
  }

  let { position, propVelocity, params, enabled }: Props = $props();

  interface Droplet {
    id: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    scale: number;
  }

  let droplets = $state<Droplet[]>([]);
  let spawnAccumulator = 0;
  let nextId = 0;

  /** Per-tip share of the overall pool. */
  const PER_TIP_CAP = 256;
  /** Stronger than earth - water reads as fast-falling, not floating. */
  const GRAVITY_MPS2 = -18;

  // Cheap reusable objects so we don't alloc per droplet per frame.
  const UP = new Vector3(0, 1, 0);
  const tmpVelDir = new Vector3();
  const tmpQuat = new Quaternion();

  useTask((delta) => {
    if (!enabled || !position) return;

    const speed = propVelocity.length();
    const speedScalar =
      params.motionReferenceSpeed > 0
        ? Math.min(1, speed / params.motionReferenceSpeed)
        : 0;
    const rate =
      params.ambientEmission * params.ambientSpawnRate +
      params.motionEmission * speedScalar * params.motionSpawnRate;
    const flingVx = propVelocity.x;
    const flingVy = propVelocity.y;
    const flingVz = propVelocity.z;

    spawnAccumulator += delta * rate;
    while (spawnAccumulator >= 1 && droplets.length < PER_TIP_CAP) {
      const px = position.x;
      const py = position.y;
      const pz = position.z;

      // Small origin jitter - prevents the geometric-perfect line artifact.
      const ox = (Math.random() - 0.5) * 0.015;
      const oy = (Math.random() - 0.5) * 0.015;
      const oz = (Math.random() - 0.5) * 0.015;

      // Strong fling along tip motion + smaller random kick.
      const flingFactor = 0.6 + Math.random() * 0.4;
      const kickMag = 0.25 + Math.random() * 0.45;
      const kTheta = Math.random() * Math.PI * 2;
      const kPhi = Math.acos(2 * Math.random() - 1);
      const kx = Math.sin(kPhi) * Math.cos(kTheta) * kickMag;
      const ky = Math.sin(kPhi) * Math.sin(kTheta) * kickMag;
      const kz = Math.cos(kPhi) * kickMag;

      droplets.push({
        id: nextId++,
        x: px + ox,
        y: py + oy,
        z: pz + oz,
        vx: flingVx * flingFactor + kx,
        vy: flingVy * flingFactor + ky,
        vz: flingVz * flingFactor + kz,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.4,
        scale: (0.55 + Math.random() * 0.9) * (0.6 + 0.4 * params.intensity),
      });
      spawnAccumulator -= 1;
    }

    // Integrate - aggressive gravity, no drag.
    const surviving: Droplet[] = [];
    for (const d of droplets) {
      d.life += delta;
      if (d.life >= d.maxLife) continue;
      d.vy += GRAVITY_MPS2 * delta;
      d.x += d.vx * delta;
      d.y += d.vy * delta;
      d.z += d.vz * delta;
      surviving.push(d);
    }
    droplets = surviving;
  });

  const palette = $derived(params.resolvedPalette);
  const bodyOpacity = $derived(1.0 - params.clarity * 0.25);

  // Capsule-orientation quaternion: align cylinder's local Y-axis to velocity.
  function orient(d: Droplet): [number, number, number, number] {
    tmpVelDir.set(d.vx, d.vy, d.vz);
    const len = tmpVelDir.length();
    if (len < 0.0001) {
      tmpQuat.identity();
    } else {
      tmpVelDir.divideScalar(len);
      tmpQuat.setFromUnitVectors(UP, tmpVelDir);
    }
    return [tmpQuat.x, tmpQuat.y, tmpQuat.z, tmpQuat.w];
  }
</script>

{#each droplets as d (d.id)}
  {@const fade =
    d.life < 0.08 * d.maxLife
      ? d.life / (0.08 * d.maxLife)
      : d.life > 0.7 * d.maxLife
        ? Math.max(0, 1 - (d.life - 0.7 * d.maxLife) / (0.3 * d.maxLife))
        : 1}
  {@const r = params.baseRadius * d.scale}
  {@const q = orient(d)}
  <T.Mesh
    position.x={d.x}
    position.y={d.y}
    position.z={d.z}
    quaternion={q}
    scale.x={r}
    scale.y={r * 3.0}
    scale.z={r}
  >
    <T.CylinderGeometry args={[1, 1, 1, 6, 1]} />
    <T.MeshBasicMaterial
      color={palette.edge}
      transparent
      opacity={fade * bodyOpacity}
      depthWrite={false}
    />
  </T.Mesh>
{/each}
