// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { THUMBNAIL_RENDERER_VERSION } from "#lib/shared/browse/services/thumbnail-key-deriver.js";

const mocks = vi.hoisted(() => {
  const auth = {
    authStateReady: vi.fn(),
    currentUser: null as { uid: string } | null,
  };

  return {
    auth,
    getAuthInstance: vi.fn(),
    ensureGuestIdentity: vi.fn(),
    getStorageInstance: vi.fn(),
    ref: vi.fn(),
    uploadBytes: vi.fn(),
    getDownloadURL: vi.fn(),
  };
});

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: mocks.getAuthInstance,
  getStorageInstance: mocks.getStorageInstance,
}));

vi.mock("#lib/shared/auth/services/guest-identity.js", () => ({
  ensureGuestIdentity: mocks.ensureGuestIdentity,
}));

vi.mock("firebase/storage", () => ({
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
  getDownloadURL: mocks.getDownloadURL,
}));

import {
  clearMemoryCache,
  getStoragePath,
  getUrl,
  markMissing,
  upload,
  type CloudThumbnailKey,
} from "#lib/shared/browse/services/cloud-thumbnail-cache.js";

const key: CloudThumbnailKey = {
  sequenceName: "AAAA",
  sequenceId: "sequence-1",
  propType: PropType.CLUB,
  lightMode: false,
  variant: "gallery",
  rendererVersion: THUMBNAIL_RENDERER_VERSION,
};

beforeEach(() => {
  clearMemoryCache(true);
  localStorage.clear();
  mocks.auth.currentUser = null;
  mocks.auth.authStateReady.mockResolvedValue(undefined);
  mocks.ensureGuestIdentity.mockResolvedValue(undefined);
  mocks.getAuthInstance.mockResolvedValue(mocks.auth);
  mocks.getStorageInstance.mockResolvedValue({ bucket: "test" });
  mocks.ref.mockReturnValue({ fullPath: "thumbnail.webp" });
  mocks.uploadBytes.mockResolvedValue({});
  mocks.getDownloadURL.mockResolvedValue("https://storage.test/thumbnail.webp");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("cloud-thumbnail-cache upload authorization", () => {
  it("mints a guest identity before deciding whether it can upload", async () => {
    mocks.ensureGuestIdentity.mockImplementationOnce(async () => {
      mocks.auth.currentUser = { uid: "guest-1" };
    });

    const url = await upload(key, new Blob(["webp"], { type: "image/webp" }));

    expect(url).toBe("https://storage.test/thumbnail.webp");
    expect(mocks.ensureGuestIdentity).toHaveBeenCalledWith("thumbnail_upload");
    expect(mocks.uploadBytes).toHaveBeenCalledOnce();
    expect(mocks.ensureGuestIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.uploadBytes.mock.invocationCallOrder[0]!
    );
  });

  it("stays silent when the guest provider cannot mint an identity", async () => {
    // ensureGuestIdentity swallows provider failures, so it resolves while
    // currentUser stays null. The upload must still not be attempted.
    mocks.ensureGuestIdentity.mockResolvedValueOnce(undefined);

    const url = await upload(key, new Blob(["webp"], { type: "image/webp" }));

    expect(url).toBeNull();
    expect(mocks.ensureGuestIdentity).toHaveBeenCalledOnce();
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });

  it("does not send an upload when the settled auth state is signed out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await upload(
      { ...key, sequenceId: "signed-out" },
      new Blob(["thumbnail"], { type: "image/webp" })
    );

    expect(result).toBeNull();
    expect(mocks.auth.authStateReady).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getStorageInstance).not.toHaveBeenCalled();
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });

  it("waits for restored auth before uploading a missing thumbnail", async () => {
    mocks.auth.authStateReady.mockImplementationOnce(async () => {
      mocks.auth.currentUser = { uid: "user-1" };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await upload(
      { ...key, sequenceId: "restored-user" },
      new Blob(["thumbnail"], { type: "image/webp" })
    );

    expect(result).toBe("https://storage.test/thumbnail.webp");
    expect(mocks.auth.authStateReady).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.uploadBytes).toHaveBeenCalledOnce();
    expect(mocks.auth.authStateReady.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.uploadBytes.mock.invocationCallOrder[0]!
    );
  });
});

describe("cloud-thumbnail-cache renderer versioning", () => {
  it("folds the renderer version into the storage filename", () => {
    expect(getStoragePath(key)).toBe(
      "thumbnails/gallery/club/AAAA_sequence-1_r6_dark.webp"
    );
  });
});

describe("cloud-thumbnail-cache missing-object memory", () => {
  it("can skip the speculative probe for an unknown thumbnail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await getUrl({ ...key, sequenceId: "quiet-unknown" }, Infinity, {
        probeUnknown: false,
      })
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a confirmed 404 override a previously confirmed positive entry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const missingKey = { ...key, sequenceId: "deleted-after-confirmation" };

    const initialUrl = await getUrl(missingKey);
    markMissing(missingKey);
    const after404 = await getUrl(missingKey);

    expect(initialUrl).toContain("deleted-after-confirmation");
    expect(after404).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not poison the missing-object cache for retryable HTTP failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const retryableKey = { ...key, sequenceId: "retryable-server-error" };

    expect(await getUrl(retryableKey)).toBeNull();
    expect(await getUrl(retryableKey)).toContain("retryable-server-error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("replaces stale persisted positives with the freshly loaded manifest", async () => {
    clearMemoryCache(true);
    localStorage.setItem(
      "tka-cloud-thumbnails",
      JSON.stringify({
        keys: ["gallery/club/AAAA_stale-persisted_dark"],
        timestamp: Date.now(),
      })
    );

    vi.resetModules();
    const freshCache =
      await import("#lib/shared/browse/services/cloud-thumbnail-cache.js");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: ["gallery/club/BBBB_fresh-manifest_dark"],
          generated: new Date().toISOString(),
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    await freshCache.loadManifest();
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "manifest.json?alt=media&v=3"
    );
    const staleResult = await freshCache.getUrl({
      ...key,
      sequenceId: "stale-persisted",
    });

    expect(staleResult).toBeNull();
    // The stale positive no longer short-circuits to a download URL. It takes
    // one metadata probe, which records the key in the existing negative cache.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
