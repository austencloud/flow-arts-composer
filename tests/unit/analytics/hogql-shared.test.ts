import { describe, it, expect } from "vitest";
import {
  escapeHogQL,
  personIdentityFilter,
  pulseProdFilter,
  EXCLUDED_ADMIN_UIDS,
} from "#lib/server/analytics/hogql-shared.js";

describe("escapeHogQL", () => {
  it("escapes single quotes so a uid cannot break out of a literal", () => {
    expect(escapeHogQL("o'brien")).toBe("o\\'brien");
  });

  it("escapes backslashes before quotes", () => {
    expect(escapeHogQL("a\\b")).toBe("a\\\\b");
  });
});

describe("personIdentityFilter", () => {
  it("matches the PostHog person instead of only the account distinct ID", () => {
    const sql = personIdentityFilter("account-1");

    expect(sql).toContain("person_id IN");
    expect(sql).toContain("FROM person_distinct_ids");
    expect(sql).toContain("distinct_id = 'account-1'");
  });

  it("escapes the distinct ID inside the identity lookup", () => {
    expect(personIdentityFilter("o'brien")).toContain("o\\'brien");
  });
});

describe("pulseProdFilter", () => {
  it("excludes every admin uid", () => {
    const sql = pulseProdFilter();
    for (const uid of EXCLUDED_ADMIN_UIDS) {
      expect(sql).toContain(uid);
    }
  });

  it("excludes localhost, LAN, and the dev host", () => {
    const sql = pulseProdFilter();
    expect(sql).toContain("localhost%");
    expect(sql).toContain("192.168.%");
    expect(sql).toContain("dev.tkaflowarts.com");
  });
});
