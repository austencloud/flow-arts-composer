/** Serve only the built capture bundle and source public assets during capture. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, "../../..");
const built = resolve(root, "unreal/FlowFest/Intermediate/native-capture-static");
const publicRoot = resolve(root, "static");
const html = resolve(built, "unreal/FlowFest/Tools/native-capture.html");
const output = resolve(process.argv[2] ?? "unreal/FlowFest/Content/Data/performances");
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
  } catch { /* try next root */ }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = (await fileInside(built, path)) ?? (await fileInside(publicRoot, path)) ??
      (path === "/test/flow-fest-native-export" ? html : null);
    if (!file) { response.writeHead(404); response.end("Not found"); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
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
if (!address || typeof address === "string") throw new Error("Static capture server has no port");
console.log(`Static capture bundle on port ${address.port}`);
try {
  const code = await new Promise((ok, fail) => {
    const child = spawn(process.execPath, [resolve(toolsDir, "capture-performances.mjs"),
      `http://127.0.0.1:${address.port}`, output], { stdio: "inherit" });
    child.once("error", fail);
    child.once("exit", (exitCode) => ok(exitCode ?? 1));
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await new Promise((ok) => server.close(ok));
}
