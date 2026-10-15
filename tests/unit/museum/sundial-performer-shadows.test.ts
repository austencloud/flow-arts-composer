import { Group, Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { castSundialPerformerShadows } from "#lib/features/museum/services/sundial-performer-shadows.js";

function station(name: string) {
  const root = new Group();
  root.name = name;
  const nested = new Group();
  const mesh = new Mesh();
  nested.add(mesh);
  root.add(nested);
  return { root, mesh };
}

describe("Sundial performer shadows", () => {
  it("unwraps the Threlte scene and flags only sun station meshes", () => {
    const current = new Scene();
    const sun = station("performer-station-cave-sun-north");
    const moon = station("performer-station-cave-moon-north");
    current.add(sun.root, moon.root);
    expect(castSundialPerformerShadows({ current })).toBe(1);
    expect(sun.mesh.castShadow).toBe(true);
    expect(moon.mesh.castShadow).toBe(false);
    expect(sun.root.castShadow).toBe(false);
  });

  it("finds late arrivals on later sweeps and reads the current scene", () => {
    const scene = { current: new Scene() };
    expect(castSundialPerformerShadows(scene)).toBe(0);
    for (const direction of ["north", "east", "south", "west"]) {
      scene.current.add(
        station(`performer-station-cave-sun-${direction}`).root
      );
    }
    expect(castSundialPerformerShadows(scene)).toBe(4);
    scene.current = new Scene();
    expect(castSundialPerformerShadows(scene)).toBe(0);
  });
});
