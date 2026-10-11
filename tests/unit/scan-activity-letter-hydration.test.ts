// @vitest-environment jsdom
/**
 * Scan Atlas renders decoded shortcodes with letters.
 *
 * A decoded QR payload is letterless by construction — `decodeSequence`
 * stamps `letter: null` on every step because the wire format carries motions,
 * not letters. A letterless pictograph misses BOTH arrow-adjustment tiers:
 * special placement needs a letter to build its key, and the default-placement
 * key degrades to a bare motion type ("pro") because detectLayerInfo cannot
 * classify alpha/beta/gamma without one. No default_*_placements.json defines
 * a bare motion-type key, so the lookup returns (0,0) and every arrow renders
 * on its raw hand point.
 *
 * Scan Atlas's card peek was the one decoded-shortcode surface that skipped
 * the canonical hydrator (/q, /sequence/[id], the viewer drawer and the
 * scan-cell warmer all run it), which is why the bug showed there and nowhere
 * else.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { decodeSequenceFromQR } from "#lib/shared/navigation/services/sequence-encoder.js";
import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
import { generatePlacementKey } from "#lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

// The live payload on shortcode O263 ("IIII") — the card in the bug report.
const O263_ENCODED =
  "s~r1:sr:e9a854fc:q1:HYPQN1Z0M/2Q 5Q:66FLG868WFFLH6K3BGJB000";

function proPlacementKeys(): string[] {
  const file = resolve(
    process.cwd(),
    "static/data/arrow_placement/default/default_pro_placements.json"
  );
  return Object.keys(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * The letter deriver reads the pictograph dataframes through CsvLoader, which
 * fetches them from `static/` in the browser. Serve those same files off disk
 * so this runs without a dev server.
 */
function serveStaticCsvOverFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = resolve(process.cwd(), "static", url.replace(/^\//, ""));
    const body = readFileSync(path, "utf8");
    return {
      ok: true,
      status: 200,
      text: async () => body,
    } as Response;
  }) as typeof fetch;
}

describe("scan activity decoded-shortcode hydration", () => {
  beforeAll(() => {
    serveStaticCsvOverFetch();
  });

  it("decodes letterless steps straight off the wire", async () => {
    const decoded = await decodeSequenceFromQR(O263_ENCODED);

    expect(decoded.steps.length).toBeGreaterThan(0);
    expect(decoded.steps.every((step) => step.letter === null)).toBe(true);
  });

  it("restores letters through the canonical hydrator", async () => {
    const decoded = await decodeSequenceFromQR(O263_ENCODED);
    const hydrated = await hydrateSequence(decoded, { loopDetector: null });

    expect(hydrated.steps.every((step) => Boolean(step.letter))).toBe(true);
    expect(hydrated.word).toBe("IIII");
  });

  it("only resolves a real default-placement key once the letter is present", async () => {
    const decoded = await decodeSequenceFromQR(O263_ENCODED);
    const hydrated = await hydrateSequence(decoded, { loopDetector: null });

    const availableKeys = proPlacementKeys();
    const step = hydrated.steps.find(
      (candidate) => candidate.motions?.left?.motionType === "pro"
    );
    expect(step).toBeDefined();
    const left = step!.motions.left!;

    const lettered = {
      letter: step!.letter,
      motions: step!.motions,
    } as unknown as PictographData;
    const letterless = {
      letter: null,
      motions: step!.motions,
    } as unknown as PictographData;

    // Letterless: falls all the way back to the bare motion type, which the
    // placement file does not define — that miss is the (0,0) adjustment.
    const missKey = generatePlacementKey(left, letterless, availableKeys);
    expect(missKey).toBe("pro");
    expect(availableKeys).not.toContain(missKey);

    // Lettered: resolves to a key the file actually holds.
    const hitKey = generatePlacementKey(left, lettered, availableKeys);
    expect(availableKeys).toContain(hitKey);
  });
});
