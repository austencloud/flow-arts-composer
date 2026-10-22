import {
  countryName,
  deviceLabel,
  placeLabel,
  singleVisitMessage,
  sourceLabel,
  summarizeVisit,
  visitDigestMessage,
  type VisitFacts,
  type VisitSummary,
} from "./visitMessages";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_US; FBAN/FBIOS)";
const FACEBOOK_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]";

function facts(overrides: Partial<VisitFacts> = {}): VisitFacts {
  return {
    city: "Lyon",
    region: null,
    country: "FR",
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    userAgent: IPHONE_SAFARI,
    landingPath: "/learn",
    visitNumber: 1,
    ...overrides,
  };
}

describe("countryName / placeLabel", () => {
  it("spells out Cloudflare's country codes", () => {
    expect(countryName("FR")).toBe("France");
    expect(countryName("au")).toBe("Australia");
    expect(placeLabel("Ghent", "BE")).toBe("Ghent, Belgium");
  });
  it("treats Cloudflare's unknown code as no country", () => {
    expect(countryName("XX")).toBeNull();
    expect(placeLabel(null, "XX")).toBe("an unknown place");
  });
  it("falls back to whatever part is known", () => {
    expect(placeLabel(null, "FR")).toBe("France");
    expect(placeLabel("Lyon", null)).toBe("Lyon");
  });
});

describe("sourceLabel", () => {
  it("names search engines across their country domains", () => {
    expect(sourceLabel(facts({ referrerHost: "www.google.fr" }))).toBe(
      "Google"
    );
    expect(sourceLabel(facts({ referrerHost: "google.com.au" }))).toBe(
      "Google"
    );
    expect(sourceLabel(facts({ referrerHost: "duckduckgo.com" }))).toBe(
      "DuckDuckGo"
    );
  });

  it("tells Gemini apart from Google search", () => {
    expect(sourceLabel(facts({ referrerHost: "gemini.google.com" }))).toBe(
      "Gemini"
    );
  });

  it("names social link shims", () => {
    expect(sourceLabel(facts({ referrerHost: "l.instagram.com" }))).toBe(
      "Instagram"
    );
    expect(sourceLabel(facts({ referrerHost: "lm.facebook.com" }))).toBe(
      "Facebook"
    );
    expect(sourceLabel(facts({ referrerHost: "t.co" }))).toBe("X");
  });

  it("does not mistake a lookalike host for a known one", () => {
    expect(sourceLabel(facts({ referrerHost: "notx.com" }))).toBe("notx.com");
  });

  it("shows an unknown referrer as its bare host", () => {
    expect(sourceLabel(facts({ referrerHost: "www.flowarts.org" }))).toBe(
      "flowarts.org"
    );
  });

  it("reads the in-app browser when the referrer is missing", () => {
    expect(sourceLabel(facts({ userAgent: INSTAGRAM_IOS }))).toBe("Instagram");
    expect(sourceLabel(facts({ userAgent: FACEBOOK_ANDROID }))).toBe(
      "Facebook"
    );
  });

  it("prefers campaign tags over everything else", () => {
    expect(
      sourceLabel(
        facts({
          utmSource: "newsletter",
          utmMedium: "email",
          referrerHost: "mail.google.com",
        })
      )
    ).toBe("an email (Newsletter)");
    expect(
      sourceLabel(facts({ utmSource: "facebook", utmMedium: "cpc" }))
    ).toBe("an ad on Facebook");
  });

  it("calls a visit with no clues a direct link", () => {
    expect(sourceLabel(facts())).toBe("a direct link");
  });
});

describe("deviceLabel", () => {
  it("names common devices", () => {
    expect(deviceLabel(IPHONE_SAFARI)).toBe("iPhone");
    expect(deviceLabel(FACEBOOK_ANDROID)).toBe("Android phone");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
      )
    ).toBe("Windows PC");
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
      )
    ).toBe("Mac");
  });
});

describe("singleVisitMessage", () => {
  it("reads as one line with place, source, device and landing page", () => {
    const visit = summarizeVisit(
      facts({ referrerHost: "www.google.fr" }),
      "s1"
    );
    expect(singleVisitMessage(visit)).toBe(
      "New visitor in Lyon, France · via Google · iPhone · landed on /learn"
    );
  });

  it("says when the browser has been here before", () => {
    const visit = summarizeVisit(facts({ visitNumber: 3 }), null);
    expect(singleVisitMessage(visit)).toBe(
      "Returning visitor (3rd visit) in Lyon, France · via a direct link · iPhone · landed on /learn"
    );
  });
});

describe("visitDigestMessage", () => {
  const v = (place: string, source: string): VisitSummary => ({
    place,
    source,
    device: "iPhone",
    landingPath: "/",
    visitNumber: 1,
    postHogSessionId: null,
  });

  it("lists each visitor with where they came from", () => {
    expect(
      visitDigestMessage(
        [v("Lyon, France", "Google"), v("Sydney, Australia", "Instagram")],
        2,
        10
      )
    ).toBe(
      "2 visitors · last 10 min: Lyon, France (Google) · Sydney, Australia (Instagram)"
    );
  });

  it("caps the list and counts the rest", () => {
    const visits = Array.from({ length: 7 }, (_, i) =>
      v(`City ${i}`, "Google")
    );
    const message = visitDigestMessage(visits, 9, 10);
    expect(
      message.startsWith("9 visitors · last 10 min: City 0 (Google)")
    ).toBe(true);
    expect(message.endsWith("City 4 (Google) · +4 more")).toBe(true);
  });
});
