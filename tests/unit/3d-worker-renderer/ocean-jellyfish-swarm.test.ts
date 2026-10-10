import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three";
import { createOceanJellyfishSwarm } from "#lib/shared/3d/environments/worlds/ocean/ocean-jellyfish-swarm.js";
import {
  buildPentatonicNotes,
  midiName,
  midiToFreq,
} from "#lib/shared/3d/environments/worlds/ocean/ocean-jellyfish-notes.js";

describe("Ocean jellyfish world", () => {
  it("preserves the production pentatonic note assignment", () => {
    expect(buildPentatonicNotes(7)).toEqual([60, 62, 64, 67, 69, 72, 74]);
    expect(midiName(60)).toBe("C4");
    expect(midiToFreq(69)).toBe(440);
  });

  it("owns the exact animated swarm as one renderer-neutral object", () => {
    const swarm = createOceanJellyfishSwarm(2);
    const before = swarm.object.children.map((child) => child.position.clone());

    swarm.update(1 / 30);

    expect(swarm.count).toBe(2);
    expect(swarm.object.name).toBe("OceanJellyfishSwarm");
    expect(swarm.object.children).toHaveLength(2);
    expect(
      swarm.object.children.some(
        (child, index) => !child.position.equals(before[index]!),
      ),
    ).toBe(true);
    expect(swarm.object.children[0]!.scale.x).toBeCloseTo(0.012);
    swarm.dispose();
    expect(swarm.object.children).toHaveLength(0);
  });

  it("keeps hover and tap picking inside the shared simulation owner", () => {
    const swarm = createOceanJellyfishSwarm(1);
    swarm.update(1 / 30);
    const jelly = swarm.object.children[0]!;
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.copy(jelly.position).addScalar(2);
    camera.lookAt(jelly.position);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    swarm.object.updateMatrixWorld(true);

    expect(swarm.hoverAt(0, 0, camera)).toBe(true);
    const interaction = swarm.interactAt(0, 0, camera);
    expect(interaction?.frequencyHz).toBeGreaterThan(0);
    expect(interaction?.pan).toBeGreaterThanOrEqual(-1);
    expect(interaction?.pan).toBeLessThanOrEqual(1);
    swarm.dispose();
  });
});
