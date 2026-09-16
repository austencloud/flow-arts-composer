import { describe, expect, it, vi } from "vitest";

import {
  createDirectorSequenceLibrary,
  type DirectorSequenceLibraryDeps,
} from "../../../src/routes/test/film-director/_lib/director-sequence-library";
import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";
import type { SequenceData } from "../../../src/lib/shared/foundation/domain/models/sequence-data";

/** Sequences are opaque here; only identity and the applied op trail matter. */
function seq(tag: string): SequenceData {
  return { id: tag, name: tag, word: tag, steps: [] } as unknown as SequenceData;
}
const tag = (s: SequenceData) => s.id as string;

function deps(): DirectorSequenceLibraryDeps & { calls: string[] } {
  const calls: string[] = [];
  const stamp =
    (op: string) =>
    async (s: SequenceData, ...rest: unknown[]) => {
      calls.push(
        `${op}(${tag(s)}${rest.length ? "," + rest.map(String).join(",") : ""})`
      );
      return seq(`${tag(s)}>${op}`);
    };
  return {
    calls,
    generate: vi.fn(async () => seq("gen")),
    loadLibrarySequence: vi.fn(async (id: string) => seq(`lib:${id}`)),
    transforms: {
      mirrorSequence: stamp("mirror"),
      flipSequence: stamp("flip"),
      rotateSequence: stamp("rotate"),
      swapHands: (s) => {
        calls.push(`swap(${tag(s)})`);
        return seq(`${tag(s)}>swap`);
      },
      invertSequence: stamp("invert"),
      rewindSequence: stamp("rewind"),
      shiftStartPlacement: (s, step) => {
        calls.push(`start-at(${tag(s)},${step})`);
        return seq(`${tag(s)}>start-at`);
      },
    },
  };
}

function film(performers: Record<string, unknown>[]) {
  return resolveFilmDirectorSpec({
    version: 2,
    id: "lib-film",
    title: "Lib Film",
    scenes: [{ id: "s1", title: "S1", performance: { performers } }],
  });
}

describe("director sequence library", () => {
  it("applies a transform chain in order with the spoken hand and rotation", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([
        { id: "lead" },
        {
          id: "second",
          sequence: {
            transformOf: "lead",
            transforms: [
              { op: "rotate", degrees: 90, direction: "ccw", hand: "left" },
              { op: "flip" },
              { op: "swap-hands" },
              { op: "start-at", step: 3 },
            ],
          },
        },
      ])
    );
    expect(d.calls).toEqual([
      "rotate(demo,-2,left)",
      "flip(demo>rotate,both)",
      "swap(demo>rotate>flip)",
      "start-at(demo>rotate>flip>swap,3)",
    ]);
    expect(tag(lib.forScene("s1").get("second")!)).toBe(
      "demo>rotate>flip>swap>start-at"
    );
    expect(lib.failures).toEqual([]);
  });

  it("turns clockwise degrees into positive 45-degree steps", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([
        { id: "lead" },
        {
          id: "second",
          sequence: {
            transformOf: "lead",
            transforms: [{ op: "rotate", degrees: 135, direction: "cw" }],
          },
        },
      ])
    );
    expect(d.calls).toEqual(["rotate(demo,3,both)"]);
  });

  it("keeps mirrorOf on the mirror transform", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([{ id: "lead" }, { id: "second", sequence: { mirrorOf: "lead" } }])
    );
    expect(d.calls).toEqual(["mirror(demo,both)"]);
  });

  it("loads a library sequence once and lets another performer transform it", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([
        { id: "lead", sequence: { library: "abc" } },
        { id: "second", sequence: { library: "abc" } },
        {
          id: "third",
          sequence: { transformOf: "lead", transforms: [{ op: "rewind" }] },
        },
      ])
    );
    expect(d.loadLibrarySequence).toHaveBeenCalledTimes(1);
    expect(tag(lib.forScene("s1").get("lead")!)).toBe("lib:abc");
    expect(tag(lib.forScene("s1").get("third")!)).toBe("lib:abc>rewind");
  });

  it("shares one derived result between performers who ask for the same chain", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([
        { id: "lead" },
        {
          id: "b",
          sequence: { transformOf: "lead", transforms: [{ op: "invert" }] },
        },
        {
          id: "c",
          sequence: { transformOf: "lead", transforms: [{ op: "invert" }] },
        },
      ])
    );
    expect(d.calls).toEqual(["invert(demo,both)"]);
  });

  it("falls back to the demo with a reason when a library sequence is missing", async () => {
    const noise = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps();
    d.loadLibrarySequence = vi.fn(async (id: string) => {
      throw new Error(`Library sequence "${id}" is not in the public library.`);
    });
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(film([{ id: "lead", sequence: { library: "nope" } }]));
    expect(tag(lib.forScene("s1").get("lead")!)).toBe("demo");
    expect(lib.failures[0]).toMatch(
      /performer "lead": Library sequence "nope" is not in the public library/
    );
    noise.mockRestore();
  });

  it("gives an idle performer no sequence at all, not the demo", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([{ id: "watcher", sequence: { source: "none" } }, { id: "spinner" }])
    );
    const scene = lib.forScene("s1");
    expect(scene.has("watcher")).toBe(false);
    expect(tag(scene.get("spinner")!)).toBe("demo");
    expect(lib.failures).toEqual([]);
  });

});
