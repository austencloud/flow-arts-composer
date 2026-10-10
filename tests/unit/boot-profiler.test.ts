/**
 * `npm run check` does not typecheck plain `.ts` files reachable only through
 * a Svelte import graph, so a syntax error in boot-profiler.ts passed a green
 * check and broke every 3D scene at runtime. Importing the module here makes
 * vitest transform it, which turns that class of failure back into a test
 * failure.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildBootProfileReport,
  finishBootProfile,
  formatBootProfile,
  isBootProfileEnabled,
  markBootPhaseEnd,
  markBootPhaseStart,
  recordBootFeatureReady,
  startBootProfile,
  stopBootProfile,
} from "#lib/shared/3d/scene-boot/boot-profiler.js";

describe("boot profiler gating", () => {
  afterEach(() => {
    stopBootProfile();
    delete window.__sceneBootProfileEnabled;
    delete window.__sceneBootProfile;
  });

  it("stays off by default", () => {
    expect(isBootProfileEnabled()).toBe(false);
    startBootProfile();
    expect(window.__sceneBootProfile).toEqual({ enabled: false });
    expect(buildBootProfileReport()).toBeNull();
  });

  it("leaves createImageBitmap untouched while disabled", () => {
    const original = window.createImageBitmap;
    startBootProfile();
    expect(window.createImageBitmap).toBe(original);
  });

  it("turns on for the window flag", () => {
    window.__sceneBootProfileEnabled = true;
    expect(isBootProfileEnabled()).toBe(true);
  });
});

describe("boot profiler lifecycle", () => {
  beforeEach(() => {
    window.__sceneBootProfileEnabled = true;
    startBootProfile();
  });

  afterEach(() => {
    stopBootProfile();
    delete window.__sceneBootProfileEnabled;
    delete window.__sceneBootProfile;
  });

  it("reports a phase per marked span plus a total", () => {
    markBootPhaseStart("assets");
    markBootPhaseEnd("assets");
    markBootPhaseStart("compile");
    markBootPhaseEnd("compile");

    const report = buildBootProfileReport();
    expect(report).not.toBeNull();
    expect(report?.phases.map((phase) => phase.phase)).toEqual([
      "assets",
      "compile",
      "total",
    ]);
  });

  it("keeps an unclosed phase open to the end of the window", () => {
    markBootPhaseStart("assets");
    const report = buildBootProfileReport();
    const assets = report?.phases.find((phase) => phase.phase === "assets");
    expect(assets).toBeDefined();
    expect(assets!.endMs).toBeGreaterThanOrEqual(assets!.startMs);
  });

  it("records each feature once, in order", () => {
    recordBootFeatureReady("environment");
    recordBootFeatureReady("flora");
    recordBootFeatureReady("environment");

    const report = buildBootProfileReport();
    expect(report?.features.map((feature) => feature.key)).toEqual([
      "environment",
      "flora",
    ]);
  });

  it("publishes a report and detaches instrumentation on finish", () => {
    const original = window.createImageBitmap;
    markBootPhaseStart("assets");
    markBootPhaseEnd("assets");
    finishBootProfile();

    const published = window.__sceneBootProfile;
    expect(published && "enabled" in published && published.enabled).toBe(true);
    if (typeof original === "function") {
      expect(window.createImageBitmap).toBe(original);
    }
    // A finished profile stops collecting rather than reopening a stale one.
    expect(buildBootProfileReport()).toBeNull();
  });

  it("formats a report without throwing", () => {
    markBootPhaseStart("assets");
    recordBootFeatureReady("environment");
    markBootPhaseEnd("assets");

    const report = buildBootProfileReport();
    expect(report).not.toBeNull();
    const text = formatBootProfile(report!);
    expect(text).toContain("[assets]");
    expect(text).toContain("environment");
    expect(text.split("\n").length).toBeGreaterThan(3);
  });
});
