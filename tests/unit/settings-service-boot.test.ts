/**
 * Settings service boot contract.
 *
 * getSettings() serves a frozen copy of the browser's saved settings until the
 * settings service starts. A route that never starts it still renders, just
 * with the prop it loaded with, and never follows a change, including one
 * synced from another tab. Nothing looks broken, so these checks guard it.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The body of a named function, found by matching its braces. */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start + signature.length);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`${signature} has unbalanced braces`);
}

describe("root layout settings boot", () => {
  const layout = readFileSync("src/routes/+layout.svelte", "utf8");

  it("loads the settings service lazily so public pages never download it", () => {
    const start = functionBody(layout, "function startSettingsService()");
    expect(start).toMatch(
      /import\("\$lib\/shared\/application\/state\/services\.svelte"\)[\s\S]*initializeAppServices\(\)/
    );
    expect(layout).not.toMatch(
      /^\s*import[^;]*from\s+"\$lib\/shared\/application\/state\/services\.svelte"/m
    );
  });

  it("starts it for app routes, including ones outside MainApplication", () => {
    expect(functionBody(layout, "async function initAppMode()")).toMatch(
      /containerReady = true;\s*startSettingsService\(\);/
    );
  });

  it("starts it for retro routes, whose bootstrap already loads Firebase", () => {
    expect(layout).toMatch(
      /initRetroMode\(\)\)\s*\.then\(\(\) => \{\s*containerReady = true;\s*startSettingsService\(\);\s*\}\)/
    );
  });

  it("leaves landing mode free of it", () => {
    expect(functionBody(layout, "async function initLandingMode()")).not.toMatch(
      /startSettingsService|services\.svelte/
    );
  });
});

describe("app boot state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stays un-booted when the settings service started first", async () => {
    // The root layout starts the settings service while MainApplication's code
    // may still be loading. MainApplication skips restoring the workspace, the
    // saved settings and the theme when the app already reads as booted.
    const services = await import(
      "$lib/shared/application/state/services.svelte"
    );
    await services.initializeAppServices();
    expect(services.areServicesInitialized()).toBe(true);

    const boot = await import(
      "$lib/shared/application/state/initialization-state.svelte"
    );
    expect(boot.getIsInitialized()).toBe(false);
    expect(boot.getInitializationProgress()).toBe(0);
  });
});
