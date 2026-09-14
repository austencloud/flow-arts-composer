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
    "--bundle",
    "--outfile=dist/index.js",
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
    "--alias:@tka/domain=../packages/domain/src/index.ts",
  ].join(" "),
  { cwd: __dirname, stdio: "inherit" }
);

console.log("Built dist/index.js (bundled)");
