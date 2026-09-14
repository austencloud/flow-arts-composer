/** Publish immutable QR artwork for existing links, using the application's renderer.
 * Defaults to a read-only inventory. --apply authorizes artifact uploads only.
 * Requires --credentials, --canvas-module and --output-dir. Never edits shortcodes.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire, builtinModules } from "node:module";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { installQrBakeNodeRuntime } from "./lib/qr-bake-node-runtime.mjs";
import { QrBakeWorkerPool } from "./lib/qr-bake-worker-pool.mjs";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    refresh: { type: "boolean", default: false },
    credentials: { type: "string" },
    "canvas-module": { type: "string" },
    "output-dir": { type: "string" },
    "gallery-sequences": { type: "string" },
    prop: { type: "string" },
    limit: { type: "string", default: "0" },
    concurrency: { type: "string", default: "4" },
  },
});
for (const key of ["credentials", "canvas-module", "output-dir"])
  if (!values[key]) throw new Error(`Missing --${key}`);
const concurrency = Number(values.concurrency);
const limit = Number(values.limit);
if (
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 8 ||
  !Number.isInteger(limit) ||
  limit < 0
)
  throw new Error("Use concurrency 1–8 and a nonnegative integer limit");
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const nodeCanvas = require(path.resolve(values["canvas-module"]));
const output = path.resolve(values["output-dir"]);
await fs.mkdir(output, { recursive: true });
const credential = JSON.parse(await fs.readFile(values.credentials, "utf8"));
if (credential.project_id !== "the-kinetic-alphabet")
  throw new Error("Unexpected Firebase project");
const app = admin.initializeApp({
  credential: admin.credential.cert(credential),
  storageBucket: "the-kinetic-alphabet.firebasestorage.app",
});
const bucket = app.storage().bucket();
const qrWorkers = new QrBakeWorkerPool(path.resolve(values["canvas-module"]));
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
await server.ws.close();
await server.watcher.close();
const cellWorkers = new QrBakeWorkerPool(
  path.resolve(values["canvas-module"]),
  4,
  {
    entry: "qr-bake-cell-worker.mjs",
    runtime: { staticRoot: path.resolve("static") },
    invoke: ({ data: { name, data } }) => {
      if (name === "getBuiltins")
        return builtinModules.flatMap((name) => [name, `node:${name}`]);
      if (name === "fetchModule")
        return server.environments.ssr.fetchModule(...data);
      throw new Error(`Unknown module invocation: ${name}`);
    },
  }
);
const startedAt = new Date().toISOString();
const report = {
  startedAt,
  apply: values.apply,
  prop: values.prop ?? null,
  total: 0,
  processed: 0,
  ready: 0,
  uploaded: 0,
  cellsUploaded: 0,
  reused: 0,
  failed: [],
  missingCells: {},
  finished: false,
};
let next = 0;
let stopped = false;
process.once("SIGINT", () => {
  stopped = true;
});
const checkpoint = async () => {
  report.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(
    JSON.stringify({
      processed: report.processed,
      total: report.total,
      ready: report.ready,
      uploaded: report.uploaded,
      cellsUploaded: report.cellsUploaded,
      reused: report.reused,
      failed: report.failed.length,
      missingCells: Object.keys(report.missingCells).length,
    })
  );
};
try {
  const load = (name) => server.ssrLoadModule(`/src/lib/${name}.ts`);
  const { hydrateSelfContainedShortCodePayload } = await load(
    "shared/qr/services/short-code-payload-hydrator"
  );
  const { hydrateSequence } = await load(
    "shared/navigation/services/sequence-hydrator"
  );
  const { encodeSequence } = await load(
    "shared/navigation/services/sequence-encoder"
  );
  const { sha256Hex } = await load("shared/foundation/utils/canonical-digest");
  const { resolveScanPropConfig } = await load(
    "shared/qr/services/scan-prop-resolver"
  );
  const { PropType } = await load(
    "shared/pictograph/prop/domain/enums/prop-type"
  );
  const { getCanonicalSequenceCells } = await load(
    "shared/render/services/warm-sequence-cells"
  );
  const { deriveCloudCellHash } = await load(
    "shared/render/services/cloud-cell-key"
  );
  const { PreparedQrCache } = await load(
    "shared/qr/services/prepared-qr-cache"
  );
  const { QRCodeGenerator } = await load(
    "shared/qr/services/qr-code-generator"
  );
  const { ShortCodeManager } = await load(
    "shared/qr/services/short-code-manager"
  );
  const shortCodes = new ShortCodeManager();
  const forcedProps = values.prop
    ? (() => {
        if (!Object.values(PropType).includes(values.prop)) {
          throw new Error(
            `Unknown --prop ${JSON.stringify(values.prop)}; use a PropType value`
          );
        }
        // Gallery prop choices are an intentional destination variant. Keep
        // both hands explicit so the cache key and QR URL describe the same card.
        return {
          leftPropType: values.prop,
          rightPropType: values.prop,
          catDogMode: false,
        };
      })()
    : null;
  installQrBakeNodeRuntime(nodeCanvas, path.resolve("static"));
  const cache = new PreparedQrCache({
    get: async () => null,
    set: async () => {},
  });
  const gallerySequencesByHash = new Map();
  if (values["gallery-sequences"]) {
    const gallerySequences = JSON.parse(
      await fs.readFile(values["gallery-sequences"], "utf8")
    );
    if (!Array.isArray(gallerySequences) || gallerySequences.length === 0)
      throw new Error("--gallery-sequences must be a nonempty sequence array");
    for (const sequence of gallerySequences) {
      const encoderHash = await sha256Hex(encodeSequence(sequence));
      if (gallerySequencesByHash.has(encoderHash))
        throw new Error(`Duplicate gallery encoder hash: ${encoderHash}`);
      gallerySequencesByHash.set(encoderHash, sequence);
    }
  }
  let records;
  const snapshot = path.join(output, "shortcodes.json");
  try {
    if (values.refresh)
      throw Object.assign(new Error("Refresh snapshot"), { code: "ENOENT" });
    records = JSON.parse(await fs.readFile(snapshot, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    records = [];
    let cursor;
    while (true) {
      let query = app
        .firestore()
        .collection("shortcodes")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(500);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      records.push(
        ...page.docs.map((doc) => ({ code: doc.id, record: doc.data() }))
      );
      console.log(`Read ${records.length} shortcode records`);
      if (page.size < 500) break;
      cursor = page.docs.at(-1);
    }
    await fs.writeFile(snapshot, JSON.stringify(records));
  }
  // Consistent first choice when several historical codes describe identical content.
  records.sort((a, b) => a.code.localeCompare(b.code));
  if (limit) records = records.slice(0, limit);
  report.total = records.length;
  const names = async (prefix) =>
    new Set(
      (
        await bucket.getFiles({ prefix, fields: "items(name),nextPageToken" })
      )[0].map((file) => file.name)
    );
  const [cells, prepared] = await Promise.all([
    names("pictograph-cells/"),
    names("prepared-qrs/"),
  ]);
  console.log(
    `Found ${cells.size} cell objects and ${prepared.size} QR objects`
  );
  let activeUploads = 0;
  const uploadWaiters = [];
  const upload = async (work) => {
    if (activeUploads >= 32)
      await new Promise((resolve) => uploadWaiters.push(resolve));
    else activeUploads++;
    try {
      return await work();
    } finally {
      const wake = uploadWaiters.shift();
      if (wake) wake();
      else activeUploads--;
    }
  };
  const cellInFlight = new Map();
  const ensureCell = async (hash, cell) => {
    if (cells.has(`pictograph-cells/${hash}.webp`)) return;
    if (cellInFlight.has(hash)) return cellInFlight.get(hash);
    const render = cellWorkers.render(cell);
    const publish = render.then(async (bytes) => {
      try {
        await upload(() =>
          bucket.file(`pictograph-cells/${hash}.webp`).save(bytes, {
            resumable: false,
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: {
              contentType: "image/webp",
              cacheControl: "public,max-age=31536000,immutable",
            },
          })
        );
        report.cellsUploaded++;
      } catch (error) {
        if (Number(error.code) !== 412) throw error;
      }
      cells.add(`pictograph-cells/${hash}.webp`);
      delete report.missingCells[hash];
    });
    cellInFlight.set(hash, publish);
    try {
      await publish;
    } finally {
      cellInFlight.delete(hash);
    }
  };
  const inFlight = new Map();
  const expectedQrs = new Set();
  const requiredCells = new Set();
  const worker = async () => {
    const generator = new QRCodeGenerator(
      undefined,
      { get: async () => null, set: async () => {} },
      undefined,
      undefined,
      (options) => ({ getRawData: () => qrWorkers.render(options) })
    );
    while (!stopped && next < records.length) {
      const { code, record } = records[next++];
      try {
        const raw = await hydrateSelfContainedShortCodePayload(code, record);
        if (!raw) throw new Error("No valid self-contained sequence payload");
        const hydrated = await hydrateSequence(raw, { loopDetector: null });
        if (
          values["gallery-sequences"] &&
          (await sha256Hex(encodeSequence(hydrated))) !== record.encoderHash
        ) {
          throw new Error("Shortcode payload does not match its encoder hash");
        }
        const sequence = values["gallery-sequences"]
          ? gallerySequencesByHash.get(record.encoderHash)
          : hydrated;
        if (!sequence)
          throw new Error(
            "No same-hash gallery sequence for shortcode payload"
          );
        const props = forcedProps ?? resolveScanPropConfig(sequence, record);
        const missing = [];
        const cellSequences =
          sequence === hydrated ? [sequence] : [hydrated, sequence];
        const cellChecks = cellSequences.flatMap((cellSequence) =>
          getCanonicalSequenceCells(cellSequence, props).flatMap(
            ({ data, options }) =>
              [true, false].map(async (darkMode) => {
                const hash = await deriveCloudCellHash(data, darkMode, options);
                requiredCells.add(hash);
                if (!cells.has(`pictograph-cells/${hash}.webp`)) {
                  const cell = { code, data, options, darkMode };
                  report.missingCells[hash] ??= cell;
                  if (values.apply) await ensureCell(hash, cell);
                  else missing.push(hash);
                }
              })
          )
        );
        const checked = await Promise.allSettled(cellChecks);
        const rejected = checked.find((result) => result.status === "rejected");
        if (rejected) throw rejected.reason;
        if (missing.length)
          throw new Error(`Missing ${missing.length} canonical cells`);
        for (const darkMode of [true, false]) {
          const options = {
            size: 200,
            style: "modern",
            darkMode,
            centerIcon: "play",
          };
          const key = await cache.keyFor(sequence, props, options);
          const object = `prepared-qrs/${key}.json`;
          expectedQrs.add(key);
          if (prepared.has(object)) {
            report.reused++;
            continue;
          }
          if (inFlight.has(key)) {
            await inFlight.get(key);
            report.reused++;
            continue;
          }
          if (!values.apply) continue;
          const publish = (async () => {
            const encodedUrl = shortCodes.urlForExistingCode(code, props);
            const result = await generator.generateForUrl(encodedUrl, options);
            const json = JSON.stringify({
              key,
              svg: result.svg,
              encodedUrl,
              shortCode: code,
            });
            if (Buffer.byteLength(json) >= 512 * 1024)
              throw new Error("QR exceeds cache size limit");
            try {
              await bucket.file(object).save(json, {
                resumable: false,
                preconditionOpts: { ifGenerationMatch: 0 },
                metadata: {
                  contentType: "application/json",
                  cacheControl: "public,max-age=31536000,immutable",
                },
              });
              report.uploaded++;
            } catch (error) {
              if (Number(error.code) !== 412) throw error;
              report.reused++;
            }
            prepared.add(object);
          })();
          inFlight.set(key, publish);
          try {
            await publish;
          } finally {
            inFlight.delete(key);
          }
        }
        report.ready++;
      } catch (error) {
        report.failed.push({ code, reason: error.message });
      }
      report.processed++;
      if (existsSync(path.join(output, "STOP"))) stopped = true;
      if (report.processed % 100 === 0) await checkpoint();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  report.finished = !stopped;
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(output, "artifact-manifest.json"),
    JSON.stringify({ qrKeys: [...expectedQrs], cellHashes: [...requiredCells] })
  );
  await checkpoint();
  if (report.failed.length) process.exitCode = 2;
} finally {
  await cellWorkers.close();
  await qrWorkers.close();
  await server.close();
  await app.delete();
}
