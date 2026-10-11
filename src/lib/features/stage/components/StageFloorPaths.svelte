<script lang="ts">
  /**
   * StageFloorPaths
   *
   * The drill, drawn on the floor the cast actually walks. Every performer gets
   * a marker at each set — the poker chip on the ground — and a ribbon joining
   * the chips in the order the show visits them.
   *
   * This renders inside the viewer's performer group through the canvas's
   * `worldChildren` seam, so it shares the exact coordinate frame the rigs are
   * positioned in and lands under the feet that walk it.
   */

  import { T } from "@threlte/core";
  import { CircleGeometry, DoubleSide, RingGeometry } from "three";

  import { getViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { getStageChoreographyContext } from "../context/stage-choreography-context";
  import { resolveActiveFormationIndex } from "../domain/active-formation";
  import { stageToWorld } from "../domain/stage-performance-sampler";

  interface Segment {
    x: number;
    z: number;
    heading: number;
    length: number;
  }

  interface PerformerPath {
    id: string;
    color: string;
    marks: { x: number; z: number; active: boolean }[];
    segments: Segment[];
  }

  const stageState = getStageChoreographyContext();
  const viewer = getViewer3DContext();

  const PATH_WIDTH = 0.09;
  const MARK_OUTER = 0.34;
  const MARK_INNER = 0.24;

  // Shared across every mark and segment: the geometry is identical, only the
  // transform and colour differ, so one instance each keeps the draw list flat.
  const markRing = new RingGeometry(MARK_INNER, MARK_OUTER, 28);
  const markDisc = new CircleGeometry(MARK_INNER, 28);

  // A hair above the deck. Coplanar with the floor z-fights; higher than this
  // and the ribbon visibly floats out from under the feet at a low camera.
  const groundY = $derived(viewer.stageGroundOffset + 0.012);

  const choreography = $derived(stageState.choreography);

  const activeSetIndex = $derived(
    resolveActiveFormationIndex(
      choreography.formations,
      null,
      stageState.currentBeat
    )
  );

  const paths = $derived.by((): PerformerPath[] => {
    const sets = [...choreography.formations].sort(
      (a, b) => a.atBeat - b.atBeat
    );
    if (sets.length === 0) return [];

    return choreography.performers.map((performer) => {
      const marks = sets.map((set, index) => {
        const spot = set.spots[performer.id];
        const world = stageToWorld(
          { x: spot?.x ?? 0, z: spot?.z ?? 0 },
          choreography
        );
        return { ...world, active: index === activeSetIndex };
      });

      const segments: Segment[] = [];
      for (let i = 1; i < marks.length; i += 1) {
        const from = marks[i - 1]!;
        const to = marks[i]!;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        // A performer who holds their spot through a set has no path to draw.
        if (length < 0.05) continue;
        segments.push({
          x: (from.x + to.x) / 2,
          z: (from.z + to.z) / 2,
          heading: Math.atan2(dx, dz),
          length,
        });
      }

      return { id: performer.id, color: performer.color, marks, segments };
    });
  });
</script>

{#each paths as path (path.id)}
  {#each path.segments as segment, index (index)}
    <T.Mesh
      position={[segment.x, groundY, segment.z]}
      rotation={[-Math.PI / 2, 0, segment.heading]}
    >
      <T.PlaneGeometry args={[PATH_WIDTH, segment.length]} />
      <T.MeshBasicMaterial
        color={path.color}
        transparent
        opacity={0.42}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
  {/each}

  {#each path.marks as mark, index (index)}
    <T.Mesh
      geometry={markRing}
      position={[mark.x, groundY + 0.001, mark.z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <T.MeshBasicMaterial
        color={path.color}
        transparent
        opacity={mark.active ? 0.95 : 0.55}
        side={DoubleSide}
        depthWrite={false}
      />
    </T.Mesh>
    {#if mark.active}
      <T.Mesh
        geometry={markDisc}
        position={[mark.x, groundY + 0.002, mark.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <T.MeshBasicMaterial
          color={path.color}
          transparent
          opacity={0.22}
          side={DoubleSide}
          depthWrite={false}
        />
      </T.Mesh>
    {/if}
  {/each}
{/each}
