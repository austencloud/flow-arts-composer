import { describe, it, expect } from "vitest";
import {
  parseCsvEdges,
  lookupLetter,
  type CsvEdge,
} from "$lib/features/choreo-card/services/pictograph-letter-lookup";

const CSV = [
  "letter,startPlacement,endPlacement,blueMotionType,blueStartLocation,blueEndLocation,redMotionType,redStartLocation,redEndLocation",
  "A,alpha1,alpha2,pro,s,w,pro,n,e",
  "B,alpha1,alpha2,anti,s,w,anti,n,e",
].join("\n");

describe("parseCsvEdges", () => {
  it("parses header + rows into objects", () => {
    const edges = parseCsvEdges(CSV);
    expect(edges).toHaveLength(2);
    expect(edges[0].letter).toBe("A");
    expect(edges[1].blueMotionType).toBe("anti");
  });
});

describe("lookupLetter", () => {
  const edges = parseCsvEdges(CSV);
  it("matches a step on positions + motion types + locations", () => {
    const letter = lookupLetter(edges, {
      startPlacement: "alpha1",
      endPlacement: "alpha2",
      left: { motionType: "anti", startLocation: "s", endLocation: "w" },
      right: { motionType: "anti", startLocation: "n", endLocation: "e" },
    });
    expect(letter).toBe("B");
  });
  it("returns null when no edge matches", () => {
    const letter = lookupLetter(edges, {
      startPlacement: "beta1",
      endPlacement: "beta2",
      left: { motionType: "pro", startLocation: "s", endLocation: "w" },
      right: { motionType: "pro", startLocation: "n", endLocation: "e" },
    });
    expect(letter).toBeNull();
  });
});
