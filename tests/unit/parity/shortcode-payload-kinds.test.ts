import { describe, expect, it } from "vitest";
import { getHandPathReferenceCards } from "#lib/features/choreo-card/domain/hand-path-reference-cards.js";
import { buildHandPathShortCodePayload } from "#lib/shared/qr/services/hand-path-short-code-payload.js";
import {
  isWordPayloadKind,
  validateHandPathRecord,
} from "../../../scripts/migrations/lib/shortcode-payload-kinds";

describe("shortcode audit payload kinds", () => {
  it.each(getHandPathReferenceCards())(
    "accepts the minted $cardTitle hand-path card as current",
    async ({ sequence }) => {
      const record = await buildHandPathShortCodePayload(sequence);
      expect(isWordPayloadKind(record.payloadKind)).toBe(false);
      expect(await validateHandPathRecord("TEST01", { ...record })).toBeNull();
    }
  );

  it("rejects a hand-path card that the word label repair has stamped", async () => {
    // What backfill-shortcode-words.ts --apply would have written onto the
    // 2026-09-05 reference cards had they stayed in the word path.
    const record = await buildHandPathShortCodePayload(
      getHandPathReferenceCards()[0]!.sequence
    );
    expect(
      await validateHandPathRecord("TEST01", {
        ...record,
        payloadSchemaVersion: 2,
      })
    ).toMatch(/payloadSchemaVersion must be 4/);
    expect(
      await validateHandPathRecord("TEST01", {
        ...record,
        payloadWord: "GGGG",
        sequence: "GGGG",
        sequenceName: "GGGG",
      })
    ).toMatch(/carries a TKA word label/);
  });

  it("rejects a hand-path card whose payload no longer plays its beat count", async () => {
    const record = await buildHandPathShortCodePayload(
      getHandPathReferenceCards()[0]!.sequence
    );
    expect(
      await validateHandPathRecord("TEST01", { ...record, payloadStepCount: 8 })
    ).toMatch(/does not hydrate/);
  });
});
