import { describe, it, expect } from "vitest";
import {
  CRAWLER_SESSION_COLUMNS,
  crawlerSessionExclusion,
  crawlerSessionHaving,
  isLikelyCrawlerSession,
} from "#lib/server/analytics/crawler-sessions.js";
import {
  buildTriageSessionsQuery,
  parseTriageSessionRow,
} from "#lib/server/analytics/session-triage-queries.js";
import { buildVitalsSessionsQuery } from "#lib/server/analytics/web-vitals-triage.js";

/** What ClickHouse returns for the four columns the rule reads. */
interface RawFacts {
  pageviewCount: number;
  identified: 0 | 1;
  locale: string | null;
  referringDomain: string | null;
}

const CRAWLER: RawFacts = {
  pageviewCount: 1,
  identified: 0,
  locale: "zh-CN",
  referringDomain: null,
};

const CASES: Array<[string, RawFacts, boolean]> = [
  ["one anonymous zh-CN page view, no referrer", CRAWLER, true],
  ["empty-string referrer", { ...CRAWLER, referringDomain: "" }, true],
  ["$direct referrer", { ...CRAWLER, referringDomain: "$direct" }, true],
  ["zh_cn spelling", { ...CRAWLER, locale: "zh_cn" }, true],
  ["two page views", { ...CRAWLER, pageviewCount: 2 }, false],
  ["no page view", { ...CRAWLER, pageviewCount: 0 }, false],
  ["identified", { ...CRAWLER, identified: 1 }, false],
  ["en-US", { ...CRAWLER, locale: "en-US" }, false],
  ["zh-TW", { ...CRAWLER, locale: "zh-TW" }, false],
  ["no locale", { ...CRAWLER, locale: null }, false],
  [
    "linked from baidu",
    { ...CRAWLER, referringDomain: "www.baidu.com" },
    false,
  ],
];

/** The triage CLI path: raw row → parseTriageSessionRow → predicate. */
function triageVerdict(raw: RawFacts): boolean {
  const row: unknown[] = new Array(21).fill(null);
  row[9] = raw.pageviewCount;
  row[18] = raw.locale;
  row[19] = raw.identified;
  row[20] = raw.referringDomain;
  return isLikelyCrawlerSession(parseTriageSessionRow(row));
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "\\'")}'`;
}

/**
 * The admin path: evaluates the HAVING clause the route sends to PostHog,
 * with each aggregate replaced by the session's value. Supports exactly the
 * SQL the clause uses (AND, =, IN, coalesce, lower, replaceAll); anything else
 * throws, so a rewrite of the clause has to come back here too.
 */
function hogqlVerdict(raw: RawFacts): boolean {
  let sql = crawlerSessionHaving();
  for (const [key, expr] of Object.entries(CRAWLER_SESSION_COLUMNS)) {
    sql = sql.split(expr).join(sqlLiteral(raw[key as keyof RawFacts]));
  }
  const helpers = {
    coalesce: (v: unknown, d: unknown) => v ?? d,
    lower: (v: unknown) => (v == null ? null : String(v).toLowerCase()),
    replaceAll: (v: unknown, a: string, b: string) =>
      v == null ? null : String(v).split(a).join(b),
  };
  const evaluate = (expr: string): unknown => {
    const js = expr.replace(/\bNULL\b/g, "null");
    if (/[^\w\s'(),$.\-]/.test(js.replace(/'[^']*'/g, ""))) {
      throw new Error(`Unsupported SQL in crawler clause: ${expr}`);
    }
    return new Function(...Object.keys(helpers), `return (${js});`)(
      ...Object.values(helpers)
    );
  };
  return sql.split(/\s+AND\s+/).every((clause) => {
    const inMatch = /^(.*) IN \((.*)\)$/s.exec(clause.trim());
    if (inMatch) {
      const options = inMatch[2].split(",").map((s) => evaluate(s.trim()));
      return options.includes(evaluate(inMatch[1]));
    }
    const [lhs, rhs, ...rest] = clause.split(" = ");
    if (rhs === undefined || rest.length) {
      throw new Error(`Unsupported SQL in crawler clause: ${clause}`);
    }
    return evaluate(lhs.trim()) === evaluate(rhs.trim());
  });
}

describe("crawler session rule", () => {
  it.each(CASES)("triage predicate: %s", (_name, raw, expected) => {
    expect(triageVerdict(raw)).toBe(expected);
  });

  it.each(CASES)(
    "HogQL clause agrees with the predicate: %s",
    (_name, raw, expected) => {
      expect(hogqlVerdict(raw)).toBe(expected);
    }
  );

  it("is computed from the same columns the triage queries select", () => {
    const triage = buildTriageSessionsQuery("2026-11-01T00:00:00Z", 10);
    const vitals = buildVitalsSessionsQuery("2026-11-01T00:00:00Z", ["s1"]);
    for (const expr of Object.values(CRAWLER_SESSION_COLUMNS)) {
      expect(triage).toContain(expr);
      expect(vitals).toContain(expr);
    }
  });

  it("excludes whole sessions within the caller's window", () => {
    const sql = crawlerSessionExclusion("now() - interval 30 day");
    expect(sql).toMatch(/^"\$session_id" NOT IN \(/);
    expect(sql).toContain("WHERE timestamp > now() - interval 30 day");
    expect(sql).toContain('GROUP BY "$session_id"');
    expect(sql).toContain(`HAVING ${crawlerSessionHaving()}`);
  });
});
