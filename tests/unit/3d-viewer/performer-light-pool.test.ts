import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(
  resolve("src/lib/shared/3d/components/Viewer3DScene.svelte"),
  "utf8"
);

// The cast is rendered from `renderablePerformers` so exiting rigs keep their
// slot for one presence phase. Locating the loop by name keeps this file
// honest: a rename would otherwise turn every "not inside the loop" assertion
// below into a comparison against an empty string.
const performerLoopStart = sceneSource.indexOf(
  "{#each performerManager.renderablePerformers"
);
const performerLoop = sceneSource.slice(
  performerLoopStart,
  sceneSource.lastIndexOf("{/each}")
);

describe("performer selection light", () => {
  it("finds the performer loop it guards", () => {
    expect(performerLoopStart).toBeGreaterThan(-1);
    expect(performerLoop.length).toBeGreaterThan(0);
  });

  it("keeps a constant light count while performer rigs enter and leave", () => {
    expect(sceneSource.match(/<T\.PointLight/g)).toHaveLength(1);
    expect(sceneSource).toContain("position={selectedPerformerLightPosition}");
    expect(sceneSource).toContain("intensity={selectedPerformer ? 6 : 0}");

    expect(performerLoop).not.toContain("<T.PointLight");
  });

  it("mounts one selection-ring mesh set, only for a selected performer", () => {
    // Multi-performer selection (acd54aaeb6) gives every selected performer
    // its own identity-colored ring, so the ring set moved inside the loop.
    // The render budget it still owes: exactly one ring set, mounted behind
    // the selection gate, so an unselected cast adds no ring meshes and no
    // second light. Lifting a ring above the gate would put a ring set on
    // every performer in the scene. The all-selected ring (0095974000)
    // is the third RingGeometry; it sits behind its own gate below.
    expect(sceneSource.match(/<T\.RingGeometry/g)).toHaveLength(3);

    const selectionGate = performerLoop.indexOf(
      "selectedPerformerIndices.has(i)"
    );
    expect(selectionGate).toBeGreaterThan(-1);
    expect(performerLoop.slice(0, selectionGate)).not.toContain(
      "<T.RingGeometry"
    );
    expect(performerLoop.match(/<T\.RingGeometry/g)).toHaveLength(3);
    expect(performerLoop).toContain("color={selectionColor}");

    // The all-selected ring replaces the per-performer set (not adds to
    // it) and mounts only while every performer is selected.
    const allSelectedGate = performerLoop.indexOf(
      '"exiting" && viewer3DState.isAllPerformersSelected}'
    );
    expect(allSelectedGate).toBeGreaterThan(selectionGate);
    expect(performerLoop.slice(selectionGate, allSelectedGate)).toContain(
      "!viewer3DState.isAllPerformersSelected"
    );
    expect(
      performerLoop.slice(allSelectedGate).match(/<T\.RingGeometry/g)
    ).toHaveLength(1);
  });
});
