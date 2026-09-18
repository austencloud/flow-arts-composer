import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { resolveMotionPathEntryStep } from "../../../src/routes/(public)/guide/motion-paths/_data/motion-path-entry-step";
import { loadShapeMatrix } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
import { flowerKey } from "$lib/shared/shape-matrix/domain/flower-signature";
import { buildModeRealization } from "$lib/shared/shape-matrix/services/build-mode-realizations";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const STATIC = path.resolve(process.cwd(), "static");
vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const file = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
  return new Response(readFileSync(path.join(STATIC, file)), {
    status: 200,
    headers: {
      "content-type": file.endsWith(".json") ? "application/json" : "text/csv",
    },
  });
});

function sequence(id: string, beats: Array<[string, string]>): SequenceData {
  return {
    id,
    name: id,
    word: id,
    steps: beats.map(([left, right]) => ({
      motions: {
        left: {
          motionType: left,
          startLocation: `${left}-start`,
          endLocation: `${left}-end`,
          rotationDirection: "cw",
          startOrientation: "in",
          endOrientation: "out",
          turns: 1,
          handPath: "cw",
          pathShape: "arc",
        },
        right: {
          motionType: right,
          startLocation: `${right}-start`,
          endLocation: `${right}-end`,
          rotationDirection: "cw",
          startOrientation: "in",
          endOrientation: "out",
          turns: 1,
          handPath: "cw",
          pathShape: "arc",
        },
      },
    })),
    thumbnails: [],
  } as unknown as SequenceData;
}

function hasMatchingHandLoop(
  hand: "left" | "right",
  outgoing: SequenceData,
  outgoingStep: number,
  incoming: SequenceData,
  incomingStep: number
): boolean {
  if (outgoing.steps.length !== incoming.steps.length) return false;
  const start = (step: number, count: number) =>
    ((Math.floor(step - 1) % count) + count) % count;
  const signature = (step: (typeof outgoing.steps)[number]) => {
    const motion = step.motions[hand];
    return JSON.stringify([
      step.duration,
      motion.motionType,
      motion.startLocation,
      motion.endLocation,
      motion.rotationDirection,
      motion.startOrientation ?? null,
      motion.endOrientation ?? null,
      motion.turns ?? null,
      motion.handPath ?? null,
      motion.skewSteps ?? null,
      motion.skewDir ?? null,
      motion.pathShape ?? null,
      motion.segment?.t0 ?? null,
      motion.segment?.t1 ?? null,
    ]);
  };
  const outgoingStart = start(outgoingStep, outgoing.steps.length);
  const incomingStart = start(incomingStep, incoming.steps.length);
  return outgoing.steps.every(
    (_, offset) =>
      signature(
        outgoing.steps[(outgoingStart + offset) % outgoing.steps.length]!
      ) ===
      signature(
        incoming.steps[(incomingStart + offset) % incoming.steps.length]!
      )
  );
}

