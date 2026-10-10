import { afterEach, describe, expect, it, vi } from "vitest";

async function loadProductionFeatureFlags(
  covenOverride = "",
  buildAllOverride = ""
) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BUILD_COVEN", covenOverride);
  vi.stubEnv("BUILD_ALL", buildAllOverride);
  vi.resetModules();
  return import("../../src/config/feature-flags");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production release feature gate", () => {
  it("keeps role-gated operator modules in the production bundle", async () => {
    const flags = await loadProductionFeatureFlags();
    const defineMap = flags.getEnabledFeaturesDefineMap();

    expect(flags.isFeatureEnabled("admin")).toBe(true);
    expect(flags.isFeatureEnabled("choreo-card")).toBe(true);
    expect(defineMap).not.toHaveProperty("__FEATURE_ADMIN__");
    expect(defineMap).not.toHaveProperty("__FEATURE_CHOREO_CARD__");
    expect(flags.getDisabledFeatureModulePaths()).not.toContain(
      "features/admin/"
    );
    expect(flags.getDisabledFeatureModulePaths()).not.toContain(
      "features/choreo-card/"
    );
  });

  it("fails Coven closed without stubbing its museum-shared components", async () => {
    const flags = await loadProductionFeatureFlags();
    const coven = flags.FEATURES.find((feature) => feature.id === "coven");

    expect(coven).toMatchObject({
      tier: "dev",
      modulePaths: [],
      routePatterns: ["src/routes/coven/"],
      emptyClientRouteComponents: true,
    });
    expect(flags.getEnabledFeaturesDefineMap().__FEATURE_COVEN__).toBe("false");
    expect(flags.getClientEmptiedRoutePaths()).toEqual([
      "src/routes/1989/",
      "src/routes/1995/",
      "src/routes/1998/",
      "src/routes/2003/",
      "src/routes/coven/",
      "src/routes/test/",
      "src/routes/(dev)/",
      "src/routes/demo/",
      "src/routes/render-pictographs/",
      "src/routes/grant-feature/",
      "src/routes/hall-of-shame/",
      "src/routes/(public)/composer/auth-lab/",
    ]);
    expect(flags.getDisabledFeatureModulePaths()).not.toContain(
      "features/coven-hub/"
    );
  });

  it("keeps Coven available only through its explicit build override", async () => {
    const flags = await loadProductionFeatureFlags("true");

    expect(flags.getEnabledFeaturesDefineMap().__FEATURE_COVEN__).toBe("true");
    expect(flags.getClientEmptiedRoutePaths()).not.toContain("src/routes/coven/");
  });

  it("keeps the outward-facing /embed route out of every internal list", async () => {
    // /embed/spinner is iframed by third parties. It reads like a dev path, so
    // it is the one most likely to be swept into a gating list by mistake.
    const flags = await loadProductionFeatureFlags();

    expect(flags.getClientEmptiedRoutePaths()).not.toContain("src/routes/embed/");
    expect(flags.getDisabledRoutePatterns()).not.toContain("src/routes/embed/");
  });

  it("empties every internal route that ships real UI", async () => {
    const flags = await loadProductionFeatureFlags();
    const emptied = flags.getClientEmptiedRoutePaths();

    // Each of these was reachable in a production build before 2026-08-03.
    for (const route of [
      "src/routes/(dev)/", // /video-collab-demo — 15.9 KB, 500d on the public web
      "src/routes/grant-feature/",
      "src/routes/render-pictographs/",
      "src/routes/demo/",
      "src/routes/hall-of-shame/",
      "src/routes/(public)/composer/auth-lab/",
      "src/routes/1998/",
      "src/routes/2003/",
    ]) {
      expect(emptied).toContain(route);
    }
  });

  it("empties only the guarded route components in the client build", async () => {
    await loadProductionFeatureFlags();
    const { featureGatePlugin } =
      await import("../../src/config/vite-plugin-feature-gate");
    const plugin = featureGatePlugin();

    const configure = plugin.configResolved as (config: {
      command: string;
      build: { ssr: boolean };
    }) => void;
    configure({ command: "build", build: { ssr: false } });

    const load = plugin.load as (id: string) => string | null;
    expect(load("E:/tka-platform/src/routes/coven/+page.svelte")).toBe("");
    expect(load("E:/tka-platform/src/routes/test/foo/+page.svelte")).toBe("");
    expect(
      load(
        "E:/tka-platform/src/lib/features/coven-hub/components/CovenStation.svelte"
      )
    ).toBeNull();
    expect(
      load("E:/tka-platform/src/routes/browse/gallery/+page.svelte")
    ).toBeNull();
  });

  it("keeps the public Concepts SSR shell while stubbing its app child", async () => {
    const flags = await loadProductionFeatureFlags();
    expect(flags.getSsrRenderedFeatureComponentPaths()).toEqual([
      "features/learn/components/PublicConceptCourse.svelte",
    ]);

    const { featureGatePlugin } =
      await import("../../src/config/vite-plugin-feature-gate");
    const plugin = featureGatePlugin();
    const configure = plugin.configResolved as (config: {
      command: string;
      build: { ssr: boolean };
    }) => void;
    configure({ command: "build", build: { ssr: true } });

    const resolve = vi.fn(async (source: string) => ({
      id: `E:/tka-platform/src/lib/${source.replace("#lib/", "")}`,
    }));
    const resolveId = plugin.resolveId as (
      this: { resolve: typeof resolve },
      source: string,
      importer: string,
      options: { ssr: boolean }
    ) => Promise<string | null>;

    await expect(
      resolveId.call(
        { resolve },
        "#lib/features/learn/components/PublicConceptCourse.svelte",
        "E:/tka-platform/src/routes/(public)/learn/concepts/+page.svelte",
        { ssr: true }
      )
    ).resolves.toBeNull();
    await expect(
      resolveId.call(
        { resolve },
        "#lib/features/learn/LearnTab.svelte",
        "E:/tka-platform/src/lib/features/learn/components/PublicConceptCourse.svelte",
        { ssr: true }
      )
    ).resolves.toBe("\0feature-gate-stub.js");
  });
});
