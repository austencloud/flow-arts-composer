// @vitest-environment jsdom
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPromotionPacket,
  intakeCharacter,
  parseArguments,
  parseTextureSize,
} from "../../../scripts/characters/character-intake.mjs";
import {
  REQUIRED_BODY_BONES,
  inspectCharacterGlb,
  normalizeRuntimeJointNames,
  readImageDimensions,
} from "../../../scripts/characters/character-glb.mjs";
import {
  BAKEOFF_MANIFEST_FILE,
  LEGACY_BAKEOFF_SLOT,
  upsertStagedIntake,
} from "../../../scripts/characters/character-intake.mjs";
import { validateCharacterProvenance } from "../../../scripts/characters/character-provenance.mjs";
import { buildCharacterOptimizationSteps } from "../../../scripts/lib/optimize-character-glb.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "tka-character-intake-"));
  temporaryDirectories.push(directory);
  return directory;
}

function validProvenance(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "test-performer",
    displayName: "Test Performer",
    description: "Synthetic intake fixture",
    source: {
      provider: "Fixture Foundry",
      assetName: "Rigged Test Human",
      assetId: "fixture-1",
      creator: "TKA tests",
      url: "https://example.com/characters/fixture-1",
    },
    license: {
      name: "Fixture license",
      spdx: "CC0-1.0",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    rights: {
      commercialUse: "allowed",
      applicationRuntimeDistribution: "allowed",
      rawSourceRedistribution: "allowed",
      attributionRequired: false,
      restrictions: [],
    },
    evidence: [
      {
        url: "https://example.com/characters/fixture-1/license",
        retrievedAt: "2026-08-31",
        note: "Synthetic fixture rights",
      },
    ],
    acquiredAt: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}

const FINGER_SEGMENTS = [
  "Thumb1",
  "Thumb2",
  "Thumb3",
  "Index1",
  "Index2",
  "Index3",
  "Middle1",
  "Middle2",
  "Middle3",
  "Ring1",
  "Ring2",
  "Ring3",
  "Pinky1",
  "Pinky2",
  "Pinky3",
];

interface MaterialFixture {
  materials: Record<string, unknown>[];
  textures: Record<string, unknown>[];
  images: Record<string, unknown>[];
  bufferViews: Record<string, unknown>[];
  binary: Buffer;
}

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)]);
  const sof0 = Buffer.alloc(19);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(17, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
}

function webpVp8xHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function webpVp8lHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8L", 12, "ascii");
  bytes[20] = 0x2f;
  bytes.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return bytes;
}

function webpVp8Header(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8 ", 12, "ascii");
  bytes[23] = 0x9d;
  bytes[24] = 0x01;
  bytes[25] = 0x2a;
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
}

/** Pack embedded image headers into one binary chunk with a view per image. */
function materialFixture(
  materials: Record<string, unknown>[],
  imageBuffers: { bytes: Buffer; mimeType: string }[]
): MaterialFixture {
  const bufferViews: Record<string, unknown>[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const image of imageBuffers) {
    const padded = Buffer.concat([
      image.bytes,
      Buffer.alloc((4 - (image.bytes.length % 4)) % 4),
    ]);
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: padded.length,
    });
    chunks.push(padded);
    offset += padded.length;
  }
  return {
    materials,
    textures: imageBuffers.map((_image, index) => ({ source: index })),
    images: imageBuffers.map((image, index) => ({
      bufferView: index,
      mimeType: image.mimeType,
    })),
    bufferViews,
    binary: Buffer.concat(chunks),
  };
}

