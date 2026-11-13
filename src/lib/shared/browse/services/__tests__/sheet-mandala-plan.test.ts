import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ThumbnailRenderInput } from "#lib/shared/browse/services/thumbnail-key-deriver.js";
import { ThumbnailRenderer } from "#lib/shared/browse/services/thumbnail-renderer.js";
import { ImageComposer } from "#lib/shared/render/services/image-composer.js";
import {
  computeCardFrontLayout,
  paintCardFrontChrome,
} from "#lib/shared/render/services/card-front-assembler.js";
import type { WordHeaderOptions } from "#lib/shared/render/services/text-renderer.js";
import { registerLoopDisplayResolver } from "#lib/shared/loop-labeler/get-loop-display-resolver.js";
import {
  calculateHeaderWordSideInset,
  type LOOPComponentId,
} from "@tka/render-composition";
import {
  computeSheetMandalaPlan,
  sheetMandalaSettings,
} from "../sheet-region-map";

// A slow gallery card's drawing flies into the squares where the finished
// picture paints its mandalas, then the picture takes over beneath it. If the
// plan and the composer ever disagree, the drawing lands beside the painted
// mandala and jumps at the hand-off, on slow cards only, where nobody is
// looking. So this drives the real chain: a render input through the
// thumbnail renderer's own options, the composer's own mandala painter, and
// compares where it paints with where the plan lands.

const painted: { x: number; y: number; size: number; show: string }[] = [];

vi.mock("#lib/shared/mandala/services/mandala-renderer", async (original) => ({
  ...(await original<object>()),
  renderMandalaToCanvas: (
    _ctx: unknown,
    _paths: unknown,
    o: { offsetX: number; offsetY: number; size: number; show: string }
  ) => {
    painted.push({ x: o.offsetX, y: o.offsetY, size: o.size, show: o.show });
  },
}));

// The word-room test reads only the header's inputs, not the grid lines.
vi.mock("#lib/shared/render/services/cell-border-renderer", () => ({
  drawSmartCellBorders: () => {},
}));

// Any non-empty drawing will do; the test is about where it goes.
vi.mock("#lib/shared/mandala/services/mandala-geometry-calculator", () => ({
  calculate: () => ({
    left: [{ d: "M0 0 L1 1" }],
    right: [{ d: "M0 0 L1 1" }],
    purple: [],
  }),
}));

function sequenceOf(length: number): SequenceData {
  return {
    id: `seq-${length}`,
    name: "ABC",
    word: "ABC",
    steps: Array.from({ length }, (_, i) => ({
      id: `s${i}`,
      letter: "A",
      motions: {},
    })),
  } as unknown as SequenceData;
}

function inputOf(overrides: Partial<ThumbnailRenderInput>): ThumbnailRenderInput {
  return {
    sequenceName: "ABC",
    leftPropType: undefined,
    rightPropType: undefined,
    catDogModeEnabled: false,
    lightMode: false,
    variant: "gallery",
    ...overrides,
    visibility: { showMandala: true, ...overrides.visibility },
  } as ThumbnailRenderInput;
}

