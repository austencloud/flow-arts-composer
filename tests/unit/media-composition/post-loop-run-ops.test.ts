import { describe, expect, it } from "vitest";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import { applyPostProjectOps } from "#lib/shared/media-composition/domain/post-project-ops.js";
import { loopRunBadgeAt } from "#lib/shared/media-composition/domain/loop-run.js";
import { NOW, project } from "./post-project-fixtures";

const ctx = editContext(NOW);

const motion = (startLocation: string, endLocation: string, motionType = "pro") => ({
  motionType,
  startLocation,
  endLocation,
  rotationDirection: motionType === "static" ? "noRotation" : "cw",
  startOrientation: "in",
  endOrientation: "in",
});
const steps = [
  { letter: "α", startPlacement: "alpha7", endPlacement: "alpha7", leftMotion: motion("e", "e", "static"), rightMotion: motion("w", "w", "static") },
  { letter: "Σ", startPlacement: "alpha7", endPlacement: "gamma7", leftMotion: motion("e", "s"), rightMotion: motion("w", "w", "static") },
  { letter: "W", startPlacement: "gamma7", endPlacement: "alpha1", leftMotion: motion("s", "s", "static"), rightMotion: motion("w", "n") },
];
const overlays = (p: ReturnType<typeof project>) => p.tracks.slice(1).flatMap((track) => track.items);

describe("words and LOOP runs added by command", () => {
  it("adds one line of words where it is asked for, and refuses a box outside the frame", () => {
    const box = { x: 0.06, y: 0.075, width: 0.88, height: 0.06 };
    const next = applyPostProjectOps(project([]), [{ op: "add-text", text: "A seed", at: 3.2, duration: 2, size: "l", box }], ctx);
    const words = overlays(next).find((item) => item.kind === "text")!;
    expect(words).toMatchObject({ kind: "text", text: "A seed", size: "l", start: 3.2, duration: 2, box });
    expect(() =>
      applyPostProjectOps(project([]), [{ op: "add-text", text: "x", box: { ...box, x: 1.4 } }], ctx)
    ).toThrow(/box/);
  });

  it("carries a run's badges, and shows each from its time until the next", () => {
    const badges = [
      { at: 0, text: "What is a LOOP?", icon: "ring" as const, colour: "#f2f2f6" },
      { at: 15.4, text: "Rotated", icon: "rotated" as const },
    ];
    const next = applyPostProjectOps(project([]), [{ op: "add-loop", steps, change: "rotated", badges }], ctx);
    const run = overlays(next).find((item) => item.kind === "loop") as unknown as Parameters<typeof loopRunBadgeAt>[0];
    expect(run.badges).toEqual(badges);
    const first = loopRunBadgeAt(run, 0)!;
    expect(first.text).toBe("What is a LOOP?");
    expect(first.colour).toBe("#f2f2f6");
    expect(first.opacity).toBeLessThan(1);
    expect(loopRunBadgeAt(run, 1)!.opacity).toBe(1);
    const second = loopRunBadgeAt(run, 15.4)!;
    // Going on from the ring keeps the badge up: the second one takes over at full strength, in the run's colour.
    expect(second).toEqual({
      text: "Rotated",
      icon: "rotated",
      colour: "#36c3ff",
      opacity: 1,
      top: { from: undefined, to: undefined, glide: 1 },
      left: { from: undefined, to: undefined, glide: 1 },
    });
    expect(loopRunBadgeAt({ ...run, badges: [] }, 3)).toBeNull();
  });

  it("keeps the card's start, the pairs' gaps, plain tiles, the ring's look and the grid's strength from an item patch", () => {
    const added = applyPostProjectOps(project([]), [{ op: "add-loop", steps, change: "reflected" }], ctx);
    const id = overlays(added).find((item) => item.kind === "loop")!.id;
    const play = { kind: "play", at: 1, duration: 2, stage: { x: 0.5, y: 0.5, size: 0.5, grid: 0.5 }, ring: "card" };
    const loop = { cardStart: false, pairsGap: { across: 0.1, down: 0.2 }, plainTiles: true, events: [play] };
    const next = applyPostProjectOps(added, [{ op: "item", item: id, patch: { loop } }], ctx);
    expect(overlays(next).find((item) => item.id === id)).toMatchObject(loop);
  });

  it("keeps bare copies and the play's shadow, flare and way back from an item patch", () => {
    const added = applyPostProjectOps(project([]), [{ op: "add-loop", steps, change: "reflected" }], ctx);
    const id = overlays(added).find((item) => item.kind === "loop")!.id;
    const play = { kind: "play", at: 1, duration: 2, stage: { x: 0.5, y: 0.5, size: 0.5 }, shadow: true, flare: true, wayBack: true };
    const loop = { plainTiles: true, bareCopies: true, events: [play] };
    const next = applyPostProjectOps(added, [{ op: "item", item: id, patch: { loop } }], ctx);
    expect(overlays(next).find((item) => item.id === id)).toMatchObject(loop);
  });
});
