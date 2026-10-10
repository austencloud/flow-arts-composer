import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// The repo's app-environment stub exports browser=false; the store no-ops
// under that, so every test here would trivially "pass" against nothing.
vi.mock("$app/env", () => ({ browser: true }));

import {
  putIntake,
  getIntake,
  listIntakes,
  updateStatus,
  deleteIntake,
  reapExpired,
  INTAKE_TTL_MS,
  NEEDS_AUTH_TTL_MS,
  MAX_INTAKE_STORE_BYTES,
} from "#lib/shared/share-intake/services/intake-store.js";
import type { SharedIntake } from "#lib/shared/share-intake/domain/share-intake-models.js";

// jsdom (as pinned in this repo, v27.4.0) does not implement Blob/File's
// spec-required arrayBuffer() method (jsdom/jsdom#2555). Polyfilled locally
// via FileReader, which jsdom DOES implement, so the assertions below exercise
// the real spec method name instead of a jsdom-specific workaround.
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

function intake(overrides: Partial<SharedIntake> = {}): SharedIntake {
  return {
    receiptId: "si_abc",
    source: "native",
    files: [new File([new Uint8Array([1, 2])], "a.png", { type: "image/png" })],
    text: undefined,
    title: undefined,
    status: "received",
    receivedAt: Date.now(),
    problems: [],
    ...overrides,
  };
}

function bigIntake(receiptId: string, bytes: number, overrides: Partial<SharedIntake> = {}) {
  return intake({
    receiptId,
    files: [new File([new Uint8Array(bytes)], `${receiptId}.png`, { type: "image/png" })],
    ...overrides,
  });
}

describe("intake-store", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
  });

  it("round-trips a record and rebuilds a real File from the stored bytes", async () => {
    await putIntake(intake());

    const got = await getIntake("si_abc");

    expect(got?.files[0]).toBeInstanceOf(File);
    expect(got?.files[0].name).toBe("a.png");
    expect(got?.files[0].type).toBe("image/png");
    expect(got?.files[0].size).toBe(2);
    expect(new Uint8Array(await got!.files[0].arrayBuffer())).toEqual(
      new Uint8Array([1, 2])
    );
  });

  it("round-trips the problem list", async () => {
    await putIntake(
      intake({ problems: [{ name: "b.heic", reason: "unsupported-type" }] })
    );

    const got = await getIntake("si_abc");

    expect(got?.problems).toEqual([{ name: "b.heic", reason: "unsupported-type" }]);
  });

  it("does not delete on read", async () => {
    await putIntake(intake());
    await getIntake("si_abc");
    expect(await getIntake("si_abc")).not.toBeNull();
  });

  it("is idempotent on a duplicate receiptId", async () => {
    await putIntake(intake());
    await putIntake(intake());
    expect(await listIntakes()).toHaveLength(1);
  });

  it("updates status in place", async () => {
    await putIntake(intake());
    await updateStatus("si_abc", "needs-auth");
    expect((await getIntake("si_abc"))?.status).toBe("needs-auth");
  });

  it("appends problems on a status update rather than replacing them", async () => {
    await putIntake(intake({ problems: [{ name: "a", reason: "too-large" }] }));

    await updateStatus("si_abc", "partially-sent", [
      { name: "b", reason: "send-dropped" },
    ]);

    expect((await getIntake("si_abc"))?.problems).toEqual([
      { name: "a", reason: "too-large" },
      { name: "b", reason: "send-dropped" },
    ]);
  });

  it("rejects a status update for a record that is gone", async () => {
    // Silently succeeding here hid a real bug: the runner would report an
    // intake advanced that no longer existed.
    await expect(updateStatus("si_missing", "ready")).rejects.toThrow(/si_missing/);
  });

  it("reaps records past the one-hour TTL and keeps fresh ones", async () => {
    await putIntake(intake({ receiptId: "si_old", receivedAt: Date.now() - INTAKE_TTL_MS - 1 }));
    await putIntake(intake({ receiptId: "si_new" }));

    expect(await reapExpired()).toBe(1);
    expect(await getIntake("si_old")).toBeNull();
    expect(await getIntake("si_new")).not.toBeNull();
  });

  it("does NOT reap a needs-auth record at the one-hour mark", async () => {
    // This is the whole reason the store exists: a share that must outlive a
    // sign-in round trip.
    await putIntake(
      intake({
        receiptId: "si_auth",
        status: "needs-auth",
        receivedAt: Date.now() - INTAKE_TTL_MS - 1,
      })
    );

    expect(await reapExpired()).toBe(0);
    expect(await getIntake("si_auth")).not.toBeNull();
  });

  it("does reap a needs-auth record past its own long ceiling", async () => {
    await putIntake(
      intake({
        receiptId: "si_auth",
        status: "needs-auth",
        receivedAt: Date.now() - NEEDS_AUTH_TTL_MS - 1,
      })
    );

    expect(await reapExpired()).toBe(1);
  });

  it("evicts the oldest record to make room for a new one", async () => {
    const half = Math.floor(MAX_INTAKE_STORE_BYTES / 2);
    await putIntake(bigIntake("si_old", half, { receivedAt: 1 }));
    await putIntake(bigIntake("si_mid", half, { receivedAt: 2 }));

    await putIntake(bigIntake("si_new", half, { receivedAt: 3 }));

    expect(await getIntake("si_old")).toBeNull();
    expect(await getIntake("si_new")).not.toBeNull();
  });

  it("refuses the write rather than evicting a needs-auth record", async () => {
    const most = MAX_INTAKE_STORE_BYTES - 1024;
    await putIntake(bigIntake("si_auth", most, { status: "needs-auth", receivedAt: 1 }));

    await expect(putIntake(bigIntake("si_new", most, { receivedAt: 2 }))).rejects.toThrow(
      /pending sign-in/
    );
    expect(await getIntake("si_auth")).not.toBeNull();
  });

  it("reuses one connection instead of opening per operation", async () => {
    const openSpy = vi.spyOn(indexedDB, "open");

    await putIntake(intake());
    await getIntake("si_abc");
    await listIntakes();
    await reapExpired();

    // The connection was cached by the tests above; reapExpired alone used to
    // open N+1 of them.
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
