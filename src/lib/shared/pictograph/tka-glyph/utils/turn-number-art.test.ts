/**
 * Turn numbers must be part of the app's code. A number fetched by file path
 * lands a moment after its letter on a first visit, so every number file needs
 * art that is available the instant a card mounts.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { turnNumberArt } from "./turn-number-art";
import { HALF_MARK_IMAGE_PATH } from "./turn-tuple-parser";

const NUMBERS_DIR = path.resolve(process.cwd(), "static/images/numbers");
const DATA_URL_PREFIX = "data:image/svg+xml;base64,";

function decode(dataUrl: string): string {
  return Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64").toString(
    "utf8"
  );
}

describe("turnNumberArt", () => {
  it("has a data URL for every file in static/images/numbers", () => {
    const files = readdirSync(NUMBERS_DIR).filter((f) => f.endsWith(".svg"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const publicPath = `/images/numbers/${file}`;
      expect(turnNumberArt(publicPath), publicPath).toMatch(
        /^data:image\/svg\+xml/
      );
    }
  });

  it("returns a data URL that decodes to the svg markup", () => {
    const art = turnNumberArt("/images/numbers/1.5.svg");
    expect(art.startsWith("data:image/svg+xml")).toBe(true);
    expect(decode(art)).toContain("<svg");
  });

  it("covers the half mark", () => {
    expect(turnNumberArt(HALF_MARK_IMAGE_PATH)).toMatch(
      /^data:image\/svg\+xml/
    );
  });

  it("returns an unknown path unchanged", () => {
    expect(turnNumberArt("/images/numbers/nope.svg")).toBe(
      "/images/numbers/nope.svg"
    );
  });
});
