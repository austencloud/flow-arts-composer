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
 * plus one `getDocument` per code checked (capped at MAX_CODES_PER_RUN) — a
 * handful of document reads per run, run a few times a day. See
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

// Bounded live discovery — see firestore-cost-discipline.md. Recently
// print-minted codes carry `deckName`; older decks whose codes were minted
// long ago fall outside this recent window and rely on FALLBACK_CODES below.
const MAX_LIVE_DOCS = 25;
const MAX_DECKS_LIVE = 5;
const MAX_CODES_PER_RUN = 6;

/**
 * Known-good printed-deck short codes, used when live discovery (below)
 * can't find a deck-tagged code for a given run — either the read failed, or
 * the recent-N window it scans didn't happen to contain that deck's codes.
 * Each entry here was confirmed live via the public `shortcodes/{code}` REST
 * read (the same one this script uses) before being added — never guessed.
 * Add more as other decks' codes are verified the same way; a stale entry
 * here is safe (short codes are permanent, per firestore.rules) but a wrong
 * one would produce a false alarm, so verify before adding.
 *
 * Verified 2026-09-23 against production:
 *   ZRRQ -> LOOP Deck #11, "ΦKΦKΦKΦK", 8 steps, system-minted at print time.
 */
const FALLBACK_CODES: DeckCode[] = [
  { code: "ZRRQ", deckName: "LOOP Deck #11" },
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
    console.error(
      `[scan-health] live shortcode discovery failed, falling back to the known-code list: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
  return mergeCodesToCheck(live, FALLBACK_CODES, MAX_CODES_PER_RUN);
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
    console.log(
      "FAILING: no short codes available to check — live discovery found none and FALLBACK_CODES is empty."
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
