import { describe, expect, it } from "vitest";
import {
  landingPathOf,
  looksLikeBot,
  parseVisitReport,
  referrerHostOf,
} from "#lib/server/visits/site-visit.js";

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("referrerHostOf", () => {
  it("keeps only the referring host", () => {
    expect(
      referrerHostOf("https://www.google.fr/search?q=poi", "tkaflowarts.com")
    ).toBe("www.google.fr");
  });

  it("treats the site's own pages as no referrer", () => {
    expect(
      referrerHostOf("https://tkaflowarts.com/learn", "www.tkaflowarts.com")
    ).toBeNull();
  });

  it("drops anything that is not a web address", () => {
    expect(
      referrerHostOf("android-app://com.google", "tkaflowarts.com")
    ).toBeNull();
    expect(referrerHostOf("not a url", "tkaflowarts.com")).toBeNull();
    expect(referrerHostOf("", "tkaflowarts.com")).toBeNull();
  });
});

describe("landingPathOf", () => {
  it("drops query strings, which can carry tokens", () => {
    expect(landingPathOf("/auth/finish?oobCode=secret")).toBe("/auth/finish");
  });

  it("refuses paths that leave the site", () => {
    expect(landingPathOf("//evil.example/x")).toBe("/");
    expect(landingPathOf("https://evil.example")).toBe("/");
  });
});

describe("looksLikeBot", () => {
  it("passes an ordinary phone browser", () => {
    expect(looksLikeBot(CHROME_ANDROID, undefined)).toBe(false);
  });

  it("catches crawlers, headless browsers and scripts", () => {
    expect(
      looksLikeBot(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        undefined
      )
    ).toBe(true);
    expect(
      looksLikeBot(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0",
        undefined
      )
    ).toBe(true);
    expect(looksLikeBot("python-requests/2.32", undefined)).toBe(true);
    expect(looksLikeBot("", undefined)).toBe(true);
  });

  it("trusts Cloudflare's bot verdict when it has one", () => {
    expect(looksLikeBot(CHROME_ANDROID, { botManagement: { score: 5 } })).toBe(
      true
    );
    expect(
      looksLikeBot(CHROME_ANDROID, { botManagement: { verifiedBot: true } })
    ).toBe(true);
    expect(looksLikeBot(CHROME_ANDROID, { botManagement: { score: 90 } })).toBe(
      false
    );
  });
});

describe("parseVisitReport", () => {
  it("merges the browser's report with Cloudflare's location", () => {
    const parsed = parseVisitReport(
      {
        referrer: "https://l.instagram.com/",
        landingPath: "/learn",
        utm: { source: "instagram", medium: "social" },
        visitNumber: 2,
        sinceLastVisitMs: 86_400_000,
        postHogSessionId: "ph-1",
        language: "fr-FR",
        timezone: "Europe/Paris",
        viewport: "390x844",
      },
      {
        ownHost: "tkaflowarts.com",
        userAgent: CHROME_ANDROID,
        cf: {
          city: "Lyon",
          region: "Auvergne-Rhône-Alpes",
          country: "FR",
          latitude: "45.75",
          longitude: "4.85",
          asOrganization: "Orange",
        },
      }
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        referrerHost: "l.instagram.com",
        landingPath: "/learn",
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: null,
        utmContent: null,
        utmTerm: null,
        visitNumber: 2,
        sinceLastVisitMs: 86_400_000,
        postHogSessionId: "ph-1",
        language: "fr-FR",
        timezone: "Europe/Paris",
        viewport: "390x844",
        userAgent: CHROME_ANDROID,
        city: "Lyon",
        region: "Auvergne-Rhône-Alpes",
        country: "FR",
        lat: 45.75,
        lng: 4.85,
        network: "Orange",
      },
    });
  });

  it("falls back to safe values for junk fields", () => {
    const parsed = parseVisitReport(
      { visitNumber: -4, utm: "nope", landingPath: 42 },
      { ownHost: "tkaflowarts.com", userAgent: CHROME_ANDROID, cf: undefined }
    );
    expect(parsed.ok && parsed.value).toMatchObject({
      visitNumber: 1,
      landingPath: "/",
      utmSource: null,
      city: null,
      country: null,
    });
  });

  it("rejects a body that is not an object", () => {
    expect(
      parseVisitReport([], {
        ownHost: "tkaflowarts.com",
        userAgent: CHROME_ANDROID,
        cf: undefined,
      }).ok
    ).toBe(false);
  });
});
