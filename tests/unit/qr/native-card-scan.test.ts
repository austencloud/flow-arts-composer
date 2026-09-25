import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The app posts anonymously in these tests.
vi.mock("$lib/shared/auth/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("$lib/shared/auth/services/authed-fetch", () => ({
  authedFetch: vi.fn(),
}));

import { withPhysicalCardId } from "$lib/shared/qr/domain/physical-card";
import {
  readCardScanLink,
  recordNativeCardScan,
} from "$lib/shared/qr/services/native-card-scan";
import { resolveNativeDeepLinkTarget } from "$lib/shared/platform/services/native-deep-link-target";

const PID = "k7Qm2XpR9aBc";
const DEVICE_ID = "79312e84-8b18-4a43-bf8f-9cddc7816cf5";
const SITE_SCAN_ENDPOINT = "https://tkaflowarts.com/api/physical-cards/scan";

const deps = {
  deviceId: () => DEVICE_ID,
  waitForAuth: async () => undefined,
};

function stubScanEndpoint(
  respond: () => Promise<Response> = async () =>
    new Response(
      JSON.stringify({ recorded: true, duplicate: false, scanKind: "legacy" }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    )
) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => respond()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postedBody(
  call: [RequestInfo | URL, RequestInit | undefined]
): Record<string, unknown> {
  return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("readCardScanLink: links Android opens in the app", () => {
  it("reads a bare printed card", () => {
    expect(readCardScanLink("https://tka.run/ELYW")).toEqual({
      shortCode: "ELYW",
      physicalCardId: null,
      pidState: "absent",
    });
  });

  it("keeps the physical card ID of a serialized card", () => {
    expect(
      readCardScanLink(`https://tka.run/K7QM?bp=staff&rp=staff&pid=${PID}`)
    ).toEqual({ shortCode: "K7QM", physicalCardId: PID, pidState: "valid" });
  });

  it("reads the uppercase URL a print export encodes", () => {
    // Exactly how a print export builds the QR payload.
    const printed = withPhysicalCardId(
      "HTTPS://TKA.RUN/K7QM?bp=staff&rp=staff",
      PID
    );

    expect(readCardScanLink(printed)).toEqual({
      shortCode: "K7QM",
      physicalCardId: PID,
      pidState: "valid",
    });
  });

  it("keeps a legacy mixed-case code exactly as printed", () => {
    // Shortcode documents are case-sensitive; uppercasing would miss it.
    expect(readCardScanLink("https://tka.run/07JPcN")?.shortCode).toBe(
      "07JPcN"
    );
  });

  it("reads a /q/ link the same way", () => {
    expect(
      readCardScanLink(
        `https://tkaflowarts.com/q/K7QM?bp=staff&rp=staff&pid=${PID}`
      )
    ).toEqual({ shortCode: "K7QM", physicalCardId: PID, pidState: "valid" });
  });

  it("degrades a mangled pid to a legacy scan instead of dropping the scan", () => {
    expect(
      readCardScanLink("https://tka.run/K7QM?bp=staff&rp=staff&pid=not-a-card")
    ).toEqual({
      shortCode: "K7QM",
      physicalCardId: null,
      pidState: "malformed",
    });
  });

  it("ignores links that are not a card scan", () => {
    // After a browser scan, /q already recorded it before this handoff.
    expect(
      readCardScanLink(
        `https://tkaflowarts.com/store/open?to=${encodeURIComponent(
          `/browse/gallery?bp=staff&rp=staff&pid=${PID}&from=scan&code=K7QM&v=K7QM`
        )}`
      )
    ).toBeNull();
    expect(
      readCardScanLink("https://tkaflowarts.com/sequence/K7QM")
    ).toBeNull();
    expect(readCardScanLink("https://tka.run/s~r1:abcXYZ")).toBeNull();
    expect(
      readCardScanLink("https://tkaflowarts.com/q/K7QM?demo=1")
    ).toBeNull();
    expect(readCardScanLink("https://tka.run/")).toBeNull();
    expect(readCardScanLink("not a URL")).toBeNull();
  });

  it("opens the viewer with the same code and the card's props", () => {
    const target = new URL(
      resolveNativeDeepLinkTarget(
        `https://tka.run/K7QM?bp=staff&rp=staff&pid=${PID}`
      )!,
      "https://localhost"
    );
    expect(target.pathname).toBe("/browse/gallery");
    expect(target.searchParams.get("v")).toBe("K7QM");
    expect(target.searchParams.get("bp")).toBe("staff");
    expect(target.searchParams.get("rp")).toBe("staff");
    expect(target.searchParams.get("pid")).toBe(PID);

    expect(resolveNativeDeepLinkTarget("https://tka.run/07JPcN")).toBe(
      "/browse/gallery?v=07JPcN"
    );
  });
});

describe("recordNativeCardScan", () => {
  it("posts the code and pid to the site's scan endpoint by absolute URL", async () => {
    const fetchMock = stubScanEndpoint();

    const outcome = await recordNativeCardScan(
      `https://tka.run/K7QM?bp=staff&rp=staff&pid=${PID}`,
      deps
    );

    expect(outcome).toEqual({ outcome: "recorded", scanKind: "legacy" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(String(input)).toBe(SITE_SCAN_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(false);
    expect(postedBody(fetchMock.mock.calls[0]!)).toEqual({
      schemaVersion: 1,
      shortCode: "K7QM",
      physicalCardId: PID,
      deviceId: DEVICE_ID,
    });
  });

  it("records one scan when Android delivers the same link twice", async () => {
    const fetchMock = stubScanEndpoint();
    const link = `https://tka.run/K7QM?bp=staff&rp=staff&pid=${PID}`;

    await recordNativeCardScan(link, deps);
    await expect(recordNativeCardScan(link, deps)).resolves.toBeNull();
    // Another serialized copy of the same sequence is its own scan.
    await recordNativeCardScan(
      "https://tka.run/K7QM?bp=staff&rp=staff&pid=23456789ABCD",
      deps
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedBody(fetchMock.mock.calls[1]!).physicalCardId).toBe(
      "23456789ABCD"
    );
  });

  it("posts nothing for a link that is not a card scan", async () => {
    const fetchMock = stubScanEndpoint();

    await expect(
      recordNativeCardScan("https://tkaflowarts.com/sequence/K7QM", deps)
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a failed outcome when the network is down", async () => {
    stubScanEndpoint(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordNativeCardScan("https://tka.run/ELYW", deps)
    ).resolves.toEqual({ outcome: "failed", status: null, code: null });
  });
});
