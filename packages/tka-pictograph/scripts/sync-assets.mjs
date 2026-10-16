/**
 * Copies the art the renderer can reference from the knowledge server's
 * packaged assets (generated from the app's canonical art), and turns the
 * pictograph dataframes into JSON for the letter lookup.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const mcp = join(pkg, "../../mcp-server-pkg");
const from = join(mcp, "assets");
const to = join(pkg, "assets");

// The knowledge server's own sync regenerates its packaged art from the app.
execFileSync(process.execPath, [join(mcp, "scripts/sync-card-assets.mjs")], {
  cwd: mcp,
  stdio: "ignore",
});

const COPY = [
  "images/grid",
  "images/arrows",
  "images/arrow.svg",
  "images/letters_trimmed",
  "images/numbers",
  "images/vtg_glyphs",
  "images/elements",
  "images/props",
  "data/arrow_placement",
];
const SKIP = new Set(["animated", "build-previews"]);

rmSync(to, { recursive: true, force: true });
for (const rel of COPY) {
  const source = join(from, rel);
  if (!existsSync(source)) throw new Error(`Missing art to package: ${source}`);
  cpSync(source, join(to, rel), {
    recursive: true,
    filter: (path) => !SKIP.has(path.split(/[\\/]/).pop() ?? ""),
  });
}

const dataDir = join(pkg, "src/data");
mkdirSync(dataDir, { recursive: true });
for (const [grid, file] of [
  ["diamond", "DiamondPictographDataframe.csv"],
  ["box", "BoxPictographDataframe.csv"],
]) {
  const [header, ...lines] = readFileSync(join(from, "data/pictographs", file), "utf-8").split(/\r?\n/);
  const columns = header.split(",");
  const rows = lines
    .filter((line) => line.trim())
    .map((line) => Object.fromEntries(line.split(",").map((value, i) => [columns[i], value])));
  writeFileSync(join(dataDir, `${grid}.json`), JSON.stringify(rows));
}

console.log("tka-pictograph: art and dataframes synced");
