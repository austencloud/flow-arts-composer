import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

vi.mock("$app/env", () => ({ browser: true }));

// vi.mock() factories are hoisted above every top-level statement, including
// plain `const` declarations in this file. A factory that DEREFERENCES a later
// `const` (as opposed to closing over it inside an arrow) throws "Cannot access
// '<name>' before initialization" the first time the mocked module loads.
// vi.hoisted() hoists these alongside the mock registrations.
const { auth, showAuthDrawer, toast, inboxState, classifyIntake, routeIntake } =
  vi.hoisted(() => ({
    auth: {
      effectiveUserId: "user-1" as string | null,
      isFullAccount: true,
      loading: false,
    },
    showAuthDrawer: vi.fn(),
    toast: { info: vi.fn(), error: vi.fn() },
    inboxState: { shareAttachmentReceiptId: null as string | null },
    classifyIntake: vi.fn(),
    routeIntake: vi.fn(),
  }));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    get effectiveUserId() {
      return auth.effectiveUserId;
    },
    get isFullAccount() {
      return auth.isFullAccount;
    },
    get loading() {
      return auth.loading;
    },
  },
}));

vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { show: showAuthDrawer },
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({ toast }));

vi.mock("#lib/shared/inbox/state/inbox-state.svelte.js", () => ({ inboxState }));

vi.mock("#lib/shared/share-intake/services/intake-classifier.js", () => ({
  classifyIntake: (...args: unknown[]) => classifyIntake(...args),
}));

vi.mock("#lib/shared/share-intake/services/intake-router.js", () => ({
  routeIntake: (...args: unknown[]) => routeIntake(...args),
}));

import {
  runPendingIntakes,
  scheduleIntakeRun,
  completeShareIntake,
} from "#lib/shared/share-intake/services/share-intake-runner.js";
import {
  putIntake,
  getIntake,
  listIntakes,
  deleteIntake,
} from "#lib/shared/share-intake/services/intake-store.js";
import type { SharedIntake } from "#lib/shared/share-intake/domain/share-intake-models.js";

// jsdom (as pinned in this repo, v27.4.0) does not implement Blob/File's
// spec-required arrayBuffer() method (jsdom/jsdom#2555), and putIntake calls it.
// Same guarded FileReader polyfill the other share-intake suites use.
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
    receiptId: "si_1",
    source: "native",
    files: [new File([new Uint8Array([1])], "a.png", { type: "image/png" })],
    status: "received",
    receivedAt: Date.now(),
    problems: [],
    ...overrides,
  };
}

const emptyClassification = {
  items: [],
  textCode: null,
  residualText: null,
  problems: [],
};

function imageClassification() {
  return {
    ...emptyClassification,
    items: [
      {
        kind: "image" as const,
        file: new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
      },
    ],
  };
}

const cleanRoute = {
  cards: [],
  unresolved: [],
  queued: [],
  problems: [],
  opened: null,
};

