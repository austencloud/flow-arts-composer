import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The shipped outpost model, read as glTF JSON. The runtime shades the rover
 * tracks and bootprints from their UVs; without them those shaders fail to
 * compile and the tracks vanish without an error on the page. The optimiser
 * once stripped them as "unused", which no picture of the pad would catch.
 */
const GLB = resolve("static/models/cosmic/moon-outpost.glb");

interface GltfJson {
  nodes: { name: string; mesh?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; material: number }[] }[];
  materials: { name: string }[];
}

function readGltf(): { bytes: number; json: GltfJson } {
  const buffer = readFileSync(GLB);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8")) as GltfJson;
  return { bytes: buffer.length, json };
}

describe("moon-outpost.glb", () => {
  const { bytes, json } = readGltf();
  const primitivesOf = (name: string) => {
    const node = json.nodes.find((candidate) => candidate.name === name);
    expect(node?.mesh, `${name} has a mesh`).toBeDefined();
    return json.meshes[node!.mesh!]!.primitives;
  };

  it("keeps the UVs and own materials the track and bootprint shaders need", () => {
    for (const [name, material] of [
      ["MO_RoverTracks", "MO_Track"],
      ["MO_Bootprints", "MO_Boot"],
    ] as const) {
      for (const primitive of primitivesOf(name)) {
        expect(primitive.attributes.TEXCOORD_0, `${name} UVs`).toBeDefined();
        expect(json.materials[primitive.material]?.name).toBe(material);
      }
    }
  });

  it("stays inside the 4 MB model budget", () => {
    expect(bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});
