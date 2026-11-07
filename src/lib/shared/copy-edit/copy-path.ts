import { resolve, sep } from "node:path";

/**
 * The dev copy endpoint writes to disk, so this is the whole of what it may
 * touch: a file named `copy.json` under `src/`, given as a plain relative path.
 * `%` is refused outright so an encoded dot-dot cannot pass here and mean
 * something else later.
 */
export function isEditableCopyPath(
  file: unknown,
  cwd: string = process.cwd()
): file is string {
  if (typeof file !== "string") return false;
  if (/[\\%:\0]/.test(file)) return false;

  const segments = file.split("/");
  if (segments[0] !== "src" || segments.at(-1) !== "copy.json") return false;
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;

  return resolve(cwd, file).startsWith(resolve(cwd, "src") + sep);
}
