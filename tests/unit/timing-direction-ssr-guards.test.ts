import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unguardedRenders } from "../helpers/unguarded-renders";

/**
 * The production SSR build stubs every `.svelte` file under
 * `shared/animation-engine/` and `features/learn/` to `export default null`
 * (see SSR_STUBBED_SHARED_RENDER_PATHS in src/config/feature-flags.ts). A
 * prerendered public route that renders one of those components outside a
 * `{#if browser}` block calls `null` as a component and fails the whole build
 * with "Error: 500 /timing-and-direction". The dev server never shows this
 * because the gate only runs for `vite build`.
 */

const ROUTE_DIR = resolve(
  __dirname,
  "../../src/routes/(public)/timing-and-direction"
);
const ROUTE_FILES = [
  "+layout.svelte",
  "[mode]/+page.svelte",
  "_components/TimingDirectionAtlas.svelte",
];
const CLIENT_ONLY_COMPONENTS = [
  "HandMotionPlayer",
  "TransportControls",
  "TimingDirectionIntro",
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("timing and direction SSR guards", () => {
  it("renders every SSR-stubbed component client-only", () => {
    for (const file of ROUTE_FILES) {
      const source = readFileSync(resolve(ROUTE_DIR, file), "utf8");
      for (const component of CLIENT_ONLY_COMPONENTS) {
        expect(
          unguardedRenders(source, component),
          `${file}: <${component}> outside {#if browser}`
        ).toEqual([]);
      }
    }
  });

  it("still needs the guards: the SSR build stubs these imports", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { featureGatePlugin } =
      await import("../../src/config/vite-plugin-feature-gate");
    const plugin = featureGatePlugin();
    (
      plugin.configResolved as (config: {
        command: string;
        build: { ssr: boolean };
      }) => void
    )({ command: "build", build: { ssr: true } });

    const resolveId = plugin.resolveId as (
      this: { resolve: (source: string) => Promise<{ id: string }> },
      source: string,
      importer: string,
      options: { ssr: boolean }
    ) => Promise<string | null>;
    const context = {
      resolve: async (source: string) => ({
        id: `E:/tka-platform/src/lib/${source.replace("#lib/", "")}`,
      }),
    };
    const importer = `${ROUTE_DIR}/_components/TimingDirectionAtlas.svelte`;

    for (const source of [
      "#lib/shared/animation-engine/components/controls/TransportControls.svelte",
      "#lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte",
      "#lib/features/learn/components/interactive/motions/TimingDirectionIntro.svelte",
    ]) {
      await expect(
        resolveId.call(context, source, importer, { ssr: true })
      ).resolves.toBe("\0feature-gate-stub.js");
    }
  });

  it("flags a render that escapes its guard", () => {
    const source = [
      "{#if browser}",
      "  <HandMotionPlayer />",
      "{/if}",
      "{#if open}",
      "  <HandMotionPlayer />",
      "{/if}",
      "<HandMotionPlayer />",
      "{#if browser && !togetherOppositeRoute}",
      "  <HandMotionPlayer />",
      "{/if}",
      "{#if browser || open}",
      "  <HandMotionPlayer />",
      "{/if}",
    ].join("\n");
    expect(unguardedRenders(source, "HandMotionPlayer")).toEqual([5, 7, 12]);
  });
});
