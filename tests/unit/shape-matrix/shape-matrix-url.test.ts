import { describe, expect, it } from "vitest";

import {
  buildFlowerAxis,
  flowerKey,
} from "$lib/shared/shape-matrix/domain/flower-signature";
import {
  readShapeMatrixRouteState,
  writeShapeMatrixRouteState,
} from "../../../src/routes/(public)/shape-engine/_state/shape-matrix-url";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const COMMON = {
  surface: "matrix" as const,
  theoryLeftRatio: { propRotations: 1, handCycles: 3 },
  theoryRightRatio: { propRotations: 1, handCycles: 3 },
  theoryMode: "SS" as const,
  theoryPair: null,
  activeAxis: "both" as const,
  propType: PropType.STAFF,
  propMode: null,
  solo: null,
};

describe("shape matrix URL state", () => {
  it("round-trips the selected matrix state without dropping unrelated params", () => {
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    const url = new URL(
      "https://tkaflowarts.com/shape-engine?ref=promo"
    );

    writeShapeMatrixRouteState(url, {
      level: 3,
      leftTurn: 0,
      rightTurn: 0,
      ...COMMON,
      labelMode: "ratios",
      pair: { left, right },
      mode: "SS",
    });

    expect(url.searchParams.get("ref")).toBe("promo");
    expect(url.searchParams.get("left")).toBe(flowerKey(left));
    expect(url.searchParams.get("right")).toBe(flowerKey(right));
    expect(readShapeMatrixRouteState(url.search)).toEqual({
      level: 3,
      leftTurn: 0,
      rightTurn: 0,
      ...COMMON,
      labelMode: "ratios",
      pair: { left, right },
      mode: "SS",
    });
  });

  it("carries a soloed hand, and drops it without a pair", () => {
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    const url = new URL("https://tkaflowarts.com/shape-engine");

    writeShapeMatrixRouteState(url, {
      level: 3,
      leftTurn: 0,
      rightTurn: 0,
      ...COMMON,
      solo: "right",
      labelMode: "turns",
      pair: { left, right },
      mode: "SS",
    });

    expect(url.searchParams.get("solo")).toBe("right");
    expect(readShapeMatrixRouteState(url.search).solo).toBe("right");

    // Without a pair there is no hand to solo, so the link says nothing.
    writeShapeMatrixRouteState(url, {
      level: 3,
      leftTurn: 0,
      rightTurn: 0,
      ...COMMON,
      labelMode: "turns",
      pair: null,
      mode: null,
    });
    expect(url.searchParams.get("solo")).toBeNull();
    expect(readShapeMatrixRouteState("?level=3&solo=left").solo).toBeNull();
  });

  it("rejects partial or unknown selections without inventing a mode", () => {
    const state = readShapeMatrixRouteState(
      "?level=9&blue=not-a-flower&mode=SS"
    );

    expect(state).toEqual({
      level: 2,
      leftTurn: 2,
      rightTurn: 2,
      ...COMMON,
      labelMode: "turns",
      pair: null,
      mode: null,
    });
  });

  it("removes cell parameters when the selection is cleared", () => {
    const url = new URL(
      "https://tkaflowarts.com/shape-engine?size=medium&blue=x&red=y&mode=SS"
    );

    writeShapeMatrixRouteState(url, {
      level: 1,
      leftTurn: 0,
      rightTurn: 0,
      ...COMMON,
      labelMode: "turns",
      pair: null,
      mode: null,
    });

    expect(url.searchParams.get("blue")).toBeNull();
    expect(url.searchParams.get("red")).toBeNull();
    expect(url.searchParams.get("leftTurn")).toBe("0");
    expect(url.searchParams.get("rightTurn")).toBe("0");
  });

  it("migrates the old cumulative size links onto their outer turn band", () => {
    expect(readShapeMatrixRouteState("?size=large")).toEqual({
      level: 2,
      leftTurn: 2,
      rightTurn: 2,
      ...COMMON,
      labelMode: "turns",
      pair: null,
      mode: null,
    });
  });

  it("reads independent axis bands without restoring the legacy driver mode", () => {
    const state = readShapeMatrixRouteState(
      "?level=4&leftTurn=0.75&rightTurn=1.5&axis=right&labels=ratios&prop=fan&driver=props"
    );

    expect(state).toEqual({
      surface: "matrix",
      theoryLeftRatio: { propRotations: 1, handCycles: 3 },
      theoryRightRatio: { propRotations: 1, handCycles: 3 },
      theoryMode: "SS",
      theoryPair: null,
      level: 4,
      leftTurn: 0.75,
      rightTurn: 1.5,
      activeAxis: "right",
      labelMode: "ratios",
      propType: PropType.FAN,
      pair: null,
      mode: null,
      propMode: null,
      solo: null,
    });
  });

  it("round-trips the Shape Matrix-only negative quarter-turn band", () => {
    const flowers = buildFlowerAxis([-0.25]).filter(
      (flower) => flower.grid === "diamond"
    );
    const left = flowers[0];
    const right = flowers[1];
    if (!left || !right) throw new Error("Expected negative quarter flowers");
    const url = new URL("https://tkaflowarts.com/shape-engine");

    writeShapeMatrixRouteState(url, {
      level: 4,
      leftTurn: -0.25,
      rightTurn: -0.25,
      ...COMMON,
      labelMode: "ratios",
      pair: { left, right },
      mode: "SS",
    });

    expect(readShapeMatrixRouteState(url.search)).toEqual({
      level: 4,
      leftTurn: -0.25,
      rightTurn: -0.25,
      ...COMMON,
      labelMode: "ratios",
      pair: { left, right },
      mode: "SS",
    });
  });

  it("reads legacy color-keyed axis links as performer-relative hands", () => {
    const state = readShapeMatrixRouteState(
      "?level=4&blueTurn=0.75&redTurn=1.5&axis=red"
    );

    expect(state.leftTurn).toBe(0.75);
    expect(state.rightTurn).toBe(1.5);
    expect(state.activeAxis).toBe("right");
  });

  it("round-trips an explicit prop relationship for an equal rotating pair", () => {
    const flowers = buildFlowerAxis([0.25]).filter(
      (flower) => flower.grid === "diamond"
    );
    const left = flowers[0];
    const right = flowers[1];
    if (!left || !right) throw new Error("Expected quarter-turn flowers");
    const url = new URL("https://tkaflowarts.com/shape-engine");

    writeShapeMatrixRouteState(url, {
      level: 4,
      leftTurn: 0.25,
      rightTurn: 0.25,
      activeAxis: "both",
      labelMode: "turns",
      propType: PropType.CLUB,
      pair: { left, right },
      mode: "TS",
      propMode: "SS",
      solo: null,
    });

    expect(url.searchParams.get("propMode")).toBe("SS");
    expect(url.searchParams.get("driver")).toBeNull();
    expect(readShapeMatrixRouteState(url.search).propMode).toBe("SS");
  });

  it("restores the exact prop edge from a legacy prop-first link", () => {
    const flowers = buildFlowerAxis([0.25]).filter(
      (flower) => flower.grid === "diamond"
    );
    const left = flowers[0];
    const right = flowers[1];
    if (!left || !right) throw new Error("Expected quarter-turn flowers");

    const state = readShapeMatrixRouteState(
      `?level=4&leftTurn=0.25&rightTurn=0.25&driver=props&left=${flowerKey(left)}&right=${flowerKey(right)}&mode=TS&propMode=SS`
    );

    expect(state.mode).toBe("TS");
    expect(state.propMode).toBe("SS");
    expect("relationshipDriver" in state).toBe(false);
  });

  it("rejects timed prop state for unequal turns", () => {
    const state = readShapeMatrixRouteState(
      "?level=4&leftTurn=0.25&rightTurn=1&propMode=SS"
    );
    expect(state.propMode).toBeNull();
  });

  it("round-trips both theory axes, the pairing, and the selected cell", () => {
    const url = new URL(
      "https://tkaflowarts.com/shape-engine?ref=theory"
    );
    const state = readShapeMatrixRouteState(
      "?theory=1&leftRatio=2:9&rightRatio=1:2&pairing=QO" +
        "&theoryLeft=2:9-anti-in&theoryRight=1:2-pro-out&level=4"
    );

    expect(state.surface).toBe("theory");
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 1, handCycles: 2 });
    expect(state.theoryMode).toBe("QO");
    expect(state.theoryPair?.left.style).toBe("anti");
    expect(state.theoryPair?.left.ori).toBe("in");
    expect(state.theoryPair?.right.style).toBe("pro");
    // `1:2-pro-out` was written before the axis stopped emitting coincident
    // starts. At two hand cycles `out` is `in` re-entered half a period later
    // and draws the same curve, so the link keeps its shape under the name
    // that survived.
    expect(state.theoryPair?.right.ori).toBe("in");

    writeShapeMatrixRouteState(url, state);
    expect(url.searchParams.get("ref")).toBe("theory");
    expect(url.searchParams.get("theory")).toBe("1");
    // Theory ratios are self-contained; the link needs neither a field bound
    // nor a Kinetic Alphabet level.
    expect(url.searchParams.get("band")).toBeNull();
    expect(url.searchParams.get("level")).toBeNull();
    expect(url.searchParams.get("leftRatio")).toBe("2:9");
    expect(url.searchParams.get("rightRatio")).toBe("1:2");
    expect(url.searchParams.get("pairing")).toBe("QO");
    expect(url.searchParams.get("theoryLeft")).toBe("2:9-anti-in");
    // Written back under the surviving name, so the next reader gets an exact
    // match rather than the collapse path again.
    expect(url.searchParams.get("theoryRight")).toBe("1:2-pro-in");
  });

  it("round-trips a linked ratio relationship only for equal ratios", () => {
    const linked = readShapeMatrixRouteState(
      "?theory=1&leftRatio=2:9&rightRatio=2:9&linkRatios=1"
    );
    expect(linked.theoryRatiosLinked).toBe(true);

    const url = new URL("https://tkaflowarts.com/shape-engine");
    writeShapeMatrixRouteState(url, linked);
    expect(url.searchParams.get("linkRatios")).toBe("1");

    const contradictory = readShapeMatrixRouteState(
      "?theory=1&leftRatio=2:9&rightRatio=1:2&linkRatios=1"
    );
    expect(contradictory.theoryRatiosLinked).toBeFalsy();
  });

  it("restores the one-axis legacy link onto both axes", () => {
    const state = readShapeMatrixRouteState("?theory=1&ratio=2:9&level=4");
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 2, handCycles: 9 });
  });

  it("drops the retired timing and hands pair from an older theory link", () => {
    const url = new URL(
      "https://tkaflowarts.com/shape-engine?theory=1&timing=quarter&hands=opp"
    );
    const state = readShapeMatrixRouteState(url.search);
    // The old two-parameter pairing has no reading; the surface opens on the
    // default element rather than half-restoring a link it cannot honour.
    expect(state.theoryMode).toBe("SS");

    writeShapeMatrixRouteState(url, state);
    expect(url.searchParams.get("timing")).toBeNull();
    expect(url.searchParams.get("hands")).toBeNull();
    expect(url.searchParams.get("pairing")).toBe("SS");
  });

  it("ignores a retired band instead of replacing a valid ratio", () => {
    const state = readShapeMatrixRouteState("?theory=1&leftRatio=2:9&band=2");
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });

    const full = readShapeMatrixRouteState(
      "?theory=1&leftRatio=15:4&rightRatio=4:15&band=1"
    );
    expect(full.theoryLeftRatio).toEqual({ propRotations: 15, handCycles: 4 });
    expect(full.theoryRightRatio).toEqual({ propRotations: 4, handCycles: 15 });

    const url = new URL(
      "https://tkaflowarts.com/shape-engine?theory=1&band=1"
    );
    writeShapeMatrixRouteState(url, full);
    expect(url.searchParams.get("band")).toBeNull();
  });

  it("rejects a typed part above 15", () => {
    const state = readShapeMatrixRouteState(
      "?theory=1&leftRatio=16:15&rightRatio=15:16&band=5"
    );
    expect(state.theoryLeftRatio).toEqual({ propRotations: 1, handCycles: 3 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 1, handCycles: 3 });
  });

  it("preserves a pre-split theory link's ratio without its retired level", () => {
    const legacy = readShapeMatrixRouteState("?theory=1&leftRatio=2:9&level=4");
    expect(legacy.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });
    expect("theoryBand" in legacy).toBe(false);
  });
});
