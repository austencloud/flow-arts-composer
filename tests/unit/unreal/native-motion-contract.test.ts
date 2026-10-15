import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  familyMotionIdentity,
  indexMotionManifest,
  NATIVE_MOTION_CONTRACT,
  validateFamilyMotion,
} from "../../../unreal/Shared/Tools/motion-contract.mjs";

function fixture() {
  const sourceBytes = Buffer.from("captured browser performer");
  const identity = familyMotionIdentity("x-bot", "bigbuugeng", "B");
  const clip = {
    ...NATIVE_MOTION_CONTRACT,
    character: identity.characterId, propId: identity.propId, profile: identity.profile,
    sourceFrameCount: 480, sourceSHA256: createHash("sha256").update(sourceBytes).digest("hex"),
    frames: Array.from({ length: 480 }, () => [
      12, -8, 130, 0, 0, 0, 1, 12, 8, 130, 0, 0, 0, 1,
      10, -8, 130, 10, 8, 130, 0, 0, 0, 1, 0, 0, 0, 1,
    ]),
  };
  const manifestEntry = { character: clip.character, profile: clip.profile, filename: identity.filename,
    frames: 480, schema: clip.schema, captureRevision: clip.captureRevision, sourceSHA256: clip.sourceSHA256 };
  return { clip, options: { ...identity, manifestEntry, sourceBytes } };
}

describe("shared native family motion contract", () => {
  it("preserves exact rig, family and routine identity with a 16 second loop", () => {
    const { clip, options } = fixture();
    expect(validateFamilyMotion(clip, options)).toMatchObject({ filename: "x_bot_P_bigbuugeng_B.json",
      durationSeconds: 16, sourceHashVerified: true });
    expect(validateFamilyMotion(clip, { ...options, sourceBytes: undefined }).sourceHashVerified).toBe(false);
  });

  it.each(["characterId", "propId", "routine"])("rejects a mismatched requested %s", (field) => {
    const { clip, options } = fixture();
    const value = { characterId: "remy", propId: "staff", routine: "A" }[field];
    expect(() => validateFamilyMotion(clip, { ...options, [field]: value })).toThrow(/mismatch/);
  });

  it("rejects legacy data and stale or incompatible conversions", () => {
    for (const [field, value] of [["schema", "flow-fest-prop-motion-v2"],
      ["captureRevision", "previous"], ["coordinateBasis", "X,Y,Z"]]) {
      const { clip, options } = fixture();
      expect(() => validateFamilyMotion({ ...clip, [field]: value }, options)).toThrow();
    }
  });

  it("rejects frame/timing drift, nonfinite positions and invalid root or visual rotations", () => {
    for (const mutate of [
      (clip: ReturnType<typeof fixture>["clip"]) => { clip.fps = 60; },
      (clip: ReturnType<typeof fixture>["clip"]) => { clip.frames.pop(); },
      (clip: ReturnType<typeof fixture>["clip"]) => { clip.frames[0]!.pop(); },
      (clip: ReturnType<typeof fixture>["clip"]) => { clip.frames[5]![14] = NaN; },
      ...[3, 10, 20, 24].map(offset => (clip: ReturnType<typeof fixture>["clip"]) => { clip.frames[4]![offset + 3] = 0; }),
    ]) {
      const { clip, options } = fixture();
      mutate(clip);
      expect(() => validateFamilyMotion(clip, options)).toThrow();
    }
  });

  it("rejects manifest mismatch and raw source substitution", () => {
    const { clip, options } = fixture();
    expect(() => validateFamilyMotion(clip, { ...options, manifestEntry: { ...options.manifestEntry, sourceSHA256: "0".repeat(64) } })).toThrow(/manifest provenance/);
    expect(() => validateFamilyMotion(clip, { ...options, sourceBytes: Buffer.from("different capture") })).toThrow(/source capture hash/);
    expect(() => validateFamilyMotion(clip, { ...options, manifestEntry: undefined })).toThrow(/manifest provenance/);
  });

  it("rejects unsafe paths and manifest identity/filename collisions", () => {
    expect(() => familyMotionIdentity("../x-bot", "staff", "A")).toThrow();
    const { options: { manifestEntry: entry } } = fixture();
    const manifest = { schema: NATIVE_MOTION_CONTRACT.manifestSchema, clips: [entry] };
    expect(indexMotionManifest(manifest).size).toBe(1);
    expect(() => indexMotionManifest({ ...manifest, clips: [entry, entry] })).toThrow(/Duplicate motion identity/);
    expect(() => indexMotionManifest({ ...manifest, clips: [entry, { ...entry, character: "remy" }] })).toThrow(/Duplicate motion filename/);
    expect(() => indexMotionManifest({ ...manifest, clips: [{ ...entry, filename: "../file.json" }] })).toThrow(/Unsafe motion filename/);
  });
});
