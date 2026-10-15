/** Shared acceptance boundary for Composer's native family captures.
 * Conversion remains owned by prepare-prop-motion.mjs until runtime extraction.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const NATIVE_MOTION_CONTRACT = Object.freeze({
  schema: "flow-fest-prop-motion-v3",
  manifestSchema: "flow-fest-prop-motion-manifest-v1",
  captureRevision: "clock-isolated-body-v3",
  coordinateBasis: "source XYZ to UE Feet (Z,-X,Y); rotation uses mirrored avatar basis and fixed native mesh X=-1",
  fps: 30,
  frames: 480,
  stride: 28,
});

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

/** The identity comes from the requested equipment, never from the clip itself. */
export function familyMotionIdentity(characterId, propId, routine) {
  requireValue(typeof characterId === "string" && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(characterId), "Invalid character ID");
  requireValue(typeof propId === "string" && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(propId), "Invalid prop ID");
  requireValue(routine === "A" || routine === "B", "Routine must be A or B");
  const profile = `P_${propId}_${routine}`;
  return { characterId, propId, routine, profile, filename: `${characterId.replaceAll("-", "_")}_${profile}.json` };
}

/** Legacy profiles may coexist in the manifest, but cannot stand in for a family. */
export function indexMotionManifest(manifest) {
  requireValue(manifest?.schema === NATIVE_MOTION_CONTRACT.manifestSchema && Array.isArray(manifest.clips), "Invalid motion manifest");
  const entries = new Map();
  const filenames = new Set();
  for (const entry of manifest.clips) {
    requireValue(typeof entry?.character === "string" && /^[a-z0-9_-]+$/.test(entry.character) &&
      typeof entry.profile === "string" && /^[A-Za-z0-9_]+$/.test(entry.profile), "Invalid manifest identity");
    requireValue(typeof entry.filename === "string" && /^[A-Za-z0-9_]+\.json$/.test(entry.filename), "Unsafe motion filename");
    const key = `${entry.character}/${entry.profile}`;
    requireValue(!entries.has(key), `Duplicate motion identity: ${key}`);
    requireValue(!filenames.has(entry.filename), `Duplicate motion filename: ${entry.filename}`);
    entries.set(key, entry);
    filenames.add(entry.filename);
  }
  return entries;
}

/** Validate format and provenance agreement; sourceBytes additionally verifies the raw capture hash. */
export function validateFamilyMotion(clip, { characterId, propId, routine, manifestEntry, sourceBytes } = {}) {
  const identity = familyMotionIdentity(characterId, propId, routine);
  const contract = NATIVE_MOTION_CONTRACT;
  const name = identity.filename;
  requireValue(clip?.schema === contract.schema, `${name}: expected ${contract.schema}`);
  requireValue(clip.character === characterId && clip.propId === propId && clip.profile === identity.profile, `${name}: character, prop, or routine mismatch`);
  requireValue(clip.captureRevision === contract.captureRevision, `${name}: stale capture revision`);
  requireValue(clip.coordinateBasis === contract.coordinateBasis, `${name}: incompatible coordinate basis`);
  requireValue(clip.fps === contract.fps && clip.sourceFrameCount === contract.frames &&
    Array.isArray(clip.frames) && clip.frames.length === contract.frames, `${name}: invalid timing or frame count`);
  requireValue(typeof clip.sourceSHA256 === "string" && /^[a-f0-9]{64}$/i.test(clip.sourceSHA256), `${name}: missing source SHA-256`);
  requireValue(manifestEntry?.character === characterId && manifestEntry.profile === identity.profile &&
    manifestEntry.filename === name && manifestEntry.frames === contract.frames &&
    manifestEntry.schema === clip.schema && manifestEntry.captureRevision === clip.captureRevision &&
    manifestEntry.sourceSHA256 === clip.sourceSHA256, `${name}: manifest provenance mismatch`);
  if (sourceBytes !== undefined) {
    const hash = createHash("sha256").update(sourceBytes).digest("hex");
    requireValue(hash === clip.sourceSHA256.toLowerCase(), `${name}: source capture hash mismatch`);
  }
  for (let i = 0; i < clip.frames.length; i++) {
    const frame = clip.frames[i];
    requireValue(Array.isArray(frame) && frame.length === contract.stride && frame.every(Number.isFinite), `${name}: invalid frame ${i}`);
    // Root transforms: 0..13; wrist positions: 14..19; visible rotations: 20..27.
    for (const offset of [3, 10, 20, 24]) {
      const norm = Math.hypot(...frame.slice(offset, offset + 4));
      requireValue(Math.abs(norm - 1) < 0.001, `${name}: invalid quaternion at frame ${i}, offset ${offset}`);
    }
  }
  return { ...identity, frames: clip.frames.length, durationSeconds: clip.frames.length / clip.fps,
    captureRevision: clip.captureRevision, sourceSHA256: clip.sourceSHA256,
    sourceHashVerified: sourceBytes !== undefined };
}

async function main() {
  const { values } = parseArgs({ options: {
    clip: { type: "string" }, manifest: { type: "string" }, character: { type: "string" },
    prop: { type: "string" }, routine: { type: "string" }, "source-capture": { type: "string" },
  } });
  requireValue(values.clip && values.manifest && values.character && values.prop && values.routine,
    "Usage: node motion-contract.mjs --clip FILE --manifest FILE --character ID --prop ID --routine A|B [--source-capture FILE]");
  const clip = JSON.parse(await readFile(values.clip, "utf8"));
  const manifest = indexMotionManifest(JSON.parse(await readFile(values.manifest, "utf8")));
  const identity = familyMotionIdentity(values.character, values.prop, values.routine);
  const result = validateFamilyMotion(clip, { ...identity,
    manifestEntry: manifest.get(`${identity.characterId}/${identity.profile}`),
    sourceBytes: values["source-capture"] ? await readFile(values["source-capture"]) : undefined,
  });
  console.log(JSON.stringify({ status: "PASS", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
