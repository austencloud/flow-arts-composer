import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { hydrateSequence as restoreSemanticFields } from "$lib/shared/navigation/services/sequence-hydrator";
import { hydrateSequence } from "$lib/features/choreo-card/services/sequence-render-hydrator";

/**
 * The scan-preview defect, at the field the arrow pipeline actually gates on.
 *
 * A shortcode decodes to steps with `letter: null` — the codec carries motion
 * geometry only (sequence-encoder.decodeSequence hardcodes it). The scan
 * preview used to run the render hydrator alone, which rebuilds placement
 * OBJECTS but derives no semantics, so the letter stayed null all the way to
 * SpecialPlacer.getSpecialAdjustment — which returns null on a letterless
 * pictograph before it reads any placement data. Every adjustment tier is
 * gated the same way, so the arrow renders at its unadjusted grid point.
 *
 * These motions are a verbatim row from the canonical dataframe,
 * static/data/pictographs/DiamondPictographDataframe.csv:
 *   G,beta3,beta5,tog,same,pro,cw,e,s,pro,cw,e,s
 * The test asserts the letter comes back non-null and matches that row. The
 * app's own deriver — reading that same CSV — is what names it.
 */
function letterlessStep() {
  const motion = (hand: "left" | "right") => ({
    hand,
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "e",
    endLocation: "s",
    turns: 0,
    startOrientation: "in",
    endOrientation: "in",
    gridMode: "diamond",
  });

  return {
    id: "scan-preview-proof",
    stepNumber: 1,
    duration: 1,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    leftReversal: false,
    rightReversal: false,
    motions: { left: motion("left"), right: motion("right") },
  };
}

const letterlessSequence = () =>
  hydrateSequence({
    id: "scan-preview-proof",
    word: "",
    steps: [letterlessStep()],
  });

beforeAll(() => {
  // The letter deriver matches against the pictograph dataframe, which it
  // fetches. Serve `static/` off disk so this exercises the real dataframe
  // rather than passing because the fetch failed.
  //
  // csv-loader probes `window.csvData` before fetching and reads `window`
  // unguarded, which throws bare in Node — a stub object sends it down the
  // fetch path.
  (globalThis as { window?: unknown }).window ??= {};

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : input.url;
    const filePath = resolve("static", url.split("?")[0]!.replace(/^\//, ""));
    if (!existsSync(filePath)) return new Response("", { status: 404 });
    return new Response(readFileSync(filePath, "utf8"), { status: 200 });
  }) as typeof fetch;
});

describe("scan preview semantic restore", () => {
  it("leaves the step letterless when only the render hydrator runs", () => {
    // The old scan-preview behavior: placement objects rebuilt, semantics not.
    expect(letterlessSequence().steps.map((step) => step.letter)).toEqual([
      null,
    ]);
  });

  it("derives the real letter once the canonical pipeline runs", async () => {
    const restored = await restoreSemanticFields(letterlessSequence(), {
      loopDetector: null,
    });

    // Non-null is what un-gates every adjustment tier; "G" is what the
    // canonical dataframe row above actually spells.
    expect(restored.steps[0]!.letter).toBe("G");
  });
});
