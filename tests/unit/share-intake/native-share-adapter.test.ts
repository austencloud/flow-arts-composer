import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

vi.mock("$app/env", () => ({ browser: true }));

// vi.mock() factories are hoisted above every top-level statement, including
// plain `const` declarations in this file. A factory that DEREFERENCES a later
// `const` throws "Cannot access '<name>' before initialization" the first time
// the mocked module loads. vi.hoisted() hoists these alongside the mock
// registrations. Same fix as share-intake-runner.test.ts.
const { listeners, bumpIntakeSignal, toast, consumeLaunchShortcutId } = vi.hoisted(() => ({
  listeners: {} as Record<string, (event: unknown) => void>,
  bumpIntakeSignal: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn() },
  consumeLaunchShortcutId: vi.fn(async () => null as string | null),
}));

vi.mock("@capgo/capacitor-share-target", () => ({
  CapacitorShareTarget: {
    addListener: vi.fn((name: string, cb: (event: unknown) => void) => {
      listeners[name] = cb;
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    convertFileSrc: vi.fn((p: string) => `https://localhost/f${p}`),
  },
}));

vi.mock("#lib/shared/share-intake/state/share-intake-signal.svelte.js", () => ({
  bumpIntakeSignal: () => bumpIntakeSignal(),
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({ toast }));

vi.mock("#lib/shared/share-intake/services/sharing-shortcuts-publisher.js", () => ({
  consumeLaunchShortcutId,
}));

import {
  registerNativeShareTarget,
  whenIdle,
} from "#lib/shared/share-intake/services/native-share-adapter.js";
import {
  listIntakes,
  deleteIntake,
} from "#lib/shared/share-intake/services/intake-store.js";

// jsdom (as pinned in this repo, v27.4.0) does not implement Blob/File's
// spec-required arrayBuffer() method (jsdom/jsdom#2555). putIntake calls it, so
// without this every persisted record here would throw. Polyfilled via
// FileReader, which jsdom DOES implement.
if (typeof File.prototype.arrayBuffer !== "function") {
  File.prototype.arrayBuffer = function (this: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const EVENT = {
  title: "Share",
  texts: [],
  files: [{ uri: "/cache/a.png", name: "a.png", mimeType: "image/png" }],
};

function bodyOf(bytes: number) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

function fire(event: unknown): void {
  const listener = listeners.shareReceived;
  if (!listener) throw new Error("shareReceived listener was never registered");
  listener(event);
}

/**
 * Deliver an event and wait for it to be FULLY handled.
 *
 * `await listeners.shareReceived(EVENT)` is not that: the listener is
 * fire-and-forget (`void handleShareReceived(...)`), so awaiting it yields one
 * microtask while the real work spans a fetch chain plus fake-indexeddb
 * macrotask round trips. Every assertion after it raced. whenIdle() awaits the
 * handler's own promise.
 */
async function deliver(event: unknown): Promise<void> {
  fire(event);
  await whenIdle();
}

describe("native share adapter", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
    bumpIntakeSignal.mockClear();
    consumeLaunchShortcutId.mockReset();
    consumeLaunchShortcutId.mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => bodyOf(3)));
    await registerNativeShareTarget();
  });

  it("persists a received share and signals the host", async () => {
    await deliver(EVENT);

    const all = await listIntakes();
    expect(all).toHaveLength(1);
    expect(all[0]?.files[0]?.name).toBe("a.png");
    expect(all[0]?.status).toBe("received");
    // The adapter signals; it never routes. Routing needs the app shell.
    expect(bumpIntakeSignal).toHaveBeenCalledTimes(1);
  });

  it("never imports the runner", async () => {
    // Structural, not behavioural: importing the runner here is what let an
    // earlier revision route a share from the native boot path.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/lib/shared/share-intake/services/native-share-adapter.ts",
      "utf8"
    );
    expect(source).not.toContain("share-intake-runner");
  });

  it("collapses the cold-launch double delivery into one record", async () => {
    await deliver(EVENT);
    await deliver({ ...EVENT });

    expect(await listIntakes()).toHaveLength(1);
  });

  it("collapses it even when both deliveries land before the first bridge resolves", async () => {
    // The real cold-launch shape: Capacitor replays both retained events back
    // to back, long before any fetch settles. An await-then-check dedup lets
    // BOTH through.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return bodyOf(3);
      })
    );

    fire(EVENT);
    fire({ ...EVENT });
    release();
    await whenIdle();

    expect(await listIntakes()).toHaveLength(1);
  });

  it("keeps two same-named screenshots apart via the bridged byte size", async () => {
    // The plugin's SharedFile has no size field, so a descriptor-only key makes
    // these two identical and silently swallows the second. They also share a
    // cache path, because copyFileToCache overwrites - which is why the SIZE,
    // not the uri, is what separates them.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(bodyOf(11))
      .mockResolvedValueOnce(bodyOf(22));
    vi.stubGlobal("fetch", fetchMock);

    const shot = {
      title: "",
      texts: [],
      files: [
        {
          uri: "/cache/shared_files/Screenshot.png",
          name: "Screenshot.png",
          mimeType: "image/png",
        },
      ],
    };
    await deliver(shot);
    await deliver({ ...shot });

    expect(await listIntakes()).toHaveLength(2);
  });

  it("keeps two simultaneous content:// deliveries apart via the in-flight uri", async () => {
    // getFileData falls back to uri.toString() when copyFileToCache returns
    // null (CapacitorShareTargetPlugin.java:114). Those content:// uris DO
    // differ per share. Two arriving at once with the same display name would
    // produce the SAME name+mime key, so a uri-less in-flight key drops the
    // second at the door - before the bridge can discover their sizes differ.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(bodyOf(11)).mockResolvedValueOnce(bodyOf(22))
    );

    fire({
      title: "",
      texts: [],
      files: [{ uri: "content://media/1", name: "IMG.png", mimeType: "image/png" }],
    });
    fire({
      title: "",
      texts: [],
      files: [{ uri: "content://media/2", name: "IMG.png", mimeType: "image/png" }],
    });
    await whenIdle();

    expect(await listIntakes()).toHaveLength(2);
    expect(bumpIntakeSignal).toHaveBeenCalledTimes(2);
  });

  it("records a bridge failure on the intake instead of dropping the file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    );

    await deliver(EVENT);

    const [record] = await listIntakes();
    expect(record?.problems).toContainEqual(
      expect.objectContaining({ name: "a.png", reason: "not-found" })
    );
  });

  it("records a ClipData-style empty share as failed rather than returning silently", async () => {
    await deliver({ title: "Share", texts: [], files: [] });

    const [record] = await listIntakes();
    // "TKA opens but receives nothing" is the exact symptom the device matrix
    // is hunting. A bare return makes it invisible.
    expect(record?.status).toBe("failed");
    expect(bumpIntakeSignal).not.toHaveBeenCalled();
  });

  it("registration does not wait on a grace period", async () => {
    // Every share-LESS cold boot used to pay 300 ms here, because with no
    // share only the timer could settle the race.
    const started = Date.now();
    await registerNativeShareTarget();
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("stamps the tapped conversation onto the record", async () => {
    consumeLaunchShortcutId.mockResolvedValueOnce("conv_paul");

    await deliver(EVENT);

    const [record] = await listIntakes();
    expect(record?.targetConversationId).toBe("conv_paul");
  });

  it("leaves the field unset for an ordinary share", async () => {
    consumeLaunchShortcutId.mockResolvedValueOnce(null);

    await deliver(EVENT);

    const [record] = await listIntakes();
    expect(record?.targetConversationId).toBeUndefined();
  });

  it("reads the shortcut id once per delivery, not once per retained event", async () => {
    consumeLaunchShortcutId.mockResolvedValue("conv_paul");

    // The cold-launch double fire. The in-flight key already collapses these to
    // one intake; the shortcut read must not run twice either, because the
    // native side nulls the extra on first read and the second would get null.
    fire(EVENT);
    fire({ ...EVENT });
    await whenIdle();

    expect(consumeLaunchShortcutId).toHaveBeenCalledTimes(1);
  });
});
