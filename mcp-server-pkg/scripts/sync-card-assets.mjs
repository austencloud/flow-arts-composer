import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(packageRoot, "..");
const source = resolve(repositoryRoot, "static/images/letters_trimmed");
const destination = resolve(packageRoot, "assets/images/letters_trimmed");

if (!existsSync(source)) {
  throw new Error(`Canonical TKA glyph directory is missing: ${source}`);
}

if (!destination.startsWith(`${packageRoot}${sep}`)) {
  throw new Error(
    `Refusing to replace assets outside the MCP package: ${destination}`
  );
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, {
  recursive: true,
  filter: (sourcePath) => !sourcePath.endsWith(".FAKE_DELETE_ME"),
});

console.log("Generated packaged TKA glyphs from the canonical app assets");
