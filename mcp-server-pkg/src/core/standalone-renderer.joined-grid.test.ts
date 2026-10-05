import { describe, expect, it } from "vitest";
import {
  getGridJoinLayout,
  getNormalHandPointCoordinates,
  type GridJoinSpec,
} from "@tka/render-core";
import { ensureDataLoaded } from "../shared/server-context.js";
import {
  getStandaloneRenderer,
  type MotionInput,
  type PictographInput,
} from "./standalone-renderer.js";

const renderer = getStandaloneRenderer();
const E1: GridJoinSpec = { toward: "e", steps: 1 };
const E2: GridJoinSpec = { toward: "e", steps: 2 };
/** A staff's beta-offset distance. */
const STAFF_NUDGE = 950 / 45;
const JOINED_GROUP = '<g class="svg-joined"';

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

/** The `<g>` element starting at `start`, through its matching close. */
function groupAt(svg: string, start: number): string {
  const tags = /<g\b[^>]*?(\/?)>|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let tag = tags.exec(svg); tag; tag = tags.exec(svg)) {
    if (tag[0] === "</g>") depth--;
    else if (tag[1] !== "/") depth++;
    if (depth === 0) return svg.slice(start, tags.lastIndex);
  }
  throw new Error("unclosed group");
}

/** Blue's then red's prop position, in scene units. */
function propPositions(svg: string) {
  return [
    ...svg.matchAll(/\n<g transform="translate\(([^,]+), ([^)]+)\) rotate/g),
  ].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

function arrowTransform(svg: string): string | undefined {
  return svg.match(/<g filter="url\(#arrow-halo\)" transform="([^"]+)"/)?.[1];
}

describe("joined grids in the packaged MCP renderer", () => {
  it("draws the one shared grid without a join", async () => {
    const plain = await renderer.renderToSvg(staticPair("n", "n", "in"));
    const unjoined = await renderer.renderToSvg(
      staticPair("n", "n", "in", null)
    );

    expect(unjoined).toBe(plain);
    expect(plain).not.toContain(JOINED_GROUP);
  });

  it("scales both grids, props and arrows together, leaving the glyphs as they are", async () => {
    const input = staticPair("n", "s", "in");
    const joined = await renderer.renderToSvg({ ...input, conjoined: E1 });
    const glyphsOnly = await renderer.renderToSvg(input, {
      showGrid: false,
      showLeftMotion: false,
      showRightMotion: false,
    });
    const layout = getGridJoinLayout(E1, "diamond");
    const scene = groupAt(joined, joined.indexOf(JOINED_GROUP));

    expect(scene).toContain(
      `${JOINED_GROUP} transform="translate(475 475) scale(${layout.scale}) translate(-475 -475)">`
    );
    expect(scene.match(/<circle /g)).toHaveLength(layout.points.length);
    expect(propPositions(scene)).toHaveLength(2);
    expect(joined.replace(`\n${scene}`, "")).toBe(glyphsOnly);
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
    const [blue, red] = propPositions(joined);

    expect(blue.x).toBeCloseTo(north.x + offsets.left.x, 6);
    expect(blue.y).toBeCloseTo(north.y, 6);
    expect(red.x).toBeCloseTo(north.x + offsets.right.x, 6);
    expect(red.y).toBeCloseTo(north.y, 6);
  });

  it("parts staffs lying along one line by their beta offset", async () => {
    // Two steps apart, blue's east point and red's west point are both the
    // scene center: the staffs lie on one line, so red moves up, blue down.
    const joined = await renderer.renderToSvg(staticPair("e", "w", "in", E2));
    const [blue, red] = propPositions(joined);

    expect(blue.x).toBeCloseTo(475, 6);
    expect(blue.y).toBeCloseTo(475 + STAFF_NUDGE, 6);
    expect(red.x).toBeCloseTo(475, 6);
    expect(red.y).toBeCloseTo(475 - STAFF_NUDGE, 6);
  });

  it("leaves level staffs whose tips rest on the other hand in place", async () => {
    const joined = await renderer.renderToSvg(
      staticPair("n", "n", "clock", E1)
    );
    const north = getNormalHandPointCoordinates("n", "diamond");
    const { offsets } = getGridJoinLayout(E1, "diamond");
    const [blue, red] = propPositions(joined);

    expect(blue.x).toBeCloseTo(north.x + offsets.left.x, 6);
    expect(blue.y).toBeCloseTo(north.y, 6);
    expect(red.y).toBeCloseTo(north.y, 6);
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
        // Only the blue arrow is drawn; red still feeds its placement.
        const arrow = async (pictograph: PictographInput) =>
          arrowTransform(
            await renderer.renderToSvg(pictograph, { showRightMotion: false })
          );

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
