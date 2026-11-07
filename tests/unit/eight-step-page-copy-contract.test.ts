import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_DIR = "src/routes/(public)/guide/eight-step";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

// Austen retypes this page's words in place, and the page reads copy.json back
// by key. A key spelled differently on one side shows up as a blank line or a
// sentence nobody can reach, and neither fails anywhere else.
describe("Eight Hand Paths page copy", () => {
  const page = readSource(`${PAGE_DIR}/+page.svelte`);
  const copy: Record<string, string> = JSON.parse(
    readSource(`${PAGE_DIR}/copy.json`)
  );
  const slots = (key: string) =>
    [...(copy[key] ?? "").matchAll(/\{(\d+)\}/g)].map((match) => match[1]);

  const staticKeys = [
    ...page.matchAll(/\bkey="([a-z0-9-]+)"/g),
    ...page.matchAll(/copy\.text\["([a-z0-9-]+)"\]/g),
    ...page.matchAll(/fillCopy\("([a-z0-9-]+)"/g),
    ...page.matchAll(/"(poi-anti-zero|poi-note)"/g),
  ].map((match) => match[1]!);

  // Keys the page builds from data. Each family is pinned to the template that
  // builds it, so removing the template fails here as well.
  const builtKeys: [RegExp, string[]][] = [
    [/`path-\$\{path\.column\}`/, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `path-${n}`)],
    [
      /key="timing-\{row\.timing\}-title"/,
      ["split", "together", "quarter"].map((t) => `timing-${t}-title`),
    ],
    [
      /key="timing-\{row\.timing\}-body"/,
      ["split", "together", "quarter"].map((t) => `timing-${t}-body`),
    ],
    [
      /key="direction-\{box\.direction\}"/,
      ["same", "opposite"].map((d) => `direction-${d}`),
    ],
  ];
  const propKeys = ["split", "together", "quarter"].flatMap((timing) =>
    ["same", "opposite"].map((direction) => `props-${timing}-${direction}`)
  );
  const driftKeys = ["same", "opposite"].map((d) => `props-drift-${d}`);

  it("builds its keys from the templates this test expects", () => {
    for (const [template] of builtKeys) expect(page).toMatch(template);
    expect(page).toMatch(/PROP_LINE_KEYS/);
  });

  it("has every key the page reads", () => {
    const used = new Set([
      ...staticKeys,
      ...builtKeys.flatMap(([, keys]) => keys),
      ...propKeys,
      ...driftKeys,
    ]);
    expect([...used].filter((key) => !(key in copy))).toEqual([]);
  });

  it("has no key the page never reads", () => {
    const used = new Set([
      ...staticKeys,
      ...builtKeys.flatMap(([, keys]) => keys),
      ...propKeys,
      ...driftKeys,
    ]);
    expect(Object.keys(copy).filter((key) => !used.has(key))).toEqual([]);
  });

  it("gives each placeholder exactly one island", () => {
    const islands = [
      ...page.matchAll(/key="([a-z0-9-]+)"\s+islands=\{\[([^\]]*)\]\}/g),
    ].map((match) => [match[1]!, match[2]!.split(",").length] as const);
    expect(islands.map(([key]) => key).sort()).toEqual(
      Object.keys(copy)
        .filter((key) => slots(key).length > 0)
        .sort()
    );
    for (const [key, count] of islands) {
      expect(slots(key), key).toEqual(
        Array.from({ length: count }, (_, index) => String(index))
      );
    }
  });

  it("fills the plain-text examples with as many values as they have slots", () => {
    const fills = [
      ...page.matchAll(/fillCopy\("([a-z0-9-]+)",\s*\[([^\]]*)\]\)/g),
    ];
    expect(fills.length).toBeGreaterThan(0);
    for (const [, key, values] of fills) {
      expect(slots(key!).length, key).toBe(values!.split(",").length);
    }
  });

  it("uses no em dash in any value", () => {
    const dashed = Object.entries(copy).filter(([, value]) =>
      value.includes(String.fromCodePoint(0x2014))
    );
    expect(dashed).toEqual([]);
  });
});
