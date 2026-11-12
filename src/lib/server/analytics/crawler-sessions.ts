/**
 * The one definition of a crawler session, in both of the forms it is used:
 *
 *   - `isLikelyCrawlerSession` checks a session row the triage CLIs already
 *     fetched, so they can count crawlers and bring them back on request.
 *   - `crawlerSessionExclusion` drops the same sessions inside HogQL, so the
 *     admin pulse counts never see them.
 *
 * Both read `CRAWLER_SESSION_RULE`, and the HogQL form compares the very
 * column expressions the triage sessions query selects
 * (`CRAWLER_SESSION_COLUMNS`). Change the rule here and both forms move
 * together; crawler-sessions.test.ts fails if they stop agreeing.
 *
 * The shape: one page view, never identified, zh-CN browser language, and no
 * referrer. On 2026-10-22, 30 of the top 40 friction slots were this shape
 * (zh-CN Chrome from cloud IP ranges reading one localized /guide page), and
 * on 2026-11-08/09 it was 27 sessions on a day with about 4 real people.
 * PostHog data here carries no datacenter-IP flag, so an empty referrer stands
 * in for it.
 */

/** The values a session must have to count as a crawler. */
export const CRAWLER_SESSION_RULE = {
  pageviewCount: 1,
  identified: false,
  /** Lowercase, with `_` read as `-`, so "zh_CN" matches too. */
  locale: "zh-cn",
  /** Referring domains that mean "nobody linked here". */
  noReferrerValues: ["", "$direct"],
} as const;

/**
 * Per-session HogQL aggregates the rule reads. The triage sessions query
 * selects these same expressions, so the row the CLI tests and the HAVING
 * clause the admin route runs are computed identically.
 */
export const CRAWLER_SESSION_COLUMNS = {
  pageviewCount: `countIf(event = '$pageview')`,
  locale: `argMax(properties."$browser_language", timestamp)`,
  identified: `maxIf(1, toString(properties."$is_identified") IN ('true', '1'))`,
  referringDomain: `argMinIf(properties."$referring_domain", timestamp, event = '$pageview')`,
} as const;

/** The four session facts the rule reads, as the triage row carries them. */
export interface CrawlerSessionFacts {
  pageviewCount: number;
  identified: boolean;
  /** Browser language of the session's last event, e.g. "zh-CN". Empty if absent. */
  locale: string;
  /** Referring domain of the entry pageview. Empty or "$direct" when none. */
  referringDomain: string;
}

function normalizeLocale(locale: string): string {
  return locale.toLowerCase().replaceAll("_", "-");
}

/** True when a fetched session row has the crawler shape. */
export function isLikelyCrawlerSession(row: CrawlerSessionFacts): boolean {
  const rule = CRAWLER_SESSION_RULE;
  return (
    row.pageviewCount === rule.pageviewCount &&
    row.identified === rule.identified &&
    normalizeLocale(row.locale) === rule.locale &&
    (rule.noReferrerValues as readonly string[]).includes(row.referringDomain)
  );
}

/** The rule as a HogQL HAVING condition over one session's events. */
export function crawlerSessionHaving(): string {
  const rule = CRAWLER_SESSION_RULE;
  const cols = CRAWLER_SESSION_COLUMNS;
  const noReferrer = rule.noReferrerValues.map((v) => `'${v}'`).join(", ");
  return [
    `${cols.pageviewCount} = ${rule.pageviewCount}`,
    // maxIf over no matching rows is 0, so a never-identified session reads 0.
    `${cols.identified} = ${rule.identified ? 1 : 0}`,
    `replaceAll(lower(coalesce(${cols.locale}, '')), '_', '-') = '${rule.locale}'`,
    // A missing referrer reads "" on the triage side (String(null ?? "")).
    `coalesce(${cols.referringDomain}, '') IN (${noReferrer})`,
  ].join("\n        AND ");
}

/**
 * SQL fragment for an `events` WHERE clause: drops every event of a crawler
 * session. `sinceExpr` bounds the inner scan and should match the outer
 * query's window, e.g. `now() - interval 30 day`.
 */
export function crawlerSessionExclusion(sinceExpr: string): string {
  return `"$session_id" NOT IN (
      SELECT "$session_id"
      FROM events
      WHERE timestamp > ${sinceExpr}
        AND "$session_id" != ''
      GROUP BY "$session_id"
      HAVING ${crawlerSessionHaving()}
    )`;
}
