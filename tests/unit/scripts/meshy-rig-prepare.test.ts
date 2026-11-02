// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  canonicalizeMeshySpine,
  transplantRefineMaterials,
} from "../../../scripts/characters/meshy-rig-prepare.mjs";

/** The joint layout Meshy's rigging API produced on 2026-09-05. */
function meshyDocument() {
  return {
    nodes: [
      { name: "Armature", children: [1] },
      { name: "Hips", children: [2, 6] },
      { name: "Spine02", children: [3] },
      { name: "Spine01", children: [4] },
      { name: "Spine", children: [5] },
      { name: "neck", children: [] },
      { name: "LeftUpLeg" },
    ],
  };
}

describe("canonicalizeMeshySpine", () => {
  it("renames the spine chain by hierarchy and capitalizes the neck", () => {
    const document = meshyDocument();
    const changes = canonicalizeMeshySpine(document);
    expect(document.nodes.map((node) => node.name)).toEqual([
      "Armature",
      "Hips",
      "Spine",
      "Spine1",
      "Spine2",
      "Neck",
      "LeftUpLeg",
    ]);
    expect(changes).toEqual([
      { index: 2, from: "Spine02", to: "Spine" },
      { index: 3, from: "Spine01", to: "Spine1" },
      { index: 4, from: "Spine", to: "Spine2" },
      { index: 5, from: "neck", to: "Neck" },
    ]);
  });

  it("leaves a canonical rig untouched", () => {
    const document = meshyDocument();
    canonicalizeMeshySpine(document);
    expect(canonicalizeMeshySpine(document)).toEqual([]);
  });

  it("refuses a rig with a different spine count", () => {
    const document = meshyDocument();
    document.nodes[3].children = [5];
    expect(() => canonicalizeMeshySpine(document)).toThrow(
      "Expected 3 spine bones"
    );
  });
});

function glb(document: Record<string, unknown>, binary: Buffer) {
  return { document, binary };
}

describe("transplantRefineMaterials", () => {
  it("carries the refine maps across and drops the emissive and specular overrides", () => {
    const rigged = glb(
      {
        extensionsUsed: ["KHR_materials_specular", "KHR_materials_ior"],
        buffers: [{ byteLength: 8 }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }],
        images: [{ mimeType: "image/png", bufferView: 0 }],
        textures: [
          { sampler: 0, source: 0 },
          { sampler: 0, source: 0 },
        ],
        samplers: [{ magFilter: 9729 }],
        materials: [
          {
            emissiveFactor: [1, 1, 1],
            emissiveTexture: { index: 0 },
            extensions: {
              KHR_materials_specular: { specularColorFactor: [2, 2, 2] },
              KHR_materials_ior: { ior: 1.45 },
            },
            pbrMetallicRoughness: { baseColorTexture: { index: 1 } },
          },
        ],
      },
      Buffer.from("BASECOLR")
    );
    const unrigged = glb(
      {
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 6 },
          { buffer: 0, byteOffset: 8, byteLength: 5 },
          { buffer: 0, byteOffset: 16, byteLength: 5 },
        ],
        images: [
          { mimeType: "image/jpeg", bufferView: 0, name: "normal" },
          { mimeType: "image/jpeg", bufferView: 1, name: "base_color" },
          { mimeType: "image/jpeg", bufferView: 2, name: "metallic_roughness" },
        ],
        textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
        materials: [
          {
            normalTexture: { index: 0 },
            pbrMetallicRoughness: {
              baseColorTexture: { index: 1 },
              metallicRoughnessTexture: { index: 2 },
            },
          },
        ],
      },
      Buffer.from("NORMAL\0\0COLOR\0\0\0ROUGH\0\0\0")
    );

    const { binary, summary } = transplantRefineMaterials(rigged, unrigged);
    const material = rigged.document.materials[0];
    expect(summary).toEqual({
      materials: 1,
      emissiveRemoved: 1,
      extensionsRemoved: 2,
    });
    expect(material).toEqual({
      pbrMetallicRoughness: {
        baseColorTexture: { index: 1 },
        metallicRoughnessTexture: { index: 3 },
      },
      normalTexture: { index: 2 },
    });
    expect(rigged.document.extensionsUsed).toBeUndefined();
    expect(rigged.document.images.map((image) => image.name)).toEqual([
      undefined,
      "normal",
      "metallic_roughness",
    ]);
    const views = rigged.document.bufferViews;
    expect(
      binary.subarray(views[1].byteOffset, views[1].byteOffset + 6).toString()
    ).toBe("NORMAL");
    expect(
      binary.subarray(views[2].byteOffset, views[2].byteOffset + 5).toString()
    ).toBe("ROUGH");
    expect(rigged.document.buffers[0].byteLength).toBe(binary.length);
  });
});
