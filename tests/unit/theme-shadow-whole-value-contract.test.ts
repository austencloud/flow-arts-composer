/**
 * `--theme-shadow` holds a whole shadow, never a color.
 *
 * background-theme-calculator.ts and the boot script in app.html set it to a
 * full value such as `0 14px 36px rgba(0, 0, 0, 0.4)`. A style sweep on
 * 2025-12-28 used it as a color instead (`0 2px 8px var(--theme-shadow)`,
 * `color-mix(in srgb, var(--theme-shadow) 70%, transparent)`) in 233
 * declarations. Each one became invalid once the variable was substituted, so
 * the browser dropped the whole declaration: box shadows, text shadows and
 * filters computed to `none` and backgrounds to transparent, for nine months,
 * with no warning anywhere. The dead declarations were deleted and the
 * backgrounds restored on 2026-10-09.
 *
 * If this fails, use `var(--theme-shadow)` as the entire value of a shadow
 * property, or write the color you meant. Do not loosen the check.
 */
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const USE = /var\(\s*--theme-shadow(?![-\w])/g;

/**
 * Each `var(--theme-shadow…)` that is not the whole value of its declaration.
 * A fallback may hold anything; only what surrounds the call matters.
 */
function partialUses(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(USE)) {
    const start = match.index;
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")" && --depth === 0) break;
    }
    const before = source.slice(0, start).trimEnd();
    const after = source.slice(end + 1);
    const wholeValue =
      before.endsWith(":") && /^\s*(!important)?\s*([;}"'`]|$)/.test(after);
    if (!wholeValue) {
      const line = source.slice(0, start).split("\n").length;
      hits.push(
        `${line}: ${source.slice(start, end + 1).replace(/\s+/g, " ")}`
      );
    }
  }
  return hits;
}

/** Style-bearing sources under src/, with forward slashes. */
function sources(): string[] {
  return readdirSync("src", { recursive: true, withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /\.(svelte|css|ts|html)$/.test(entry.name)
    )
    .map((entry) => `${entry.parentPath}/${entry.name}`.split("\\").join("/"));
}

describe("--theme-shadow", () => {
  it("flags color-slot uses and accepts whole-value uses", () => {
    expect(
      partialUses("box-shadow: 0 2px 8px var(--theme-shadow);")
    ).toHaveLength(1);
    expect(
      partialUses(
        "background: color-mix(in srgb, var(--theme-shadow, #000) 70%, transparent);"
      )
    ).toHaveLength(1);
    expect(
      partialUses("box-shadow: var(--panel, 0 1px 3px var(--theme-shadow));")
    ).toHaveLength(1);
    expect(
      partialUses(
        "`background: red; box-shadow: 0 1px 3px var(--theme-shadow);`"
      )
    ).toHaveLength(1);

    expect(partialUses("box-shadow: var(--theme-shadow);")).toEqual([]);
    expect(partialUses("box-shadow: var(--theme-shadow) !important;")).toEqual(
      []
    );
    expect(
      partialUses(
        "box-shadow: var(--theme-shadow, 0 8px 24px rgba(0, 0, 0, 0.5))\n}"
      )
    ).toEqual([]);
    expect(partialUses("--shadow-sm: var(--theme-shadow);")).toEqual([]);
    expect(
      partialUses("box-shadow: 0 1px 2px var(--theme-shadow-color, #000);")
    ).toEqual([]);
  });

  it("is only ever used as a whole value", async () => {
    // A bounded pool keeps the several thousand reads inside the timeout.
    const paths = sources();
    const offenders: string[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++];
        for (const hit of partialUses(await readFile(path, "utf8")))
          offenders.push(`${path}:${hit}`);
      }
    };
    await Promise.all(Array.from({ length: 32 }, worker));
    expect(offenders.sort()).toEqual([]);
  });
});
