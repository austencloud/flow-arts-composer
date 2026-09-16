/**
 * hero-act.svelte.ts logic tests. Named without the `.svelte.` infix so it
 * runs under jsdom (the plain unit-test project), not the browser component
 * project — see docs/reference/component-testing.md's naming footgun.
 *
 * Mocks generatePerVisitDemo at the per-visit-demo.ts module boundary: that's
 * where generation enters hero-act.ts's world, so tests exercise the act's
 * cycling, pass-counting, and chaining without touching the real engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const mocks = vi.hoisted(() => ({
  generatePerVisitDemo: vi.fn(),
  drawMatrixRealization: vi.fn(),
}));

vi.mock("$lib/shared/landing/data/per-visit-demo", () => ({
  generatePerVisitDemo: mocks.generatePerVisitDemo,
}));

vi.mock("$lib/shared/landing/data/shape-matrix-hero-pool", () => ({
  drawMatrixRealization: mocks.drawMatrixRealization,
}));

import {
  createHeroAct,
  PROP_CYCLE,
  PASSES_PER_SEQUENCE,
} from "../hero-act.svelte";

/** Minimal fixture — hero-act.ts only ever reads `.id` and `.startPlacement`. */
function fakeSequence(id: string, startPos: string): SequenceData {
  return {
    id,
    name: id,
    word: id,
    steps: [],
    startPlacement: {
      isStartPlacement: true,
      id: `${id}-start`,
      startPlacement: startPos,
      motions: {},
    },
    thumbnails: [],
    isFavorite: false,
    isCircular: true,
    tags: [],
    metadata: {},
  } as unknown as SequenceData;
}

/** Flushes every pending microtask (including a `.then()` chain fired by a
 *  background `prepareNext()` call that `advance()` doesn't itself await). */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Await macrotasks until `pred()` holds (or a bounded tick budget elapses). A
 *  matrix-source draw adds a dynamic `import()` hop, so a single flush() tick can
 *  return before the act's state settles under CPU contention (parallel forks) —
 *  poll instead of guessing a tick count, removing the timing race. */
