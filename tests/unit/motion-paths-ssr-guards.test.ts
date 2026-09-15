import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unguardedRenders } from "../helpers/unguarded-renders";

/**
 * /guide/motion-paths is a prerendered public route. Its explanation renders
 * LessonStageControls from features/learn, and its explorer renders the
 * transition stage whose InlineAnimationPlayer pulls in the animation engine.
 * Both are stubbed to `null` in the production SSR build, so each render has
 * to sit inside `{#if browser}`. 2026-09-14: an unguarded LessonStageControls
 * failed the deploy build with "Error: 500 /guide/motion-paths".
 */

const ROUTE_DIR = resolve(
  __dirname,
  "../../src/routes/(public)/guide/motion-paths"
);
const ROUTE_FILES = [
  "+page.svelte",
  "_components/MotionPathExplanation.svelte",
  "_components/MotionPathExplorer.svelte",
];
const CLIENT_ONLY_COMPONENTS = [
  "LessonStageControls",
  "MotionPathExplorer",
  "MotionPathTransitionStage",
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("motion paths SSR guards", () => {
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

  it("still needs the guard: the SSR build stubs the learn controls", async () => {
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
        id: `E:/tka-platform/src/lib/${source.replace("$lib/", "")}`,
      }),
    };
    const importer = `${ROUTE_DIR}/_components/MotionPathExplanation.svelte`;

    for (const source of [
      "$lib/features/learn/components/interactive/LessonStageControls.svelte",
      "$lib/features/learn/components/interactive/ExperienceProgressIndicator.svelte",
    ]) {
      await expect(
        resolveId.call(context, source, importer, { ssr: true })
      ).resolves.toBe("\0feature-gate-stub.js");
    }
  });
});
