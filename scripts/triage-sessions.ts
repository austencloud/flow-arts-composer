/**
 * Session triage CLI. Reads real user sessions from PostHog and ranks them by
 * friction so the /sessions skill can decide which to read in full.
 *
 *   npx tsx scripts/triage-sessions.ts analyze --since 2026-08-01T00:00:00Z
 *   npx tsx scripts/triage-sessions.ts analyze --days 7 --limit 20
 *   npx tsx scripts/triage-sessions.ts stats --days 30
 *   npx tsx scripts/triage-sessions.ts s_9a1c
 *
 * Talks to PostHog directly with POSTHOG_PERSONAL_API_KEY. The admin API route
 * needs a Firebase admin token that a CLI does not have.
 */
import {
  buildTriageSessionsQuery,
  buildTriageSessionEventsQuery,
  buildFirstSeenQuery,
  parseTriageSessionRow,
  parseTriageEventRow,
  isLikelyCrawlerSession,
  type TriageSessionRow,
} from "../src/lib/server/analytics/session-triage-queries.js";
import {
  scoreSession,
  resolveModule,
} from "../src/lib/server/analytics/session-friction-score.js";
import { runHogQl as hogql } from "./lib/posthog-hogql.js";

// Node built-in .env loader — this repo has no dotenv dependency.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on ambient environment. requireEnv reports what is missing.
}

