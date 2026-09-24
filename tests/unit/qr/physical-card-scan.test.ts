import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirestoreWrite } from "../../../src/lib/server/firestore/firestore-rest";

const PREFIX = "projects/test-project/databases/(default)/documents/";

const mocks = vi.hoisted(() => ({ firestore: null as unknown }));

vi.mock("$lib/server/security/withRateLimit", () => ({
  withRateLimit: async () => null,
}));
vi.mock("$lib/server/security/rate-limiter", () => ({
  RATE_LIMITS: { GENERAL: {}, CARD_SCAN: {} },
}));
vi.mock("$lib/server/auth/getOptionalFirebaseUser", () => ({
  getOptionalFirebaseUser: async () => null,
}));
vi.mock("$lib/server/firestore/firestore-rest", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/lib/server/firestore/firestore-rest")
  >("../../../src/lib/server/firestore/firestore-rest");
  return { ...actual, getFirestoreRest: () => mocks.firestore };
});
// The browser client posts anonymously in these tests.
vi.mock("$lib/shared/auth/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("$lib/shared/auth/services/authed-fetch", () => ({
  authedFetch: vi.fn(),
}));

import {
  FirestoreRestError,
  fromFirestoreFields,
  toFirestoreFields,
} from "../../../src/lib/server/firestore/firestore-rest";
import { withPhysicalCardId } from "../../../src/lib/shared/qr/domain/physical-card";
import {
  readScanPhysicalCardId,
  recordCardScanAfterAuth,
} from "../../../src/lib/shared/qr/services/card-scan-ingest";
import { recordNativeCardScan } from "../../../src/lib/shared/qr/services/native-card-scan";
import {
  OPTIONS,
  POST,
} from "../../../src/routes/api/physical-cards/scan/+server";
import worker from "../../../cloudflare/workers/shortcode-redirect.js";

/**
 * Just enough of Firestore's commit semantics to exercise the endpoint's
 * idempotency: preconditions are checked for every write before any applies,
 * `exists: false` on an existing document fails with ALREADY_EXISTS, and
 * increments accumulate.
 */
class FakeFirestore {
  readonly docs = new Map<string, Record<string, unknown>>();
  commits = 0;

  documentName(path: string): string {
    return PREFIX + path;
  }

  async getDocument(path: string, mask: readonly string[] = []) {
    const data = this.docs.get(path);
    if (!data) return null;
    const picked =
      mask.length === 0
        ? data
        : Object.fromEntries(
            Object.entries(data).filter(([key]) => mask.includes(key))
          );
    return { name: PREFIX + path, fields: toFirestoreFields(picked) };
  }

  async commit(writes: FirestoreWrite[]) {
    const pathOf = (write: FirestoreWrite) =>
      (write.update?.name ?? write.transform?.document ?? "").slice(
        PREFIX.length
      );

    for (const write of writes) {
      const exists = this.docs.has(pathOf(write));
      if (write.currentDocument?.exists === false && exists) {
        throw new FirestoreRestError(
          "Firestore REST commit failed (409)",
          409,
          '{"error":{"status":"ALREADY_EXISTS"}}'
        );
      }
      if (write.currentDocument?.exists === true && !exists) {
        throw new FirestoreRestError(
          "Firestore REST commit failed (404)",
          404,
          '{"error":{"status":"NOT_FOUND"}}'
        );
      }
    }

    this.commits++;
    for (const write of writes) {
      const path = pathOf(write);
      if (write.update) {
        this.docs.set(path, fromFirestoreFields(write.update.fields));
      }
      const transforms = [
        ...(write.updateTransforms ?? []),
        ...(write.transform?.fieldTransforms ?? []),
      ] as Array<{
        fieldPath: string;
        increment?: { integerValue: string };
      }>;
      const doc = this.docs.get(path)!;
      for (const transform of transforms) {
        doc[transform.fieldPath] = transform.increment
          ? Number(doc[transform.fieldPath] ?? 0) +
            Number(transform.increment.integerValue)
          : "REQUEST_TIME";
      }
    }
    return { commitTime: "2026-09-23T12:00:00Z" };
  }

  scanEvents(shortCode: string): Record<string, unknown>[] {
    return [...this.docs.entries()]
      .filter(([path]) =>
        path.startsWith(`shortcodes/${shortCode}/scanEvents/`)
      )
      .map(([, data]) => data);
  }
}

const SHORT_CODE = "K7QM";
const PID = "k7Qm2XpR9aBc";
const PRINT_RUN_ID = "CqRz0123456789abcdEF";
const DEVICE_ID = "79312e84-8b18-4a43-bf8f-9cddc7816cf5";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

let firestore: FakeFirestore;

