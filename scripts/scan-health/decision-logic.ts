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
  source: "live" | "fallback";
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
 * Combine a live-discovered deck-code list with the static fallback list:
 * live entries win on a code collision, the result is capped at `maxCodes`
 * total, and fallback entries only fill in once live entries are exhausted.
 * Used whether live discovery found nothing (network/query failure — `live`
 * is `[]`) or found fewer decks than the fallback list covers.
 */
export function mergeCodesToCheck(
  live: readonly DeckCode[],
  fallback: readonly DeckCode[],
  maxCodes: number
): SourcedDeckCode[] {
  const seen = new Set(live.map((entry) => entry.code));
  const merged: SourcedDeckCode[] = [
    ...live.map((entry) => ({ ...entry, source: "live" as const })),
    ...fallback
      .filter((entry) => !seen.has(entry.code))
      .map((entry) => ({ ...entry, source: "fallback" as const })),
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
