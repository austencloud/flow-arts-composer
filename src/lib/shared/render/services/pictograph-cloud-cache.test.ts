// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("firebase/storage", () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve("https://dl/url")),
}));
const authMocks = vi.hoisted(() => ({
  authStateReady: vi.fn(() => Promise.resolve()),
  currentUser: {} as object | null,
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: vi.fn(() => Promise.resolve(authMocks)),
  getStorageInstance: vi.fn(() => Promise.resolve({})),
}));

import {
  download,
  upload,
  cellPublicUrl,
  isCellKnownAvailable,
  _resetForTest,
} from "./pictograph-cloud-cache";

describe("pictograph-cloud-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTest();
    authMocks.currentUser = {};
  });
  afterEach(() => vi.restoreAllMocks());

  it("builds a deterministic public URL for a hash", () => {
    expect(cellPublicUrl("abc123")).toContain("pictograph-cells%2Fabc123.webp");
  });

  it("download returns the blob on a 200 hit", async () => {
    const blob = new Blob(["img"], { type: "image/webp" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
    );
    expect(await download("hit")).toBe(blob);
  });

  it("download returns null on 404 and negative-caches (no re-probe)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await download("miss")).toBeNull();
    expect(await download("miss")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("quiet download treats an unknown hash as a miss without sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await download("not-yet-uploaded", { probeUnknown: false })
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("download never throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await download("err")).toBeNull();
  });

  it("upload dedups concurrent calls for the same hash", async () => {
    const blob = new Blob(["w"], { type: "image/webp" });
    const [a, b] = await Promise.all([upload("h", blob), upload("h", blob)]);
    expect(a).toBe("https://dl/url");
    expect(b).toBe("https://dl/url");
    expect(isCellKnownAvailable("h")).toBe(true);
    expect(authMocks.authStateReady).toHaveBeenCalledOnce();
  });

  it("does not attempt a canonical upload until Firebase auth is restored", async () => {
    authMocks.currentUser = null;

    await expect(
      upload("signed-out", new Blob(["w"], { type: "image/webp" }))
    ).resolves.toBeNull();

    const { uploadBytes } = await import("firebase/storage");
    expect(authMocks.authStateReady).toHaveBeenCalledOnce();
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("exposes positive availability without downloading the object", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isCellKnownAvailable("new-cell")).toBe(false);
    await upload("new-cell", new Blob(["w"], { type: "image/webp" }));
    expect(isCellKnownAvailable("new-cell")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
