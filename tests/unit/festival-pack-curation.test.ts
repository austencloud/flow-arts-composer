import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mirrorFestivalSheetColumns,
  placeFestivalSignupAtCenter,
} from "$lib/features/choreo-card/services/festival-sampler-sheet";
import {
  festivalSamplerCardKey,
  festivalSamplerFingerprint,
  festivalSamplerManifestRevision,
} from "$lib/features/choreo-card/services/festival-sampler-manifest";
import uniquePackManifests from "$lib/features/choreo-card/data/festival-sampler-manifests.json";
import localSequenceData from "../../static/data/choreo-card/festival-sampler-sequences.json";
import { FESTIVAL_TURN_PATTERN_PRESETS } from "$lib/features/choreo-card/services/festival-sampler-turns";

const require = createRequire(import.meta.url);
const {
  buildBalancedLevelThreeSchedule,
  buildBalancedTurnSchedule,
  buildCandidateNames,
  buildFestivalPackCuration,
  isClassicPosition,
} = require("../../scripts/festival-pack-curate.cjs") as {
  buildBalancedLevelThreeSchedule(levelTwoSchedule: string[][]): string[];
  buildBalancedTurnSchedule(): string[][];
  buildCandidateNames(): Array<Record<string, string>>;
  isClassicPosition(position: string | null | undefined): boolean;
  buildFestivalPackCuration(
    documents: unknown[],
    tndRecords?: unknown,
    localRecords?: unknown,
    count?: number
  ): {
    candidates: Array<{
      selected: boolean;
      cards: Array<Record<string, unknown>>;
    }>;
  };
};
const { computeTrimGeometry } =
  require("../../scripts/festival-pack-9up.cjs") as {
    computeTrimGeometry(
      width: number,
      height: number
    ): {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  };

describe("festival pack curation", () => {
  it("builds 50 distinct proposals with the approved control first", () => {
    const candidates = buildCandidateNames();
    expect(candidates).toHaveLength(50);
    expect(
      new Set(candidates.map((candidate) => JSON.stringify(candidate))).size
    ).toBe(50);
    expect(candidates[0]).toEqual({
      mirrored16: expect.stringMatching(/^festival-mirrored-/),
      mirrored8: "DJII",
      rotated16: "OVXΔ",
      rotated8: "MVNU",
      tndBase: "AAAA",
      tndTurn: "JDJD",
      mirroredSwapped8: expect.stringMatching(/^festival-mirrored_swapped-/),
      mirroredInverted8: expect.stringMatching(/^festival-mirrored_inverted-/),
    });
  });

  it("keeps every proposal inside the approved eight-card slot contract", () => {
    const snapshot = JSON.parse(
      readFileSync("static/data/snapshots/public-sequences.json", "utf8")
    ) as { documents: unknown[] };
    const curation = buildFestivalPackCuration(snapshot.documents);

    expect(curation.candidates).toHaveLength(50);
    for (const candidate of curation.candidates) {
      expect(candidate.cards.map((card) => card.slot)).toEqual([
        "mirrored16",
        "mirrored8",
        "rotated16",
        "rotated8",
        "tndBase",
        "tndTurn",
        "mirroredSwapped8",
        "mirroredInverted8",
      ]);
      expect(candidate.cards).toHaveLength(8);
      for (const card of candidate.cards) {
        expect(isClassicPosition(card.startPlacement as string)).toBe(true);
        expect(isClassicPosition(card.endPlacement as string)).toBe(true);
      }
      expect(
        candidate.cards.find((card) => card.slot === "rotated16")?.period
      ).toBe(4);
      expect(
        candidate.cards.find((card) => card.slot === "rotated8")?.period
      ).toBe(2);
    }
    expect(
      curation.candidates.filter((candidate) => candidate.selected)
    ).toHaveLength(1);
  });

  it("provides 60 different tradeable pack assortments", () => {
    const packs = uniquePackManifests.candidates.slice(0, 60);
    const fingerprints = packs.map((pack) =>
      festivalSamplerFingerprint(pack.cards)
    );

    expect(packs).toHaveLength(60);
    expect(new Set(fingerprints).size).toBe(60);
    for (const slot of [
      "mirrored16",
      "mirroredSwapped8",
      "mirroredInverted8",
    ]) {
      const cards = packs.map(
        (pack) => pack.cards.find((card) => card.slot === slot)!
      );
      expect(new Set(cards.map((card) => card.id)).size).toBe(60);
      expect(new Set(cards.map((card) => card.name)).size).toBe(60);
      expect(
        cards.every(
          (card) => card.sequenceLength === (slot === "mirrored16" ? 16 : 8)
        )
      ).toBe(true);
      expect(
        cards.every(
          (card) =>
            isClassicPosition(card.startPlacement) &&
            card.endPlacement === card.startPlacement
        )
      ).toBe(true);
    }
    const tndPairs = packs.map((pack) =>
      pack.cards
        .filter((card) => card.slot === "tndBase" || card.slot === "tndTurn")
        .map((card) => card.docId)
        .join("|")
    );
    expect(new Set(tndPairs).size).toBe(60);
    expect(
      new Set(
        packs.map(
          (pack) => pack.cards.find((card) => card.slot === "tndBase")!.name
        )
      ).size
    ).toBe(10);
    expect(
      new Set(
        packs.map(
          (pack) => pack.cards.find((card) => card.slot === "tndTurn")!.name
        )
      ).size
    ).toBe(9);
    for (const pack of packs) {
      const base = pack.cards.find((card) => card.slot === "tndBase")!;
      const turn = pack.cards.find((card) => card.slot === "tndTurn")!;
      const levelTwo = pack.cards.filter((card) => card.level === 2);
      const levelThree = pack.cards.filter((card) => card.level === 3);
      const levelOne = pack.cards.filter((card) => card.level === 1);
      expect(levelTwo).toHaveLength(3);
      expect(levelThree).toHaveLength(1);
      expect(levelOne).toHaveLength(4);
      expect(
        levelTwo.every(
          (card) =>
            card.turnIntensity === 1 &&
            typeof card.turnPattern === "string" &&
            card.turnPattern.includes("1") &&
            card.turnPattern.includes("0")
        )
      ).toBe(true);
      expect(levelThree[0]!.turnIntensity).toBe(0.5);
      expect(levelThree[0]!.source).not.toBe("catalog");
      expect(levelThree[0]!.turnPattern).toMatch(/0\.5/);
      expect(levelThree[0]!.turnPattern).toMatch(/(?:^|[-|])0(?:[-|]|$)/);
      expect(
        levelOne.every(
          (card) => card.turnIntensity === 0 && card.turnPattern == null
        )
      ).toBe(true);
      const expectedRatio = (level: number) =>
        level === 2 ? "3:1" : level === 3 ? "2:1" : "1:1";
      expect(base.ratio).toBe(expectedRatio(base.level));
      expect(turn.ratio).toBe(expectedRatio(turn.level));
      expect(base.familyId).toMatch(/-same$/);
      expect(turn.familyId).toMatch(/-opp$/);

      for (const card of [...levelTwo, ...levelThree]) {
        const patternValues = card.turnPattern.split(/[-|]/).map(Number);
        const patternEntries = card.turnPattern.split("-");
        const expectedUnitLength =
          card.source === "catalog"
            ? card.sequenceLength
            : card.sequenceLength / (card.period ?? 1);
        expect(patternValues).toHaveLength(expectedUnitLength * 2);
        expect(Math.max(...patternValues)).toBe(card.turnIntensity);
        expect(Math.min(...patternValues)).toBe(0);
        const preset = FESTIVAL_TURN_PATTERN_PRESETS.find(
          (candidate) => candidate.id === card.turnPatternId
        );
        expect(preset).toBeDefined();
        expect(card.sequenceLength).toBeGreaterThanOrEqual(
          preset!.minSequenceLength
        );
      }
    }
    const promotedSlots = new Set(
      packs.flatMap((pack) =>
        pack.cards.filter((card) => card.level === 2).map((card) => card.slot)
      )
    );
    expect(promotedSlots).toEqual(
      new Set([
        "mirrored16",
        "mirrored8",
        "rotated16",
        "rotated8",
        "tndBase",
        "tndTurn",
        "mirroredSwapped8",
        "mirroredInverted8",
      ])
    );
    const selectionCounts = new Map<string, number>();
    const combinations = new Set<string>();
    for (const pack of packs) {
      const selectedSlots = pack.cards
        .filter((card) => card.level === 2)
        .map((card) => card.slot)
        .sort();
      combinations.add(selectedSlots.join("|"));
      for (const slot of selectedSlots) {
        selectionCounts.set(slot, (selectionCounts.get(slot) ?? 0) + 1);
      }
    }
    expect(combinations.size).toBe(56);
    expect([...selectionCounts.values()].sort((a, b) => a - b)).toEqual([
      22, 22, 22, 22, 23, 23, 23, 23,
    ]);
    const levelThreeCounts = new Map<string, number>();
    for (const pack of packs) {
      const card = pack.cards.find((candidate) => candidate.level === 3)!;
      levelThreeCounts.set(
        card.slot,
        (levelThreeCounts.get(card.slot) ?? 0) + 1
      );
    }
    expect(levelThreeCounts.has("tndBase")).toBe(false);
    expect(levelThreeCounts.has("tndTurn")).toBe(false);
    expect([...levelThreeCounts.values()].sort((a, b) => a - b)).toEqual([
      10, 10, 10, 10, 10, 10,
    ]);
    expect(
      new Set(
        packs.flatMap((pack) =>
          pack.cards
            .filter((card) => card.slot === "rotated16")
            .map((card) => card.name)
        )
      ).size
    ).toBe(15);
    expect(
      new Set(
        packs.flatMap((pack) =>
          pack.cards
            .filter((card) => card.slot === "rotated8")
            .map((card) => card.name)
        )
      ).size
    ).toBe(13);
  });

  it("keeps generated source records at Level 1 before manifest assignment", () => {
    const records = localSequenceData.records as Record<
      string,
      {
        level: number;
        turnIntensity: number;
        steps: Array<{
          motions: {
            left: { turns: number };
            right: { turns: number };
          };
        }>;
      }
    >;

    for (const record of Object.values(records)) {
      const turns = record.steps.flatMap((step) => [
        (step.motions.left ?? step.motions.blue).turns,
        (step.motions.right ?? step.motions.red).turns,
      ]);
      expect(turns.every((turn) => Number.isInteger(turn))).toBe(true);
      expect(turns.every((turn) => turn === 0)).toBe(true);
      expect(record.turnIntensity).toBe(0);
      expect(record.level).toBe(1);
    }
  });

  it("balances all 56 three-of-eight turn selections across 60 packs", () => {
    const schedule = buildBalancedTurnSchedule();
    const counts = new Map<string, number>();

    expect(schedule).toHaveLength(60);
    expect(
      new Set(schedule.map((slots) => [...slots].sort().join("|"))).size
    ).toBe(56);
    for (const slots of schedule) {
      expect(new Set(slots).size).toBe(3);
      for (const slot of slots) {
        counts.set(slot, (counts.get(slot) ?? 0) + 1);
      }
    }
    expect([...counts.values()].sort((a, b) => a - b)).toEqual([
      22, 22, 22, 22, 23, 23, 23, 23,
    ]);
  });

  it("randomly balances one eligible LOOP at Level 3 per pack", () => {
    const levelTwoSchedule = buildBalancedTurnSchedule();
    const levelThreeSchedule =
      buildBalancedLevelThreeSchedule(levelTwoSchedule);
    const counts = new Map<string, number>();

    expect(levelThreeSchedule).toHaveLength(60);
    levelThreeSchedule.forEach((slot, index) => {
      expect(levelTwoSchedule[index]).not.toContain(slot);
      expect(slot).not.toBe("tndBase");
      expect(slot).not.toBe("tndTurn");
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    });
    expect([...counts.values()].sort((a, b) => a - b)).toEqual([
      10, 10, 10, 10, 10, 10,
    ]);
  });

  it("keys the same source separately when its frozen turn recipe differs", () => {
    const base = {
      slot: "rotated16",
      source: "publicSequences" as const,
      sourceRef: "publicSequences/example",
      name: "EXAMPLE",
      level: 1,
      turnIntensity: 0,
    };
    const turned = {
      ...base,
      level: 2,
      turnIntensity: 1,
      turnPattern: "1|1",
    };
    const halfTurned = {
      ...base,
      level: 3,
      turnIntensity: 0.5,
      turnPattern: "0.5|0-0|0.5",
    };

    expect(
      new Set([
        festivalSamplerCardKey(base),
        festivalSamplerCardKey(turned),
        festivalSamplerCardKey(halfTurned),
      ]).size
    ).toBe(3);
  });

  it("invalidates rendered batches when a frozen card recipe changes", () => {
    const original = uniquePackManifests.candidates.slice(0, 1);
    const changed = structuredClone(original);
    changed[0]!.cards[5]!.turnPattern = "1|1-0|0-0|1-1|0";

    expect(festivalSamplerManifestRevision(changed)).not.toBe(
      festivalSamplerManifestRevision(original)
    );
  });

  it("crops the same physical bleed from 1x fronts and 2x backs", () => {
    expect(computeTrimGeometry(822, 1122)).toEqual({
      left: 36,
      top: 36,
      width: 750,
      height: 1050,
    });
    expect(computeTrimGeometry(1644, 2244)).toEqual({
      left: 72,
      top: 72,
      width: 1500,
      height: 2100,
    });
  });

  it("keeps signup centered and mirrors each back-page row", () => {
    const sheet = placeFestivalSignupAtCenter(
      ["A", "B", "C", "D", "E", "F", "G", "H"],
      "SIGNUP"
    );

    expect(sheet).toEqual(["A", "B", "C", "D", "SIGNUP", "E", "F", "G", "H"]);
    expect(mirrorFestivalSheetColumns(sheet)).toEqual([
      "C",
      "B",
      "A",
      "E",
      "SIGNUP",
      "D",
      "H",
      "G",
      "F",
    ]);
  });
});