describe("motion path selection handoff", () => {
  it("keeps an unchanged hand on its authored curve when timing shifts it around the loop", () => {
    const outgoing = sequence("SS", [
      ["left-a", "right-a"],
      ["left-b", "right-b"],
      ["left-c", "right-c"],
      ["left-d", "right-d"],
    ]);
    const incoming = sequence("TS", [
      ["left-c", "right-x"],
      ["left-d", "right-y"],
      ["left-a", "right-z"],
      ["left-b", "right-w"],
    ]);

    expect(
      resolveMotionPathEntryStep({
        outgoing,
        outgoingStep: 1.6,
        incoming,
        fallbackKey: "SS-to-TS",
      })
    ).toBeCloseTo(3.6);
  });

  it("prefers a beat preserving both hands, including a same-to-opposite switch", () => {
    const outgoing = sequence("same", [
      ["left-a", "right-a"],
      ["left-b", "right-b"],
    ]);
    const incoming = sequence("opposite", [
      ["left-b", "right-b"],
      ["left-a", "right-z"],
    ]);

    expect(
      resolveMotionPathEntryStep({
        outgoing,
        outgoingStep: 2.25,
        incoming,
        fallbackKey: "same-to-opposite",
      })
    ).toBeCloseTo(1.25);
  });

  it("falls back to normalized phase when neither hand has the same curve", () => {
    expect(
      resolveMotionPathEntryStep({
        outgoing: sequence("old", [
          ["left-a", "right-a"],
          ["left-b", "right-b"],
        ]),
        outgoingStep: 1.5,
        incoming: sequence("new", [
          ["left-x", "right-x"],
          ["left-y", "right-y"],
          ["left-z", "right-z"],
          ["left-w", "right-w"],
        ]),
        fallbackKey: "different-cell",
      })
    ).toBeCloseTo(2);
  });

  it("does not treat a reversed curve as an unchanged hand", () => {
    const outgoing = sequence("same", [
      ["left-a", "right-a"],
      ["left-b", "right-b"],
    ]);
    const incoming = sequence("opposite", [
      ["left-x", "right-x"],
      ["left-a", "right-y"],
    ]);
    (
      incoming.steps[1]!.motions.left as { rotationDirection: string }
    ).rotationDirection = "ccw";

    expect(
      resolveMotionPathEntryStep({
        outgoing,
        outgoingStep: 1.4,
        incoming,
        fallbackKey: "reverse-direction",
      })
    ).toBeCloseTo(1.4);
  });

  it("rejects a single matching beat when the rest of that hand's loop diverges", () => {
    const outgoing = sequence("old", [
      ["left-a", "right-a"],
      ["left-b", "right-b"],
    ]);
    const incoming = sequence("new", [
      ["left-x", "right-x"],
      ["left-a", "right-y"],
    ]);

    expect(
      resolveMotionPathEntryStep({
        outgoing,
        outgoingStep: 1.5,
        incoming,
        fallbackKey: "one-beat-only",
      })
    ).toBeCloseTo(1.5);
  });

  it("keeps the canonical untouched hand through SS to TS and SS to SO", async () => {
    const data = await loadShapeMatrix(PropType.STAFF);
    const left = data.axis.find(
      (flower) => flowerKey(flower) === "pro-0-in-diamond"
    )!;
    const right = data.axis.find(
      (flower) => flowerKey(flower) === "anti-0-out-diamond"
    )!;
    const overlay = {
      left: data.left.get(flowerKey(left))?.left ?? [],
      right: data.right.get(flowerKey(right))?.right ?? [],
      tips: data.tips,
      clubTipDx: data.clubTipDx,
    };
    const ss = await buildModeRealization({ left, right }, overlay, "SS");
    const alternatives = await Promise.all(
      (["TS", "SO"] as const).map((mode) =>
        buildModeRealization({ left, right }, overlay, mode)
      )
    );
    expect(ss).not.toBeNull();
    expect(alternatives.every((alternative) => alternative)).toBe(true);
    const [ts, so] = alternatives;
    const tsEntry = resolveMotionPathEntryStep({
      outgoing: ss!.seq,
      outgoingStep: 1.5,
      incoming: ts!.seq,
      fallbackKey: "SS-to-TS",
    });
    const soEntry = resolveMotionPathEntryStep({
      outgoing: ss!.seq,
      outgoingStep: 1.5,
      incoming: so!.seq,
      fallbackKey: "SS-to-SO",
    });
    expect(tsEntry % 1).toBeCloseTo(0.5);
    expect(soEntry % 1).toBeCloseTo(0.5);
    expect(hasMatchingHandLoop("right", ss!.seq, 1.5, ts!.seq, tsEntry)).toBe(
      true
    );
    expect(hasMatchingHandLoop("left", ss!.seq, 1.5, so!.seq, soEntry)).toBe(
      true
    );
  }, 60_000);
});
