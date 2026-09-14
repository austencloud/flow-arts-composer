/**
 * Build a read-only bake input from an exported PublicSequencesLoader payload.
 *
 * The loader export is the authoritative gallery population for a run. We
 * derive the same encoder hash the app uses, then follow shortcodeHashes to an
 * existing code. This never mints or edits a shortcode.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    credentials: { type: "string" },
    "gallery-sequences": { type: "string" },
    "output-dir": { type: "string" },
  },
});
for (const key of ["credentials", "gallery-sequences", "output-dir"])
  if (!values[key]) throw new Error(`Missing --${key}`);

const output = path.resolve(values["output-dir"]);
const targets = ["shortcodes.json", "gallery-hash-inventory.json"];
for (const name of targets) {
  try {
    await fs.access(path.join(output, name));
    throw new Error(
      `${path.join(output, name)} already exists; refusing to overwrite it`
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const gallery = JSON.parse(
  await fs.readFile(values["gallery-sequences"], "utf8")
);
if (!Array.isArray(gallery) || gallery.length === 0)
  throw new Error(
    "--gallery-sequences must be a nonempty array from PublicSequencesLoader"
  );

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const credential = JSON.parse(await fs.readFile(values.credentials, "utf8"));
if (credential.project_id !== "the-kinetic-alphabet")
  throw new Error("Unexpected Firebase project");
const app = admin.initializeApp({
  credential: admin.credential.cert(credential),
});
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
await server.ws.close();
await server.watcher.close();

try {
  const { encodeSequence } = await server.ssrLoadModule(
    "/src/lib/shared/navigation/services/sequence-encoder.ts"
  );
  const { sha256Hex } = await server.ssrLoadModule(
    "/src/lib/shared/foundation/utils/canonical-digest.ts"
  );
  const { hydrateSelfContainedShortCodePayload } = await server.ssrLoadModule(
    "/src/lib/shared/qr/services/short-code-payload-hydrator.ts"
  );
  const { hydrateSequence } = await server.ssrLoadModule(
    "/src/lib/shared/navigation/services/sequence-hydrator.ts"
  );
  const encoderHashes = await Promise.all(
    gallery.map(async (sequence) => {
      const encoderHash = await sha256Hex(encodeSequence(sequence));
      return { id: sequence.id, word: sequence.word, encoderHash };
    })
  );
  const db = app.firestore();
  const hashDocs = [];
  for (let index = 0; index < encoderHashes.length; index += 500) {
    hashDocs.push(
      ...(await db.getAll(
        ...encoderHashes
          .slice(index, index + 500)
          .map(({ encoderHash }) =>
            db.collection("shortcodeHashes").doc(encoderHash)
          )
      ))
    );
  }
  const resolved = encoderHashes.map((entry, index) => ({
    ...entry,
    code:
      hashDocs[index]?.exists &&
      typeof hashDocs[index].data()?.code === "string"
        ? hashDocs[index].data().code
        : null,
    resolution: hashDocs[index]?.exists ? "hash index" : "none",
  }));
  for (const entry of resolved.filter(({ code }) => !code)) {
    const legacy = await db
      .collection("shortcodes")
      .where("encoderHash", "==", entry.encoderHash)
      .limit(10)
      .get();
    if (legacy.size === 1) {
      entry.code = legacy.docs[0].id;
      entry.resolution = "legacy shortcode hash";
    } else if (legacy.size > 1) {
      entry.resolution = "ambiguous legacy shortcode hashes";
    }
  }
  const codeDocs = new Map();
  const codes = [
    ...new Set(resolved.flatMap(({ code }) => (code ? [code] : []))),
  ];
  for (let index = 0; index < codes.length; index += 500) {
    const docs = await db.getAll(
      ...codes
        .slice(index, index + 500)
        .map((code) => db.collection("shortcodes").doc(code))
    );
    for (const doc of docs) codeDocs.set(doc.id, doc);
  }
  const matched = [];
  const unmatched = [];
  for (const entry of resolved) {
    const doc = entry.code ? codeDocs.get(entry.code) : null;
    if (!doc?.exists) {
      unmatched.push({
        ...entry,
        reason: entry.code ? "missing shortcode record" : entry.resolution,
      });
    } else if (doc.data().encoderHash !== entry.encoderHash) {
      unmatched.push({ ...entry, reason: "shortcode hash mismatch" });
    } else {
      const payload = await hydrateSelfContainedShortCodePayload(
        doc.id,
        doc.data()
      );
      if (!payload) {
        unmatched.push({ ...entry, reason: "unhydratable shortcode payload" });
        continue;
      }
      const hydrated = await hydrateSequence(payload, { loopDetector: null });
      if ((await sha256Hex(encodeSequence(hydrated))) !== entry.encoderHash) {
        unmatched.push({
          ...entry,
          reason: "hydrated shortcode hash mismatch",
        });
        continue;
      }
      matched.push({ code: doc.id, record: doc.data() });
    }
  }
  matched.sort((a, b) => a.code.localeCompare(b.code));
  const inventory = {
    gallerySequences: gallery.length,
    uniqueEncoderHashes: new Set(
      encoderHashes.map(({ encoderHash }) => encoderHash)
    ).size,
    matchedRecords: matched.length,
    unmatched,
  };
  await fs.mkdir(output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(output, "shortcodes.json"), JSON.stringify(matched)),
    fs.writeFile(
      path.join(output, "gallery-hash-inventory.json"),
      JSON.stringify(inventory, null, 2)
    ),
  ]);
  console.log(JSON.stringify({ ...inventory, unmatched: unmatched.length }));
} finally {
  await server.close();
  await app.delete();
}