async function flushUntil(pred: () => boolean, ticks = 50): Promise<void> {
  for (let i = 0; i < ticks && !pred(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Every draw the act has asked for, from either source. */
function drawCount(): number {
  return (
    mocks.generatePerVisitDemo.mock.calls.length +
    mocks.drawMatrixRealization.mock.calls.length
  );
}

/** Waits for the background prefetch to fire AND land.
 *
 *  prepareNext() defers its draw to background priority, so it costs one
 *  macrotask more than the `.then()` chain a single flush() covers. The
 *  trailing flush lets the resolved draw settle into the act's prepared slot,
 *  which is what the offer/accept assertions read. */
async function flushPrefetch(draws = 2): Promise<void> {
  await flushUntil(() => drawCount() >= draws);
  await flush();
}

/**
 * These tests exercise the act's orchestration (cycling, prefetch, chaining)
 * against the generated per-visit draw, which they mock. The shape-matrix source
 * is a separate feature with its own tests, so it is disabled here — fraction 0
 * draws no source/box roll, keeping the random call order identical to the
 * pre-matrix act.
 */
const NO_MATRIX = { matrixFraction: 0, boxFraction: 0 } as const;

function createStaffFirstAct() {
  return createHeroAct({ random: () => 0, ...NO_MATRIX });
}

let callCount = 0;

const FAKE_ELEMENT = {
  familyId: "split-same",
  name: "Split-Same",
  element: "water",
  accentColor: "#3568a0",
  darkComplement: "#1a3a5e",
  iconPath: "/images/elements/water-v2.png",
  cardTintOpacity: 0.25,
  iconScale: 0.9,
};

beforeEach(() => {
  callCount = 0;
  mocks.generatePerVisitDemo.mockReset();
  mocks.generatePerVisitDemo.mockImplementation(
    async (_options?: { propType?: PropType; startPlacement?: unknown }) => {
      callCount += 1;
      return fakeSequence(`gen-${callCount}`, `pos-${callCount}`);
    }
  );
  mocks.drawMatrixRealization.mockReset();
  mocks.drawMatrixRealization.mockResolvedValue(null);
});

/**
 * Drains the act's background-priority prefetch before the next test starts.
 *
 * prepareNext() schedules its draw instead of firing it inline, so an act that
 * outlives its test can still land a draw afterwards — and beforeEach has by
 * then reset the mocks, so that draw is counted against the NEXT test. Wait for
 * the scheduled work to go quiet rather than guessing a tick count.
 */
afterEach(async () => {
  let quiet = 0;
  let seen = -1;
  for (let i = 0; i < 30 && quiet < 3; i++) {
    const now = drawCount();
    quiet = now === seen ? quiet + 1 : 0;
    seen = now;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe("createHeroAct", () => {
  it("publishes a baked opening without generation and prepares only its continuation on start", async () => {
    const initial = fakeSequence("baked", "baked-pos");
    const random = vi.fn(() => 0.75);
    const act = createHeroAct({
      initialSequence: initial,
      random,
      ...NO_MATRIX,
    });

    expect(act.sequence?.id).toBe("baked");
    expect(act.propType).toBe(PropType.STAFF);
    expect(random).not.toHaveBeenCalled();
    expect(mocks.generatePerVisitDemo).not.toHaveBeenCalled();

    act.start();
    act.start();
    await flush();

    expect(random).not.toHaveBeenCalled();
    expect(mocks.generatePerVisitDemo).toHaveBeenCalledTimes(1);
    expect(mocks.generatePerVisitDemo.mock.calls[0]?.[0]).toEqual({
      propType: PropType.FAN,
      startPlacement: expect.objectContaining({ startPlacement: "baked-pos" }),
    });
    expect(act.sequence?.id).toBe("baked");
  });

  it("waits until client start before choosing and generating the opening prop", async () => {
    const random = vi.fn(() => 0.75);
    const act = createHeroAct({ random, ...NO_MATRIX });
    expect(act.sequence).toBeNull();
    expect(act.propType).toBe(PropType.STAFF);
    expect(random).not.toHaveBeenCalled();
    expect(mocks.generatePerVisitDemo).not.toHaveBeenCalled();

    act.start();
    act.start();
    expect(random).toHaveBeenCalledTimes(1);
    expect(act.propType).toBe(PropType.BUUGENG);
    expect(act.rerolling).toBe(true);
    await flush();

    expect(mocks.generatePerVisitDemo.mock.calls[0]?.[0]).toEqual({
      propType: PropType.BUUGENG,
    });
    expect(act.sequence?.id).toBe("gen-1");
    expect(act.propType).toBe(PropType.BUUGENG);
    expect(act.rerolling).toBe(false);
  });

  it.each([
    [0, PropType.STAFF],
    [0.25, PropType.FAN],
    [0.5, PropType.CLUB],
    [0.999, PropType.BUUGENG],
  ] as const)("maps the random draw %s to %s", async (draw, expectedProp) => {
    const act = createHeroAct({ random: () => draw, ...NO_MATRIX });

    act.start();
    await flush();

    expect(act.propType).toBe(expectedProp);
    expect(mocks.generatePerVisitDemo.mock.calls[0]?.[0]).toEqual({
      propType: expectedProp,
    });
  });

  it("never includes poi in the prop cycle", () => {
    expect(PROP_CYCLE).not.toContain(PropType.POI);
  });

  it("pre-generates the next prop after the fresh first sequence lands", async () => {
    const act = createHeroAct({ random: () => 0.5, ...NO_MATRIX });
    act.start();
    await flushPrefetch();

    expect(mocks.generatePerVisitDemo).toHaveBeenCalledTimes(2);
    expect(mocks.generatePerVisitDemo.mock.calls[1]?.[0]).toEqual({
      propType: PropType.BUUGENG,
      startPlacement: expect.objectContaining({ startPlacement: "pos-1" }),
    });
  });

  it("generates the first sequence independently for every act instance", async () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);
    const firstVisit = createHeroAct({ random, ...NO_MATRIX });
    firstVisit.start();
    // gen-1 opens the first act and gen-2 is its prefetch, so the second act's
    // opening draw is gen-3. Wait for the prefetch rather than assuming it beat
    // the second act to the generator.
    await flushPrefetch();

    const secondVisit = createHeroAct({ random, ...NO_MATRIX });
    secondVisit.start();
    await flush();

    expect(firstVisit.sequence?.id).toBe("gen-1");
    expect(secondVisit.sequence?.id).toBe("gen-3");
    expect(secondVisit.sequence?.id).not.toBe(firstVisit.sequence?.id);
    expect(firstVisit.propType).toBe(PropType.STAFF);
    expect(secondVisit.propType).toBe(PropType.CLUB);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("cycles from the randomly selected opening prop and wraps around", async () => {
    const act = createHeroAct({ random: () => 0.25, ...NO_MATRIX });
    act.start();
    await flush();
    const seen: PropType[] = [act.propType];

    for (let i = 0; i < PROP_CYCLE.length; i++) {
      await act.advanceNow();
      await flush();
      seen.push(act.propType);
    }

    expect(seen).toEqual([
      PropType.FAN,
      PropType.CLUB,
      PropType.BUUGENG,
      PropType.STAFF,
      PropType.FAN,
    ]);
    // Every prop visited across a full lap stays inside the sanctioned cycle.
    for (const prop of seen) {
      expect(PROP_CYCLE).toContain(prop);
    }
  });

  it("every advance carries a distinct sequence id (the player keys its in-place reload on id)", async () => {
    const act = createStaffFirstAct();
    act.start();
    await flush();
    const ids: string[] = [act.sequence!.id];

    for (let i = 0; i < PROP_CYCLE.length; i++) {
      await act.advanceNow();
      await flush();
      ids.push(act.sequence!.id);
    }

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chains each generated sequence's startPlacement to the immediately-preceding sequence's start position", async () => {
    const act = createStaffFirstAct();
    act.start();
    await flush();

    await act.advanceNow(); // STAFF -> FAN
    await flush();
    const fanCall = mocks.generatePerVisitDemo.mock.calls.find(
      ([options]) =>
        (options as { propType?: PropType } | undefined)?.propType ===
        PropType.FAN
    );
    expect(fanCall?.[0]).toMatchObject({
      startPlacement: expect.objectContaining({ startPlacement: "pos-1" }),
    });
    const fanStartPlacement = act.sequence?.startPlacement;

    await act.advanceNow(); // FAN -> CLUB
    await flush();
    const clubCall = mocks.generatePerVisitDemo.mock.calls.find(
      ([options]) =>
        (options as { propType?: PropType } | undefined)?.propType ===
        PropType.CLUB
    );
    expect(clubCall?.[0]).toMatchObject({ startPlacement: fanStartPlacement });
  });

  it("advanceNow reuses an already-prepared next sequence instead of generating a duplicate", async () => {
    const act = createStaffFirstAct();
    act.start();
    await flushPrefetch(); // the FAN pre-generation lands

    expect(mocks.generatePerVisitDemo).toHaveBeenCalledTimes(2);

    await act.advanceNow();
    await flushPrefetch(3);

    // Exactly one more call: the background prepareNext() for the prop after
    // FAN (CLUB), fired by advance() itself. A second call targeting FAN
    // again would mean the ready sequence was discarded and regenerated.
    expect(mocks.generatePerVisitDemo).toHaveBeenCalledTimes(3);
    expect(act.propType).toBe(PropType.FAN);
  });

  it("advanceNow generates on demand when the next prefetch is still pending", async () => {
    let resolvePrefetch!: (seq: SequenceData) => void;
    const pendingPrefetch = new Promise<SequenceData>((resolve) => {
      resolvePrefetch = resolve;
    });
    const act = createStaffFirstAct();
    act.start();
    mocks.generatePerVisitDemo.mockReturnValueOnce(pendingPrefetch);
    // The prefetch must have STARTED for this scenario to exist, so wait for the
    // call rather than for a result that never arrives. Flushing a fixed tick
    // instead would leave the deferred draw unfired, and advanceNow would then
    // consume the never-resolving promise itself and hang.
    await flushUntil(() => mocks.generatePerVisitDemo.mock.calls.length >= 2);

    await act.advanceNow();
    await flush();

    expect(act.propType).toBe(PropType.FAN);
    const fanCalls = mocks.generatePerVisitDemo.mock.calls.filter(
      ([options]) =>
        (options as { propType?: PropType } | undefined)?.propType ===
        PropType.FAN
    );
    expect(fanCalls).toHaveLength(2);

    // Settle the abandoned prefetch. Its result must be ignored because the
    // act already advanced and began preparing CLUB.
    resolvePrefetch(fakeSequence("stale-fan", "stale-pos"));
    await flush();
    expect(act.sequence?.id).not.toBe("stale-fan");
  });

  it("offers the prepared sequence only after PASSES_PER_SEQUENCE boundaries, then commits both sequence and prop atomically", async () => {
    const act = createStaffFirstAct();
    act.start();
    await flushPrefetch(); // FAN pre-generation lands
    expect(act.propType).toBe(PropType.STAFF);
    const outgoingId = act.sequence?.id;

    for (let i = 1; i < PASSES_PER_SEQUENCE; i++) {
      expect(act.offerSequenceBoundary()).toBeNull();
      expect(act.propType).toBe(PropType.STAFF);
    }

    const handoff = act.offerSequenceBoundary();
    expect(handoff?.sequence.id).not.toBe(outgoingId);
    // Merely offering the candidate cannot move host state. The controller
    // accepts only after its engine has initialized the incoming sequence.
    expect(act.sequence?.id).toBe(outgoingId);
    expect(act.propType).toBe(PropType.STAFF);

    handoff?.accept();
    expect(act.propType).toBe(PropType.FAN);
    expect(act.sequence?.id).toBe(handoff?.sequence.id);
  });

  it("keeps looping the current sequence when the pre-generated next hasn't landed, then advances once it does", async () => {
    let resolveNext!: (seq: SequenceData) => void;
    const pending = new Promise<SequenceData>((resolve) => {
      resolveNext = resolve;
    });
    const act = createStaffFirstAct();
    act.start();
    // The first call already returned the initial staff sequence. Hold the
    // second call, which is the background FAN prefetch.
    mocks.generatePerVisitDemo.mockReturnValueOnce(pending);
    await flushPrefetch();
    expect(mocks.generatePerVisitDemo).toHaveBeenCalledTimes(2);

    // Loop boundary fires before generation has resolved. PASSES_PER_SEQUENCE
    // may be 1 (crossing the quota on this very call) — either way, with no
    // ready sequence the act must not advance.
    for (let i = 0; i < PASSES_PER_SEQUENCE; i++) {
      expect(act.offerSequenceBoundary()).toBeNull();
    }
    await flush();
    expect(act.sequence?.id).toBe("gen-1");
    expect(act.propType).toBe(PropType.STAFF);

    // Generation lands.
    resolveNext(fakeSequence("gen-fan", "pos-fan"));
    await flush();

    // Retried at the next boundary: now it advances.
    const handoff = act.offerSequenceBoundary();
    expect(handoff?.sequence.id).toBe("gen-fan");
    handoff?.accept();
    expect(act.sequence?.id).toBe("gen-fan");
    expect(act.propType).toBe(PropType.FAN);
  });

  it("commits the replacement sequence and prop together on a manual reroll", async () => {
    const act = createStaffFirstAct();
    act.start();
    await flush();
    const initialSequenceId = act.sequence?.id;

    await act.advanceNow();

    expect(act.sequence?.id).not.toBe(initialSequenceId);
    expect(act.propType).toBe(PropType.FAN);
    expect(act.rerolling).toBe(false);
  });
});

describe("createHeroAct — shape-matrix source", () => {
  it("uses a matrix realization and exposes its element when the matrix draw wins", async () => {
    mocks.drawMatrixRealization.mockResolvedValue({
      sequence: fakeSequence("matrix-1", "pos-m"),
      element: FAKE_ELEMENT,
    });
    // matrixFraction 1 → source roll always picks the matrix; boxFraction 0.
    const act = createHeroAct({
      random: () => 0,
      matrixFraction: 1,
      boxFraction: 0,
    });
    act.start();
    await flushUntil(() => act.sequence != null);

    expect(mocks.drawMatrixRealization).toHaveBeenCalled();
    expect(mocks.generatePerVisitDemo).not.toHaveBeenCalled();
    expect(act.sequence?.id).toBe("matrix-1");
    expect(act.element).toEqual(FAKE_ELEMENT);
  });

  it("falls back to a generated draw (no element) when the matrix draw returns null", async () => {
    mocks.drawMatrixRealization.mockResolvedValue(null);
    const act = createHeroAct({
      random: () => 0,
      matrixFraction: 1,
      boxFraction: 0,
    });
    act.start();
    await flushUntil(() => act.sequence != null);

    expect(mocks.drawMatrixRealization).toHaveBeenCalled();
    expect(mocks.generatePerVisitDemo).toHaveBeenCalled();
    expect(act.sequence?.id).toBe("gen-1");
    expect(act.element).toBeNull();
  });

  it("generated draws never carry an element (no indicator)", async () => {
    const act = createHeroAct({
      random: () => 0,
      matrixFraction: 0,
      boxFraction: 0,
    });
    act.start();
    await flush();

    expect(mocks.drawMatrixRealization).not.toHaveBeenCalled();
    expect(act.element).toBeNull();
  });
});
