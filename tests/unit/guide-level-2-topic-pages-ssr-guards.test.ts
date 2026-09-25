/**
 * SSR-stub guard check for the new Level-2 per-topic routes
 * (`/guide/level-2/<slug>`, see level2-topic-manifest.ts).
 *
 * The production SSR build stubs every `.svelte` file under
 * `shared/animation-engine/`, `shared/3d/`, and every non-core feature to
 * `export default null` (see reference_ssr_feature_gate_prerender_null_component,
 * SSR_STUBBED_SHARED_RENDER_PATHS + FEATURES in src/config/feature-flags.ts).
 * A prerendered public route that renders one of those components outside a
 * `{#if browser}` block calls `null` as a component and fails the whole
 * build with "Error: 500 /route" — the dev server never shows this because
 * the gate only runs for `vite build` (same failure mode
 * tests/unit/timing-direction-ssr-guards.test.ts guards for
 * `/timing-and-direction`).
 *
 * This applies the same `unguardedRenders` scanner to every file the new
 * `/guide/level-2/[slug]` route statically reaches: the route itself, its
 * Level2TopicBody host, the shared GuideCompanionHost it mounts (unchanged —
 * already used by the pre-existing /turns and /double-turns routes), and
 * every ch20/ch21 GuideSection component a topic page can render. None of
 * these import a stubbed path today; this test locks that so a future edit
 * can't reintroduce one silently.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { unguardedRenders } from "../helpers/unguarded-renders";

const GUIDE_ROOT = resolve(__dirname, "../../src/routes/(public)/guide");
const LEVEL2_ROOT = `${GUIDE_ROOT}/level-2`;

const ROUTE_FILES = [
  `${LEVEL2_ROOT}/[slug]/+page.svelte`,
  `${LEVEL2_ROOT}/_components/Level2TopicBody.svelte`,
  `${GUIDE_ROOT}/_components/GuideCompanionHost.svelte`,
];

const SECTION_FILES = [
  "ch20/TurnShifts.svelte",
  "ch20/TurnDashes.svelte",
  "ch20/TurnStatic.svelte",
  "ch20/GlyphsPADS.svelte",
  "ch20/Type1Turns.svelte",
  "ch20/Type2Turns.svelte",
  "ch20/Type3Turns.svelte",
  "ch20/Type4Turns.svelte",
  "ch20/Type5Turns.svelte",
  "ch20/Type6Turns.svelte",
  "ch20/SandT.svelte",
  "ch20/OpeningClosing.svelte",
  "ch20/OneOneTurns.svelte",
  "ch21/DoubleTurnShifts.svelte",
  "ch21/DoubleTurnDashes.svelte",
  "ch21/DoubleTurnStatic.svelte",
  "ch21/CodexPages.svelte",
].map((rel) => `${LEVEL2_ROOT}/_sections/${rel}`);

/** Components genuinely stubbed to null in the SSR build that would be a
 *  realistic mistake to render unguarded in this tree (mirrors the intent of
 *  CLIENT_ONLY_COMPONENTS in timing-direction-ssr-guards.test.ts — there is
 *  no exact level-2 equivalent today, so this also asserts none of these
 *  stubbed-path imports exist at all, which is the actual current contract). */
const STUBBED_PATH = /\$lib\/(shared\/(animation-engine|3d)\/|features\/(?!browse\/|creators\/|create\/|feedback\/))[^"'`]*\.svelte/;

describe("Level 2 per-topic route SSR guards", () => {
  it("the new route + host files import nothing from an SSR-stubbed .svelte path", () => {
    for (const file of ROUTE_FILES) {
      const source = readFileSync(file, "utf8");
      const staticImportPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1]!
      );
      for (const importPath of staticImportPaths) {
        expect(
          STUBBED_PATH.test(importPath),
          `${file}: static import of SSR-stubbed path "${importPath}"`
        ).toBe(false);
      }
    }
  });

  it("every ch20/ch21 section a topic page can render imports nothing from an SSR-stubbed .svelte path", () => {
    for (const file of SECTION_FILES) {
      const source = readFileSync(file, "utf8");
      const staticImportPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1]!
      );
      for (const importPath of staticImportPaths) {
        expect(
          STUBBED_PATH.test(importPath),
          `${file}: static import of SSR-stubbed path "${importPath}"`
        ).toBe(false);
      }
    }
  });

  it("GuideCompanionHost's one client-only piece (the dynamic-imported companion drawer) stays behind {#if browser}", () => {
    const source = readFileSync(
      `${GUIDE_ROOT}/_components/GuideCompanionHost.svelte`,
      "utf8"
    );
    expect(source).toMatch(/\{#if browser && companionOpen\}/);
    expect(unguardedRenders(source, "Comp")).toEqual([]);
  });
});
