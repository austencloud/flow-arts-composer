import { describe, expect, it } from "vitest";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import { selectTogetherOppositeExamples } from "../../src/routes/(public)/timing-and-direction/_data/together-opposite-examples";
import { getAllLetterVariants } from "../helpers/real-pictograph-loader";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

describe("Together-Opposite article examples", () => {
  it("uses geometry-classified dataframe variants instead of a letter-family table", async () => {
    const [diamondJ, boxM] = await Promise.all([
      getAllLetterVariants(Letter.J, GridMode.DIAMOND),
      getAllLetterVariants(Letter.M, GridMode.BOX),
    ]);
    const examples = selectTogetherOppositeExamples([
      ...diamondJ.map((pictograph) => ({
        ...pictograph,
        gridMode: GridMode.DIAMOND,
      })),
      ...boxM.map((pictograph) => ({ ...pictograph, gridMode: GridMode.BOX })),
    ]);

    expect(examples).toHaveLength(2);
    expect(examples.map(({ label }) => label)).toEqual([
      expect.stringMatching(/^J .+ diamond$/),
      expect.stringMatching(/^M .+ box$/),
    ]);
    expect(
      examples.map(
        ({ pictograph }) => deriveTnDFromPictograph(pictograph).tndMode
      )
    ).toEqual([TnDMode.TOG_OPP, TnDMode.TOG_OPP]);
  });

  it("keeps one readable representative for each matching letter and grid", async () => {
    const variants = await getAllLetterVariants(Letter.D, GridMode.DIAMOND);
    const examples = selectTogetherOppositeExamples(
      [...variants, ...variants].map((pictograph) => ({
        ...pictograph,
        gridMode: GridMode.DIAMOND,
      }))
    );

    expect(new Set(examples.map(({ id }) => id)).size).toBe(examples.length);
    expect(
      examples.every(
        ({ pictograph }) =>
          deriveTnDFromPictograph(pictograph).tndMode === TnDMode.TOG_OPP
      )
    ).toBe(true);
  });
});