function createFixtureGlb({
  weighted = true,
  mixamoNamespace = false,
  unrealNaming = false,
  lastSkinOmitsFingers = false,
  material = null as MaterialFixture | null,
} = {}): Buffer {
  const canonicalJointNames = [
    ...REQUIRED_BODY_BONES,
    ...["Left", "Right"].flatMap((side) =>
      FINGER_SEGMENTS.map((segment) => `${side}Hand${segment}`)
    ),
  ];
  const unrealBodyNames = new Map([
    ["Spine", "spine_01"],
    ["Spine1", "spine_02"],
    ["Spine2", "spine_03"],
    ["LeftUpLeg", "thigh_l"],
    ["LeftLeg", "calf_l"],
    ["RightUpLeg", "thigh_r"],
    ["RightLeg", "calf_r"],
  ]);
  const jointNames = canonicalJointNames.map((name) => {
    if (!unrealNaming) return name;
    const bodyName = unrealBodyNames.get(name);
    if (bodyName) return bodyName;
    const finger = name.match(
      /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/
    );
    if (!finger) return name;
    const [, side, fingerName, segment] = finger;
    return `${fingerName.toLowerCase()}_0${segment}_${side === "Left" ? "l" : "r"}`;
  });
  const jointNodes = jointNames.map((name) => ({
    name: mixamoNamespace ? `mixamorig12:${name}` : name,
  }));
  const meshNodeIndex = jointNodes.length;
  const lastMeshNodeIndex = meshNodeIndex + 1;
  const primitive = {
    attributes: {
      POSITION: 0,
      NORMAL: 1,
      TEXCOORD_0: 2,
      JOINTS_0: 3,
      ...(weighted ? { WEIGHTS_0: 4 } : {}),
    },
    indices: 5,
    material: 0,
  };
  const document = {
    asset: { version: "2.0", generator: "TKA synthetic fixture" },
    scene: 0,
    scenes: [
      {
        nodes: [
          0,
          meshNodeIndex,
          ...(lastSkinOmitsFingers ? [lastMeshNodeIndex] : []),
        ],
      },
    ],
    nodes: [
      ...jointNodes,
      { name: "CharacterMesh", mesh: 0, skin: 0 },
      ...(lastSkinOmitsFingers
        ? [{ name: "LastCharacterMesh", mesh: 1, skin: 1 }]
        : []),
    ],
    meshes: [
      {
        name: "CharacterMesh",
        primitives: [primitive],
      },
      ...(lastSkinOmitsFingers
        ? [{ name: "LastCharacterMesh", primitives: [primitive] }]
        : []),
    ],
    skins: [
      { joints: jointNames.map((_name, index) => index) },
      ...(lastSkinOmitsFingers
        ? [{ joints: REQUIRED_BODY_BONES.map((_name, index) => index) }]
        : []),
    ],
    accessors: [
      { count: 3 },
      { count: 3 },
      { count: 3 },
      { count: 3 },
      { count: 3 },
      { count: 3 },
    ],
    materials: material?.materials ?? [{ name: "Skin" }],
    textures: material?.textures ?? [{ source: 0 }],
    images: material?.images ?? [{ bufferView: 0, mimeType: "image/png" }],
    buffers: [{ byteLength: material?.binary.length ?? 4 }],
    bufferViews: material?.bufferViews ?? [
      { buffer: 0, byteOffset: 0, byteLength: 4 },
    ],
  };
  const json = Buffer.from(JSON.stringify(document), "utf8");
  const jsonPadding = (4 - (json.length % 4)) % 4;
  const paddedJson = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const binary = material?.binary ?? Buffer.alloc(4);
  const totalLength = 12 + 8 + paddedJson.length + 8 + binary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, paddedJson, binaryHeader, binary]);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("character provenance gate", () => {
  it("accepts an evidenced runtime-distribution record", () => {
    const result = validateCharacterProvenance(validProvenance());

    expect(result.ok).toBe(true);
    expect(result.value?.id).toBe("test-performer");
  });

  it("rejects unknown rights before asset processing", () => {
    const provenance = validProvenance({
      rights: {
        commercialUse: "unknown",
        applicationRuntimeDistribution: "unknown",
        rawSourceRedistribution: "forbidden",
        attributionRequired: false,
      },
    });

    const result = validateCharacterProvenance(provenance);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "rights.commercialUse must be allowed before intake",
        "rights.applicationRuntimeDistribution must be allowed before intake",
      ])
    );
  });

  it("requires a credit line when attribution is required", () => {
    const provenance = validProvenance({
      rights: {
        commercialUse: "allowed",
        applicationRuntimeDistribution: "allowed",
        rawSourceRedistribution: "allowed",
        attributionRequired: true,
      },
    });

    expect(validateCharacterProvenance(provenance).errors).toContain(
      "rights.creditLine is required when attribution is required"
    );
  });

  it("rejects misspelled fields instead of silently dropping them", () => {
    const provenance = validProvenance({ commmercialUse: "allowed" });

    expect(validateCharacterProvenance(provenance).errors).toContain(
      "provenance.commmercialUse is not recognized"
    );
  });
});