async function paintedSquares(
  sequence: SequenceData,
  input: ThumbnailRenderInput
) {
  const renderer = new ThumbnailRenderer(
    {} as never,
    {} as never,
    null,
    {} as never
  );
  // @ts-expect-error private method invoked for unit coverage
  const options = renderer.buildRenderOptions(input);
  const layout = computeCardFrontLayout(sequence, options, { darkMode: true });
  const composer = new ImageComposer(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  painted.length = 0;
  await composer
    .buildChromeDeps(sequence, layout, options)
    .renderMandalas({} as CanvasRenderingContext2D);
  return {
    layout,
    squares: painted.map(({ x, y, size, show }) => ({
      variant: show === "both" ? "full" : show,
      x,
      y,
      size,
    })),
  };
}

function landingSquares(sequence: SequenceData, input: ThumbnailRenderInput) {
  const plan = computeSheetMandalaPlan(sequence, sheetMandalaSettings(input));
  return {
    plan,
    squares: plan.spots.map((s) => ({
      variant: s.variant,
      x: s.cx - s.size / 2,
      y: s.cy - s.size / 2,
      size: s.size,
    })),
  };
}

const sortSquares = <T extends { x: number; y: number }>(list: T[]) =>
  [...list].sort((a, b) => a.y - b.y || a.x - b.x);

describe("slow-card mandala landing", () => {
  beforeEach(() => {
    painted.length = 0;
  });

  it.each([
    ["8 steps, start in the top row", 8, {}],
    ["16 steps, start in the top row", 16, {}],
    ["12 steps, start in a left column", 12, { startPlacementLayout: "column" }],
    ["8 steps with a QR in the last cell", 8, { visibility: { showQRCode: true } }],
    ["8 steps, left hand hidden", 8, { visibility: { showLeftMotion: false } }],
    ["4 steps, the fewest that paint one", 4, {}],
  ] as const)("%s lands on the painted squares", async (_label, length, extra) => {
    const sequence = sequenceOf(length);
    const input = inputOf(extra as Partial<ThumbnailRenderInput>);
    const composed = await paintedSquares(sequence, input);
    const planned = landingSquares(sequence, input);

    expect(planned.plan.width).toBe(composed.layout.canvasWidth);
    expect(planned.plan.height).toBe(composed.layout.canvasHeight);
    expect(planned.plan.headerHeight).toBe(composed.layout.headerHeight);
    expect(composed.squares.length).toBeGreaterThan(0);
    expect(sortSquares(planned.squares)).toEqual(sortSquares(composed.squares));
  });

  it("plans no squares when the card paints no mandala", () => {
    const sequence = sequenceOf(8);
    const plan = computeSheetMandalaPlan(
      sequence,
      sheetMandalaSettings(inputOf({ visibility: { showMandala: false } }))
    );
    expect(plan.spots).toEqual([]);
  });

  it.each([
    ["3 steps", 3, {}],
    ["6 steps without the start cell", 6, { includeStartPlacement: false }],
  ] as const)("%s: neither paints nor plans a square", async (_l, length, extra) => {
    const sequence = sequenceOf(length);
    const input = inputOf(extra as Partial<ThumbnailRenderInput>);
    expect((await paintedSquares(sequence, input)).squares).toEqual([]);
    expect(landingSquares(sequence, input).squares).toEqual([]);
  });
});

// The drawn word fits the room the header letters the word in, between the
// level badge and the LOOP icons. If the plan reads the badge or the icons
// differently from the painter, a long word lands at the wrong size on those
// cards only, for the moment the two words cross.
describe("slow-card word room", () => {
  async function paintedRoom(sequence: SequenceData, input: ThumbnailRenderInput) {
    const renderer = new ThumbnailRenderer(
      {} as never,
      {} as never,
      null,
      {} as never
    );
    // @ts-expect-error private method invoked for unit coverage
    const built = renderer.buildRenderOptions(input);
    // As ThumbnailRenderer.render hands them to the composer.
    const options = {
      ...built,
      loopType: sequence.loopType ?? undefined,
      showLoopGlyph: input.showLoopGlyph,
    };
    const layout = computeCardFrontLayout(sequence, options, { darkMode: true });
    let header: WordHeaderOptions | undefined;
    await paintCardFrontChrome(
      {} as never,
      {} as never,
      layout,
      sequence,
      options,
      // As ImageComposer.composeSequenceImage builds it.
      {
        handPathMode: options.visibilityOverrides?.handPathMode,
        showLeftMotion: options.leftVisible !== false,
        showRightMotion: options.rightVisible !== false,
      },
      {
        textRenderer: {
          renderWordHeader: (o: WordHeaderOptions) => {
            header = o;
          },
          renderCardFooter: async () => {},
        } as never,
        renderMandalas: async () => {},
        renderQRCode: async () => {},
      }
    );
    if (!header) throw new Error("the card painted no header");
    // As renderHeader works out the room from what it was handed.
    const ids = (set?: Set<unknown>) =>
      set && set.size > 0 ? new Set([...set] as LOOPComponentId[]) : undefined;
    const inset = Math.min(
      layout.canvasWidth / 2,
      calculateHeaderWordSideInset({
        headerHeight: header.headerHeight,
        indicatorSizeScale: header.indicatorSizeScale,
        showDifficultyBadge: header.showDifficultyBadge ?? true,
        loopComponents: ids(header.loopComponents),
        overlayComponents: ids(header.overlayComponents),
      })
    );
    return { left: inset, right: layout.canvasWidth - inset };
  }

  const looped = (loopType: string) =>
    ({ ...sequenceOf(8), loopType }) as unknown as SequenceData;

  it.each([
    ["a plain card", sequenceOf(8), {}],
    ["LOOP icons", looped("rotated_swapped"), {}],
    ["LOOP icons, left hand hidden", looped("rotated_swapped"), { visibility: { showLeftMotion: false } }],
    ["LOOP icons in hand paths", looped("rotated_inverted"), { visibility: { handPathMode: true } }],
    ["LOOP icons turned off", looped("rotated_swapped"), { showLoopGlyph: false }],
    ["no level badge", looped("rotated"), { addDifficultyLevel: false }],
  ] as const)("%s: the plan's room is the painted room", async (_l, sequence, extra) => {
    const input = inputOf(extra as Partial<ThumbnailRenderInput>);
    const planned = computeSheetMandalaPlan(sequence, sheetMandalaSettings(input));
    expect(planned.word).toEqual(await paintedRoom(sequence, input));
  });

  // The room asks the LOOP resolver, which serialises the whole sequence.
  // A waiting card works its plan out once; the frame that mounts its
  // drawing must find that plan, not pay for it again.
  it("asks the LOOP resolver once per card, however often the plan is read", () => {
    const resolve = vi.fn(() => ({ components: new Set<never>(), period: 1 }));
    registerLoopDisplayResolver(resolve as never);
    try {
      const sequence = looped("rotated_swapped");
      const settings = sheetMandalaSettings(inputOf({}));
      const first = computeSheetMandalaPlan(sequence, settings);
      const again = computeSheetMandalaPlan(sequence, { ...settings });
      expect(again).toBe(first);
      expect(resolve).toHaveBeenCalledTimes(1);
    } finally {
      registerLoopDisplayResolver(null as never);
    }
  });

  it("gives a long word less room beside LOOP icons", () => {
    const input = inputOf({});
    const plain = computeSheetMandalaPlan(sequenceOf(8), sheetMandalaSettings(input));
    const loop = computeSheetMandalaPlan(
      looped("rotated_swapped_inverted"),
      sheetMandalaSettings(input)
    );
    const width = (p: typeof plain) => p.word.right - p.word.left;
    expect(width(loop)).toBeLessThan(width(plain));
  });
});
