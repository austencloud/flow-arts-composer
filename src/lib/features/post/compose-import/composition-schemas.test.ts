import { describe, expect, it } from "vitest";
import { CompositionSchema } from "./composition-schemas";

describe("CompositionSchema", () => {
  it("restores literal blue/red motion records in saved cells", () => {
    const parsed = CompositionSchema.parse({
      id: "composition-1",
      name: "Legacy",
      layout: { rows: 1, cols: 1 },
      cells: [
        {
          id: "cell-1",
          type: "sequence",
          sequences: [
            {
              id: "sequence-1",
              steps: [
                {
                  motions: {
                    blue: { color: "blue", motionType: "pro" },
                    red: { color: "red", motionType: "anti" },
                  },
                },
              ],
            },
          ],
          trailSettings: {},
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      creator: "tester",
      isFavorite: false,
    });

    expect(parsed.cells[0]?.sequences[0]?.steps).toEqual([
      {
        motions: {
          left: { hand: "left", motionType: "pro" },
          right: { hand: "right", motionType: "anti" },
        },
      },
    ]);
  });
});