function replayUrl(sessionId: string): string {
  const projectId = process.env.POSTHOG_PROJECT_ID ?? "";
  return `https://us.posthog.com/project/${projectId}/replay/${sessionId}`;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Session rows for analysis, minus likely crawlers unless --include-crawlers. */
async function loadSessions(since: string): Promise<TriageSessionRow[]> {
  const rows = (
    await hogql(buildTriageSessionsQuery(toClickhouse(since), 200))
  ).map(parseTriageSessionRow);
  if (process.argv.includes("--include-crawlers")) return rows;
  const kept = rows.filter((r) => !isLikelyCrawlerSession(r));
  if (kept.length < rows.length) {
    console.error(
      `(excluded ${rows.length - kept.length} likely crawler sessions; --include-crawlers to see them)`
    );
  }
  return kept;
}

function sinceFromArgs(): string {
  const explicit = arg("--since");
  if (explicit) return explicit;
  const days = Number(arg("--days") ?? 7);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO -> the format ClickHouse's toDateTime() accepts. */
function toClickhouse(iso: string): string {
  return iso
    .replace("T", " ")
    .replace(/\.\d+Z?$/, "")
    .replace("Z", "");
}

async function analyze(): Promise<void> {
  const since = sinceFromArgs();
  const limit = Number(arg("--limit") ?? 20);
  const asJson = process.argv.includes("--json");

  const rows = await loadSessions(since);

  if (rows.length === 0) {
    if (asJson) console.log(JSON.stringify({ since, sessions: [] }, null, 2));
    else console.log(`No sessions since ${since}.`);
    return;
  }

  // Which of these users are brand new? Their first-ever event is in-window.
  const uids = [...new Set(rows.map((r) => r.uid))];
  const firstSeen = new Map<string, string>();
  for (const row of await hogql(buildFirstSeenQuery(uids))) {
    firstSeen.set(String(row[0]), String(row[1]));
  }

  const sinceCh = toClickhouse(since);
  const scored = rows
    .map((r: TriageSessionRow) => {
      const first = firstSeen.get(r.uid) ?? "";
      const isNewUser = first !== "" && first >= sinceCh;
      return { row: r, score: scoreSession(r, { isNewUser }) };
    })
    .filter((s) => s.score.total > 0)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          since,
          scanned: rows.length,
          surfaced: scored.length,
          sessions: scored.map(({ row, score }) => ({
            sessionId: row.sessionId,
            uid: row.uid,
            startedAt: row.startedAt,
            durationMs: row.durationMs,
            module: resolveModule(row.topSegments, row.subSegments),
            entryPath: row.entryPath,
            exitPath: row.exitPath,
            device: `${row.browser} / ${row.operatingSystem} / ${row.deviceType}`,
            replayUrl: replayUrl(row.sessionId),
            score: score.total,
            reasons: score.reasons,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`\nPostHog | since ${since}`);
  console.log(
    `${rows.length} sessions scanned | ${scored.length} with friction\n`
  );
  console.log("SCORE  WHEN                 WHO         SESSION      SIGNALS");
  for (const { row, score } of scored) {
    const when = row.startedAt.slice(0, 16);
    const who = row.uid.slice(0, 10).padEnd(10);
    const sig = score.reasons.map((r) => r.detail).join(" | ");
    console.log(
      `${String(score.total).padStart(5)}  ${when}  ${who}  ${row.sessionId.slice(0, 11).padEnd(11)}  ${sig}`
    );
  }
  console.log("");
}

async function stats(): Promise<void> {
  const since = sinceFromArgs();
  const rows = await loadSessions(since);

  const total = rows.length;
  const withException = rows.filter((r) => r.exceptionCount > 0).length;
  const withRage = rows.filter((r) => r.rageClickCount > 0).length;
  const withDead = rows.filter((r) => r.deadClickCount > 0).length;
  const withContent = rows.filter((r) => r.contentActionCount > 0).length;
  const bounced = rows.filter(
    (r) => r.durationMs < 30_000 && r.pageviewCount <= 1
  ).length;
  const users = new Set(rows.map((r) => r.uid)).size;

  const byExitPath = new Map<string, number>();
  for (const r of rows.filter((x) => x.exceptionCount > 0)) {
    byExitPath.set(r.exitPath, (byExitPath.get(r.exitPath) ?? 0) + 1);
  }
  const worst = [...byExitPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  console.log(`\nSince ${since}`);
  console.log(`  sessions              ${total}`);
  console.log(`  distinct users        ${users}`);
  console.log(
    `  with exception        ${withException} (${pct(withException)}%)`
  );
  console.log(`  with rage click       ${withRage} (${pct(withRage)}%)`);
  console.log(`  with dead click       ${withDead} (${pct(withDead)}%)`);
  console.log(`  with content action   ${withContent} (${pct(withContent)}%)`);
  console.log(`  bounced               ${bounced} (${pct(bounced)}%)`);
  if (worst.length) {
    console.log(`\n  routes with most exception sessions:`);
    for (const [path, n] of worst)
      console.log(`    ${String(n).padStart(3)}  ${path}`);
  }
  console.log("");
}

async function showSession(sessionId: string): Promise<void> {
  const events = (
    await hogql(buildTriageSessionEventsQuery(sessionId, 500))
  ).map(parseTriageEventRow);

  const firstEvent = events[0];
  if (!firstEvent) {
    console.error(`No events for session ${sessionId}. Check the id.`);
    process.exit(1);
  }

  const start = new Date(firstEvent.occurredAt).getTime();
  console.log(`\n## ${sessionId}`);
  console.log(`${replayUrl(sessionId)}\n`);
  console.log("```");
  for (const e of events) {
    const offset = Math.max(
      0,
      Math.round((new Date(e.occurredAt).getTime() - start) / 1000)
    );
    const mm = String(Math.floor(offset / 60)).padStart(2, "0");
    const ss = String(offset % 60).padStart(2, "0");
    const extra = e.exceptionMessage
      ? `${e.exceptionType ?? "Error"}: ${e.exceptionMessage}`
      : e.detail;
    console.log(
      `${mm}:${ss}  ${e.event.padEnd(16)} ${e.route.padEnd(24)} ${extra}`
    );
  }
  console.log("```\n");
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd || cmd === "--help") {
    console.log(
      "Usage: tsx scripts/triage-sessions.ts <analyze|stats|SESSION_ID> [flags]"
    );
    console.log("  analyze [--since ISO | --days N] [--limit N] [--json] [--include-crawlers]");
    console.log("  stats   [--since ISO | --days N] [--include-crawlers]");
    console.log("  <sessionId>");
    process.exit(0);
  }

  if (cmd === "analyze") return analyze();
  if (cmd === "stats") return stats();
  return showSession(cmd);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
