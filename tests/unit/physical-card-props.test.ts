/**
 * Serialized QRs carry only `tka.run/{code}?pid={id}`; the card's props come
 * from its physicalCards record. Covers the record read, the public props
 * endpoint the installed app calls, the browser fetch, and the /q load that
 * hands the record's props to the scan viewer. URL props always win.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getFirestoreRest: vi.fn(),
  fetchPublicShortCodeRecord: vi.fn(),
  prepareScanViewerPayload: vi.fn(),
}));

vi.mock("$env/dynamic/public", () => ({ env: {} }));
vi.mock("$lib/server/security/withRateLimit", () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock("$lib/server/firestore/firestore-rest", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("$lib/server/firestore/firestore-rest")
  >()),
  getFirestoreRest: mocks.getFirestoreRest,
}));
vi.mock("$lib/shared/qr/services/public-short-code-record-reader", () => ({
  fetchPublicShortCodeRecord: mocks.fetchPublicShortCodeRecord,
}));
vi.mock("$lib/server/scan/scan-viewer-payload-preparer", () => ({
  prepareScanViewerPayload: mocks.prepareScanViewerPayload,
}));

import {
  readPhysicalCardProps,
  readPhysicalCardPropsWithin,
} from "$lib/server/physical-cards/physical-card-props";
import {
  fetchPhysicalCardProps,
  physicalCardIdNeedingProps,
  physicalCardPropCandidate,
} from "$lib/shared/qr/services/physical-card-props";
import { GET } from "../../src/routes/api/physical-cards/props/+server";
import { load } from "../../src/routes/q/[code]/+page.server";

const CODE = "K7QM";
const PID = "k7Qm2XpR9aBc";

function cardDocument(fields: Record<string, string>) {
  return {
    name: `projects/test/databases/(default)/documents/physicalCards/${PID}`,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        { stringValue: value },
      ])
    ),
  };
}

function firestoreReturning(document: unknown) {
  const getDocument = vi.fn().mockResolvedValue(document);
  mocks.getFirestoreRest.mockReturnValue({ getDocument });
  return getDocument;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
});

describe("which scans need the card record", () => {
  it("asks only for a valid pid whose URL is missing a hand", () => {
    const need = (query: string, code = CODE) =>
      physicalCardIdNeedingProps(code, new URLSearchParams(query));

    expect(need(`pid=${PID}`)).toBe(PID);
    expect(need(`pid=${PID}&bp=staff`)).toBe(PID);
    expect(need(`pid=${PID}&bp=staff&rp=fan`)).toBeNull();
    expect(need("pid=not-a-card-id")).toBeNull();
    expect(need("")).toBeNull();
    expect(need(`pid=${PID}`, "not a code")).toBeNull();
  });

  it("shapes the record's props like URL props", () => {
    expect(physicalCardPropCandidate("staff", "fan")).toEqual({
      leftPropType: "staff",
      rightPropType: "fan",
      catDogMode: true,
    });
    expect(physicalCardPropCandidate("staff", "staff")).toEqual({
      leftPropType: "staff",
      rightPropType: "staff",
      catDogMode: false,
    });
    expect(physicalCardPropCandidate("staff", null)).toEqual({
      leftPropType: "staff",
    });
    expect(physicalCardPropCandidate("not-a-prop", null)).toBeNull();
  });
});

describe("physical card record read", () => {
  it("returns the stored props for the card's own code", async () => {
    const getDocument = vi.fn().mockResolvedValue(
      cardDocument({
        shortCode: CODE,
        leftPropType: "staff",
        rightPropType: "bigdoublecontactball",
      })
    );

    await expect(
      readPhysicalCardProps({ getDocument }, CODE, PID)
    ).resolves.toEqual({
      leftPropType: "staff",
      rightPropType: "bigdoublecontactball",
      catDogMode: true,
    });
    expect(getDocument).toHaveBeenCalledWith(`physicalCards/${PID}`, [
      "shortCode",
      "leftPropType",
      "rightPropType",
    ]);
  });

  it("answers nothing for a missing card, another code, or no props", async () => {
    const read = (document: unknown) =>
      readPhysicalCardProps(
        { getDocument: vi.fn().mockResolvedValue(document) },
        CODE,
        PID
      );

    await expect(read(null)).resolves.toBeNull();
    await expect(
      read(cardDocument({ shortCode: "ZZZZ", leftPropType: "staff" }))
    ).resolves.toBeNull();
    await expect(read(cardDocument({ shortCode: CODE }))).resolves.toBeNull();
  });

  it("degrades to null when the read fails or stalls", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { getDocument: vi.fn().mockRejectedValue(new Error("x")) };
    const stalled = { getDocument: vi.fn(() => new Promise<never>(() => {})) };

    await expect(
      readPhysicalCardPropsWithin(() => failing, CODE, PID, 50)
    ).resolves.toBeNull();
    await expect(
      readPhysicalCardPropsWithin(() => stalled, CODE, PID, 5)
    ).resolves.toBeNull();
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});

describe("public card props endpoint", () => {
  function request(query: string) {
    const url = new URL(
      `https://tkaflowarts.com/api/physical-cards/props?${query}`
    );
    return GET({ url, platform: { env: {} } } as never);
  }

  it("returns only the prop pair, cacheable and open to the app's origin", async () => {
    firestoreReturning(
      cardDocument({
        shortCode: CODE,
        leftPropType: "staff",
        rightPropType: "fan",
        printRunId: "0123456789ABCDEFGHIJ",
      })
    );

    const response = await request(`code=${CODE}&pid=${PID}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      leftPropType: "staff",
      rightPropType: "fan",
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("refuses malformed identities without reading Firestore", async () => {
    const response = await request(`code=k7qm&pid=${PID}`);

    expect(response.status).toBe(400);
    expect(mocks.getFirestoreRest).not.toHaveBeenCalled();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("answers 404 when the card has no props for that code", async () => {
    firestoreReturning(
      cardDocument({ shortCode: "ZZZZ", leftPropType: "staff" })
    );

    const response = await request(`code=${CODE}&pid=${PID}`);

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("stops at the rate limit", async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await request(`code=${CODE}&pid=${PID}`);

    expect(response.status).toBe(429);
    expect(mocks.getFirestoreRest).not.toHaveBeenCalled();
  });
});

describe("browser card props fetch", () => {
  it("reads the site's endpoint from the installed app", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ leftPropType: "staff", rightPropType: null })
        )
      );

    await expect(
      fetchPhysicalCardProps(CODE, PID, {
        origin: "https://tkaflowarts.com",
        fetchImpl,
      })
    ).resolves.toEqual({ leftPropType: "staff" });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://tkaflowarts.com/api/physical-cards/props?code=${CODE}&pid=${PID}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("resolves null on a miss, an error, or a timeout", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 404 }));
    const offline = vi.fn().mockRejectedValue(new TypeError("offline"));
    const hanging = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          )
        )
    );

    for (const fetchImpl of [missing, offline, hanging]) {
      await expect(
        fetchPhysicalCardProps(CODE, PID, {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          timeoutMs: 5,
        })
      ).resolves.toBeNull();
    }
    warnings.mockRestore();
  });
});

describe("/q load with a serialized card", () => {
  const record = { sequenceData: {}, leftPropType: "fan" };

  function scan(query: string) {
    const url = new URL(`https://tkaflowarts.com/q/${CODE}?${query}`);
    return load({
      params: { code: CODE },
      request: new Request(url),
      platform: { env: { FIREBASE_SERVICE_ACCOUNT_JSON: "{}" } },
      url,
    } as never) as Promise<Record<string, unknown>>;
  }

  beforeEach(() => {
    mocks.fetchPublicShortCodeRecord.mockResolvedValue(record);
    mocks.prepareScanViewerPayload.mockResolvedValue(null);
  });

  it("passes the card record's props below the URL's and above the shortcode's", async () => {
    firestoreReturning(
      cardDocument({
        shortCode: CODE,
        leftPropType: "staff",
        rightPropType: "bigdoublecontactball",
      })
    );

    const data = await scan(`pid=${PID}`);

    const cardProps = {
      leftPropType: "staff",
      rightPropType: "bigdoublecontactball",
      catDogMode: true,
    };
    expect(mocks.prepareScanViewerPayload).toHaveBeenCalledWith(
      CODE,
      record,
      {},
      cardProps
    );
    expect(data.physicalCardProps).toEqual(cardProps);
  });

  it("skips the record read when the printed URL names both props", async () => {
    await scan(`bp=staff&rp=fan&pid=${PID}`);

    expect(mocks.getFirestoreRest).not.toHaveBeenCalled();
    expect(mocks.prepareScanViewerPayload).toHaveBeenCalledWith(
      CODE,
      record,
      { leftPropType: "staff", rightPropType: "fan", catDogMode: true },
      null
    );
  });

  it("still renders when the record read fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getFirestoreRest.mockReturnValue({
      getDocument: vi.fn().mockRejectedValue(new Error("unavailable")),
    });

    const data = await scan(`pid=${PID}`);

    expect(data.physicalCardProps).toBeNull();
    expect(mocks.prepareScanViewerPayload).toHaveBeenCalledWith(
      CODE,
      record,
      {},
      null
    );
    errors.mockRestore();
  });
});
