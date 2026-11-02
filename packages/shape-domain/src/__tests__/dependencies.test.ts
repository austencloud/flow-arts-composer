import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const FORBIDDEN = [
  /from\s+["']#lib\//,
  /from\s+["']\$lib\//,
  /from\s+["']\$app\//,
  /from\s+["']svelte/,
  /from\s+["']\.\.\/\.\.\/\.\.\/src\//,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? files(full)
      : full.endsWith(".ts")
        ? [full]
        : [];
  });
}

describe("@tka/shape-domain stays framework-free", () => {
  it("imports nothing from the Composer's src or from Svelte", () => {
    const offenders = files(ROOT)
      .filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        return FORBIDDEN.filter((re) => re.test(text)).map(
          (re) => `${f}: ${re}`
        );
      });
    expect(offenders).toEqual([]);
  });
});
