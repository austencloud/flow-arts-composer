import { describe, expect, it } from "vitest";
import { Scene3DFilmSchema } from "./scene-3d-collection-types";

// A film recorded on 2026-09-01 (before the position → placement rename),
// trimmed to one keyframe. The shape is what Firestore still holds.
const legacyFilm = {
  version: 1,
  recordedAt: 1788337767618,
  durationSeconds: 3.44,
  cameraMode: "free",
  autoSaved: true,
  keyframes: [{ timestamp: 0, position: [0, 1.6, 4], quaternion: [0, 0, 0, 1], fov: 50 }],
  render: {
    fps: 30,
    resolution: 720,
    quality: "standard",
    includeEndHold: true,
    includeStartPosition: true,
  },
};

describe("Scene3DFilmSchema", () => {
  it("reads a film saved before the placement rename", () => {
    const parsed = Scene3DFilmSchema.parse(legacyFilm);
    expect(parsed.render.includeStartPlacement).toBe(true);
    expect(parsed.render).not.toHaveProperty("includeStartPosition");
  });

  it("keeps the current key when both spellings are present", () => {
    const parsed = Scene3DFilmSchema.parse({
      ...legacyFilm,
      render: { ...legacyFilm.render, includeStartPlacement: false },
    });
    expect(parsed.render.includeStartPlacement).toBe(false);
  });
});