function seedSerializedCard(
  runStatus = "ready",
  cardShortCode = SHORT_CODE
): void {
  firestore.docs.set(`shortcodes/${SHORT_CODE}`, {
    sequence: "encoded",
    deckId: "deck-4",
    deckName: "TKA 1: Learning Letters (Base Motions)",
    leftPropType: "staff",
    rightPropType: "staff",
  });
  firestore.docs.set(`physicalCards/${PID}`, {
    shortCode: cardShortCode,
    printRunId: PRINT_RUN_ID,
    deckId: "deck-4",
    deckName: "TKA 1: Learning Letters (Base Motions)",
    deckReleaseNumber: 4,
    sequenceId: "tnd-split-same-aaaa",
    sequenceWord: "AAAA",
    cardIndex: 0,
    copyIndex: 2,
    printPosition: 1,
  });
  firestore.docs.set(`cardPrintRuns/${PRINT_RUN_ID}`, { status: runStatus });
}

function scanEvent(body: unknown) {
  const request = new Request(
    "https://tkaflowarts.com/api/physical-cards/scan",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  );
  return {
    request,
    url: new URL(request.url),
    platform: {
      env: { FIREBASE_SERVICE_ACCOUNT_JSON: "service-account-json" },
      cf: {
        country: "US",
        city: "Chicago",
        latitude: "41.85",
        longitude: "-87.65",
      },
    },
    getClientAddress: () => "203.0.113.7",
  } as never;
}

async function postScan(input: {
  shortCode: string;
  physicalCardId: string | null;
  deviceId?: string;
}) {
  const response = await POST(
    scanEvent({ schemaVersion: 1, deviceId: DEVICE_ID, ...input })
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  firestore = new FakeFirestore();
  mocks.firestore = firestore;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/physical-cards/scan", () => {
  it("records a serialized scan with its card identity and bumps both counters", async () => {
    seedSerializedCard();

    const result = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
    });

    expect(result).toEqual({
      status: 201,
      body: { recorded: true, duplicate: false, scanKind: "serialized" },
    });
    const [event] = firestore.scanEvents(SHORT_CODE);
    expect(event).toMatchObject({
      scanKind: "serialized",
      shortCode: SHORT_CODE,
      physicalCardId: PID,
      printId: PID,
      printRunId: PRINT_RUN_ID,
      deckReleaseNumber: 4,
      sequenceWord: "AAAA",
      copyIndex: 2,
      country: "US",
      city: "Chicago",
      locationPrecision: "city",
      leftPropType: "staff",
    });
    // The raw device id never reaches Firestore, only its hash.
    expect(JSON.stringify(event)).not.toContain(DEVICE_ID);
    expect(firestore.docs.get(`physicalCards/${PID}`)?.scanCount).toBe(1);
    expect(firestore.docs.get(`shortcodes/${SHORT_CODE}`)?.scanCount).toBe(1);
  });

  it("rejects an unknown physical card without writing anything", async () => {
    seedSerializedCard();
    firestore.docs.delete(`physicalCards/${PID}`);

    const result = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
    });

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("unknown_physical_card");
    expect(firestore.commits).toBe(0);
  });

  it("rejects a card identity scanned under a different shortcode", async () => {
    seedSerializedCard("ready", "ELYW");

    const result = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
    });

    expect(result.status).toBe(400);
    expect(result.body.code).toBe("card_code_mismatch");
    expect(firestore.commits).toBe(0);
  });

  it("converges a repeat scan from the same device, day, and city on one record", async () => {
    seedSerializedCard();

    const first = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
    });
    const repeat = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
    });

    expect(first.status).toBe(201);
    expect(repeat).toEqual({
      status: 200,
      body: { recorded: false, duplicate: true, scanKind: "serialized" },
    });
    expect(firestore.scanEvents(SHORT_CODE)).toHaveLength(1);
    expect(firestore.docs.get(`physicalCards/${PID}`)?.scanCount).toBe(1);
    expect(firestore.docs.get(`shortcodes/${SHORT_CODE}`)?.scanCount).toBe(1);
  });

  it("counts a second device scanning the same card as a new scan", async () => {
    seedSerializedCard();

    await postScan({ shortCode: SHORT_CODE, physicalCardId: PID });
    const other = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
      deviceId: "0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4",
    });

    expect(other.status).toBe(201);
    expect(firestore.docs.get(`physicalCards/${PID}`)?.scanCount).toBe(2);
  });

  it("refuses a card from a print run that never finished exporting", async () => {
    // One 2026-08-11 run (475 identities) is still "allocated" in production.
    seedSerializedCard("allocated");

    const result = await postScan({
      shortCode: SHORT_CODE,
      physicalCardId: PID,
    });

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("card_not_ready");
    expect(firestore.commits).toBe(0);
  });

  it("records a legacy scan of a pre-uppercase mixed-case shortcode", async () => {
    firestore.docs.set("shortcodes/07JPcN", { sequence: "encoded" });

    const result = await postScan({
      shortCode: "07JPcN",
      physicalCardId: null,
    });

    expect(result).toEqual({
      status: 201,
      body: { recorded: true, duplicate: false, scanKind: "legacy" },
    });
    expect(firestore.docs.get("shortcodes/07JPcN")?.scanCount).toBe(1);
  });

  it("rejects a shortcode that does not exist", async () => {
    const result = await postScan({ shortCode: "ZZZZ", physicalCardId: null });

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("unknown_short_code");
    expect(firestore.commits).toBe(0);
  });
});

