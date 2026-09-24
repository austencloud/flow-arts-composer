#!/usr/bin/env node
/**
 * verify-scan-health.ts
 *
 * "Does a printed choreo card still scan?" — nothing in CI or production
 * answered that before this script. The chain a physical card depends on is
 * tka.run/{code} (Cloudflare Worker) -> 302 -> tkaflowarts.com/q/{code} ->
 * Firestore shortcode lookup -> sequence hydration. Every link is watched by
 * a service (Cloudflare, Firestore, Pages) but nothing watches the CHAIN, and
 * server-side failures only ever reached `console.error`. Real precedent:
 * July 2026 saw 7 failed scans out of 35 real attempts (5 not_found, 2
 * load_error) with zero trace anywhere. This is meant to run on a schedule
 * (see .github/workflows/scan-health-check.yml) so the next one shows up as
 * a red run and an email instead of a quiet support ticket.
 *
 * SAFETY: this never fetches `https://tkaflowarts.com/q/...` — that route
 * logs a scan and feeds the app's own scan analytics, and a health check
 * counting as a "scan" would be its own kind of drift. Resolution is checked
 * the same way `/q/[code]/+page.server.ts` does (same `fetchPublicShortCode
 * Record` + `prepareScanViewerPayload` functions, imported directly — not
 * reimplemented), which is a pure Firestore REST read plus in-memory
 * hydration; it performs no writes and increments no counter. Only the
 * tka.run redirect hop is fetched over HTTP, with `redirect: "manual"` so the
 * target `/q/...` URL is never actually requested.
 *
 * Firestore cost: one bounded `runQuery` (limit, see MAX_LIVE_DOCS below)
 * plus one `getDocument` per code checked — PRINTED_CODES always checks 3
 * fixed codes, plus up to MAX_CODES_PER_RUN - 3 more from live discovery —
 * a handful of document reads per run, run a few times a day. See
 * .claude/rules/firestore-cost-discipline.md.
 *
 * Usage:
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/verify-scan-health.ts
 *   npm run scan:health   (same thing, wired in package.json)
 *
 * `$lib` imports below only resolve under the `scripts/tsconfig.json` paths
 * config (same trick scripts/build-mandala-index.ts uses) — plain `node` or
 * `tsx` without --tsconfig will fail to resolve them.
 */

import { fetchPublicShortCodeRecord } from "$lib/shared/qr/services/public-short-code-record-reader";
import { prepareScanViewerPayload } from "$lib/server/scan/scan-viewer-payload-preparer";
import {
  mergeCodesToCheck,
  pickOneCodePerDeck,
  validateRedirectTarget,
  type DeckCode,
  type RunQueryRow,
} from "./scan-health/decision-logic";

const PROJECT_ID = "the-kinetic-alphabet";
const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const TKA_RUN_ORIGIN = "https://tka.run";
const APP_ORIGIN = "https://tkaflowarts.com";
const FETCH_TIMEOUT_MS = 15_000;
const HUMAN_UA =
  "Mozilla/5.0 (compatible; TKAScanHealthCheck/1.0; +https://tkaflowarts.com)";

// Appended to the tka.run request so the redirect's query-string
// preservation (shortcode-redirect.js forwarding url.searchParams) is
// actually exercised by this check, not just assumed from reading the code.
const MARKER_PARAM = "healthcheck";
const MARKER_VALUE = "1";

// Bounded live discovery — see firestore-cost-discipline.md. This only ever
// supplements PRINTED_CODES below with a deck it doesn't already cover (see
// mergeCodesToCheck's doc comment); it is not load-bearing for the core
// guarantee this script makes.
const MAX_LIVE_DOCS = 25;
const MAX_DECKS_LIVE = 5;
// PRINTED_CODES.length (currently 3) must always fit inside this cap, with
// headroom left for live discovery's extra decks — see mergeCodesToCheck.
const MAX_CODES_PER_RUN = 8;

