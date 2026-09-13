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
  deleteGate: null as Promise<void> | null,
  releaseDelete: null as (() => void) | null,
  finalizeCallable: vi.fn(async () => ({
    data: {
      messageId: "message-1",
      storagePath: "message-images/x.webp",
      width: 10,
      height: 10,
    },
  })),
  uploadStarted: vi.fn(),
  uploadDenied: vi.fn(),
  deleteDenied: vi.fn(),
  /** Objects currently in the bucket, by full path. */
  objects: new Set<string>(),
  task: null as UploadTaskDouble | null,
}));

/**
 * `storage.rules:252-263` for `message-image-staging/{userId}/…`:
 * `create` only when `resource == null` and the signed-in uid equals the uid in
 * the path; `delete` only for that same uid; `update` never. A double that
 * always resolves `deleteObject` hides both halves of this — the denial after
 * an account switch, and the create that the leftover object then blocks.
 */
function uidInPath(path: string): string | undefined {
  return path.split("/")[1];
}

function storageError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

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
  deleteObject: vi.fn(async (storageRef: { path: string }) => {
    // One-shot: a test parks the pre-upload cleanup without also parking the
    // cleanup in the sender's `finally`.
    const gate = mocks.deleteGate;
    if (gate) {
      mocks.deleteGate = null;
      await gate;
    }
    if (uidInPath(storageRef.path) !== mocks.currentUid) {
      mocks.deleteDenied(storageRef.path);
      throw storageError("storage/unauthorized");
    }
    if (!mocks.objects.has(storageRef.path)) {
      throw storageError("storage/object-not-found");
    }
    mocks.objects.delete(storageRef.path);
  }),
  uploadBytesResumable: vi.fn((storageRef: { path: string }) => {
    // `resource == null` is part of the create rule: a leftover object makes
    // the retry a permission failure, not an overwrite.
    if (mocks.objects.has(storageRef.path)) {
      mocks.uploadDenied(storageRef.path);
      const denied = {
        on(
          _event: string,
          _onNext: unknown,
          onError: (reason: unknown) => void
        ) {
          onError(storageError("storage/unauthorized"));
        },
        cancel: vi.fn(),
      };
      return denied;
    }
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
      complete: () => {
        // A completed upload leaves the object in the bucket.
        mocks.objects.add(storageRef.path);
        complete?.();
      },
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

/** Park the next `deleteObject` — the sender's pre-upload slot clearing. */
function holdNextDelete(): void {
  mocks.deleteGate = new Promise<void>((resolve) => {
    mocks.releaseDelete = resolve;
  });
}

async function releaseDelete(): Promise<void> {
  mocks.releaseDelete?.();
  mocks.releaseDelete = null;
  await settle();
}

describe("MessageImageSender account ownership", () => {
  beforeEach(() => {
    mocks.currentUid = "user-a";
    mocks.initGate = null;
    mocks.releaseInit = null;
    mocks.deleteGate = null;
    mocks.releaseDelete = null;
    mocks.task = null;
    mocks.finalizeCallable.mockClear();
    mocks.uploadStarted.mockClear();
    mocks.uploadDenied.mockClear();
    mocks.deleteDenied.mockClear();
    mocks.objects.clear();
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
    // Its own account is still signed in, so the staging object is cleaned up
    // rather than left behind.
    expect(mocks.objects.size).toBe(0);
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

  it("recovers when the owner signs back in after a denied cleanup", async () => {
    const stagingPath =
      "message-image-staging/user-a/conversation-1/message-1/attachment-1";

    // The account switches mid-upload. The sender refuses to finalize, and its
    // own cleanup cannot run: deleting this path is allowed only for user-a.
    const abandoned = new MessageImageSender().send(request());
    await settle();
    mocks.task?.emitProgress(0.5);
    mocks.currentUid = "user-b";
    mocks.task?.complete();

    const error = (await abandoned.promise.catch(
      (reason: unknown) => reason
    )) as { code?: string };
    expect(error.code).toBe("messaging/sender-changed");
    expect(mocks.finalizeCallable).not.toHaveBeenCalled();
    // Left behind on purpose, not silently "cleaned up": a delete as the wrong
    // account would be denied, so the sender does not even attempt it.
    expect(mocks.objects.has(stagingPath)).toBe(true);
    expect(mocks.deleteDenied).not.toHaveBeenCalled();

    // user-a signs back in and the outbox retries the same row — same message,
    // same attachment, so the same staging path. The create rule requires
    // `resource == null`, so without clearing the slot first this retry is a
    // permission failure and the image can never be sent.
    mocks.currentUid = "user-a";
    const retry = new MessageImageSender().send(request());
    await settle();
    mocks.task?.complete();

    await expect(retry.promise).resolves.toMatchObject({
      messageId: "message-1",
    });
    expect(mocks.uploadDenied).not.toHaveBeenCalled();
    expect(mocks.finalizeCallable).toHaveBeenCalledTimes(1);
    // And the successful attempt cleans up after itself.
    expect(mocks.objects.has(stagingPath)).toBe(false);
  });

  it("starts no upload when cancelled during the pre-upload cleanup", async () => {
    // The cleanup is an await, and during it there is no upload task yet for
    // `cancel()` to reach — so only a re-check on the far side can stop the
    // upload from starting anyway.
    holdNextDelete();
    const handle = new MessageImageSender().send(request());
    await settle();

    handle.cancel();
    await releaseDelete();

    // Asserted before awaiting the promise: an upload that should not exist
    // never completes in this harness, so waiting first would turn a started
    // upload into a timeout instead of a failed expectation.
    expect(mocks.uploadStarted).not.toHaveBeenCalled();

    const error = (await handle.promise.catch((reason: unknown) => reason)) as
      | Error
      | undefined;
    expect(error?.message).toBe("Image send cancelled.");
    expect(mocks.finalizeCallable).not.toHaveBeenCalled();
  });

  it("starts no upload when the account changes during the pre-upload cleanup", async () => {
    holdNextDelete();
    const handle = new MessageImageSender().send(request());
    await settle();

    mocks.currentUid = "user-b";
    await releaseDelete();

    // Not one byte uploaded into the first account's path by the second — and
    // asserted before the await, for the same reason as above.
    expect(mocks.uploadStarted).not.toHaveBeenCalled();

    const error = (await handle.promise.catch((reason: unknown) => reason)) as {
      code?: string;
    };
    expect(error.code).toBe("messaging/sender-changed");
    expect(mocks.finalizeCallable).not.toHaveBeenCalled();
    // Exactly one denial, and it is the pre-upload cleanup itself: the switch
    // landed while that request was in flight, so it was evaluated against the
    // new account. What must not happen is a SECOND, pointless denied attempt
    // from the `finally` on the way out.
    expect(mocks.deleteDenied).toHaveBeenCalledTimes(1);
  });
});
