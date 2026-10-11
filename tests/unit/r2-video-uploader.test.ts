import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authedFetch: vi.fn(),
  getUploadUrl: vi.fn(),
  startMultipart: vi.fn(),
  getPartUrl: vi.fn(),
  completeMultipart: vi.fn(),
  listParts: vi.fn(),
  deleteByPrefix: vi.fn(),
  showUserError: vi.fn(),
  isWeb: vi.fn(),
}));

vi.mock("$app/env", () => ({ dev: false }));
vi.mock("#lib/shared/platform/services/platform-detector.js", () => ({
  isWeb: mocks.isWeb,
}));
vi.mock("#lib/shared/auth/services/authed-fetch.js", () => ({
  authedFetch: mocks.authedFetch,
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthSync: () => ({
    currentUser: {
      uid: "firebase-user-1",
    },
  }),
}));
vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({
    showUserError: mocks.showUserError,
  }),
}));
vi.mock("#lib/shared/share/services/r2-presigner.js", () => ({
  getUploadUrl: mocks.getUploadUrl,
  startMultipart: mocks.startMultipart,
  getPartUrl: mocks.getPartUrl,
  completeMultipart: mocks.completeMultipart,
  listParts: mocks.listParts,
  deleteByPrefix: mocks.deleteByPrefix,
}));

import { R2VideoUploader } from "../../src/lib/shared/share/services/r2-video-uploader";

const UPLOAD_RESULT = {
  url:
    "https://pub-f5505ed75927471cb198c54336317370.r2.dev/" +
    "users/firebase-user-1/thumbnails/sequence-1/thumbnail.png",
  key: "users/firebase-user-1/thumbnails/sequence-1/thumbnail.png",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isWeb.mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("R2VideoUploader sequence thumbnails", () => {
  it("uses the authenticated first-party endpoint for deployed web clients", async () => {
    mocks.authedFetch.mockResolvedValueOnce(Response.json(UPLOAD_RESULT));
    const onProgress = vi.fn();
    const blob = new Blob(["thumbnail"], { type: "image/png" });

    const result = await new R2VideoUploader().uploadSequenceThumbnail(
      "sequence-1",
      blob,
      "png",
      { onProgress }
    );

    expect(result).toEqual(UPLOAD_RESULT);
    expect(mocks.authedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.authedFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/thumbnail?sequenceId=sequence-1");
    expect(init).toMatchObject({
      method: "POST",
      body: blob,
    });
    expect(new Headers(init.headers).get("Content-Type")).toBe("image/png");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(onProgress.mock.calls).toEqual([[0], [100]]);
    expect(mocks.getUploadUrl).not.toHaveBeenCalled();
  });

  it("retries a transient Worker failure and preserves the response contract", async () => {
    vi.useFakeTimers();
    mocks.authedFetch
      .mockResolvedValueOnce(
        new Response("Thumbnail upload failed", { status: 503 })
      )
      .mockResolvedValueOnce(Response.json(UPLOAD_RESULT));

    const upload = new R2VideoUploader().uploadSequenceThumbnail(
      "sequence-1",
      new Blob(["thumbnail"], { type: "image/png" }),
      "png"
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(upload).resolves.toEqual(UPLOAD_RESULT);
    expect(mocks.authedFetch).toHaveBeenCalledTimes(2);
  });

  it("times out and retries a first-party request that never settles", async () => {
    vi.useFakeTimers();
    mocks.authedFetch.mockImplementation(
      (_input: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("Expected an upload signal"));
            return;
          }
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        })
    );

    const upload = new R2VideoUploader()
      .uploadSequenceThumbnail(
        "sequence-1",
        new Blob(["thumbnail"], { type: "image/png" }),
        "png"
      )
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100_000);

    const error = await upload;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("TimeoutError");
    expect(mocks.authedFetch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry a caller error", async () => {
    mocks.authedFetch.mockResolvedValueOnce(
      new Response("Unsupported thumbnail type", { status: 415 })
    );

    await expect(
      new R2VideoUploader().uploadSequenceThumbnail(
        "sequence-1",
        new Blob(["thumbnail"], { type: "image/png" }),
        "png"
      )
    ).rejects.toThrow(
      "Thumbnail upload failed with status 415: Unsupported thumbnail type"
    );
    expect(mocks.authedFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps native shells on the presigned upload path", async () => {
    class SuccessfulXMLHttpRequest {
      upload = {
        onprogress: null as ((event: ProgressEvent) => void) | null,
        onload: null as (() => void) | null,
      };
      onload: (() => void) | null = null;
      status = 200;
      statusText = "OK";

      open() {}
      setRequestHeader() {}
      getResponseHeader() {
        return '"etag"';
      }
      send(body: Blob) {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: body.size,
          total: body.size,
        } as ProgressEvent);
        this.upload.onload?.();
        this.onload?.();
      }
      abort() {}
    }

    vi.stubGlobal("XMLHttpRequest", SuccessfulXMLHttpRequest);
    mocks.isWeb.mockReturnValue(false);
    mocks.getUploadUrl.mockResolvedValueOnce({
      presignedUrl: "https://uploads.example.com/thumbnail",
      publicUrl: "https://assets.example.com/thumbnail",
      key: "users/firebase-user-1/thumbnails/sequence-1/thumbnail.png",
    });

    const result = await new R2VideoUploader().uploadSequenceThumbnail(
      "sequence-1",
      new Blob(["thumbnail"], { type: "image/png" }),
      "png"
    );

    expect(result).toEqual({
      url: "https://assets.example.com/thumbnail",
      key: "users/firebase-user-1/thumbnails/sequence-1/thumbnail.png",
    });
    expect(mocks.getUploadUrl).toHaveBeenCalledTimes(1);
    expect(mocks.authedFetch).not.toHaveBeenCalled();
  });
});