describe("serialized card URL through the Worker and /q to the ingest write", () => {
  /** Route the browser client's POST into the real endpoint. */
  function routeClientPostsToEndpoint(): Array<Record<string, unknown>> {
    const posted: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/physical-cards/scan");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        posted.push(body);
        return POST(scanEvent(body));
      })
    );
    return posted;
  }

  async function followWorker(printedUrl: string): Promise<URL> {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await worker.fetch(
      new Request(printedUrl, { headers: { "user-agent": IPHONE_UA } }),
      {}
    );
    expect(response.status).toBe(302);
    return new URL(response.headers.get("location")!);
  }

  it("keeps pid, bp, and rp from the printed QR to the scan record", async () => {
    seedSerializedCard();
    const posted = routeClientPostsToEndpoint();
    // Exactly how a print export builds the QR payload.
    const printedUrl = withPhysicalCardId(
      `HTTPS://TKA.RUN/${SHORT_CODE}?bp=staff&rp=staff`,
      PID
    );

    const scanUrl = await followWorker(printedUrl);

    expect(`${scanUrl.origin}${scanUrl.pathname}`).toBe(
      `https://tkaflowarts.com/q/${SHORT_CODE}`
    );
    expect(scanUrl.searchParams.get("pid")).toBe(PID);
    expect(scanUrl.searchParams.get("bp")).toBe("staff");
    expect(scanUrl.searchParams.get("rp")).toBe("staff");

    // What /q reads from its own URL and hands to the recorder.
    const identity = readScanPhysicalCardId(scanUrl.searchParams);
    expect(identity).toEqual({ physicalCardId: PID, pidState: "valid" });

    const outcome = await recordCardScanAfterAuth(
      {
        shortCode: scanUrl.pathname.split("/").at(-1)!,
        physicalCardId: identity.physicalCardId,
        deviceId: DEVICE_ID,
      },
      async () => undefined
    );

    expect(posted).toEqual([
      {
        schemaVersion: 1,
        shortCode: SHORT_CODE,
        physicalCardId: PID,
        deviceId: DEVICE_ID,
      },
    ]);
    expect(outcome).toEqual({ outcome: "recorded", scanKind: "serialized" });
    expect(firestore.scanEvents(SHORT_CODE)[0]?.physicalCardId).toBe(PID);
    expect(firestore.docs.get(`physicalCards/${PID}`)?.scanCount).toBe(1);
  });

  it("still records the scan, as legacy, when the pid arrives mangled", async () => {
    seedSerializedCard();
    const posted = routeClientPostsToEndpoint();

    const scanUrl = await followWorker(
      `https://tka.run/${SHORT_CODE}?bp=staff&rp=staff&pid=not-a-card`
    );
    const identity = readScanPhysicalCardId(scanUrl.searchParams);
    const outcome = await recordCardScanAfterAuth(
      {
        shortCode: SHORT_CODE,
        physicalCardId: identity.physicalCardId,
        deviceId: DEVICE_ID,
      },
      async () => undefined
    );

    expect(identity.pidState).toBe("malformed");
    expect(posted[0]?.physicalCardId).toBeNull();
    expect(outcome).toEqual({ outcome: "recorded", scanKind: "legacy" });
  });

  it("reports the endpoint's refusal code instead of throwing", async () => {
    seedSerializedCard("allocated");
    routeClientPostsToEndpoint();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await recordCardScanAfterAuth(
      { shortCode: SHORT_CODE, physicalCardId: PID, deviceId: DEVICE_ID },
      async () => undefined
    );

    expect(outcome).toEqual({
      outcome: "failed",
      status: 409,
      code: "card_not_ready",
    });
  });

  it("does not wait on auth longer than its bound", async () => {
    vi.useFakeTimers();
    const record = vi.fn(async () => ({
      recorded: true,
      duplicate: false,
      scanKind: "legacy" as const,
    }));

    const pending = recordCardScanAfterAuth(
      { shortCode: SHORT_CODE, physicalCardId: null, deviceId: DEVICE_ID },
      () => new Promise(() => {}),
      record,
      1_500
    );
    await vi.advanceTimersByTimeAsync(1_499);
    expect(record).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      outcome: "recorded",
      scanKind: "legacy",
    });
    vi.useRealTimers();
  });
});

