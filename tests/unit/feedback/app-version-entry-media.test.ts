import { describe, it, expect } from "vitest";
import { AppVersionSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

// A release note's example is optional decoration. A bad one must cost only
// the picture: if it failed the schema, the whole version would vanish from
// What's New and Release Notes.
describe("AppVersionSchema entry media", () => {
  const media = {
    image: "https://assets.tkaflowarts.com/email/releases/0.49.0/effects.gif",
    video: "https://assets.tkaflowarts.com/email/releases/0.49.0/effects.mp4",
    alt: "Four effects",
    width: 1040,
    height: 1040,
  };
  const parse = (entryMedia: unknown) =>
    AppVersionSchema.parse({
      id: "0.49.0",
      version: "0.49.0",
      releasedAt: "2026-10-21T00:00:00.000Z",
      changelogEntries: [
        { category: "improved", text: "Effects rebuilt.", media: entryMedia },
      ],
    }).changelogEntries![0]!;

  it("keeps complete https media", () => {
    expect(parse(media).media).toEqual(media);
  });

  it("drops an insecure or incomplete example but keeps the note", () => {
    for (const bad of [
      { ...media, image: "http://example.com/a.gif" },
      { ...media, width: 0 },
      { ...media, alt: "" },
      "effects.gif",
    ]) {
      const entry = parse(bad);
      expect(entry.text).toBe("Effects rebuilt.");
      expect(entry.media).toBeUndefined();
    }
  });

  it("drops only an insecure clip or poster, keeping the picture", () => {
    expect(
      parse({ ...media, video: "http://example.com/a.mp4" }).media
    ).toEqual({
      ...media,
      video: undefined,
    });
    const poster =
      "https://assets.tkaflowarts.com/email/releases/0.49.0/effects.jpg";
    expect(parse({ ...media, poster }).media).toEqual({ ...media, poster });
    expect(
      parse({ ...media, poster: "http://example.com/a.jpg" }).media
    ).toEqual({
      ...media,
      poster: undefined,
    });
  });
});
