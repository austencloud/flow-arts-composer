import { describe, expect, it } from "vitest";

// tests/setup/vitest-setup.ts serves root-relative fetches out of static/.
// SpecialPlacementDataProvider builds each letter's URL with
// encodeURIComponent(letter), so β arrives as %CE%B2. A shim that joins the
// raw path looks for a file literally named %CE%B2_placements.json, answers
// 404, and every Greek letter silently loses its special arrow placements.
const SPECIAL_FROM_LAYER1 = "/data/arrow_placement/special/from_layer1";

describe("vitest-setup static fetch shim", () => {
  it("serves a percent-encoded Greek special placement file", async () => {
    const response = await fetch(
      `${SPECIAL_FROM_LAYER1}/%CE%B2_placements.json`
    );

    expect(response.status).toBe(200);
    const placements = (await response.json()) as Record<string, unknown>;
    expect(placements).toHaveProperty("β");
  });

  it("answers 404 for a malformed escape instead of rejecting", async () => {
    // %CE opens a two-byte UTF-8 sequence that never finishes.
    const response = await fetch(`${SPECIAL_FROM_LAYER1}/%CE_placements.json`);

    expect(response.status).toBe(404);
  });

  it("answers 404 for an encoded path that climbs out of static/", async () => {
    // Decodes to ../package.json, a real file one level above static/.
    const response = await fetch("/%2E%2E/package.json");

    expect(response.status).toBe(404);
  });
});