/**
 * One real, verified code per printed deck — always checked, every run.
 * This is the actual guarantee this script makes; live discovery above is a
 * bonus, not a substitute: every deck with physical cards in circulation
 * gets checked, every time, regardless of what live discovery happens to
 * find in a given run.
 *
 * Sourced from a one-time, read-only local audit of every place a printed
 * code can come from — the `physicalCards` collection (cards actually
 * issued through `/api/physical-cards/issue`), each `deckReleases/*`
 * manifest's `cards`/`sequences` arrays, and the hand-path reference card
 * manifest (`src/lib/features/choreo-card/domain/hand-path-reference-card-manifest.ts`)
 * — which found 79 distinct printed codes across exactly 3 decks as of
 * 2026-09-23: a 6-code hand-path reference set (deck-10 manifest), 19 codes
 * issued for deck release #4, and 54 codes issued for a later-generated
 * deck (physicalCards' `deckId: "generated:11"`). One representative code
 * was kept per deck. No other `deckReleases` manifest contributed a code,
 * meaning no other deck has evidence of an actually printed/issued physical
 * card yet — extend this list as new decks are printed, using the same
 * audit method (grep `deckReleases`/`physicalCards`/the hand-path manifest
 * for codes), never by guessing.
 *
 * Each entry below was then independently confirmed live via the public
 * `shortcodes/{code}` REST read (the same one this script uses) before
 * being added. `deckName` here is each code's own `shortcodes` doc
 * `deckName` field (public data), which is why it can read slightly
 * differently than the audit's `physicalCards.deckName` for the same deck
 * (e.g. "LOOP Deck #10" vs. physicalCards' "Deck #011") — both name the
 * same deck; the discrepancy is pre-existing data, not a bug here.
 *
 * Verified 2026-09-23 against production (GET .../shortcodes/{code}):
 *   DACF4E -> "Timing & Direction Hand Paths" (deck 10 hand-path reference)
 *   ELYW   -> "LOOP Deck #4"  (19 physicalCards-issued codes, release #4)
 *   MGO6   -> "LOOP Deck #10" (54 physicalCards-issued codes, generated:11)
 */
const PRINTED_CODES: DeckCode[] = [
  { code: "DACF4E", deckName: "Timing & Direction Hand Paths" },
  { code: "ELYW", deckName: "LOOP Deck #4" },
  { code: "MGO6", deckName: "LOOP Deck #10" },
];

interface Finding {
  code: string;
  step: string;
  detail: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), ...init });
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

async function discoverDeckCodesLive(): Promise<DeckCode[]> {
  const body = {
    structuredQuery: {
      from: [{ collectionId: "shortcodes" }],
      select: {
        fields: [{ fieldPath: "deckName" }, { fieldPath: "createdAt" }],
      },
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit: MAX_LIVE_DOCS,
    },
  };

  const res = await fetchWithTimeout(
    `${FIRESTORE_HOST}/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`runQuery returned ${res.status} ${res.statusText}`);
  }

  const rows = (await res.json()) as RunQueryRow[];
  return pickOneCodePerDeck(rows, MAX_DECKS_LIVE);
}

async function discoverCodesToCheck() {
  let live: DeckCode[] = [];
  try {
    live = await discoverDeckCodesLive();
  } catch (error) {
    // Non-fatal: PRINTED_CODES alone still gives full deck coverage. Live
    // discovery only adds decks not already in PRINTED_CODES, so losing it
    // for a run just means a newly released deck isn't checked until the
    // fixed list is updated or the next run's live discovery succeeds.
    console.error(
      `[scan-health] live shortcode discovery failed (non-fatal — PRINTED_CODES still covers every known printed deck): ${
        error instanceof Error ? error.message : error
      }`
    );
  }
  return mergeCodesToCheck(PRINTED_CODES, live, MAX_CODES_PER_RUN);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function checkRedirect(code: string): Promise<Finding | null> {
  const requestUrl = `${TKA_RUN_ORIGIN}/${encodeURIComponent(code)}?${MARKER_PARAM}=${MARKER_VALUE}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(requestUrl, {
      redirect: "manual",
      headers: { "user-agent": HUMAN_UA },
    });
  } catch (error) {
    return {
      code,
      step: "tka.run redirect",
      detail: `request failed: ${error instanceof Error ? error.message : error}`,
    };
  }

  const result = validateRedirectTarget({
    requestUrl,
    status: res.status,
    location: res.headers.get("location"),
    expectedOrigin: APP_ORIGIN,
    expectedPath: `/q/${code}`,
    markerParam: MARKER_PARAM,
    markerValue: MARKER_VALUE,
  });

  return result.ok
    ? null
    : { code, step: "tka.run redirect", detail: result.detail };
}

