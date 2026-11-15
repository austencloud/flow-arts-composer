/**
 * A failed 3D warm-up must never reload the page under a visitor who did not
 * tap: Vite raises vite:preloadError before the warm-up's own catch runs, and
 * hooks.client.ts answers that event with a reload. These pin who owns the
 * event at each moment.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  _resetViewer3DWarmupGuardForTests,
  releaseViewer3DWarmupGuard,
  runGuardedWarmup,
  viewer3DWarmupOwnsPreloadErrors,
} from "#lib/shared/3d/scene-boot/viewer-3d-warmup-guard.js";

afterEach(() => _resetViewer3DWarmupGuardForTests());

describe("viewer 3D warm-up guard", () => {
  it("owns preload errors only while a warm-up import is pending", async () => {
    expect(viewer3DWarmupOwnsPreloadErrors()).toBe(false);
    let seenDuring = false;
    await runGuardedWarmup(async () => {
      seenDuring = viewer3DWarmupOwnsPreloadErrors();
    });
    expect(seenDuring).toBe(true);
    expect(viewer3DWarmupOwnsPreloadErrors()).toBe(false);
  });

  it("still owns the error when Vite dispatches it, then swallows the rejection", async () => {
    let ownedAtDispatch = false;
    const result = await runGuardedWarmup(async () => {
      await Promise.resolve();
      // Vite's preload helper dispatches here, inside the import's chain.
      ownedAtDispatch = viewer3DWarmupOwnsPreloadErrors();
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    expect(ownedAtDispatch).toBe(true);
    expect(result).toBeUndefined();
    expect(viewer3DWarmupOwnsPreloadErrors()).toBe(false);
  });

  it("hands errors back once the visitor asks for 3D, even mid warm-up", async () => {
    let ownedAfterTap = true;
    await runGuardedWarmup(async () => {
      releaseViewer3DWarmupGuard();
      ownedAfterTap = viewer3DWarmupOwnsPreloadErrors();
    });
    expect(ownedAfterTap).toBe(false);
  });

  it("starts no warm-up after the tap", async () => {
    releaseViewer3DWarmupGuard();
    let ran = false;
    await runGuardedWarmup(async () => {
      ran = true;
    });
    expect(ran).toBe(false);
  });

  it("is consulted by the stale-chunk reload before it recovers", () => {
    const hooks = readFileSync(resolve("src/hooks.client.ts"), "utf8");
    const handler = hooks.slice(
      hooks.indexOf('addEventListener("vite:preloadError"')
    );
    const guard = handler.indexOf(
      "if (viewer3DWarmupOwnsPreloadErrors()) return;"
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(handler.indexOf("claimChunkRecoveryStep()"));
  });

  it("is released by the viewer when 3D is asked for", () => {
    const surface = readFileSync(
      resolve(
        "src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte"
      ),
      "utf8"
    );
    expect(surface).toMatch(
      /threeDRequested = true;[\s\S]{0,200}releaseViewer3DWarmupGuard\(\);/
    );
    expect(surface).toContain("() => warmViewer3DCode(() => threeDRequested)");
  });
});
