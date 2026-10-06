import { describe, expect, it, vi } from "vitest";
import {
  getGridJoinLayout,
  getNormalHandPointCoordinates,
  type GridJoinSpec,
} from "@tka/render-core";
import { ensureDataLoaded } from "../src/shared/server-context.js";
import {
  getStandaloneRenderer,
  type MotionInput,
  type PictographInput,
} from "../src/core/standalone-renderer.js";
import type { SequenceStep } from "../src/core/sequence-builder-adapter.js";
import { renderSequenceToImage } from "../src/core/sequence-renderer.js";

const renderer = getStandaloneRenderer();
const E1: GridJoinSpec = { toward: "e", steps: 1 };
const E2: GridJoinSpec = { toward: "e", steps: 2 };
/** A staff's beta-offset distance. */
const STAFF_NUDGE = 950 / 45;

function staticMotion(
  hand: "left" | "right",
  location: string,
  orientation: string
): MotionInput {
  return {
    motionType: "static",
    rotationDirection: "no_rotation",
    startLocation: location,
    endLocation: location,
    startOrientation: orientation,
    endOrientation: orientation,
    turns: 0,
    hand,
  };
}

function staticPair(
  leftLocation: string,
  rightLocation: string,
  orientation: string,
  conjoined?: GridJoinSpec | null
): PictographInput {
  return {
    letter: "α",
    gridMode: "diamond",
    leftMotion: staticMotion("left", leftLocation, orientation),
    rightMotion: staticMotion("right", rightLocation, orientation),
    conjoined,
  };
}

function propPosition(svg: string, color: "blue" | "red") {
  const match = svg.match(
    new RegExp(
      `<g class="svg-prop svg-prop-${color}"><g transform="translate\\(([^,]+), ([^)]+)\\)`
    )
  );
  if (!match) throw new Error(`no ${color} prop`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function leftArrowTransform(svg: string): string | undefined {
  return svg.match(
    /<g class="svg-arrow svg-arrow-blue"><g filter="url\(#arrow-halo\)" transform="([^"]+)"/
  )?.[1];
}

