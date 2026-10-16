/** Serve only the built capture bundle and source public assets during capture. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildId,
  sha256,
  stableStringify,
} from "../../Shared/Tools/capture-provenance.mjs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, "../../..");
const built = resolve(
  root,
  "unreal/FlowFest/Intermediate/native-capture-static"
);
const publicRoot = resolve(root, "static");
const html = resolve(built, "unreal/FlowFest/Tools/native-capture.html");
const receipt = JSON.parse(
  await readFile(resolve(built, "native-capture-build.json"), "utf8")
);
if (
  receipt.schema !== "tka-native-capture-build-v1" ||
  receipt.id !== (await buildId(receipt))
)
  throw new Error(
    "Native capture build receipt is missing or invalid; rebuild with native-capture.vite.config.mjs"
  );
async function outputHashes(directory) {
  const hashes = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, await outputHashes(path));
    else if (entry.isFile() && entry.name !== "native-capture-build.json")
      hashes[relative(built, path).replaceAll("\\", "/")] = await sha256(
        await readFile(path)
      );
  }
  return hashes;
}
if (
  receipt.outputSHA256 !==
  (await sha256(stableStringify(await outputHashes(built))))
)
  throw new Error(
    "Native capture build bytes changed after receipt creation; rebuild before capture"
  );
const args = process.argv.slice(2);
let outputArg;
let runnerArg;
let manifestArg;
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--runner" || value === "--manifest") {
    const argument = args[++index];
    if (!argument || argument.startsWith("--"))
      throw new Error(`${value} requires a path`);
    if (value === "--runner") runnerArg = argument;
    else manifestArg = argument;
  } else if (!value.startsWith("--") && !outputArg) {
    outputArg = value;
  } else {
    throw new Error(`Unknown static capture argument: ${value}`);
  }
}
if (Boolean(runnerArg) !== Boolean(manifestArg))
  throw new Error("A custom capture runner requires --runner and --manifest");
const output = resolve(
  outputArg ?? "unreal/FlowFest/Saved/PerformanceCaptures"
);
const runner = runnerArg
  ? resolve(runnerArg)
  : resolve(toolsDir, "capture-performances.mjs");
const runnerArgs = manifestArg ? [resolve(manifestArg)] : [];
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function fileInside(base, path) {
  const candidate = resolve(base, `.${path}`);
  const rel = relative(base, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  try {
    if ((await stat(candidate)).isFile()) return candidate;
  } catch {
    /* try next root */
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const file =
      (await fileInside(built, path)) ??
      (await fileInside(publicRoot, path)) ??
      (path === "/test/flow-fest-native-export" ? html : null);
    if (!file) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mime[extname(file)] ?? "application/octet-stream",
    });
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});

await new Promise((ok, fail) => {
  server.once("error", fail);
  server.listen(0, "127.0.0.1", ok);
});
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Static capture server has no port");
console.log(`Static capture bundle on port ${address.port}`);
try {
  const code = await new Promise((ok, fail) => {
    const child = spawn(
      process.execPath,
      [runner, `http://127.0.0.1:${address.port}`, output, ...runnerArgs],
      { stdio: "inherit" }
    );
    child.once("error", fail);
    child.once("exit", (exitCode) => ok(exitCode ?? 1));
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await new Promise((ok) => server.close(ok));
}
