<script lang="ts">
  import { T } from "@threlte/core";
  import { Color } from "three";
  import type { FirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";
  import { completedFirstFireShrines } from "#lib/features/museum/data/first-fire-procession-state.js";
  import type { FirstFireGrayboxReviewState } from "#lib/features/museum/data/first-fire-procession-review.js";

  interface Props {
    contract: FirstFireBlenderContract;
    reviewState: FirstFireGrayboxReviewState;
  }

  interface RouteSegment {
    id: string;
    position: [number, number, number];
    length: number;
    yaw: number;
  }

  const props: Props = $props();
  const coalColor = new Color("#5b1609");
  const coalEmission = new Color("#f04416");
  const growthColor = new Color("#234c1c");
  const growthEmission = new Color("#7ee35a");

  function segmentsFor(sectionId: string): RouteSegment[] {
    const section = props.contract.pathSections.find(
      (candidate) => candidate.id === sectionId
    );
    if (!section) return [];
    return section.blenderPoints.slice(0, -1).map((start, index) => {
      const end = section.blenderPoints[index + 1]!;
      const startZ = -start.y;
      const endZ = -end.y;
      const dx = end.x - start.x;
      const dz = endZ - startZ;
      return {
        id: `${sectionId}-${index + 1}`,
        position: [(start.x + end.x) / 2, 0.055, (startZ + endZ) / 2],
        length: Math.hypot(dx, dz),
        yaw: -Math.atan2(dz, dx),
      };
    });
  }

  const completedShrines = $derived(
    completedFirstFireShrines(props.reviewState.procession)
  );
  const coalSegments = $derived.by(() => {
    if (
      props.reviewState.procession.phase === "fire-extinguished" ||
      props.reviewState.procession.phase === "growth-complete"
    ) {
      return [];
    }
    return completedShrines.flatMap((shrineId) => [
      ...segmentsFor(`hub-to-${shrineId}`),
      ...segmentsFor(`${shrineId}-return-to-hub`),
    ]);
  });
  const growthSegments = $derived(
    props.reviewState.procession.phase === "growth-complete"
      ? segmentsFor("earth-growth-path")
      : []
  );
</script>

{#each coalSegments as segment (segment.id)}
  <T.Mesh position={segment.position} rotation.y={segment.yaw} receiveShadow>
    <T.BoxGeometry args={[segment.length, 0.035, 0.16]} />
    <T.MeshStandardMaterial
      color={coalColor}
      emissive={coalEmission}
      emissiveIntensity={0.72}
      roughness={0.92}
    />
  </T.Mesh>
{/each}

{#each growthSegments as segment (segment.id)}
  <T.Mesh
    position={[segment.position[0], 0.065, segment.position[2]]}
    rotation.y={segment.yaw}
    receiveShadow
  >
    <T.BoxGeometry args={[segment.length, 0.045, 0.28]} />
    <T.MeshStandardMaterial
      color={growthColor}
      emissive={growthEmission}
      emissiveIntensity={1.45}
      roughness={0.82}
    />
  </T.Mesh>
{/each}
