import { describe, it, expect } from "vitest";
import { PlacementReachabilityAnalyzer } from "../../../src/generation/reachability/PlacementReachabilityAnalyzer.js";
import type { PictographData, MotionData } from "../../../src/generation/constraints/types.js";


function makeMotion(overrides: Partial<MotionData> = {}): MotionData {
  return {
    hand: "left",
    startLocation: "n",
    endLocation: "s",
    motionType: "pro",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "in",
    ...overrides,
  };
}

function variation(start: string, end: string, letter = "A"): PictographData {
  return {
    letter,
    startPlacement: start,
    endPlacement: end,
    timing: "together",
    direction: "together",
    leftMotion: makeMotion({ hand: "left" }),
    rightMotion: makeMotion({ hand: "right" }),
  };
}


describe("PlacementReachabilityAnalyzer", () => {
  const analyzer = new PlacementReachabilityAnalyzer();

  describe("simple linear chain", () => {
    // Graph: A→B, B→C. Goal: {C}. 3-step seed.
    // Step 0 must start at A (only A can reach B, which can reach C).
    // Step 1 must start at B.
    // Step 2 must start at C... wait, no. The goal is the END position of
    // the final step, so step 2 needs startPlacement with a transition to C.
    // That's B. So: step 0 = {A}, step 1 = {B}, step 2 = {B}.
    // Actually: A→B→C is only 2 hops. 3 steps = 3 hops needed.
    // Let's use a 2-step seed instead for the simple A→B→C chain.

    const variations = [
      variation("A", "B"),
      variation("B", "C"),
    ];

    it("computes backward reachability for 2-step chain", () => {
      const result = analyzer.analyze(2, new Set(["C"]), variations);

      expect(result.feasible).toBe(true);
      // Step 0: must start at A (A→B, and B can reach C)
      expect(result.reachableAt[0]).toEqual(new Set(["A"]));
      // Step 1: must start at B (B→C, and C is the goal)
      expect(result.reachableAt[1]).toEqual(new Set(["B"]));
    });
  });

  describe("dead end detection", () => {
    // Graph: A→B, B→C. Goal: {D}. No path to D exists.
    const variations = [
      variation("A", "B"),
      variation("B", "C"),
    ];

    it("detects infeasible goal", () => {
      const result = analyzer.analyze(2, new Set(["D"]), variations);

      expect(result.feasible).toBe(false);
      expect(result.emptyStepIndex).toBeDefined();
    });
  });

  describe("blocked start positions", () => {
    // Graph: A→B, B→C, X→B. Goal: {C}. 2-step seed.
    // Without blocking: step 0 = {A, X}, step 1 = {B}.
    // Blocking A: step 0 = {X}, step 1 = {B}.
    // Blocking both A and X: infeasible.
    const variations = [
      variation("A", "B"),
      variation("X", "B"),
      variation("B", "C"),
    ];

    it("filters blocked positions from step 0", () => {
      const result = analyzer.analyze(2, new Set(["C"]), variations, new Set(["A"]));

      expect(result.feasible).toBe(true);
      expect(result.reachableAt[0]).toEqual(new Set(["X"]));
      expect(result.reachableAt[1]).toEqual(new Set(["B"]));
    });

    it("detects infeasibility when all starts are blocked", () => {
      const result = analyzer.analyze(2, new Set(["C"]), variations, new Set(["A", "X"]));

      expect(result.feasible).toBe(false);
      expect(result.emptyStepIndex).toBe(0);
    });
  });

  describe("multiple paths to goal", () => {
    // Graph: A→B, A→C, B→D, C→D. Goal: {D}. 2-step seed.
    // Step 0: {A} (only position that can reach B or C)
    // Step 1: {B, C} (both can reach D)
    const variations = [
      variation("A", "B"),
      variation("A", "C"),
      variation("B", "D"),
      variation("C", "D"),
    ];

    it("includes all viable intermediate positions", () => {
      const result = analyzer.analyze(2, new Set(["D"]), variations);

      expect(result.feasible).toBe(true);
      expect(result.reachableAt[0]).toEqual(new Set(["A"]));
      expect(result.reachableAt[1]).toEqual(new Set(["B", "C"]));
    });
  });

  describe("forward cleanup pass", () => {
    // Graph: A→B, B→C, C→D, X→C. Goal: {D}. 3-step seed.
    //
    // Backward pass:
    //   step 2: {C} (C→D)
    //   step 1: {B, X} (both can reach C)
    //   step 0: {A} (A→B, B is in step 1's reachable set)
    //
    // Forward cleanup:
    //   step 0: {A} (unchanged)
    //   step 1: {B} (X survives backward pass, but no path from A reaches X)
    //   step 2: {C} (unchanged — B can reach C)
    const variations = [
      variation("A", "B"),
      variation("B", "C"),
      variation("C", "D"),
      variation("X", "C"),  // X is reachable backward but not forward from A
    ];

    it("prunes positions that pass backward but not forward", () => {
      const result = analyzer.analyze(3, new Set(["D"]), variations);

      expect(result.feasible).toBe(true);
      expect(result.reachableAt[0]).toEqual(new Set(["A"]));
      // X should be pruned by forward cleanup
      expect(result.reachableAt[1]).toEqual(new Set(["B"]));
      expect(result.reachableAt[2]).toEqual(new Set(["C"]));
    });
  });

  describe("single-step seed", () => {
    // For a 1-step seed, the only constraint is: startPlacement has a
    // transition directly to a required end position.
    const variations = [
      variation("A", "X"),
      variation("B", "Y"),
      variation("C", "X"),
    ];

    it("returns positions with direct transition to goal", () => {
      const result = analyzer.analyze(1, new Set(["X"]), variations);

      expect(result.feasible).toBe(true);
      expect(result.reachableAt[0]).toEqual(new Set(["A", "C"]));
    });

    it("respects blocked starts for single-step seed", () => {
      const result = analyzer.analyze(1, new Set(["X"]), variations, new Set(["A"]));

      expect(result.feasible).toBe(true);
      expect(result.reachableAt[0]).toEqual(new Set(["C"]));
    });

    it("detects infeasibility for single-step seed", () => {
      const result = analyzer.analyze(1, new Set(["Z"]), variations);

      expect(result.feasible).toBe(false);
      expect(result.emptyStepIndex).toBe(0);
    });
  });

  describe("4-step seed with branching (mirrors the original bug scenario)", () => {
    // Simulates a constrained graph where only certain paths reach the goal.
    //
    // Placements: alpha1, alpha3, beta1, beta3, gamma1
    // Goal: {alpha3} (LOOP must end here)
    //
    // Transitions (after hard constraint filtering — no dash):
    //   alpha1 → beta1
    //   alpha1 → beta3
    //   beta1  → gamma1
    //   beta3  → alpha1
    //   beta3  → alpha3   <-- only path to goal
    //   gamma1 → alpha1
    //
    // 4-step seed:
    //   Step 0: must eventually reach alpha3 in 4 hops
    //   One valid path: alpha1→beta3→alpha1→beta3→alpha3
    //   Another: alpha1→beta1→gamma1→alpha1→beta3... wait, that's 5 hops.
    //   With 4 steps: alpha1→beta3, beta3→alpha1, alpha1→beta3, beta3→alpha3. Yes!
    //
    // Dead path: alpha1→beta1→gamma1→alpha1 (at step 3, alpha1 can reach
    //   beta1 or beta3, but only beta3→alpha3 satisfies the goal — so
    //   alpha1 IS reachable at step 3, and the search should still succeed).

    const variations = [
      variation("alpha1", "beta1"),
      variation("alpha1", "beta3"),
      variation("beta1", "gamma1"),
      variation("beta3", "alpha1"),
      variation("beta3", "alpha3"),
      variation("gamma1", "alpha1"),
    ];

    it("finds valid 4-step path to goal", () => {
      const result = analyzer.analyze(4, new Set(["alpha3"]), variations);

      expect(result.feasible).toBe(true);
      // Step 3 (final): must have a transition to alpha3 → only beta3
      expect(result.reachableAt[3]).toContain("beta3");
      // Step 0: alpha1 can start the path
      expect(result.reachableAt[0]).toContain("alpha1");
    });

    it("prunes unreachable positions at each step", () => {
      const result = analyzer.analyze(4, new Set(["alpha3"]), variations);

      // gamma1 has no path to alpha3 within 1 step, so at step 3 it's out
      expect(result.reachableAt[3]).not.toContain("gamma1");
      // beta1 can only go to gamma1, which can only go to alpha1, which
      // can go to beta3 — so beta1 is viable at step 1 (3 hops to goal)
      // but not at step 3 (needs 3 more hops, only has 1)
      expect(result.reachableAt[3]).not.toContain("beta1");
    });

    it("blocked starts narrow the feasible space", () => {
      // Block alpha1, beta1, and gamma1 — leaving only beta3 and alpha3.
      // beta3→alpha1 is blocked at step 1 forward cleanup (alpha1 can
      // continue, but beta3 at step 0 goes to alpha1 which leads back).
      // Actually: block ALL positions except alpha3 (which has no outgoing
      // transitions in this graph). That makes step 0 empty.
      const result = analyzer.analyze(
        4,
        new Set(["alpha3"]),
        variations,
        new Set(["alpha1", "beta1", "beta3", "gamma1"]),
      );

      expect(result.feasible).toBe(false);
      expect(result.emptyStepIndex).toBe(0);
    });

    it("blocking one start still allows paths from another", () => {
      // Blocking alpha1 leaves beta1 as a valid start:
      // beta1→gamma1→alpha1→beta3→alpha3
      const result = analyzer.analyze(
        4,
        new Set(["alpha3"]),
        variations,
        new Set(["alpha1"]),
      );

      expect(result.feasible).toBe(true);
      expect(result.reachableAt[0]).toContain("beta1");
      expect(result.reachableAt[0]).not.toContain("alpha1");
    });
  });

  describe("multiple goal positions", () => {
    // LOOP types like quartered rotated have both CW and CCW targets
    const variations = [
      variation("A", "X"),
      variation("A", "Y"),
      variation("B", "Z"),
    ];

    it("accepts any goal position", () => {
      const result = analyzer.analyze(1, new Set(["X", "Z"]), variations);

      expect(result.feasible).toBe(true);
      // A→X satisfies, B→Z satisfies
      expect(result.reachableAt[0]).toEqual(new Set(["A", "B"]));
    });
  });

  describe("fully connected graph", () => {
    // When no hard constraints filter variations, the graph is dense.
    // Reachability should include all positions at every step.
    const positions = ["A", "B", "C"];
    const variations: PictographData[] = [];
    for (const s of positions) {
      for (const e of positions) {
        variations.push(variation(s, e));
      }
    }

    it("all positions reachable at every step", () => {
      const result = analyzer.analyze(4, new Set(["C"]), variations);

      expect(result.feasible).toBe(true);
      for (let i = 0; i < 4; i++) {
        expect(result.reachableAt[i]).toEqual(new Set(positions));
      }
    });
  });
});
