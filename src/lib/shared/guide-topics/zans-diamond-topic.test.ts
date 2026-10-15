/**
 * Zan's Diamond guide record. The silent failures: the checked-in variation
 * table drifting from what the generator derives against the real dataframe,
 * a strip whose placements do not chain, a hand path that no longer closes,
 * or a caption key missing in one locale.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import {
  buildStaggerAndReversalVariations,
  pairSoloPropSteps,
  type PairLetterLookup,
} from "#lib/shared/foundation/services/solo-prop-pair-variations.js";
import {
  lookupLetter,
  parseCsvEdges,
} from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { buildBrowsePath } from "#lib/shared/browse/navigation/browse-route-resolver.js";
import record from "../foundation/services/__tests__/fixtures/zans-diamond-record.json";
import {
  ZANS_DIAMOND_COLLECTION_PATH,
  ZANS_DIAMOND_FAMILIES,
  ZANS_DIAMOND_LEFT_STEPS,
  ZANS_DIAMOND_ORIGINAL,
  ZANS_DIAMOND_PATH,
  ZANS_DIAMOND_RIGHT_STEPS,
  ZANS_DIAMOND_VARIATIONS,
  zansDiamondStrip,
  zansDiamondPathStrip,
  zansDiamondVariationLabel,
} from "./zans-diamond-topic";

const english = en as Record<string, string>;
const german = de as Record<string, string>;

const edges = parseCsvEdges(
  readFileSync(
    resolve(
      process.cwd(),
      "static/data/pictographs/DiamondPictographDataframe.csv"
    ),
    "utf8"
  )
);
const lookup: PairLetterLookup = (q) =>
  lookupLetter(edges, {
    startPlacement: q.startPlacement,
    endPlacement: q.endPlacement,
    left: q.left,
    right: q.right,
  });

describe("the hand path", () => {
  it("is the author-verified record's steps", () => {
    expect(ZANS_DIAMOND_LEFT_STEPS).toEqual(record.leftSteps);
    expect(ZANS_DIAMOND_RIGHT_STEPS).toEqual(record.rightSteps);
  });

  it("closes on itself and alternates shift and dash", () => {
    const points = [
      ZANS_DIAMOND_PATH[0]!.from,
      ...ZANS_DIAMOND_PATH.map((m) => m.to),
    ];
    expect(points).toEqual(["s", "e", "w", "n", "s", "w", "e", "n", "s"]);
    expect(ZANS_DIAMOND_PATH.map((m) => m.kind)).toEqual([
      "shift",
      "dash",
      "shift",
      "dash",
      "shift",
      "dash",
      "shift",
      "dash",
    ]);
  });
});

describe("the variation table", () => {
  it("is what the generator derives against the real dataframe", () => {
    const derived = [
      pairSoloPropSteps(
        {
          id: "original",
          label: "Original",
          left: { reversed: false, offset: 0 },
          right: { reversed: false, offset: 0 },
        },
        record.leftSteps as never,
        record.rightSteps as never,
        lookup
      ),
      ...buildStaggerAndReversalVariations(
        record.leftSteps as never,
        record.rightSteps as never,
        lookup
      ),
    ];
    expect(derived.every((r) => r.unresolvedBeats.length === 0)).toBe(true);
    expect(
      ZANS_DIAMOND_VARIATIONS.map((v) => ({
        id: v.id,
        word: v.word,
        startPlacement: v.startPlacement,
        letters: v.letters,
        left: v.left,
        right: v.right,
      }))
    ).toEqual(
      derived.map((r) => ({
        id: r.variation.id,
        word: r.word,
        startPlacement: r.beats[0]!.startPlacement,
        letters: r.beats.map((b) => b.letter),
        left: r.variation.left,
        right: r.variation.right,
      }))
    );
  });

  it("holds the original and three families of 7, 8 and 8", () => {
    expect(ZANS_DIAMOND_VARIATIONS).toHaveLength(24);
    expect(ZANS_DIAMOND_ORIGINAL.word).toBe("IΨ-IΨ-IΨ-IΨ-");
    expect(
      ZANS_DIAMOND_FAMILIES.map((f) => [f.id, f.variations.length])
    ).toEqual([
      ["stagger", 7],
      ["right-reversed", 8],
      ["left-reversed", 8],
    ]);
  });
});

describe("zansDiamondStrip", () => {
  it("plays every variation as a start pose and eight chained beats", () => {
    for (const variation of ZANS_DIAMOND_VARIATIONS) {
      const strip = zansDiamondStrip(variation);
      expect(strip).toHaveLength(9);
      expect(strip[0]!.stepNumber).toBe(0);
      expect(strip[0]!.startPlacement).toBe(variation.startPlacement);
      expect(strip[8]!.endPlacement).toBe(variation.startPlacement);
      for (let i = 1; i < strip.length; i++) {
        expect(strip[i]!.stepNumber).toBe(i);
        expect(strip[i]!.startPlacement).toBe(strip[i - 1]!.endPlacement);
        expect(strip[i]!.letter).toBe(variation.letters[i - 1]);
        const { left, right } = strip[i]!.motions;
        expect(left?.propType).toBe("hand");
        expect(right?.propType).toBe("hand");
      }
      expect(
        strip
          .slice(1)
          .map((s) => s.letter)
          .join("")
      ).toBe(variation.word);
    }
  });
});

describe("the path strip", () => {
  it("plays the left hand alone along the eight moves", () => {
    const strip = zansDiamondPathStrip();
    expect(strip).toHaveLength(9);
    for (const box of strip) {
      expect(box.motions.right?.isVisible).toBe(false);
      expect(box.motions.left?.isVisible).not.toBe(false);
      expect(box.letter).toBeNull();
    }
    expect(strip[0]!.motions.left?.startLocation).toBe(
      ZANS_DIAMOND_PATH[0]!.from
    );
    expect(
      strip.slice(1).map((s) => [
        s.motions.left?.startLocation,
        s.motions.left?.endLocation,
      ])
    ).toEqual(ZANS_DIAMOND_PATH.map((m) => [m.from, m.to]));
  });
});

describe("copy and links", () => {
  it("names every family and caption in both locales", () => {
    const keys = new Set<string>(
      ZANS_DIAMOND_FAMILIES.flatMap((f) => [f.title, f.body])
    );
    const seen = new Set<string>();
    const t = (key: string, params?: Record<string, string | number>) => {
      seen.add(key);
      expect(english[key], key).toBeTruthy();
      expect(german[key], key).toBeTruthy();
      if (params) {
        for (const name of Object.keys(params)) {
          expect(english[key]).toContain(`{${name}}`);
          expect(german[key]).toContain(`{${name}}`);
        }
      }
      return english[key]!;
    };
    for (const variation of ZANS_DIAMOND_VARIATIONS) {
      expect(zansDiamondVariationLabel(variation, t as never)).toBeTruthy();
    }
    for (const key of keys) {
      expect(english[key], key).toBeTruthy();
      expect(german[key], key).toBeTruthy();
    }
    expect(seen.size).toBe(4);
  });

  it("links the collection by the app's own browse path", () => {
    expect(ZANS_DIAMOND_COLLECTION_PATH).toBe(
      buildBrowsePath({
        primary: "explore",
        section: "collections",
        view: "detail",
        ownerId: "PBp3GSBO6igCKPwJyLZNmVEmamI3",
        contextId: "dab5fdca-b279-4a50-bd7a-67f291fce071",
      })
    );
  });
});
