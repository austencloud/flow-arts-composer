/**
 * Pure decision logic for verify-scan-health.ts, split out so the parts that
 * can silently drift — which deck codes get picked, whether a redirect
 * target actually matches — have real unit tests instead of only being
 * exercised by a live run against production. No network, no Firestore SDK,
 * no `$lib` imports: everything here takes already-fetched data in and
 * returns a decision out.
 */

/** Minimal shape of one row from a Firestore `:runQuery` REST response. */
export interface RunQueryRow {
  document?: {
    name: string;
    fields?: {
      deckName?: { stringValue?: string };
      [key: string]: unknown;
    };
  };
}

export interface DeckCode {
  code: string;
  deckName: string;
}

export interface SourcedDeckCode extends DeckCode {
  source: "printed" | "live";
}

/**
 * From a batch of shortcode docs (assumed ordered most-recent-first by the
 * caller's query), keep the first — i.e. most recently minted — code seen
 * for each distinct `deckName`, dropping codes with no deck attribution
 * (ad-hoc shares, not printed-deck cards). Capped at `maxDecks` distinct
 * decks so a broad result set can't balloon the number of codes checked.
 */
export function pickOneCodePerDeck(
  rows: readonly RunQueryRow[],
  maxDecks: number
): DeckCode[] {
  const byDeck = new Map<string, string>();

  for (const row of rows) {
    const doc = row.document;
    if (!doc) continue;
    const deckName = doc.fields?.deckName?.stringValue;
    if (!deckName || byDeck.has(deckName)) continue;

    const code = doc.name.split("/").pop();
    if (!code) continue;

    byDeck.set(deckName, code);
    if (byDeck.size >= maxDecks) break;
  }

  return [...byDeck].map(([deckName, code]) => ({ code, deckName }));
}

/**
 * Combine the fixed, always-checked `printed` deck-code list with an
 * optional live-discovered supplement: every `printed` entry is always
 * included (that's the whole point — a real printed deck must be checked
 * every run, not just when live discovery happens to surface it), and
 * `live` entries only add coverage for a deck the printed list doesn't
 * already name — either a different code (deduped by `code`) or, more
 * usefully, a deck that isn't in the printed list yet at all (deduped by
 * `deckName`, so live discovery's value is catching a newly released deck,
 * not redundantly re-checking one already covered). Capped at `maxCodes`
 * total; callers must keep `maxCodes >= printed.length` or printed entries
 * — the ones that must never be skipped — would be the ones trimmed.
 */
export function mergeCodesToCheck(
  printed: readonly DeckCode[],
  live: readonly DeckCode[],
  maxCodes: number
): SourcedDeckCode[] {
  const printedCodes = new Set(printed.map((entry) => entry.code));
  const printedDecks = new Set(printed.map((entry) => entry.deckName));
  const merged: SourcedDeckCode[] = [
    ...printed.map((entry) => ({ ...entry, source: "printed" as const })),
    ...live
      .filter(
        (entry) =>
          !printedCodes.has(entry.code) && !printedDecks.has(entry.deckName)
      )
      .map((entry) => ({ ...entry, source: "live" as const })),
  ];
  return merged.slice(0, maxCodes);
}

export interface RedirectCheckInput {
  /** The `https://tka.run/{code}?...` URL the check requested. */
  requestUrl: string;
  /** HTTP status the worker responded with. */
  status: number;
  /** Raw `Location` response header, or null if absent. */
  location: string | null;
  /** Origin the redirect must land on, e.g. "https://tkaflowarts.com". */
  expectedOrigin: string;
  /** Path the redirect must land on, e.g. "/q/ABCD". */
  expectedPath: string;
  /** Marker query param name this check appended to `requestUrl`. */
  markerParam: string;
  /** Value the marker param must survive the redirect with. */
  markerValue: string;
}

export type RedirectCheckResult = { ok: true } | { ok: false; detail: string };

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Validate a tka.run response against the contract shortcode-redirect.js
 * promises: a redirect (never a 200/404) straight to
 * `{expectedOrigin}{expectedPath}`, with any query string — including our
 * own marker param — carried over untouched. Pure: takes the already-fetched
 * status/Location pair, decides pass/fail, never performs I/O itself.
 */
export function validateRedirectTarget(
  input: RedirectCheckInput
): RedirectCheckResult {
  const {
    requestUrl,
    status,
    location,
    expectedOrigin,
    expectedPath,
    markerParam,
    markerValue,
  } = input;

  if (!REDIRECT_STATUSES.has(status)) {
    return { ok: false, detail: `expected a redirect, got status ${status}` };
  }
  if (!location) {
    return { ok: false, detail: "redirect had no Location header" };
  }

  let target: URL;
  try {
    target = new URL(location, requestUrl);
  } catch {
    return {
      ok: false,
      detail: `Location header is not a valid URL: ${location}`,
    };
  }

  if (target.origin !== expectedOrigin || target.pathname !== expectedPath) {
    return {
      ok: false,
      detail: `expected ${expectedOrigin}${expectedPath}, got ${target.origin}${target.pathname}`,
    };
  }

  if (target.searchParams.get(markerParam) !== markerValue) {
    return {
      ok: false,
      detail: `query string was not preserved across the redirect (expected ${markerParam}=${markerValue})`,
    };
  }

  return { ok: true };
}
