/**
 * Short-code survival for the paid cosmetic pair.
 *
 * A prop code is one character. Reuse an existing one and every card, QR, and
 * share link carrying the old prop silently starts rendering the new one; miss
 * a codec and a saved sequence quietly reopens as a staff. Neither failure
 * looks like a failure — the sequence still draws, just with the wrong prop.
 */

import { describe, it, expect } from "vitest";

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  encodeSequence,
  decodeSequence,
  encodePropForURL,
  parsePropTypeFromURLValue,
  decodeSequenceFromQR,
} from "$lib/shared/navigation/services/sequence-encoder";
import {
  encodeLegacySequence,
  decodeLegacySequence,
  detectLegacySequenceFormat,
  type LegacySequenceFormat,
} from "$lib/shared/navigation/services/legacy-sequence-codec";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const PRODUCTION_FLAT_QR =
  "s~q1:9O5/166CQPYL*25*4NKYPGQG:RDJMKRIPXMFQ56W257R5YNI*O4AYS/*COVM1VC9S3:T9J*4HQ13H0";

const ENERGY_PROPS = [PropType.ENERGY_SABER, PropType.ENERGY_STAFF] as const;

/** Take a real production sequence and repaint both hands with one prop. */
function withProp(source: SequenceData, propType: PropType): SequenceData {
  const repaint = <T extends { motions: Record<string, unknown> }>(
    beat: T
  ): T => ({
    ...beat,
    motions: Object.fromEntries(
      Object.entries(beat.motions).map(([hand, motion]) => [
        hand,
        motion ? { ...(motion as object), propType } : motion,
      ])
    ),
  });

  return {
    ...source,
    startPlacement: source.startPlacement
      ? repaint(source.startPlacement)
      : source.startPlacement,
    steps: source.steps.map(repaint),
  } as SequenceData;
}

describe("energy prop short codes", () => {
  it("Energy Saber is 3 and Energy Staff is 4", () => {
    expect(encodePropForURL(PropType.ENERGY_SABER)).toBe("3");
    expect(encodePropForURL(PropType.ENERGY_STAFF)).toBe("4");
  });

  it("no other prop claims 3 or 4", () => {
    const claimants = Object.values(PropType).filter(
      (prop) => encodePropForURL(prop) === "3" || encodePropForURL(prop) === "4"
    );
    expect(claimants.sort()).toEqual(
      [PropType.ENERGY_SABER, PropType.ENERGY_STAFF].sort()
    );
  });

  it("every prop code is still unique after adding two", () => {
    const codes = Object.values(PropType).map(encodePropForURL);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("decodes 3 and 4 back to the right props", () => {
    expect(parsePropTypeFromURLValue("3")).toBe(PropType.ENERGY_SABER);
    expect(parsePropTypeFromURLValue("4")).toBe(PropType.ENERGY_STAFF);
  });

  it("also accepts the full enum value, which is what saved settings hold", () => {
    expect(parsePropTypeFromURLValue("energy_saber")).toBe(
      PropType.ENERGY_SABER
    );
    expect(parsePropTypeFromURLValue("energy_staff")).toBe(
      PropType.ENERGY_STAFF
    );
  });

  it("the retired fractalgeng alias still resolves to buugeng", () => {
    // Old links in circulation encode R. Adding props must not disturb it.
    expect(parsePropTypeFromURLValue("R")).toBe(PropType.BUUGENG);
  });

  it("the retired sickles alias still resolves to sword", () => {
    // Y reached printed cards before sickles was removed 2026-09-06. Those
    // scans must land on its base prop instead of a missing one.
    expect(parsePropTypeFromURLValue("Y")).toBe(PropType.SWORD);
  });
});

describe("current codec round trip", () => {
  it.each(ENERGY_PROPS)("%s survives encode -> decode", async (prop) => {
    const source = withProp(
      await decodeSequenceFromQR(PRODUCTION_FLAT_QR),
      prop
    );
    const decoded = decodeSequence(encodeSequence(source));

    expect(decoded.startPlacement?.motions.left?.propType).toBe(prop);
    expect(decoded.startPlacement?.motions.right?.propType).toBe(prop);
    expect(decoded.steps[0]?.motions.left.propType).toBe(prop);
    expect(decoded.steps[0]?.motions.right.propType).toBe(prop);
  });

  it("keeps the two props distinct on a cat-dog pair", async () => {
    // The wire format carries one prop per HAND, read off the start position,
    // and every step inherits it. A cat-dog pair is the only way the two codes
    // ever appear in the same payload, so this is where a swapped or shared
    // code would show up.
    const source = await decodeSequenceFromQR(PRODUCTION_FLAT_QR);
    const start = source.startPlacement!;
    const mixed = {
      ...source,
      startPlacement: {
        ...start,
        motions: {
          ...start.motions,
          left: { ...start.motions.left!, propType: PropType.ENERGY_SABER },
          right: { ...start.motions.right!, propType: PropType.ENERGY_STAFF },
        },
      },
    } as SequenceData;

    const decoded = decodeSequence(encodeSequence(mixed));
    expect(decoded.startPlacement?.motions.left?.propType).toBe(
      PropType.ENERGY_SABER
    );
    expect(decoded.startPlacement?.motions.right?.propType).toBe(
      PropType.ENERGY_STAFF
    );
    expect(decoded.steps[0]?.motions.left.propType).toBe(PropType.ENERGY_SABER);
    expect(decoded.steps[0]?.motions.right.propType).toBe(PropType.ENERGY_STAFF);
  });
});

describe("legacy codec round trip", () => {
  const FORMATS: LegacySequenceFormat[] = [1, 2, 3];

  it.each(
    ENERGY_PROPS.flatMap((prop) => FORMATS.map((format) => ({ prop, format })))
  )("$prop survives the v$format wire form", async ({ prop, format }) => {
    const source = withProp(
      await decodeSequenceFromQR(PRODUCTION_FLAT_QR),
      prop
    );
    const encoded = encodeLegacySequence(source, format);

    expect(detectLegacySequenceFormat(encoded)).toBe(format);

    const decoded = decodeLegacySequence(encoded);
    expect(decoded.startPlacement?.motions.left?.propType).toBe(prop);
    expect(decoded.startPlacement?.motions.right?.propType).toBe(prop);
    // Re-encoding is stable, so an old link keeps its exact bytes.
    expect(encodeLegacySequence(decoded, format)).toBe(encoded);
  });

  it("the two codecs agree on the codes, so a sequence keeps its prop across formats", async () => {
    for (const prop of ENERGY_PROPS) {
      const source = withProp(
        await decodeSequenceFromQR(PRODUCTION_FLAT_QR),
        prop
      );
      const viaLegacy = decodeLegacySequence(encodeLegacySequence(source, 3));
      const viaCurrent = decodeSequence(encodeSequence(source));
      expect(viaLegacy.startPlacement?.motions.left?.propType).toBe(
        viaCurrent.startPlacement?.motions.left?.propType
      );
      expect(viaLegacy.startPlacement?.motions.left?.propType).toBe(prop);
    }
  });
});
