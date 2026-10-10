/**
 * The hero's short code, read-only.
 *
 * The phone in the hero loads the REAL `/q/<code>` for the card on screen, so
 * it needs that card's code. Two hard constraints shape how it gets one:
 *
 * 1. **Never mint.** `createShortCode` allocates and WRITES, and the scheme's
 *    whole integrity is one-code-per-hash. A public marketing page must not be
 *    a writer — a visitor loading /shop must never create Firestore documents.
 *    `findExistingCodeForSequence` is a pure read (added for exactly this):
 *    hash the sequence, query `shortcodes` by `encoderHash`, take the canonical
 *    winner, return. No allocation, and no hash-index heal either, which is why
 *    it is not the older `findExistingCodeByHash`.
 * 2. **Never block the page.** No code (unbaked card, cold catalog, offline,
 *    rules refusal) simply means no phone content. The hero renders its cards
 *    and its button stays inert rather than promising a page that isn't there.
 *
 * 3. **Never demo a page the card does not lead to.** The lookup and the baked
 *    cover are two independent sources for one card's code, and they have
 *    disagreed in production. The resolved code is checked against the code
 *    printed on the very cover being shown, and a card whose two sources
 *    disagree gets no phone at all — a wrong demo is worse than no demo.
 *
 * The manager needs a browse loader before it can be constructed, and /shop is
 * a public route that skips the app's composition root — so this configures the
 * same read-only stub `/q` uses, and only if nothing else has configured it
 * first. Codes are memoized per sequence CONTENT (never per id — see `keyFor`)
 * for the page session: dealing back to a card already seen costs nothing.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { encodeSequence } from "#lib/shared/navigation/services/sequence-encoder.js";
import type { ShortCodeSequenceLoader } from "#lib/shared/qr/services/short-code-manager.js";
import {
  configureShortCodeManager,
  getShortCodeManager,
} from "#lib/shared/qr/get-short-code-manager.js";

/** Code generation never reads the public gallery; resolution only needs the
 * one sequence-body read ShortCodeManager declares. */
const stubBrowseLoader = {
  loadFullSequenceData: async () => null,
} satisfies ShortCodeSequenceLoader;

const cache = new Map<string, Promise<string | null>>();

/**
 * THE MEMO KEY IS THE CONTENT, NEVER THE ID.
 *
 * It used to be `sequence.id ?? sequence.word`, and the catalog does not honour
 * either as unique: the three TnD trilogy decks carry the SAME cover sequence
 * ids (`tnd-split-same-aaaa`, `tnd-tog-same-gggg`, …) for sequences that differ
 * only in turns — 0, 1, and 0.5. One memo entry served all three, so whichever
 * A card the hero dealt FIRST decided the code every later A card showed.
 * Austen (2026-08-04): "the one that's in the card has zero turns, however the
 * one that is loaded [has] 0.5 turns."
 *
 * The encoder string is what the short code is content-addressed BY (the
 * `encoderHash` is its SHA-256), so keying on it makes the memo exactly as
 * discriminating as the lookup it caches — two cards share an entry if and only
 * if they would resolve to the same code anyway.
 */
function keyFor(sequence: SequenceData): string {
  try {
    return encodeSequence(sequence);
  } catch {
    // Unencodable sequences have no code to find either; the id keeps the memo
    // from collapsing every one of them onto a single entry.
    return `!${sequence.id ?? sequence.word ?? ""}`;
  }
}

const TKA_RUN_CODE = /tka\.run\/([a-z0-9]+)/i;
const printedCodes = new Map<string, Promise<string | null>>();

/**
 * The code actually PRINTED on a baked cover, read off its own QR.
 *
 * The baked render is the artifact on screen, and its QR is the only ground
 * truth for what scanning the thing the visitor is looking at would open.
 * Reuses the app's own detector (`createTkaQrDetector`, self-hosted ZXing) —
 * dynamically, so /shop only pays for the wasm when a hero card is verified.
 */
function printedCodeOn(coverUrl: string): Promise<string | null> {
  const hit = printedCodes.get(coverUrl);
  if (hit) return hit;

  const work = (async () => {
    try {
      const { createTkaQrDetector } = await import(
        "#lib/shared/qr/services/tka-qr-detector.js"
      );
      // The image is already in the browser cache — the hero is displaying it.
      const blob = await (await fetch(coverUrl)).blob();
      const found = await createTkaQrDetector().detect(blob);
      for (const d of found) {
        const code = TKA_RUN_CODE.exec(d.rawValue)?.[1];
        if (code) return code.toUpperCase();
      }
      return null;
    } catch {
      return null;
    }
  })();

  printedCodes.set(coverUrl, work);
  return work;
}

/**
 * The card's existing short code, or null. Never writes, never throws.
 *
 * VERIFIED AGAINST THE ART. The lookup answers "what code does this catalog
 * sequence have"; the cover answers "what code is printed on the card you are
 * looking at". They are two different sources and they have disagreed: 11 of
 * the 60 baked covers in Storage are byte-identical copies of ANOTHER product's
 * card, left behind by a render-cache key that predated `4b1bd29c89` (it named
 * neither deck, so two decks sharing a cover sequence id handed each other the
 * other's artwork and the other's QR). All six TKA 3 covers are TKA 2's cards —
 * one turn instead of a half.
 *
 * A phone that opens a page the card on screen does not lead to is a lie about
 * the product, so when the two disagree this returns null and the hero simply
 * holds the cards: no phone, no scan affordance. An unbaked card prints no code
 * at all, so there is nothing to contradict and the lookup stands on its own.
 */
export function resolveHeroScanCode(
  sequence: SequenceData,
  coverUrl: string | null
): Promise<string | null> {
  // The encoder string contains "|", so the separator is a newline: nothing
  // that can appear in either half, and no chance of two different pairs
  // flattening onto one key.
  const key = [keyFor(sequence), coverUrl ?? ""].join("\n");
  const hit = cache.get(key);
  if (hit) return hit;

  const work = (async () => {
    try {
      try {
        getShortCodeManager();
      } catch {
        configureShortCodeManager(stubBrowseLoader);
      }
      const code =
        await getShortCodeManager().findExistingCodeForSequence(sequence);
      if (!code || !coverUrl) return code;

      const printed = await printedCodeOn(coverUrl);
      if (printed && printed !== code.toUpperCase()) {
        console.debug(
          "[hero-scan-code] cover art and catalog sequence disagree; hiding the scan",
          { printed, resolved: code, coverUrl }
        );
        return null;
      }
      return code;
    } catch {
      // A hero without a code shows a hero without a phone screen. That is a
      // quieter failure than anything this page could say about it.
      return null;
    }
  })();

  cache.set(key, work);
  return work;
}
