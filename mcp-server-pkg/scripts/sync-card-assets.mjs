import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(packageRoot, "..");
const assetCopies = [
  ["static/images/letters_trimmed", "assets/images/letters_trimmed"],
  ["static/images/props", "assets/images/props"],
  ["static/fonts/gelasio", "assets/fonts/gelasio"],
];

for (const [sourcePath, destinationPath] of assetCopies) {
  const source = resolve(repositoryRoot, sourcePath);
  const destination = resolve(packageRoot, destinationPath);

  if (!existsSync(source)) {
    throw new Error(`Canonical card asset directory is missing: ${source}`);
  }
  if (!destination.startsWith(`${packageRoot}${sep}`)) {
    throw new Error(`Refusing to replace assets outside the MCP package: ${destination}`);
  }

  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    filter: (sourceFile) =>
      !sourceFile.endsWith(".FAKE_DELETE_ME") &&
      !sourceFile.includes(`${sep}build-previews${sep}`) &&
      !sourceFile.includes(`${sep}model${sep}`),
  });
}

console.log("Generated packaged card glyph, prop, and font assets from the canonical app");