async function checkResolution(code: string): Promise<Finding | null> {
  let record: Awaited<ReturnType<typeof fetchPublicShortCodeRecord>>;
  try {
    record = await fetchPublicShortCodeRecord(code, {
      projectId: PROJECT_ID,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      code,
      step: "shortcode resolve",
      detail: `Firestore read failed: ${error instanceof Error ? error.message : error}`,
    };
  }
  if (!record) {
    return {
      code,
      step: "shortcode resolve",
      detail: "no public shortcode record found (not_found)",
    };
  }

  let prepared: Awaited<ReturnType<typeof prepareScanViewerPayload>>;
  try {
    prepared = await prepareScanViewerPayload(code, record, undefined);
  } catch (error) {
    return {
      code,
      step: "sequence hydrate",
      detail: `hydration threw (load_error): ${error instanceof Error ? error.message : error}`,
    };
  }

  const stepCount = prepared?.sequence?.steps?.length ?? 0;
  if (stepCount === 0) {
    return {
      code,
      step: "sequence hydrate",
      detail: "decoded sequence has 0 steps (load_error)",
    };
  }
  return null;
}

async function checkVersionJson(): Promise<Finding | null> {
  const url = `${APP_ORIGIN}/_app/version.json`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok)
      return {
        code: "-",
        step: "version.json",
        detail: `${url} returned status ${res.status}`,
      };
  } catch (error) {
    return {
      code: "-",
      step: "version.json",
      detail: `${url} request failed: ${error instanceof Error ? error.message : error}`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    "verify-scan-health — tka.run -> /q -> sequence chain, plus /_app/version.json\n"
  );

  const codes = await discoverCodesToCheck();
  const findings: Finding[] = [];

  if (codes.length === 0) {
    // Should be unreachable — PRINTED_CODES is always non-empty and always
    // included by mergeCodesToCheck — but guarded defensively in case that
    // invariant is ever broken (e.g. PRINTED_CODES emptied by mistake).
    console.log(
      "FAILING: no short codes available to check — PRINTED_CODES is empty."
    );
    console.log("SCAN HEALTH: BROKEN (0 codes checked)");
    process.exit(1);
  }

  for (const { code, deckName, source } of codes) {
    console.log(`checking ${code} (${deckName}, ${source})`);

    const redirectFinding = await checkRedirect(code);
    if (redirectFinding) {
      findings.push(redirectFinding);
      console.log(`  FAIL tka.run redirect: ${redirectFinding.detail}`);
    } else {
      console.log(
        `  ok   tka.run/${code} -> ${APP_ORIGIN}/q/${code} (302, query preserved)`
      );
    }

    const resolveFinding = await checkResolution(code);
    if (resolveFinding) {
      findings.push(resolveFinding);
      console.log(`  FAIL resolve/hydrate: ${resolveFinding.detail}`);
    } else {
      console.log(`  ok   resolves + hydrates to a real sequence`);
    }
  }

  const versionFinding = await checkVersionJson();
  if (versionFinding) {
    findings.push(versionFinding);
    console.log(`FAIL ${versionFinding.step}: ${versionFinding.detail}`);
  } else {
    console.log(`ok   ${APP_ORIGIN}/_app/version.json responds`);
  }

  console.log("");
  if (findings.length > 0) {
    console.log("Failing checks:");
    for (const f of findings)
      console.log(`  - [${f.code}] ${f.step}: ${f.detail}`);
    console.log("");
    console.log(
      `SCAN HEALTH: BROKEN (${findings.length} failed check(s) across ${codes.length} code(s))`
    );
    process.exit(1);
  }
  console.log(
    `SCAN HEALTH: OK (${codes.length} code(s) checked, version.json OK)`
  );
}

main().catch((error) => {
  console.error("verify-scan-health crashed:", error);
  process.exit(1);
});
