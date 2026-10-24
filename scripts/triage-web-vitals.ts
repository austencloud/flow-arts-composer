/**
 * Real-user web vitals triage. Reads `$web_vitals` events from PostHog and
 * ranks route patterns by p75 LCP (mobile first), then INP, then CLS.
 *
 *   npx tsx scripts/triage-web-vitals.ts
 *   npx tsx scripts/triage-web-vitals.ts --days 14 --min 5
 *   npx tsx scripts/triage-web-vitals.ts --json
 *
 * Read-only. Talks to PostHog directly with POSTHOG_PERSONAL_API_KEY, like
 * triage-sessions.ts. Likely crawler sessions are dropped with the same rule
 * (`isLikelyCrawlerSession`); pass --include-crawlers to keep them.
 */
import { isLikelyCrawlerSession } from "../src/lib/server/analytics/session-triage-queries.js";
import {
  aggregateVitals,
  buildVitalsSessionsQuery,
  buildWebVitalsQuery,
  parseVitalsEventRow,
  rankRouteVitals,
  type Percentiles,
} from "../src/lib/server/analytics/web-vitals-triage.js";
import { runHogQl as hogql } from "./lib/posthog-hogql.js";

// Node built-in .env loader — this repo has no dotenv dependency.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on ambient environment. requireEnv reports what is missing.
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** ISO -> the format ClickHouse's toDateTime() accepts. */
function toClickhouse(iso: string): string {
  return iso
    .replace("T", " ")
    .replace(/\.\d+Z?$/, "")
    .replace("Z", "");
}

/** Session ids whose session looks like a crawler. Chunked to keep queries short. */
async function crawlerSessions(
  since: string,
  sessionIds: string[]
): Promise<Set<string>> {
  const crawlers = new Set<string>();
  for (let i = 0; i < sessionIds.length; i += 200) {
    const chunk = sessionIds.slice(i, i + 200);
    for (const row of await hogql(buildVitalsSessionsQuery(since, chunk))) {
      const session = {
        pageviewCount: Number(row[1] ?? 0),
        identified: Number(row[2] ?? 0) === 1,
        locale: String(row[3] ?? ""),
        referringDomain: String(row[4] ?? ""),
      };
      if (isLikelyCrawlerSession(session)) crawlers.add(String(row[0]));
    }
  }
  return crawlers;
}

function fmt(m: Percentiles, unit: "ms" | "cls"): string {
  if (m.n === 0) return "-".padStart(22);
  const v = (x: number | null) =>
    x === null ? "-" : unit === "cls" ? x.toFixed(3) : String(Math.round(x));
  return `${v(m.p50)}/${v(m.p75)}/${v(m.p95)} (${m.n})`.padStart(22);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: tsx scripts/triage-web-vitals.ts [--days N] [--min N] [--json] [--include-crawlers]"
    );
    process.exit(0);
  }

  const days = Number(arg("--days") ?? 30);
  const minSamples = Number(arg("--min") ?? 10);
  const asJson = process.argv.includes("--json");
  const since = toClickhouse(
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  );

  const rows = (await hogql(buildWebVitalsQuery(since))).map(
    parseVitalsEventRow
  );
  let kept = rows;
  let crawlerEvents = 0;
  if (!process.argv.includes("--include-crawlers")) {
    const crawlers = await crawlerSessions(since, [
      ...new Set(rows.map((r) => r.sessionId).filter(Boolean)),
    ]);
    kept = rows.filter((r) => !crawlers.has(r.sessionId));
    crawlerEvents = rows.length - kept.length;
  }

  const ranked = rankRouteVitals(aggregateVitals(kept), minSamples);
  const attributed = kept.some((r) => r.lcpElement || r.inpTarget);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          since,
          events: rows.length,
          crawlerEvents,
          minSamples,
          attributed,
          routes: ranked,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`\nPostHog $web_vitals | since ${since} UTC`);
  console.log(
    `${rows.length} events | ${crawlerEvents} from likely crawlers dropped | groups with >= ${minSamples} samples\n`
  );
  console.log(
    `${"DEVICE".padEnd(8)} ${"ROUTE".padEnd(40)} ${"LCP ms p50/p75/p95 (n)".padStart(22)} ${"INP ms".padStart(22)} ${"CLS".padStart(22)}`
  );
  for (const g of ranked) {
    console.log(
      `${g.deviceType.padEnd(8)} ${g.route.slice(0, 40).padEnd(40)} ${fmt(g.lcp, "ms")} ${fmt(g.inp, "ms")} ${fmt(g.cls, "cls")}`
    );
    if (g.topLcpElement)
      console.log(
        `         LCP element: ${g.topLcpElement.value} (${g.topLcpElement.count})`
      );
    if (g.topInpTarget)
      console.log(
        `         INP target:  ${g.topInpTarget.value} (${g.topInpTarget.count})`
      );
  }
  if (!attributed) {
    console.log(
      "\nNo LCP element or INP target in these events: the client does not set capture_performance.web_vitals_attribution."
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
