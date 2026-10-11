import { describe, expect, it, vi } from "vitest";

// The module under test only needs its pure readers exercised. Stubbing the
// Firebase seams keeps the suite off the network and out of SDK init.
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: vi.fn(),
  getFirestoreInstance: vi.fn(),
  getFunctionsInstance: vi.fn(),
}));

const {
  EMPTY_META_PUBLISH_STATUS,
  MetaPublishClientError,
  metaErrorCode,
  metaErrorMessage,
  readMetaConnectState,
  readMetaPublishStatus,
} = await import("#lib/shared/share/services/meta-publish.js");

describe("connection status reader", () => {
  it("reads an empty status from a missing document", () => {
    expect(readMetaPublishStatus(undefined)).toEqual(EMPTY_META_PUBLISH_STATUS);
  });

  it("reads both connections from a full mirror document", () => {
    const status = readMetaPublishStatus({
      instagram: { username: "austencloud", expiresAtMs: 1234 },
      facebookPage: {
        selectedPageId: "page-1",
        selectedPageName: "The Kinetic Alphabet",
        pages: [
          { id: "page-1", name: "The Kinetic Alphabet" },
          { id: "page-2", name: "Flow Arts Chicago" },
        ],
        expiresAtMs: 5678,
      },
    });

    expect(status.instagram).toEqual({
      accountId: "",
      username: "austencloud",
      accountType: "UNKNOWN",
      route: "instagram-login",
      expiresAtMs: 1234,
      capabilities: null,
    });
    expect(status.facebookPage?.selectedPageId).toBe("page-1");
    expect(status.facebookPage?.pages).toHaveLength(2);
  });

  it("treats a connection with no username or page id as not connected", () => {
    const status = readMetaPublishStatus({
      instagram: { expiresAtMs: 1 },
      facebookPage: { selectedPageName: "Orphan", pages: [] },
    });
    expect(status).toEqual(EMPTY_META_PUBLISH_STATUS);
  });

  it("drops malformed page entries instead of rendering blank chips", () => {
    const status = readMetaPublishStatus({
      facebookPage: {
        selectedPageId: "page-1",
        pages: ["nope", null, { name: "no id" }, { id: "page-2" }],
      },
    });

    expect(status.facebookPage?.pages).toEqual([
      { id: "page-2", name: "page-2" },
    ]);
    // A page with no name falls back to its id, and a missing selected name
    // becomes "" rather than undefined — the chip label is never blank-typed.
    expect(status.facebookPage?.selectedPageName).toBe("");
    expect(status.facebookPage?.expiresAtMs).toBe(0);
  });
});

describe("connect state reader", () => {
  it("keeps waiting through the pending and processing hops", () => {
    expect(readMetaConnectState(undefined).status).toBe("waiting");
    expect(readMetaConnectState({ status: "pending" }).status).toBe("waiting");
    expect(readMetaConnectState({ status: "processing" }).status).toBe(
      "waiting"
    );
  });

  it("resolves on complete", () => {
    expect(readMetaConnectState({ status: "complete" }).status).toBe(
      "complete"
    );
  });

  it("carries the failure code through, and falls back when it is missing", () => {
    expect(
      readMetaConnectState({ status: "error", errorCode: "meta/no-pages" })
    ).toEqual({ status: "error", errorCode: "meta/no-pages" });
    expect(readMetaConnectState({ status: "error" })).toEqual({
      status: "error",
      errorCode: "meta/provider-error",
    });
  });

  it("waits rather than guessing on a status it does not know", () => {
    expect(readMetaConnectState({ status: "something-else" }).status).toBe(
      "waiting"
    );
  });
});

describe("callable error codes", () => {
  it("unwraps the reason a Firebase callable carries in details", () => {
    expect(metaErrorCode({ details: { reason: "meta/token-expired" } })).toBe(
      "meta/token-expired"
    );
  });

  it("ignores a details.reason that is not a Meta code", () => {
    expect(metaErrorCode({ details: { reason: "auth/whatever" } })).toBe(
      "meta/provider-error"
    );
  });

  it("passes a client error's own code straight through", () => {
    expect(
      metaErrorCode(new MetaPublishClientError("meta/popup-blocked"))
    ).toBe("meta/popup-blocked");
  });

  it("falls back for a plain error, a string and null", () => {
    expect(metaErrorCode(new Error("boom"))).toBe("meta/provider-error");
    expect(metaErrorCode("boom")).toBe("meta/provider-error");
    expect(metaErrorCode(null)).toBe("meta/provider-error");
  });

  it("gives every code a message written for a person, not a log", () => {
    expect(metaErrorMessage("meta/popup-blocked")).toContain("popups");
    expect(metaErrorMessage("meta/no-pages")).toContain("Pages");
    expect(metaErrorMessage("meta/account-type-required")).toContain(
      "creator or business"
    );
    expect(metaErrorMessage("meta/app-configuration-mismatch")).toContain(
      "Trying again will not fix this"
    );
    expect(metaErrorMessage("meta/whatever-new")).toBe(
      "Meta couldn't complete that. Try again."
    );
  });
});
