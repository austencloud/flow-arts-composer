/**
 * Account ownership at the ACTUAL sending seam.
 *
 * The outbox-level tests in `message-delivery-account-ownership.test.ts` stop at
 * a fake coordinator, which is exactly the gap review found: the real
 * `MessageDeliveryCoordinator` awaits a short code and a prepared-attachment
 * persist before it calls the messenger, and the real `Messenger.sendMessage`
 * awaits the functions handle before dispatching a callable that runs as
 * whoever the SDK has signed in at that moment. Every one of those awaits can
 * outlive the account that queued the row.
 *
 * So this suite wires the real state, the real coordinator and the real
 * messenger together, and defers only the boundaries they cross: the functions
 * handle, the short-code mint, and the image upload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShortCodeManager } from "$lib/shared/qr/services/short-code-manager";
import type {
  IMessageImageSender,
  MessageImageSendHandle,
  MessageImageSendRequest,
} from "$lib/shared/messaging/services/contracts/IMessageImageSender";
// Relative, not `$test-helpers`: that alias exists only in the browser
// component config, not in the jsdom unit config.
import { MemoryDeliveryRepository } from "../../helpers/inbox/memory-delivery-repository";

const mocks = vi.hoisted(() => ({
  currentUid: "user-a" as string | null,
  functionsGate: null as Promise<void> | null,
  releaseFunctions: null as (() => void) | null,
  callable: vi.fn(async () => ({ data: { messageId: "message-1" } })),
  toastError: vi.fn(),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: async () => ({ name: "firestore" }),
  getFunctionsInstance: async () => {
    if (mocks.functionsGate) await mocks.functionsGate;
    return { name: "functions" };
  },
  getStorageInstance: async () => ({ name: "storage" }),
  getAuthInstance: async () => ({ currentUser: { uid: mocks.currentUid } }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mocks.callable),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  startAt: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  updateDoc: vi.fn(async () => undefined),
  onSnapshot: vi.fn(() => vi.fn()),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
  serverTimestamp: vi.fn(() => "server-timestamp"),
  Timestamp: { fromDate: vi.fn(), now: vi.fn() },
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get user() {
      return mocks.currentUid
        ? { uid: mocks.currentUid, displayName: "Austen", photoURL: null }
        : null;
    },
    initialized: true,
    loading: false,
  },
  getEffectiveUserId: () => mocks.currentUid,
}));

vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  userPreviewState: { isActive: false, data: {} },
  isPreviewReadOnly: () => false,
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: mocks.toastError,
  },
}));

import { messagingService } from "$lib/shared/messaging/services/messenger";
import { MessageDeliveryCoordinator } from "$lib/shared/inbox/services/implementations/MessageDeliveryCoordinator";
import { createMessageDeliveryState } from "$lib/shared/inbox/state/message-delivery-state.svelte";

/** Deferred short-code mint, the coordinator's first await for a sequence. */
function createShortCodeDouble() {
  let release: (() => void) | undefined;
  let gate: Promise<void> | null = null;
  const createShortCode = vi.fn(async () => {
    if (gate) await gate;
    return { code: "ABCD" };
  });
  return {
    manager: { createShortCode } as unknown as ShortCodeManager,
    createShortCode,
    hold() {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    open() {
      release?.();
      release = null;
      gate = null;
    },
  };
}

/**
 * Stands in for `MessageImageSender` at its contract: it reports progress while
 * uploading and exposes the cancel handle the real one uses to stop before its
 * committing `finalizeMessageImage` call.
 */
function createImageSenderDouble() {
  const cancel = vi.fn();
  let emitProgress: (() => void) | undefined;
  let finish: (() => void) | undefined;
  const finalized = vi.fn();
  const sender: IMessageImageSender = {
    send(request: MessageImageSendRequest): MessageImageSendHandle {
      let cancelled = false;
      const uploaded = new Promise<void>((resolve) => {
        finish = resolve;
      });
      emitProgress = () =>
        request.onProgress?.({ phase: "uploading", fraction: 0.5 });
      const promise = (async () => {
        await uploaded;
        // The real sender checks its cancelled flag here, before the callable
        // that commits the message.
        if (cancelled) throw new Error("Image send cancelled.");
        finalized();
        return {
          messageId: request.messageId,
          storagePath: "message-images/x.webp",
          width: 10,
          height: 10,
        };
      })();
      return {
        promise,
        cancel() {
          cancelled = true;
          cancel();
        },
      };
    },
  };
  return {
    sender,
    cancel,
    finalized,
    progress: () => emitProgress?.(),
    finishUpload: () => finish?.(),
  };
}

function setup(options: { imageSender?: IMessageImageSender } = {}) {
  const repository = new MemoryDeliveryRepository();
  const shortCode = createShortCodeDouble();
  const state = createMessageDeliveryState({
    repository,
    coordinator: new MessageDeliveryCoordinator(
      messagingService,
      options.imageSender ?? createImageSenderDouble().sender,
      shortCode.manager
    ),
    isOnline: () => true,
    now: () => 1_000,
    createId: () => "message-1",
  });
  return { repository, state, shortCode };
}

function holdFunctions(): void {
  mocks.functionsGate = new Promise<void>((resolve) => {
    mocks.releaseFunctions = resolve;
  });
}

async function releaseFunctions(): Promise<void> {
  mocks.releaseFunctions?.();
  mocks.releaseFunctions = null;
  mocks.functionsGate = null;
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("account ownership at the real sending seam", () => {
  beforeEach(() => {
    mocks.currentUid = "user-a";
    mocks.functionsGate = null;
    mocks.releaseFunctions = null;
    mocks.callable.mockClear();
    mocks.toastError.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses to dispatch when the account changed across the functions handle", async () => {
    const { repository, state } = setup();
    await state.activate("user-a");

    // The real Messenger.sendMessage has already captured user-a and is parked
    // on getFunctionsInstance().
    holdFunctions();
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Only the first account may send this",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    mocks.currentUid = "user-b";
    await state.activate("user-b");
    await releaseFunctions();

    // The callable is the network. It runs as the SDK's current auth, so
    // reaching it at all would post this message from the wrong account.
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(repository.outbox.get("message-1")).toMatchObject({
      userId: "user-a",
      status: "queued",
      attemptCount: 0,
    });
    state.dispose();
  });

  it("stops a sequence send whose account changed while its share code was minting", async () => {
    const { repository, state, shortCode } = setup();
    await state.activate("user-a");

    shortCode.hold();
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Shared sequence",
      attachment: {
        type: "sequence",
        payload: {
          sequence: { id: "sequence-1", word: "AB", steps: [] },
          sequenceId: "sequence-1",
          sequenceWord: "AB",
        },
      } as never,
    });
    await vi.waitFor(() =>
      expect(shortCode.createShortCode).toHaveBeenCalled()
    );

    mocks.currentUid = "user-b";
    await state.activate("user-b");
    shortCode.open();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.callable).not.toHaveBeenCalled();
    const durable = repository.outbox.get("message-1");
    expect(durable).toMatchObject({
      userId: "user-a",
      status: "queued",
      attemptCount: 0,
    });
    // The code was already minted, so it stays on the row rather than being
    // thrown away and minted a second time on the next attempt.
    expect(durable?.preparedAttachments?.length).toBe(1);
    expect(shortCode.createShortCode).toHaveBeenCalledTimes(1);
    state.dispose();
  });

  it("cancels an image upload whose account changed, before it can be finalized", async () => {
    const image = createImageSenderDouble();
    const { repository, state } = setup({ imageSender: image.sender });
    await state.activate("user-a");

    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Photo",
      attachment: {
        type: "image",
        file: new File(["x"], "x.webp", { type: "image/webp" }),
        messageId: "message-1",
        attachmentId: "attachment-1",
      } as never,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    mocks.currentUid = "user-b";
    await state.activate("user-b");

    // Progress is the only signal the coordinator gets while an upload runs.
    image.progress();
    image.finishUpload();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(image.cancel).toHaveBeenCalled();
    expect(image.finalized).not.toHaveBeenCalled();
    expect(repository.outbox.get("message-1")).toMatchObject({
      userId: "user-a",
      status: "queued",
      attemptCount: 0,
    });
    state.dispose();
  });

  it("never rolls back a send the network already accepted", async () => {
    const { repository, state } = setup();
    await state.activate("user-a");

    holdFunctions();
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Committed",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Released while user-a is still signed in, so the callable goes out.
    await releaseFunctions();
    await vi.waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(1));

    // Only afterwards does the account change.
    mocks.currentUid = "user-b";
    await state.activate("user-b");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.callable).toHaveBeenCalledTimes(1);
    expect(repository.outbox.get("message-1")).toMatchObject({
      userId: "user-a",
      status: "sent",
    });
    state.dispose();
  });
});
