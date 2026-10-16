import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CHARACTER_MANIFEST_SCHEMA = "flow-arts-native-characters-v1";
const CATALOG_PATH = "node_modules/@austencloud/scene-3d/src/lib/config/avatar-definitions.ts";
const PACKAGE_PATH = "node_modules/@austencloud/scene-3d/package.json";
const SAFE_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

async function readCatalogSource(sourceRoot) {
  const root = resolve(sourceRoot);
  const [source, packageJson] = await Promise.all([
    readFile(resolve(root, CATALOG_PATH)),
    readFile(resolve(root, PACKAGE_PATH), "utf8"),
  ]);
  const packageVersion = JSON.parse(packageJson).version;
  if (typeof packageVersion !== "string" || !packageVersion) {
    throw new Error("scene-3d package version is missing");
  }
  return { root, source, packageVersion };
}

async function deployedCharactersFromSource(root, source) {
  // Use Vite's esbuild so this evaluates the same TypeScript expression as the
  // production web build, including the DEV flag that hides evaluation models.
  const require = createRequire(import.meta.url);
  const viteRequire = createRequire(require.resolve("vite"));
  const { build } = viteRequire("esbuild");
  const result = await build({
    stdin: {
      contents: source.toString("utf8"),
      resolveDir: dirname(resolve(root, CATALOG_PATH)),
      sourcefile: resolve(root, CATALOG_PATH),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    define: { "import.meta.env.DEV": "false" },
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`;
  return (await import(moduleUrl)).AVATAR_DEFINITIONS;
}

async function charactersFromSnapshot(root, source) {
  const definitions = await deployedCharactersFromSource(root, source);
  if (!Array.isArray(definitions)) throw new Error("AVATAR_DEFINITIONS must be an array");
  const ids = new Set();
  const keys = new Set();
  const characters = [];
  for (const avatar of definitions) {
    if (avatar.availability === "local-evaluation") continue;
    const { id, name, modelPath } = avatar;
    if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Unsafe avatar ID: ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate avatar ID: ${id}`);
    const key = id.replaceAll("-", "_");
    if (keys.has(key)) throw new Error(`Avatar key collision: ${key}`);
    if (typeof name !== "string" || !name.trim()) throw new Error(`Missing avatar name: ${id}`);
    if (typeof modelPath !== "string" || !modelPath.trim()) throw new Error(`Missing model path: ${id}`);
    ids.add(id);
    keys.add(key);
    characters.push({
      id,
      name,
      key,
      modelPath,
      sourceRelativePath: `static/models/avatars/_optimized/${id}.glb`,
    });
  }
  if (!characters.length) throw new Error("Deployed avatar catalog is empty");
  return characters;
}

export async function loadDeployedCharacters(sourceRoot) {
  const { root, source } = await readCatalogSource(sourceRoot);
  return charactersFromSnapshot(root, source);
}

export async function createCharacterManifest(sourceRoot) {
  const { root, source, packageVersion } = await readCatalogSource(sourceRoot);
  return {
    schema: CHARACTER_MANIFEST_SCHEMA,
    source: {
      package: "@austencloud/scene-3d",
      version: packageVersion,
      catalogPath: CATALOG_PATH,
      sha256: createHash("sha256").update(source).digest("hex"),
    },
    characters: await charactersFromSnapshot(root, source),
  };
}

async function main(args) {
  let sourceRoot;
  let output;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--source-root") sourceRoot = args[i + 1];
    else if (args[i] === "--output") output = args[i + 1];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!sourceRoot || !output) throw new Error("Usage: character-catalog.mjs --source-root ROOT --output FILE");
  const manifest = await createCharacterManifest(sourceRoot);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`NATIVE_CHARACTERS_WRITTEN ${manifest.characters.length} ${resolve(output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