describe("character GLB inspection", () => {
  it("uses the runtime skeleton mapper for all body and finger chains", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "fixture.glb");
    writeFileSync(model, createFixtureGlb());

    const inspection = inspectCharacterGlb(model);

    expect(inspection.validGlb).toBe(true);
    expect(inspection.errors).toEqual([]);
    expect(inspection.mappedBodyBoneCount).toBe(22);
    expect(inspection.fingerChains).toBe(true);
    expect(inspection.skinnedMeshNodeCount).toBe(1);
    expect(inspection.triangleCount).toBe(1);
  });

  it("rejects a skinned primitive without weights", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "unweighted.glb");
    writeFileSync(model, createFixtureGlb({ weighted: false }));

    expect(inspectCharacterGlb(model).errors).toContain(
      "1 skinned primitive(s) lack JOINTS_0 or WEIGHTS_0"
    );
  });

  it("removes Mixamo namespaces so canonical spine and fingers map", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "mixamo.glb");
    writeFileSync(model, createFixtureGlb({ mixamoNamespace: true }));

    const before = inspectCharacterGlb(model);
    const changes = normalizeRuntimeJointNames(model);
    const after = inspectCharacterGlb(model);

    // The runtime mapper normalizes bone names on its own, so a namespaced
    // rig already resolves its finger chains before intake touches the file.
    // What intake owns is what is written back: every joint loses the
    // namespace so the checked-in GLB is canonical on disk rather than
    // relying on the loader to forgive it.
    expect(before.fingerChains).toBe(true);
    expect(changes).toHaveLength(52);
    expect(changes.every(({ from }) => from.startsWith("mixamorig12:"))).toBe(
      true
    );
    expect(changes.map(({ to }) => to)).toEqual(
      changes.map(({ from }) => from.slice("mixamorig12:".length))
    );
    expect(after.mappedBodyBoneCount).toBe(22);
    expect(after.fingerChains).toBe(true);
    expect(after.errors).toEqual([]);
  });

  it("canonicalizes Unreal-style body and finger joints", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "unreal.glb");
    writeFileSync(model, createFixtureGlb({ unrealNaming: true }));

    const before = inspectCharacterGlb(model);
    const changes = normalizeRuntimeJointNames(model);
    const after = inspectCharacterGlb(model);

    expect(before.mappedBodyBoneCount).toBeLessThan(22);
    expect(before.fingerChains).toBe(false);
    expect(changes).toHaveLength(37);
    expect(after.mappedBodyBoneCount).toBe(22);
    expect(after.fingerChains).toBe(true);
    expect(after.errors).toEqual([]);
  });

  it("matches the runtime finger result from the last skinned mesh", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "split-skins.glb");
    writeFileSync(model, createFixtureGlb({ lastSkinOmitsFingers: true }));

    const inspection = inspectCharacterGlb(model);

    expect(inspection.mappedBodyBoneCount).toBe(22);
    expect(inspection.runtimeSkeletonJointCount).toBe(22);
    expect(inspection.fingerChains).toBe(false);
  });

  it("reads PNG, JPEG and WebP dimensions from embedded headers", () => {
    expect(readImageDimensions(pngHeader(2048, 1024))).toEqual({
      width: 2048,
      height: 1024,
    });
    expect(readImageDimensions(jpegHeader(1024, 512))).toEqual({
      width: 1024,
      height: 512,
    });
    expect(readImageDimensions(webpVp8xHeader(4096, 4096))).toEqual({
      width: 4096,
      height: 4096,
    });
    expect(readImageDimensions(webpVp8lHeader(1024, 1024))).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(readImageDimensions(webpVp8Header(512, 256))).toEqual({
      width: 512,
      height: 256,
    });
    expect(readImageDimensions(Buffer.from("not an image at all"))).toBeNull();
  });

  it("audits PBR channels and texture size on the materials a skin draws", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "materials.glb");
    writeFileSync(
      model,
      createFixtureGlb({
        material: materialFixture(
          [
            {
              name: "Body",
              alphaMode: "BLEND",
              pbrMetallicRoughness: {
                baseColorTexture: { index: 0 },
                metallicFactor: 0,
                roughnessFactor: 0.5,
              },
              normalTexture: { index: 1 },
            },
            { name: "UnusedHair", pbrMetallicRoughness: { metallicFactor: 0 } },
          ],
          [
            { bytes: pngHeader(2048, 2048), mimeType: "image/png" },
            { bytes: jpegHeader(1024, 512), mimeType: "image/jpeg" },
          ]
        ),
      })
    );

    const inspection = inspectCharacterGlb(model);

    expect(inspection.errors).toEqual([]);
    expect(inspection.materialSummary).toMatchObject({
      skinnedMaterialCount: 1,
      withBaseColorTexture: 1,
      withNormalTexture: 1,
      withMetallicRoughnessTexture: 0,
      alphaModes: { OPAQUE: 0, MASK: 0, BLEND: 1 },
      maxTextureSide: 2048,
    });
    expect(inspection.materials[0]).toMatchObject({
      name: "Body",
      skinned: true,
      maxTextureSide: 2048,
      channels: { baseColor: 0, normal: 1, metallicRoughness: null },
    });
    expect(inspection.materials[1].skinned).toBe(false);
    expect(inspection.images[1]).toMatchObject({ width: 1024, height: 512 });
    expect(inspection.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("no metallic-roughness texture"),
        expect.stringContaining("BLEND declared on material(s)"),
      ])
    );
    expect(inspection.warnings.join("\n")).not.toContain("UnusedHair");
    expect(inspection.warnings.join("\n")).not.toContain("normal map");
  });

  it("resolves textures the optimizer moved into EXT_texture_webp", () => {
    // The WebP pass writes the image reference into the extension and drops
    // the plain `source`, which once made every optimized character audit as
    // textureless while its normalized twin audited fine (ch12, 2026-09-05).
    const directory = temporaryDirectory();
    const model = resolve(directory, "webp-textures.glb");
    const fixture = materialFixture(
      [
        {
          name: "Body",
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            metallicRoughnessTexture: { index: 1 },
            metallicFactor: 0.5,
          },
          normalTexture: { index: 1 },
        },
      ],
      [
        { bytes: webpVp8xHeader(2048, 2048), mimeType: "image/webp" },
        { bytes: webpVp8lHeader(1024, 1024), mimeType: "image/webp" },
      ]
    );
    fixture.textures = fixture.textures.map((_texture, index) => ({
      sampler: 0,
      extensions: { EXT_texture_webp: { source: index } },
    }));
    writeFileSync(model, createFixtureGlb({ material: fixture }));

    const inspection = inspectCharacterGlb(model);

    expect(inspection.materials[0]).toMatchObject({
      channels: { baseColor: 0, normal: 1, metallicRoughness: 1 },
      maxTextureSide: 2048,
    });
    expect(inspection.materialSummary).toMatchObject({
      withBaseColorTexture: 1,
      withNormalTexture: 1,
      withMetallicRoughnessTexture: 1,
    });
    expect(inspection.warnings.join("\n")).not.toContain("normal map");
    expect(inspection.warnings.join("\n")).not.toContain("renders dark");
  });

  it("flags dark metallic factors and the spec-gloss extension the loader ignores", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "metal.glb");
    writeFileSync(
      model,
      createFixtureGlb({
        material: materialFixture(
          [
            {
              name: "Armor",
              pbrMetallicRoughness: { metallicFactor: 1 },
              extensions: { KHR_materials_pbrSpecularGlossiness: {} },
            },
          ],
          [{ bytes: pngHeader(512, 512), mimeType: "image/png" }]
        ),
      })
    );

    const inspection = inspectCharacterGlb(model);

    expect(inspection.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("carry no normal map: Armor"),
        expect.stringContaining(
          "KHR_materials_pbrSpecularGlossiness is not read"
        ),
        expect.stringContaining("Largest texture is 512 px"),
      ])
    );
    // Spec-gloss materials are reported once, as a conversion problem, not
    // also as a missing roughness texture they were never going to carry.
    expect(inspection.warnings.join("\n")).not.toContain("renders dark");
  });

  it("reports malformed binaries instead of throwing", () => {
    const directory = temporaryDirectory();
    const model = resolve(directory, "broken.glb");
    writeFileSync(model, "not a glb", "utf8");

    const inspection = inspectCharacterGlb(model);

    expect(inspection.validGlb).toBe(false);
    expect(inspection.errors[0]).toContain("GLB is too short");
  });
});

