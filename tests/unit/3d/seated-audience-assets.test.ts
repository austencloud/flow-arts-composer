import { describe, expect, it } from "vitest";
import {
  SEATED_AUDIENCE_ANIMATION_URLS,
  SEATED_AUDIENCE_CHARACTER_IDS,
  SEATED_AUDIENCE_CHARACTER_URLS,
} from "#lib/shared/3d/config/seated-audience-assets.js";
import { DEPLOYED_CHARACTER_DEFINITIONS } from "#lib/shared/3d/config/deployed-characters.js";

describe("seated audience assets", () => {
  it("resolves every seat model through the deployed character registry", () => {
    expect(SEATED_AUDIENCE_CHARACTER_URLS).toHaveLength(
      SEATED_AUDIENCE_CHARACTER_IDS.length
    );

    for (const [index, modelUrl] of SEATED_AUDIENCE_CHARACTER_URLS.entries()) {
      const id = SEATED_AUDIENCE_CHARACTER_IDS[index];
      const registered = DEPLOYED_CHARACTER_DEFINITIONS.find(
        (character) => character.id === id
      );
      expect(registered, `${id} is not a deployed character`).toBeDefined();
      // The audience writes no URLs of its own: a seat is whatever the
      // registry publishes for that character, revision included.
      expect(modelUrl).toBe(registered?.modelPath);

      const parsed = new URL(modelUrl);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.hostname).toBe("assets.tkaflowarts.com");
      // These GLBs are served immutable, so a corrected export takes its own
      // revision rather than moving every avatar onto a new prefix. ch12 was
      // re-exported OPAQUE on 2026-09-04 and sits a revision ahead of its
      // neighbours, so only the shape of the release path is fixed here.
      const segments = parsed.pathname.split("/");
      expect(segments).toHaveLength(5);
      expect(segments.slice(0, 3)).toEqual(["", "models", "avatars"]);
      expect(segments[3]).toMatch(/^v\d{4}-\d{2}-\d{2}-r\d+$/);
      expect(segments[4]).toBe(`${id}.glb.bin`);
    }
  });

  it("loads the verified seated animation from an immutable CDN path", () => {
    expect(SEATED_AUDIENCE_ANIMATION_URLS).toEqual([
      "https://assets.tkaflowarts.com/animations/v2026-07-23-r1/sitting-idle-b.fbx.bin",
    ]);
  });

  it("does not infer deployment from URL shape or hide registered characters", () => {
    expect(DEPLOYED_CHARACTER_DEFINITIONS).toHaveLength(16);
    expect(
      DEPLOYED_CHARACTER_DEFINITIONS.every(
        ({ modelPath }) =>
          new URL(modelPath).protocol === "https:" &&
          new URL(modelPath).hostname === "assets.tkaflowarts.com"
      )
    ).toBe(true);
  });
});