describe("R2VideoUploader direct upload watchdog", () => {
  it("aborts and retries a PUT when no bytes move", async () => {
    vi.useFakeTimers();

    class HangingXMLHttpRequest {
      static instances: HangingXMLHttpRequest[] = [];

      upload = {
        onprogress: null,
        onload: null,
      };
      status = 0;
      statusText = "";
      aborted = false;

      constructor() {
        HangingXMLHttpRequest.instances.push(this);
      }

      open() {}
      setRequestHeader() {}
      getResponseHeader() {
        return null;
      }
      send() {}
      abort() {
        this.aborted = true;
      }
    }

    vi.stubGlobal("XMLHttpRequest", HangingXMLHttpRequest);
    mocks.getUploadUrl.mockResolvedValueOnce({
      presignedUrl: "https://uploads.example.com/object",
      publicUrl: "https://assets.example.com/object",
      key: "users/firebase-user-1/recordings/sequence-1/video.mp4",
    });

    const upload = new R2VideoUploader()
      .uploadPerformanceVideo(
        "sequence-1",
        new Blob(["video"], { type: "video/mp4" })
      )
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(110_000);

    const error = await upload;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Upload stalled: no progress for 30s"
    );
    expect(HangingXMLHttpRequest.instances).toHaveLength(3);
    expect(
      HangingXMLHttpRequest.instances.every((instance) => instance.aborted)
    ).toBe(true);
    expect(mocks.showUserError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up its watchdog when XMLHttpRequest.send throws", async () => {
    vi.useFakeTimers();

    class ThrowingXMLHttpRequest {
      upload = {
        onprogress: null,
        onload: null,
      };
      status = 0;
      statusText = "";

      open() {}
      setRequestHeader() {}
      getResponseHeader() {
        return null;
      }
      send() {
        throw new Error("send failed");
      }
      abort() {}
    }

    vi.stubGlobal("XMLHttpRequest", ThrowingXMLHttpRequest);
    mocks.getUploadUrl.mockResolvedValueOnce({
      presignedUrl: "https://uploads.example.com/object",
      publicUrl: "https://assets.example.com/object",
      key: "users/firebase-user-1/recordings/sequence-1/video.mp4",
    });

    await expect(
      new R2VideoUploader().uploadPerformanceVideo(
        "sequence-1",
        new Blob(["video"], { type: "video/mp4" })
      )
    ).rejects.toThrow("send failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
