import { describe, expect, it } from "vitest";
import {
  defaultPlacementCandidateKeys,
  letterPlacementGroup,
} from "../src/calculations/default-placement-key.js";
import { getArrowAnchorCoordinates } from "../src/calculations/arrow-placement.js";
import {
  getHandPointCoordinates,
  getLayer2PointCoordinates,
} from "../src/calculations/grid-placement.js";

describe("default placement keys", () => {
  it("groups placements by letter, not by where the step ends", () => {
    expect(letterPlacementGroup("A")).toBe("alpha");
    expect(letterPlacementGroup("Y")).toBe("beta");
    expect(letterPlacementGroup("γ")).toBe("gamma");
    expect(letterPlacementGroup(undefined)).toBeNull();
  });

  it("tries the letter key, the letterless key, then the bare motion type", () => {
    expect(
      defaultPlacementCandidateKeys({
        motionType: "Static",
        letter: "Y",
        endOrientation: "in",
        leftEndOrientation: "in",
        rightEndOrientation: "out",
      })
    ).toEqual(["static_to_layer1_beta_Y", "static_to_layer1_beta", "static"]);
  });

  it("names dash letters with a _dash suffix", () => {
    expect(
      defaultPlacementCandidateKeys({
        motionType: "dash",
        letter: "Λ-",
        leftEndOrientation: "clock",
        rightEndOrientation: "counter",
      })[0]
    ).toBe("dash_to_layer2_gamma_Λ_dash");
  });

  it("splits mixed layers by the placed hand's end orientation", () => {
    const mixed = { letter: "G", leftEndOrientation: "in", rightEndOrientation: "clock" };
    expect(
      defaultPlacementCandidateKeys({ ...mixed, motionType: "pro", endOrientation: "clock" })[1]
    ).toBe("pro_to_nonradial_layer3_beta");
    expect(
      defaultPlacementCandidateKeys({ ...mixed, motionType: "anti", endOrientation: "in" })[1]
    ).toBe("anti_to_radial_layer3_beta");
  });

  it("reads a lone hand's own layer with alpha placements", () => {
    expect(
      defaultPlacementCandidateKeys({
        motionType: "pro",
        letter: "Y",
        endOrientation: "clock",
        leftEndOrientation: "clock",
      })
    ).toEqual(["pro_to_layer2_alpha_Y", "pro_to_layer2_alpha", "pro"]);
  });
});

describe("arrow anchor", () => {
  it("puts static and dash arrows on the hand point, shifts on layer 2", () => {
    for (const gridMode of ["diamond", "box"] as const) {
      for (const location of ["n", "e", "ne", "sw"]) {
        const hand = getHandPointCoordinates(location, gridMode);
        const layer2 = getLayer2PointCoordinates(location, gridMode);
        expect(getArrowAnchorCoordinates("static", location, gridMode)).toEqual(hand);
        expect(getArrowAnchorCoordinates("DASH", location, gridMode)).toEqual(hand);
        expect(getArrowAnchorCoordinates("pro", location, gridMode)).toEqual(layer2);
        expect(getArrowAnchorCoordinates("float", location, gridMode)).toEqual(layer2);
      }
    }
    expect(getArrowAnchorCoordinates("static", "e", "diamond")).not.toEqual(
      getLayer2PointCoordinates("e", "diamond")
    );
  });
});
