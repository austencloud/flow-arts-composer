/**
 * Account ownership inside the REAL `MessageImageSender`.
 *
 * The sending-seam suite proved the coordinator stops handing rows over, but it
 * used a double that never emitted the `finalizing` phase — so it could not see
 * the sender's own ordering: the cancelled flag was checked BEFORE
 * `onProgress({ phase: "finalizing" })` and never again, while the callable
 * that commits the message runs after it. A cancellation raised from that
 * callback, which is exactly where the coordinator raises one, arrived too late.
 *
 * The sender also reads `auth.currentUser` only after awaiting Firebase init,
 * and builds its staging path from that uid.
 *
 * These drive the real class with the storage/functions/auth SDK deferred, in
 * the real order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MessageImageSendHandle,
  MessageImageSendRequest,
} from "$lib/shared/messaging/services/contracts/IMessageImageSender";

interface UploadTaskDouble {
  emitProgress: (fraction: number) => void;
  complete: () => void;
  fail: (error: unknown) => void;
  cancel: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  currentUid: "user-a" as string | null,
  initGate: null as Promise<void> | null,
  releaseInit: null as (() => void) | null,
  finalizeCallable: vi.fn(async () => ({
    data: {
      messageId: "message-1",
      storagePath: "message-images/x.webp",
      width: 10,
      height: 10,
    },
  })),
  uploadStarted: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
  task: null as UploadTaskDouble | null,
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: async () => {
    if (mocks.initGate) await mocks.initGate;
    return {
      get currentUser() {
        return mocks.currentUid
          ? { uid: mocks.currentUid, isAnonymous: false }
          : null;
      },
    };
  },
  getStorageInstance: async () => ({ name: "storage" }),
  getFunctionsInstance: async () => ({ name: "functions" }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mocks.finalizeCallable),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  deleteObject: mocks.deleteObject,
  uploadBytesResumable: vi.fn((storageRef: { path: string }) => {
    mocks.uploadStarted(storageRef.path);
    let next: ((snapshot: unknown) => void) | undefined;
    let error: ((reason: unknown) => void) | undefined;
    let complete: (() => void) | undefined;
    const task = {
      on(
        _event: string,
        onNext: (snapshot: unknown) => void,
        onError: (reason: unknown) => void,
        onComplete: () => void
      ) {
        next = onNext;
        error = onError;
        complete = onComplete;
      },
      cancel: vi.fn(),
    };
    mocks.task = {
      emitProgress: (fraction: number) =>
        next?.({ bytesTransferred: fraction * 100, totalBytes: 100 }),
      complete: () => complete?.(),
      fail: (reason: unknown) => error?.(reason),
      cancel: task.cancel,
    };
    return task;
  }),
}));

import { MessageImageSender } from "$lib/shared/messaging/services/implementations/MessageImageSender";

function request(
  overrides: Partial<MessageImageSendRequest> = {}
): MessageImageSendRequest {
  return {
    conversationId: "conversation-1",
    messageId: "message-1",
    attachmentId: "attachment-1",
    file: new File(["x"], "x.webp", { type: "image/webp" }),
    content: "Photo",
    expectedUserId: "user-a",
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function holdInit(): void {
  mocks.initGate = new Promise<void>((resolve) => {
    mocks.releaseInit = resolve;
  });
}

async function releaseInit(): Promise<void> {
  mocks.releaseInit?.();
  mocks.releaseInit = null;
  mocks.initGate = null;
  await settle();
}

describe("MessageImageSender account ownership", () => {
  beforeEach(() => {
    mocks.currentUid = "user-a";
    mocks.initGate = null;
    mocks.releaseInit = null;
    mocks.task = null;
    mocks.finalizeCallable.mockClear();
    mocks.uploadStarted.mockClear();
    mocks.deleteObject.mockClear();
  });

  it("refuses to stage under an account that did not queue the send", async () => {
    holdInit();
    const handle = new MessageImageSender().send(request());
    const settled = handle.promise.catch((error: unknown) => error);

    // The account changes while Firebase is still initializing — before the
    // sender reads currentUser and builds its staging path from it.
    mocks.currentUid = "user-b";
    await releaseInit();

    const error = (await settled) as { code?: string };
    expect(error.code).toBe("messaging/sender-changed");
    expect(mocks.uploadStarted).not.toHaveBeenCalled();
    expect(mocks.finalizeCallable).not.toHaveBeenCalled();
  });

  it("stages under the expected account when it is still signed in", async () => {
    const handle = new MessageImageSender().send(request());
    await settle();
    mocks.task?.complete();
    await handle.promise;

    expect(mocks.uploadStarted).toHaveBeenCalledWith(
      "message-image-staging/user-a/conversation-1/message-1/attachment-1"
    );
    expect(mocks.finalizeCallable).toHaveBeenCalledTimes(1);
  });

  it("does not finalize a send cancelled from the finalizing callback", async () => {
    // The real order: the sender emits `finalizing` and then commits. A caller
    // that cancels when it sees that phase — which is what the delivery
    // coordinator does — must still stop the commit.
    let handle: MessageImageSendHandle | undefined;
    handle = new MessageImageSender().send(
      request({
        onProgress: (progress) => {
          if (progress.phase === "finalizing") handle?.cancel();
        },
      })
    );
    await settle();
    mocks.task?.complete();

    const error = (await handle.promise.catch((reason: unknown) => reason)) as
      | Error
      | undefined;
    expect(error?.message).toBe("Image send cancelled.");
    expect(mocks.finalizeCallable).not.toHaveBeenCalled();
    // The staging object is cleaned up rather than left behind.
    expect(mocks.deleteObject).toHaveBeenCalled();
  });

  it("does not finalize when the account changed during the upload", async () => {
    const handle = new MessageImageSender().send(request());
    await settle();
    mocks.task?.emitProgress(0.5);

    mocks.currentUid = "user-b";
    mocks.task?.complete();

    const error = (await handle.promise.catch((reason: unknown) => reason)) as {
      code?: string;
    };
    expect(error.code).toBe("messaging/sender-changed");
    expect(mocks.finalizeCallable).not.toHaveBeenCalled();
  });

  it("does not take back a finalize that is already away", async () => {
    let releaseFinalize: (() => void) | undefined;
    mocks.finalizeCallable.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFinalize = resolve;
      });
      return {
        data: {
          messageId: "message-1",
          storagePath: "message-images/x.webp",
          width: 10,
          height: 10,
        },
      };
    });

    const handle = new MessageImageSender().send(request());
    await settle();
    mocks.task?.complete();
    await settle();
    expect(mocks.finalizeCallable).toHaveBeenCalledTimes(1);

    // Cancelling now is honest about being too late: the send is committed.
    handle.cancel();
    mocks.currentUid = "user-b";
    releaseFinalize?.();

    await expect(handle.promise).resolves.toMatchObject({
      messageId: "message-1",
    });
  });
});
