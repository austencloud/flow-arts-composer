// @vitest-environment jsdom
/**
 * The switch warm-up spends a visitor's bandwidth before they tap 3D, so what
 * it fetches must be exactly what the switch loads: a wrong character URL or
 * a model the worker never asks for is downloaded for nothing, silently.
 */
import { describe, expect, it, vi } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";

vi.mock("$app/env", () => ({ browser: true }));

import { AVATAR_DEFINITIONS, getAvatarModelPath } from "@austencloud/scene-3d";
import {
  DECODER_RUNTIME_URLS,
  sceneAssetUrls,
} from "#lib/shared/3d/scene-boot/scene-asset-manifest.js";
import {
  FIRST_VISIT_CHARACTER_URL,
  viewer3DWarmupPlan,
} from "#lib/shared/3d/scene-boot/scene-prefetch.js";
import {
  DEFAULT_CAST_IDS,
  RETIRED_DEFAULT_CHARACTER_ID,
} from "#lib/shared/3d/performers/default-cast.js";

function storage(entries: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (key) => entries[key] ?? null };
}

describe("viewer3DWarmupPlan", () => {
  it("names the mannequin's real file", () => {
    expect(FIRST_VISIT_CHARACTER_URL).toBe(
      getAvatarModelPath(RETIRED_DEFAULT_CHARACTER_ID)
    );
  });

  it("is only right while the published catalog lacks the default cast", () => {
    // When the cast is uploaded, a first visitor gets one of the four people
    // and the mannequin warm-up must go (performers/default-cast.ts).
    const published = new Set(AVATAR_DEFINITIONS.map(({ id }) => id));
    const local = AVATAR_DEFINITIONS.filter(
      (definition) =>
        (definition as { availability?: string }).availability ===
        "local-evaluation"
    ).map(({ id }) => id);
    const shipped = [...published].filter((id) => !local.includes(id));
    expect(DEFAULT_CAST_IDS.every((id) => shipped.includes(id))).toBe(false);
  });

  it("warms decoders, then the performer, then the place, on a first production visit", () => {
    expect(viewer3DWarmupPlan(storage({}), true)).toEqual([
      ...DECODER_RUNTIME_URLS,
      FIRST_VISIT_CHARACTER_URL,
      ...sceneAssetUrls(BackgroundType.COSMIC),
    ]);
  });

  it("never warms the cosmic stage model, which nothing loads", () => {
    expect(viewer3DWarmupPlan(storage({}), true)).not.toContain(
      "/models/cosmic/cosmic-stage.glb"
    );
  });

  it("skips the performer when the visitor has a saved cast or in dev", () => {
    const saved = storage({ "tka-viewer3d-performers": "[]" });
    expect(viewer3DWarmupPlan(saved, true)).not.toContain(
      FIRST_VISIT_CHARACTER_URL
    );
    expect(viewer3DWarmupPlan(storage({}), false)).not.toContain(
      FIRST_VISIT_CHARACTER_URL
    );
  });

  it("follows the remembered place", () => {
    const plan = viewer3DWarmupPlan(
      storage({ "tka-viewer3d-environment": "autumn" }),
      true
    );
    expect(plan).toEqual(
      expect.arrayContaining([...sceneAssetUrls(BackgroundType.AUTUMN)])
    );
  });
});
