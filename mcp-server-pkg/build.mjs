import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(__dirname, "dist"), { recursive: true });

const esbuildBin = resolve(__dirname, "node_modules/.bin/esbuild");

execSync(
  [
    `"${esbuildBin}"`,
    "index.ts",
    "card-renderer.ts",
    "--bundle",
    "--outdir=dist",
    "--splitting",
    // Asset-aware modules use import.meta.url to walk one level from dist/ to
    // the package assets. Keep every shared chunk directly in dist/ so that
    // relationship stays true for both MCP entry points.
    "--chunk-names=chunk-[hash]",
    "--platform=node",
    "--target=node20",
    "--format=esm",
    "--sourcemap",
    "--external:@modelcontextprotocol/sdk",
    "--external:@resvg/resvg-js",
    "--external:zod",
    "--external:child_process",
    "--external:crypto",
    "--external:events",
    "--external:fs",
    "--external:fs/promises",
    "--external:http",
    "--external:https",
    "--external:net",
    "--external:os",
    "--external:path",
    "--external:stream",
    "--external:url",
    "--external:util",
    "--external:worker_threads",
    "--external:canvas",
    "--external:@napi-rs/canvas",
    "--external:@napi-rs/canvas/*",
    "--external:qr-code-styling",
    "--external:jsdom",
    "--alias:@tka/domain=../packages/domain/src/index.ts",
    "--alias:@tka/render-composition=../packages/render-composition/src/index.ts",
  ].join(" "),
  { cwd: __dirname, stdio: "inherit" }
);

console.log("Built dist/index.js and dist/card-renderer.js (bundled)");
