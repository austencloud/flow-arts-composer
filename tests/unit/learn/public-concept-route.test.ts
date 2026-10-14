import { describe, expect, it } from "vitest";
import {
  entries,
  load,
} from "../../../src/routes/(public)/learn/concepts/[conceptId]/+page";

async function loadConcept(conceptId: string) {
  return load({ params: { conceptId } } as Parameters<typeof load>[0]);
}

describe("public concept route", () => {
  it("prerenders ten published lessons without the withdrawn experiences", async () => {
    const paths = (await entries()).map(({ conceptId }) => conceptId);

    expect(paths).toHaveLength(10);
    expect(paths).not.toContain("staff-placements");
    expect(paths).not.toContain("words-alpha-beta");
    expect(paths).toContain("letter-codex-intro");
    expect(paths).toContain("gamma-motion");
  });

  it.each(["staff-placements", "words-alpha-beta"])(
    "returns 404 for a saved %s URL",
    async (conceptId) => {
      await expect(loadConcept(conceptId)).rejects.toMatchObject({
        status: 404,
      });
    }
  );

  it("still opens the surrounding published lessons", async () => {
    await expect(loadConcept("gamma-motion")).resolves.toEqual({});
    await expect(loadConcept("letter-codex-intro")).resolves.toEqual({});
  });
});
