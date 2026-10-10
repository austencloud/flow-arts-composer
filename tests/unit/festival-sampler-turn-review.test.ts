import { describe, expect, it } from "vitest";
import manifests from "#lib/features/choreo-card/data/festival-sampler-manifests.json";
import {
  buildFestivalTurnReviewItems,
  formatFestivalTurnPattern,
  parseFestivalTurnPattern,
  readFestivalTurnReviewDecisions,
  readFestivalTurnReviewSession,
  resolveFestivalTurnPatternContext,
  setFestivalTurnMotifValue,
  smallestFestivalTurnMotifLength,
  writeFestivalTurnReviewSession,
  FESTIVAL_TURN_REVIEW_SESSION_KEY,
  type FestivalTurnReviewManifest,
} from "#lib/features/choreo-card/services/festival-sampler-turn-review.js";

const packs = manifests.candidates as FestivalTurnReviewManifest[];

describe("festival sampler turn review", () => {
  it("groups every frozen assignment into the 12 approved rhythmic families", () => {
    const items = buildFestivalTurnReviewItems(packs);
    const patternedCards = packs
      .flatMap((pack) => pack.cards)
      .filter(
        (card) =>
          card.turnPattern &&
          (card.turnIntensity === 0.5 || card.turnIntensity === 1)
      );

    expect(items).toHaveLength(12);
    expect(new Set(items.map((item) => item.id)).size).toBe(12);
    expect(items.reduce((sum, item) => sum + item.usageCount, 0)).toBe(
      patternedCards.length
    );
    expect(
      items.every((item) =>
        item.examples.every(
          (example) =>
            example.representativeCard.turnPatternId === item.id &&
            example.representativeCard.turnPattern === example.pattern
        )
      )
    ).toBe(true);
    expect(
      items.every((item) =>
        item.examples.every(
          (example) =>
            example.effectiveEntries.length === example.sequenceLength
        )
      )
    ).toBe(true);
    expect(
      items.slice(0, 4).every((item) => item.minSequenceLength === 4)
    ).toBe(true);
    expect(
      items.slice(4, 8).every((item) => item.minSequenceLength === 8)
    ).toBe(true);
    expect(items.slice(8).every((item) => item.minSequenceLength === 16)).toBe(
      true
    );
  });

  it("normalizes a halfway color swap onto continuing motion tracks", () => {
    const context = resolveFestivalTurnPatternContext(
      {
        slot: "example",
        source: "packLocal",
        name: "Halfway swap",
        sequenceLength: 4,
        loopType: "swapped",
        period: 2,
      },
      "1|0-1|0-0|1-0|1"
    );

    expect(context.swapMask).toEqual([false, false, true, true]);
    expect(context.effectivePattern).toBe("1|0-1|0-1|0-1|0");
  });

  it("uses the swap component period inside a quartered compound LOOP", () => {
    const context = resolveFestivalTurnPatternContext(
      {
        slot: "example",
        source: "packLocal",
        name: "Quartered rotated swap",
        sequenceLength: 8,
        loopType: "rotated_swapped",
        period: 4,
      },
      "1|0-0|0-1|0-0|0"
    );

    expect(context.swapPeriod).toBe(2);
    expect(context.swapMask).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it("changes the whole cyclic motif when one visible step is edited", () => {
    const entries = parseFestivalTurnPattern("1|0-0|0-1|0-0|0");
    const edited = setFestivalTurnMotifValue(entries, 2, 2, "right", 1);

    expect(formatFestivalTurnPattern(edited)).toBe("1|1-0|0-1|1-0|0");
    expect(smallestFestivalTurnMotifLength(edited)).toBe(2);
  });

  it("loads valid votes and ignores corrupt storage entries", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          valid: {
            decision: "yay",
            originalPattern: "1|0-0|1",
            reviewedPattern: "1|0-0|1",
            originalEffectivePattern: "1|0-0|1",
            reviewedEffectivePattern: "1|0-0|1",
            loopType: null,
            period: null,
            updatedAt: "2026-08-14T00:00:00.000Z",
          },
          corrupt: { decision: "maybe" },
        }),
      setItem: () => undefined,
    };

    expect(readFestivalTurnReviewDecisions(storage)).toEqual({});
  });

  it("seeds all 12 families from the imported and conversational approvals", () => {
    const items = buildFestivalTurnReviewItems(packs);
    const decisions = readFestivalTurnReviewDecisions(null, items);

    expect(Object.keys(decisions)).toHaveLength(12);
    expect(
      Object.values(decisions).every((decision) => decision.decision === "yay")
    ).toBe(true);
    expect(
      Object.values(decisions).filter(
        (decision) => decision.source === "imported-v2"
      )
    ).toHaveLength(8);
    expect(
      Object.values(decisions).filter(
        (decision) => decision.source === "conversation-2026-08-14"
      )
    ).toHaveLength(4);
  });

  it("round-trips the active review draft and scroll positions", () => {
    const items = buildFestivalTurnReviewItems(packs);
    const item = items[7]!;
    const example = item.examples[0]!;
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const session = {
      selectedId: item.id,
      selectedExampleId: example.id,
      filter: "all" as const,
      draftPattern: example.pattern,
      motifLength: smallestFestivalTurnMotifLength(
        parseFestivalTurnPattern(example.pattern)
      ),
      patternScrollTop: 412,
      patternScrollLeft: 96,
      workspaceScrollTop: 233,
      pageScrollTop: 144,
    };

    writeFestivalTurnReviewSession(storage, session);

    expect(readFestivalTurnReviewSession(storage, items)).toEqual(session);
  });

  it("drops stale or structurally invalid review sessions", () => {
    const items = buildFestivalTurnReviewItems(packs);
    const item = items[0]!;
    const example = item.examples[0]!;
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const valid = {
      selectedId: item.id,
      selectedExampleId: example.id,
      filter: "unreviewed",
      draftPattern: example.pattern,
      motifLength: smallestFestivalTurnMotifLength(
        parseFestivalTurnPattern(example.pattern)
      ),
      patternScrollTop: 0,
      patternScrollLeft: 0,
      workspaceScrollTop: 0,
      pageScrollTop: 0,
    };

    for (const invalid of [
      { ...valid, selectedId: "removed-pattern" },
      { ...valid, filter: "maybe" },
      { ...valid, selectedExampleId: "removed-example" },
      { ...valid, draftPattern: `${example.pattern}-0|0` },
      { ...valid, motifLength: 3 },
      { ...valid, pageScrollTop: -1 },
    ]) {
      values.set(FESTIVAL_TURN_REVIEW_SESSION_KEY, JSON.stringify(invalid));
      expect(readFestivalTurnReviewSession(storage, items)).toBeNull();
    }
  });
});