describe("character preparation", () => {
  it("keeps the deployed skinning-safe optimization sequence", () => {
    const commands = buildCharacterOptimizationSteps(
      "source.glb",
      "output.glb",
      "temporary"
    );
    const commandText = commands.flat().join(" ");

    expect(commands.map(([command]) => command)).toEqual([
      "resize",
      "webp",
      "resample",
      "prune",
      "dedup",
    ]);
    expect(commandText).not.toMatch(/weld|simplify|join|draco|meshopt/);
    expect(commands[0]).toEqual(
      expect.arrayContaining(["--width", "1024", "--height", "1024"])
    );
  });

  it("raises the texture ceiling only to a supported size", () => {
    const [resize] = buildCharacterOptimizationSteps(
      "source.glb",
      "output.glb",
      "temporary",
      { textureSize: 2048 }
    );

    expect(resize).toEqual(
      expect.arrayContaining(["--width", "2048", "--height", "2048"])
    );
    expect(() =>
      buildCharacterOptimizationSteps("source.glb", "output.glb", "temporary", {
        textureSize: 1500,
      })
    ).toThrow("Character texture size must be one of 512, 1024, 2048, 4096");
    expect(parseTextureSize(undefined)).toBe(1024);
    expect(parseTextureSize("2048")).toBe(2048);
    expect(() => parseTextureSize("big")).toThrow("integer number of pixels");
  });

  it("emits a deterministic promotion packet with five pending poses", () => {
    const provenance = validateCharacterProvenance(validProvenance()).value!;
    const inspection = {
      errors: [],
      mappedBodyBoneCount: 22,
      fingerChains: true,
    };

    const packet = buildPromotionPacket({
      provenance,
      normalizedInspection: inspection,
      optimizedInspection: inspection,
      thumbnailFile: "thumbnails/test-performer.webp",
      stagedForBakeoff: true,
      generatedAt: "2026-08-31T13:00:00.000Z",
    });

    expect(packet.status).toBe("needs-visual-review");
    expect(packet.review.poses).toHaveLength(5);
    expect(
      packet.review.poses.every(({ status }) => status === "pending")
    ).toBe(true);
    expect(packet.promotionEligible).toBe(false);
  });

  it("runs a no-tool fixture intake and records immutable hashes", async () => {
    const directory = temporaryDirectory();
    const source = resolve(directory, "source.glb");
    const provenanceFile = resolve(directory, "provenance.json");
    const output = resolve(directory, "output");
    writeFileSync(source, createFixtureGlb());
    writeFileSync(provenanceFile, JSON.stringify(validProvenance()));

    const result = await intakeCharacter({
      source,
      provenanceFile,
      outputDirectory: output,
      skipOptimization: true,
      skipThumbnail: true,
      now: () => "2026-08-31T13:00:00.000Z",
    });
    const report = JSON.parse(
      readFileSync(
        resolve(output, "test-performer", "character-intake-report.json"),
        "utf8"
      )
    );

    expect(result.status).toBe("needs-visual-review");
    expect(report.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.normalized.sha256).toBe(report.optimized.sha256);
    expect(report.bakeoff.poses).toHaveLength(5);
    expect(report.optimization).toMatchObject({
      skipped: true,
      textureSize: 1024,
    });
  });

  it("stages every intake by name and keeps the manifest current", async () => {
    const directory = temporaryDirectory();
    const stageDirectory = resolve(directory, "stage");
    const output = resolve(directory, "output");
    const intakeOf = async (id: string, displayName: string) => {
      const source = resolve(directory, `${id}.glb`);
      const provenanceFile = resolve(directory, `${id}.provenance.json`);
      writeFileSync(source, createFixtureGlb());
      writeFileSync(
        provenanceFile,
        JSON.stringify(validProvenance({ id, displayName }))
      );
      return intakeCharacter({
        source,
        provenanceFile,
        outputDirectory: output,
        skipOptimization: true,
        skipThumbnail: true,
        stageBakeoff: true,
        stageDirectory,
        now: () => "2026-09-05T10:00:00.000Z",
      });
    };

    const first = await intakeOf("malcolm", "Malcolm");
    const second = await intakeOf("michelle", "Michelle");
    const manifest = JSON.parse(
      readFileSync(resolve(stageDirectory, BAKEOFF_MANIFEST_FILE), "utf8")
    );

    expect(existsSync(resolve(stageDirectory, "intake-malcolm.glb"))).toBe(
      true
    );
    expect(existsSync(resolve(stageDirectory, "intake-michelle.glb"))).toBe(
      true
    );
    expect(existsSync(resolve(stageDirectory, LEGACY_BAKEOFF_SLOT))).toBe(true);
    expect(
      manifest.candidates.map((entry: { id: string }) => entry.id)
    ).toEqual(["malcolm", "michelle"]);
    expect(manifest.candidates[1]).toMatchObject({
      candidateId: "intake-michelle",
      label: "Michelle",
      source: "Fixture Foundry · Rigged Test Human",
      file: "intake-michelle.glb",
      rig: { mappedBodyBoneCount: 22, fingerChains: true },
    });
    expect(manifest.candidates[1].note).toContain("22/22 body bones");
    expect(first.report.bakeoff.poses[0].path).toBe(
      "/test/avatar-bakeoff?candidate=intake-malcolm&pose=neutral"
    );
    expect(second.report.staging).toMatchObject({
      file: "intake-michelle.glb",
      candidateId: "intake-michelle",
    });
  });

  it("replaces a restaged character without dropping its neighbours", () => {
    const manifest = {
      schemaVersion: 1,
      updatedAt: "2026-09-05T09:00:00.000Z",
      candidates: [
        { id: "malcolm", file: "intake-malcolm.glb", stagedAt: "old" },
        { id: "kaya", file: "intake-kaya.glb", stagedAt: "old" },
      ],
    };

    const next = upsertStagedIntake(
      manifest,
      { id: "malcolm", file: "intake-malcolm.glb", stagedAt: "new" },
      "2026-09-05T10:00:00.000Z"
    );

    expect(next.updatedAt).toBe("2026-09-05T10:00:00.000Z");
    expect(next.candidates.map((entry: { id: string }) => entry.id)).toEqual([
      "kaya",
      "malcolm",
    ]);
    expect(next.candidates[1].stagedAt).toBe("new");
    expect(upsertStagedIntake(null, { id: "x" }, "t").candidates).toHaveLength(
      1
    );
  });

  it("refuses replacement when it would delete the source model", async () => {
    const directory = temporaryDirectory();
    const output = resolve(directory, "output");
    const target = resolve(output, "test-performer");
    const source = resolve(target, "source.glb");
    const provenanceFile = resolve(directory, "provenance.json");
    mkdirSync(target, { recursive: true });
    writeFileSync(source, createFixtureGlb());
    writeFileSync(provenanceFile, JSON.stringify(validProvenance()));

    await expect(
      intakeCharacter({
        source,
        provenanceFile,
        outputDirectory: output,
        replace: true,
        skipOptimization: true,
        skipThumbnail: true,
      })
    ).rejects.toThrow(
      "Source model and provenance record must stay outside the generated intake directory"
    );
    expect(existsSync(source)).toBe(true);
  });

  it("parses the operational CLI without positional ambiguity", () => {
    expect(
      parseArguments([
        "--",
        "--source",
        "human.fbx",
        "--provenance",
        "human.json",
        "--output",
        "intake",
        "--stage-bakeoff",
        "--texture-size",
        "2048",
      ])
    ).toMatchObject({
      source: "human.fbx",
      provenanceFile: "human.json",
      outputDirectory: "intake",
      stageBakeoff: true,
      textureSize: 2048,
    });
  });
});