describe("serialized card URL opened in the installed Android app", () => {
  const APP_ORIGIN = "https://localhost";
  const SITE_SCAN_ENDPOINT = "https://tkaflowarts.com/api/physical-cards/scan";

  // The app claims each card once per five minutes in session storage.
  beforeEach(() => {
    sessionStorage.clear();
  });

  function endpointEvent(request: Request) {
    return {
      request,
      url: new URL(request.url),
      platform: {
        env: { FIREBASE_SERVICE_ACCOUNT_JSON: "service-account-json" },
        cf: { country: "US", city: "Chicago" },
      },
      getClientAddress: () => "203.0.113.7",
    } as never;
  }

  function preflight(origin: string) {
    return OPTIONS(
      endpointEvent(
        new Request(SITE_SCAN_ENDPOINT, {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
          },
        })
      )
    );
  }

  /**
   * Plays the WebView: the app's JSON POST goes out cross-origin from
   * https://localhost, so it is preflighted, and the app can read the answer
   * only if the endpoint grants its origin.
   */
  function routeAppPostsToEndpoint(): Array<Record<string, unknown>> {
    const posted: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(SITE_SCAN_ENDPOINT);
        const grant = await preflight(APP_ORIGIN);
        expect(grant.status).toBe(204);
        expect(grant.headers.get("access-control-allow-origin")).toBe(
          APP_ORIGIN
        );

        const headers = new Headers(init?.headers);
        headers.set("Origin", APP_ORIGIN);
        const request = new Request(String(input), { ...init, headers });
        posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        const response = await POST(endpointEvent(request));
        expect(response.headers.get("access-control-allow-origin")).toBe(
          APP_ORIGIN
        );
        return response;
      })
    );
    return posted;
  }

  it("records the scan with its pid from the link the phone camera opened", async () => {
    seedSerializedCard();
    const posted = routeAppPostsToEndpoint();
    const printedUrl = withPhysicalCardId(
      `HTTPS://TKA.RUN/${SHORT_CODE}?bp=staff&rp=staff`,
      PID
    );

    const outcome = await recordNativeCardScan(printedUrl, {
      deviceId: () => DEVICE_ID,
      waitForAuth: async () => undefined,
    });

    expect(posted).toEqual([
      {
        schemaVersion: 1,
        shortCode: SHORT_CODE,
        physicalCardId: PID,
        deviceId: DEVICE_ID,
      },
    ]);
    expect(outcome).toEqual({ outcome: "recorded", scanKind: "serialized" });
    const [event] = firestore.scanEvents(SHORT_CODE);
    expect(event).toMatchObject({
      scanKind: "serialized",
      physicalCardId: PID,
      printRunId: PRINT_RUN_ID,
      city: "Chicago",
    });
    expect(firestore.docs.get(`physicalCards/${PID}`)?.scanCount).toBe(1);
  });

  it("lets the app read a refusal instead of a blanket network error", async () => {
    seedSerializedCard("allocated");
    routeAppPostsToEndpoint();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await recordNativeCardScan(
      `https://tka.run/${SHORT_CODE}?bp=staff&rp=staff&pid=${PID}`,
      { deviceId: () => DEVICE_ID, waitForAuth: async () => undefined }
    );

    expect(outcome).toEqual({
      outcome: "failed",
      status: 409,
      code: "card_not_ready",
    });
  });

  it("grants CORS to the app's origin only", async () => {
    const denied = await preflight("https://evil.example");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    // Another origin's POST still runs server-side (anyone can call a public
    // endpoint), but its page is not allowed to read the answer.
    seedSerializedCard();
    const foreign = await POST(
      endpointEvent(
        new Request(SITE_SCAN_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.example",
          },
          body: JSON.stringify({
            schemaVersion: 1,
            shortCode: SHORT_CODE,
            physicalCardId: PID,
            deviceId: DEVICE_ID,
          }),
        })
      )
    );
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();

    // The site's own /q post is same-origin and needs no grant.
    const sameOrigin = await POST(
      scanEvent({
        schemaVersion: 1,
        shortCode: SHORT_CODE,
        physicalCardId: PID,
        deviceId: "0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4",
      })
    );
    expect(sameOrigin.status).toBe(201);
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBeNull();
  });
});
