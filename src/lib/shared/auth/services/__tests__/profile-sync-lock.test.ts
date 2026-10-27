import { afterEach, describe, expect, it, vi } from "vitest";
import { runProfileSyncExclusively } from "../profile-sync-lock";

/**
 * The profile sync's shape: read users/{uid}, create it when missing, update it
 * otherwise. A create that lands on an existing document is the write the
 * rules deny.
 */
function profileStore() {
  let exists = false;
  const writes: string[] = [];
  const sync = async () => {
    const found = exists;
    await new Promise((resolve) => setTimeout(resolve, 5));
    writes.push(found ? "update" : exists ? "create-over-existing" : "create");
    exists = true;
  };
  return { sync, writes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runProfileSyncExclusively", () => {
  it("lets a second sync for a new account see the first one's document", async () => {
    vi.stubGlobal("navigator", {});
    const store = profileStore();

    await Promise.all([
      runProfileSyncExclusively("new-guest", store.sync),
      runProfileSyncExclusively("new-guest", store.sync),
    ]);

    expect(store.writes).toEqual(["create", "update"]);
  });

  it("keeps running later syncs after one fails", async () => {
    vi.stubGlobal("navigator", {});
    const ran: string[] = [];

    const failing = runProfileSyncExclusively("uid", async () => {
      ran.push("first");
      throw new Error("offline");
    });
    const next = runProfileSyncExclusively("uid", async () => {
      ran.push("second");
    });

    await expect(failing).rejects.toThrow("offline");
    await next;
    expect(ran).toEqual(["first", "second"]);
  });

  it("holds a cross-tab Web Lock named for the account when one exists", async () => {
    const request = vi.fn(
      (_name: string, _options: unknown, task: () => Promise<void>) => task()
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const sync = vi.fn(async () => {});

    await runProfileSyncExclusively("account-uid", sync);

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe("tka-profile-sync:account-uid");
    expect(sync).toHaveBeenCalledOnce();
  });

  it("runs the sync anyway when the lock is not granted in time", async () => {
    const timeout = Object.assign(new Error("timed out"), {
      name: "TimeoutError",
    });
    vi.stubGlobal("navigator", {
      locks: { request: vi.fn(() => Promise.reject(timeout)) },
    });
    const sync = vi.fn(async () => {});

    await runProfileSyncExclusively("account-uid", sync);

    expect(sync).toHaveBeenCalledOnce();
  });
});