describe("share-intake-runner", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
    auth.effectiveUserId = "user-1";
    auth.isFullAccount = true;
    auth.loading = false;
    inboxState.shareAttachmentReceiptId = null;
    showAuthDrawer.mockReset();
    toast.info.mockReset();
    toast.error.mockReset();
    classifyIntake.mockReset();
    classifyIntake.mockResolvedValue(emptyClassification);
    routeIntake.mockReset();
    routeIntake.mockResolvedValue(cleanRoute);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("routes a pending intake and deletes it once nothing is left over", async () => {
    await putIntake(intake());

    await runPendingIntakes();

    expect(classifyIntake).toHaveBeenCalledTimes(1);
    expect(routeIntake).toHaveBeenCalledWith(emptyClassification, "user-1", {
      receiptId: "si_1",
    });
    expect(await getIntake("si_1")).toBeNull();
  });

  it("KEEPS the record as ready when the picker opened - trace 2.12", async () => {
    // The data-loss fix. The bytes must outlive picker-open: cancel, reload,
    // crash and the sign-in round trip all happen after this point.
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await putIntake(intake());

    await runPendingIntakes();

    const record = await getIntake("si_1");
    expect(record?.status).toBe("ready");
    expect(record?.files[0]?.size).toBe(1);
  });

  it("does not re-open the picker for the record it is already open on", async () => {
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await putIntake(intake());
    await runPendingIntakes();

    inboxState.shareAttachmentReceiptId = "si_1";
    routeIntake.mockClear();
    await runPendingIntakes();

    expect(routeIntake).not.toHaveBeenCalled();
  });

  it("re-opens the picker for a ready record after a reload", async () => {
    // Same record, but nothing is on screen any more (fresh boot). This is the
    // recovery path that makes cancel/reload survivable rather than terminal.
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await putIntake(intake({ status: "ready" }));

    await runPendingIntakes();

    expect(routeIntake).toHaveBeenCalledTimes(1);
  });

  it("parks an image share as needs-auth and PROMPTS when there is no full account", async () => {
    auth.isFullAccount = false;
    auth.effectiveUserId = null;
    classifyIntake.mockResolvedValue(imageClassification());
    await putIntake(intake());

    await runPendingIntakes();

    expect(routeIntake).not.toHaveBeenCalled();
    expect((await getIntake("si_1"))?.status).toBe("needs-auth");
    expect(showAuthDrawer).toHaveBeenCalledWith("signin", "share-image-signin");
    expect(toast.info).toHaveBeenCalled();
  });

  it("prompts once per record, not once per run", async () => {
    // A receiptId no earlier test has prompted for: `prompted` is deliberately
    // session-scoped module state, so reusing si_1 here would assert against a
    // set the previous test already populated.
    auth.isFullAccount = false;
    classifyIntake.mockResolvedValue(imageClassification());
    await putIntake(intake({ receiptId: "si_prompt_once" }));

    await runPendingIntakes();
    await runPendingIntakes();

    expect(showAuthDrawer).toHaveBeenCalledTimes(1);
  });

  it("does NOT gate a cards-only share behind sign-in", async () => {
    // resolveForImport takes `userId: string | null` and ScanCardSheet files
    // printed cards for guests today. Gating this would be a regression.
    auth.isFullAccount = false;
    auth.effectiveUserId = null;
    classifyIntake.mockResolvedValue({
      ...emptyClassification,
      items: [
        {
          kind: "card" as const,
          code: "AB12",
          file: new File([new Uint8Array([1])], "c.png", { type: "image/png" }),
        },
      ],
    });
    await putIntake(intake());

    await runPendingIntakes();

    expect(routeIntake).toHaveBeenCalledWith(expect.anything(), null, {
      receiptId: "si_1",
    });
    expect(showAuthDrawer).not.toHaveBeenCalled();
  });

  it("resumes a needs-auth record once the account is full - trace 3.16", async () => {
    auth.isFullAccount = false;
    classifyIntake.mockResolvedValue(imageClassification());
    await putIntake(intake());
    await runPendingIntakes();
    expect((await getIntake("si_1"))?.status).toBe("needs-auth");

    auth.isFullAccount = true;
    auth.effectiveUserId = "user-1";
    routeIntake.mockResolvedValue({ ...cleanRoute, opened: "picker" });
    await runPendingIntakes();

    expect(routeIntake).toHaveBeenCalledTimes(1);
    expect((await getIntake("si_1"))?.status).toBe("ready");
    // The bytes crossed the whole round trip.
    expect((await getIntake("si_1"))?.files[0]?.size).toBe(1);
  });

  it("keeps a record as partially-sent when a code did not resolve", async () => {
    routeIntake.mockResolvedValue({
      ...cleanRoute,
      unresolved: ["AB12"],
      problems: [{ name: "AB12", reason: "resolve-failed" as const }],
    });
    await putIntake(intake());

    await runPendingIntakes();

    const record = await getIntake("si_1");
    expect(record?.status).toBe("partially-sent");
    // Exactly ONE resolve-failed. An earlier revision had the router push one
    // and the runner synthesize a second from the same `unresolved` entry.
    expect(
      record?.problems.filter((p) => p.reason === "resolve-failed")
    ).toHaveLength(1);
  });

  it("tells the user when an unresolved code left nothing on screen", async () => {
    // Found on-device 2026-07-29: this path reported to logcat only, so the
    // user shared a card link and watched the app open to Construct with no
    // explanation. `partially-sent` is not in UNCONSUMED, so nothing retries
    // it either - if it is not said here it is never said.
    routeIntake.mockResolvedValue({
      ...cleanRoute,
      unresolved: ["AB12"],
      problems: [{ name: "AB12", reason: "resolve-failed" as const }],
    });
    await putIntake(intake());

    await runPendingIntakes();

    expect(toast.info).toHaveBeenCalledWith(
      "Couldn't open that shared TKA card."
    );
  });

  it("stays quiet about unresolved codes when a destination DID open", async () => {
    // Cards win a mixed share: openFiledCard's extraCards toast and the
    // router's queued-image toast already speak for the leftovers. A second
    // toast here would double-report the same share.
    routeIntake.mockResolvedValue({
      ...cleanRoute,
      unresolved: ["AB12"],
      queued: [new File([new Uint8Array([1])], "b.png", { type: "image/png" })],
      problems: [{ name: "AB12", reason: "resolve-failed" as const }],
      opened: "card",
    });
    await putIntake(intake());

    await runPendingIntakes();

    expect(toast.info).not.toHaveBeenCalled();
  });

  it("marks a record failed when routing throws, and does not retry it", async () => {
    routeIntake.mockRejectedValue(new Error("boom"));
    await putIntake(intake());

    await runPendingIntakes();
    const afterFirst = await getIntake("si_1");
    expect(afterFirst?.status).toBe("failed");
    expect(afterFirst?.problems).toContainEqual(
      expect.objectContaining({ reason: "route-failed", detail: "boom" })
    );

    await runPendingIntakes();
    expect(routeIntake).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent runs into one pass", async () => {
    await putIntake(intake());

    await Promise.all([scheduleIntakeRun(), scheduleIntakeRun(), scheduleIntakeRun()]);

    // Three callers, one record, one classify. The host's mount effect, its
    // signal effect and its auth effect can all fire in the same flush.
    expect(classifyIntake).toHaveBeenCalledTimes(1);
  });
});

describe("completeShareIntake", () => {
  beforeEach(async () => {
    for (const record of await listIntakes()) await deleteIntake(record.receiptId);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("deletes the record once the image has actually been sent", async () => {
    await putIntake(intake({ status: "ready" }));

    await completeShareIntake("si_1");

    expect(await getIntake("si_1")).toBeNull();
  });

  it("holds the record as partially-sent when files were queued behind it", async () => {
    await putIntake(
      intake({
        status: "ready",
        problems: [{ name: "b.png", reason: "send-dropped" }],
      })
    );

    await completeShareIntake("si_1");

    expect((await getIntake("si_1"))?.status).toBe("partially-sent");
  });

  it("is a no-op for a record that is already gone", async () => {
    await expect(completeShareIntake("si_missing")).resolves.toBeUndefined();
  });
});