describe("joined grids in the MCP renderer", () => {
  it("draws the one shared grid without a join", async () => {
    const plain = await renderer.renderToSvg(staticPair("n", "n", "in"));
    const unjoined = await renderer.renderToSvg(
      staticPair("n", "n", "in", null)
    );

    expect(unjoined).toBe(plain);
    expect(plain).not.toContain("svg-joined");
  });

  it("scales both grids, props and arrows together, leaving the glyphs as they are", async () => {
    const input = staticPair("n", "s", "in");
    const plain = await renderer.renderToSvg(input);
    const joined = await renderer.renderToSvg({ ...input, conjoined: E1 });
    const layout = getGridJoinLayout(E1, "diamond");

    expect(joined).toContain(
      `<g class="svg-joined" transform="translate(475 475) scale(${layout.scale}) translate(-475 -475)">`
    );
    const scene = joined.slice(
      joined.indexOf('<g class="svg-joined"'),
      joined.indexOf('<g class="svg-glyph')
    );
    expect(scene.match(/<circle /g)).toHaveLength(layout.points.length);
    expect(scene).toContain("svg-prop-blue");
    expect(scene).toContain("svg-prop-red");

    const tail = (svg: string) => svg.slice(svg.indexOf('<g class="svg-glyph'));
    expect(tail(joined)).toBe(tail(plain));
  });

  it("draws a box grid's outer points as rings", async () => {
    const layout = getGridJoinLayout(E1, "box");
    const joined = await renderer.renderToSvg({
      ...staticPair("ne", "sw", "in", E1),
      gridMode: "box",
    });
    const outerPoints = layout.points.filter((point) => point.kind === "outer");

    expect(outerPoints.length).toBeGreaterThan(0);
    expect(joined.match(/<circle [^>]*fill="none"/g)).toHaveLength(
      outerPoints.length
    );
  });

  it("moves each prop by its own grid's offset instead of a beta offset", async () => {
    const joined = await renderer.renderToSvg(staticPair("n", "n", "in", E1));
    const north = getNormalHandPointCoordinates("n", "diamond");
    const { offsets } = getGridJoinLayout(E1, "diamond");

    expect(propPosition(joined, "blue").x).toBeCloseTo(
      north.x + offsets.left.x,
      6
    );
    expect(propPosition(joined, "blue").y).toBeCloseTo(north.y, 6);
    expect(propPosition(joined, "red").x).toBeCloseTo(
      north.x + offsets.right.x,
      6
    );
    expect(propPosition(joined, "red").y).toBeCloseTo(north.y, 6);
  });

  it("parts staffs lying along one line by their beta offset", async () => {
    // Two steps apart, blue's east point and red's west point are both the
    // scene center: the staffs lie on one line, so red moves up, blue down.
    const joined = await renderer.renderToSvg(staticPair("e", "w", "in", E2));

    expect(propPosition(joined, "blue").x).toBeCloseTo(475, 6);
    expect(propPosition(joined, "blue").y).toBeCloseTo(475 + STAFF_NUDGE, 6);
    expect(propPosition(joined, "red").x).toBeCloseTo(475, 6);
    expect(propPosition(joined, "red").y).toBeCloseTo(475 - STAFF_NUDGE, 6);
  });

  it("leaves level staffs whose tips rest on the other hand in place", async () => {
    const joined = await renderer.renderToSvg(
      staticPair("n", "n", "clock", E1)
    );
    const north = getNormalHandPointCoordinates("n", "diamond");
    const { offsets } = getGridJoinLayout(E1, "diamond");

    expect(propPosition(joined, "blue").x).toBeCloseTo(
      north.x + offsets.left.x,
      6
    );
    expect(propPosition(joined, "blue").y).toBeCloseTo(north.y, 6);
    expect(propPosition(joined, "red").y).toBeCloseTo(north.y, 6);
  });

  it.each(["G", "Φ-"])(
    "places each %s arrow by its own hand alone",
    async (letter) => {
      const rows = ensureDataLoaded("diamond").filter(
        (row) => row.letter === letter
      ) as unknown as PictographInput[];
      let movesOnOneGrid = 0;
      for (const row of rows) {
        const input = { ...row, gridMode: "diamond" };
        const changed = {
          ...input,
          rightMotion: { ...input.rightMotion, turns: 1 },
        };
        const arrow = async (pictograph: PictographInput) =>
          leftArrowTransform(await renderer.renderToSvg(pictograph));

        if ((await arrow(input)) !== (await arrow(changed))) movesOnOneGrid++;
        expect(await arrow({ ...changed, conjoined: E1 })).toBe(
          await arrow({ ...input, conjoined: E1 })
        );
      }
      // On one grid the other hand moves some of these arrows.
      expect(movesOnOneGrid).toBeGreaterThan(0);
    }
  );
});

describe("joined grids on an MCP card", () => {
  it("draws each cell on the card's join unless its step sets its own", async () => {
    const pair = staticPair("n", "s", "in");
    const step = (
      stepNumber: number,
      conjoined?: GridJoinSpec | null
    ): SequenceStep => ({
      letter: "α",
      variation: 0,
      startPlacement: "alpha1",
      endPlacement: "alpha1",
      leftMotion: pair.leftMotion,
      rightMotion: pair.rightMotion,
      stepNumber,
      conjoined,
    });
    const steps = [step(0), step(1, E2), step(2, null), step(3)];
    const cellJoins = async (conjoined?: GridJoinSpec) => {
      const joins: unknown[] = [];
      const draw = renderer.renderToPng.bind(renderer);
      const spy = vi
        .spyOn(renderer, "renderToPng")
        .mockImplementation(async (pictograph, options) => {
          joins.push(pictograph.conjoined);
          return draw(pictograph, options);
        });
      try {
        await renderSequenceToImage(steps, "ααα", {
          layout: "strip",
          cellSize: 120,
          padding: 8,
          showStepNumbers: false,
          showWord: false,
          darkMode: false,
          conjoined,
        });
      } finally {
        spy.mockRestore();
      }
      return joins;
    };

    expect(await cellJoins(E1)).toEqual([E1, E2, null, E1]);
    expect(await cellJoins()).toEqual([null, E2, null, null]);
  });
});
