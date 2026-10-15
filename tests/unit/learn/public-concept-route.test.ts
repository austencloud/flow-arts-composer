import { describe, expect, it } from "vitest";
import {
  entries,
  load,
} from "../../../src/routes/(public)/learn/concepts/[conceptId]/+page";

async function loadConcept(conceptId: string) {
  return load({ params: { conceptId } } as Parameters<typeof load>[0]);
}

describe("public concept route", () => {
  const withdrawn = [
    "staff-placements",
    "words-alpha-beta",
    "reading-choreo-cards",
    "rotation-direction",
    "dual-shifts-alpha-beta",
    "gamma-motion",
    "letter-codex-intro",
    "type1-abc-ghi",
  ];

  it("prerenders only the four confident lessons", async () => {
    const paths = (await entries()).map(({ conceptId }) => conceptId);

    expect(paths).toEqual([
      "grid",
      "hand-placements",
      "hand-motions-intro",
      "timing-and-direction",
    ]);
    for (const conceptId of withdrawn) expect(paths).not.toContain(conceptId);
  });

  it.each(withdrawn)("returns 404 for a saved %s URL", async (conceptId) => {
    await expect(loadConcept(conceptId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("still opens the surrounding published lessons", async () => {
    await expect(loadConcept("grid")).resolves.toEqual({});
    await expect(loadConcept("timing-and-direction")).resolves.toEqual({});
  });
});
