import { describe, expect, it } from "vitest";
import {
  flowerPetals,
  type Flower,
  type FlowerStyle,
  type RotatingFlowerOri,
} from "@tka/shape-domain";
import { describeSoloFlower } from "../shape-matrix-display";

function rotating(
  style: FlowerStyle,
  turns: number,
  ori: RotatingFlowerOri = "out"
): Flower {
  return {
    style,
    turns,
    ori,
    grid: "diamond",
    petals: flowerPetals({ style, turns }),
  };
}

const tka = (value: string) => ({ system: "TKA", value });
const vtg = (value: string) => ({ system: "VTG", value });

describe("describeSoloFlower", () => {
  it("gives the name in spinner words and credits each reading to its system", () => {
    expect(describeSoloFlower(rotating("pro", 2), "left", "diagonal")).toEqual({
      hand: "Left hand",
      headline: "4-petal box-mode inspin flower",
      note: null,
      modeMeaning: "Petals at the four corners.",
      tka: tka("prospin · 2 turns"),
      vtg: vtg("1:5"),
    });
  });

  it("calls petals on the cardinals diamond mode", () => {
    expect(
      describeSoloFlower(rotating("pro", 2), "left", "cardinal").headline
    ).toBe("4-petal diamond-mode inspin flower");
    expect(
      describeSoloFlower(rotating("anti", 1), "right", "cardinal").headline
    ).toBe("4-petal diamond-mode antispin flower");
  });

  it("describes antispin on the right hand with a singular turn", () => {
    expect(
      describeSoloFlower(rotating("anti", 1), "right", "diagonal")
    ).toEqual({
      hand: "Right hand",
      headline: "4-petal box-mode antispin flower",
      note: null,
      modeMeaning: "Petals at the four corners.",
      tka: tka("antispin · 1 turn"),
      vtg: vtg("1:3"),
    });
  });

  it("explains diamond mode beside its name", () => {
    expect(
      describeSoloFlower(rotating("pro", 2), "left", "cardinal").modeMeaning
    ).toBe("Petals at the top, bottom and sides.");
  });

  it("drops the mode word and its meaning when the path names no direction", () => {
    const flower = describeSoloFlower(rotating("pro", 2), "left", null);
    expect(flower.headline).toBe("4-petal inspin flower");
    expect(flower.modeMeaning).toBeNull();
  });

  it("explains no mode when the petal count takes no mode word", () => {
    expect(
      describeSoloFlower(rotating("anti", 3), "left", "diagonal").modeMeaning
    ).toBeNull();
  });

  it("prints a mode word only at 4 and 12 petals", () => {
    const headline = (style: FlowerStyle, turns: number) =>
      describeSoloFlower(rotating(style, turns), "left", "diagonal").headline;
    expect(headline("pro", 6)).toBe("12-petal box-mode inspin flower");
    expect(headline("anti", 3)).toBe("8-petal antispin flower");
    expect(headline("pro", 3)).toBe("6-petal inspin flower");
    expect(headline("anti", -0.25)).toBe("3-petal antispin flower");
  });

  it("keeps one petal singular and fractional turns as decimals", () => {
    const quarter = describeSoloFlower(rotating("pro", 0.25), "left", null);
    expect(quarter.headline).toBe("1-petal inspin flower");
    expect(quarter.tka).toEqual(tka("prospin · 0.25 turns"));
    expect(quarter.vtg).toEqual(vtg("2:3"));
    const threeHalves = describeSoloFlower(rotating("pro", 1.5), "left", null);
    expect(threeHalves.tka).toEqual(tka("prospin · 1.5 turns"));
    expect(threeHalves.vtg).toEqual(vtg("1:4"));
  });

  it("calls prospin at 0 turns an extension and still prospin in TKA", () => {
    expect(describeSoloFlower(rotating("pro", 0), "left", null)).toEqual({
      hand: "Left hand",
      headline: "Extension",
      note: null,
      modeMeaning: null,
      tka: tka("prospin · 0 turns"),
      vtg: vtg("1:1"),
    });
  });

  it("describes a float by what the prop does", () => {
    const float: Flower = {
      style: "float",
      turns: "fl",
      ori: "clock",
      grid: "diamond",
      petals: 0,
    };
    expect(describeSoloFlower(float, "right", null)).toEqual({
      hand: "Right hand",
      headline: "Float",
      note: "The prop keeps its angle while the hand circles.",
      modeMeaning: null,
      tka: tka("float · clock"),
      vtg: vtg("1:0"),
    });
    expect(
      describeSoloFlower({ ...float, ori: "out" }, "left", null).tka
    ).toEqual(tka("float · out"));
  });

  it("never puts the ratio in the TKA reading", () => {
    for (const flower of [rotating("pro", 2), rotating("anti", 1)]) {
      const { tka: reading, vtg: ratio } = describeSoloFlower(
        flower,
        "left",
        null
      );
      expect(reading.value).not.toContain(ratio.value);
    }
  });
});
