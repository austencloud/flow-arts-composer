/**
 * The guest→account collision import must preserve the work AND the intent.
 *
 * Two defects lived here:
 *  - the draft's saved visibility was dropped, and the repository defaults an
 *    unspecified visibility to "public" — so importing republished private
 *    guest work to the community gallery (F2);
 *  - one failing write threw straight out of the loop and the prompt had
 *    already discarded its drafts, leaving no error and nothing to retry from
 *    (F3).
 *
 * Regression cover for F2 and F3 of
 * docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const repoSaveSequenceMock = vi.fn().mockResolvedValue({});
const showToastMock = vi.fn();

vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({
    saveSequence: (...a: unknown[]) => repoSaveSequenceMock(...a),
  }),
}));
vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
  showToast: (...a: unknown[]) => showToastMock(...a),
}));
/** The account the import would write into, swapped mid-flight by tests. */
const signedInUid = { value: "account-B" as string | undefined };
/** Simulates an auth lookup that cannot answer. */
const authReadThrows = { value: false };
vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: async () => {
    if (authReadThrows.value) throw new Error("auth unavailable");
    return {
      currentUser: signedInUid.value ? { uid: signedInUid.value } : null,
    };
  },
}));
vi.mock("$lib/shared/auth/services/pending-credential-link", () => ({
  stashPendingLink: vi.fn(),
}));
vi.mock("$lib/shared/auth/services/last-auth-method.svelte", () => ({
  recordLastAuthMethod: vi.fn(),
}));
vi.mock("$lib/shared/gamification/get-prop-unlock-manager", () => ({
  getPropUnlockManager: () => ({ mergeGuestCollection: vi.fn() }),
}));
vi.mock("$lib/shared/analytics/services/posthog-lifecycle-reporter", () => ({
  reportPostHogLifecycleEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/auth/services/auth-analytics-bridge", () => ({
  getAuthSubmissionContext: () => ({}),
}));
vi.mock("$lib/shared/persistence/services/dexie-persistence-service", () => ({
  getAllSequences: vi.fn().mockResolvedValue([]),
}));
vi.mock("$lib/shared/library/services/saved-sequence-ledger", () => ({
  getSavedSequenceIds: vi.fn().mockReturnValue([]),
  getOwnedSequenceIdSet: vi.fn().mockReturnValue(new Set()),
  recordSavedSequenceId: vi.fn(),
  removeSavedSequenceIds: vi.fn(),
}));

const { importDrafts } =
  await import("$lib/shared/auth/services/anonymous-upgrade");
const {
  anonymousImportPrompt,
  promptAnonymousImport,
  confirmAnonymousImport,
  cancelAnonymousImport,
} = await import("$lib/shared/auth/state/anonymous-import-prompt.svelte");

/** Above MIN_COMMUNITY_STEPS (4) so the community gate cannot mask visibility. */
function makeDraft(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
    thumbnails: [],
    ...extra,
  } as any;
}
function retryable(message = "offline") {
  return Object.assign(new Error(message), { code: "unavailable" });
}

beforeEach(() => {
  vi.clearAllMocks();
  repoSaveSequenceMock.mockResolvedValue({});
  signedInUid.value = "account-B";
  authReadThrows.value = false;
  cancelAnonymousImport();
});

describe("importDrafts — visibility intent survives the import", () => {
  it("carries a private draft's recorded visibility to the repository", async () => {
    await importDrafts([
      makeDraft("d1", {
        pendingSyncMetadata: { visibility: "private", notes: "mine" },
      }),
    ]);

    expect(repoSaveSequenceMock).toHaveBeenCalledTimes(1);
    expect(repoSaveSequenceMock.mock.calls[0]?.[1]).toMatchObject({
      visibility: "private",
      notes: "mine",
    });
  });

  it("carries a public draft's recorded visibility unchanged", async () => {
    await importDrafts([
      makeDraft("d1", {
        pendingSyncMetadata: { visibility: "public", notes: "" },
      }),
    ]);

    expect(repoSaveSequenceMock.mock.calls[0]?.[1]).toMatchObject({
      visibility: "public",
    });
  });

  it("never leaves visibility unspecified, which the repository would read as public", async () => {
    await importDrafts([makeDraft("d1")]); // no pendingSyncMetadata at all

    const overrides = repoSaveSequenceMock.mock.calls[0]?.[1];
    expect(overrides).toBeDefined();
    expect(overrides.visibility).toBe("private");
  });
});

describe("importDrafts — every draft is attempted", () => {
  it("continues past a retryable failure and reports what still needs importing", async () => {
    repoSaveSequenceMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(retryable())
      .mockResolvedValueOnce({});

    const result = await importDrafts([
      makeDraft("d1"),
      makeDraft("d2"),
      makeDraft("d3"),
    ]);

    expect(repoSaveSequenceMock).toHaveBeenCalledTimes(3);
    expect(result.imported).toBe(2);
    expect(result.failed.map((d: any) => d.id)).toEqual(["d2"]);
  });

  it("counts a duplicate as settled, not as work to retry", async () => {
    repoSaveSequenceMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ code: "ALREADY_EXISTS" });

    const result = await importDrafts([makeDraft("d1"), makeDraft("d2")]);

    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([]);
  });

  it("does not keep retrying a draft that can never be written", async () => {
    repoSaveSequenceMock.mockRejectedValueOnce({ code: "INVALID_DATA" });

    const result = await importDrafts([makeDraft("d1")]);

    expect(result.imported).toBe(0);
    expect(result.failed).toEqual([]);
  });
});

describe("confirmAnonymousImport — a failed import stays retryable", () => {
  it("keeps the drafts and re-offers them when the import fails", async () => {
    repoSaveSequenceMock.mockRejectedValue(retryable());
    promptAnonymousImport([makeDraft("d1")], "account-B");

    await confirmAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(1);
    expect(anonymousImportPrompt.isOpen).toBe(true);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't add"),
      "error"
    );
  });

  it("never rejects, because ConfirmDialog neither awaits nor catches it", async () => {
    repoSaveSequenceMock.mockRejectedValue(retryable());
    promptAnonymousImport([makeDraft("d1")], "account-B");

    await expect(confirmAnonymousImport()).resolves.toBeUndefined();
  });

  it("retrying after the failure clears the prompt once the write succeeds", async () => {
    repoSaveSequenceMock.mockRejectedValueOnce(retryable());
    promptAnonymousImport([makeDraft("d1")], "account-B");

    await confirmAnonymousImport();
    expect(anonymousImportPrompt.count).toBe(1);

    repoSaveSequenceMock.mockResolvedValue({});
    await confirmAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(0);
    expect(anonymousImportPrompt.isOpen).toBe(false);
  });

  it("keeps only the drafts that failed after a partial import", async () => {
    repoSaveSequenceMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(retryable());
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")], "account-B");

    await confirmAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(1);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Imported 1 sequence"),
      "success"
    );
  });

  it("clears the offer on a fully successful import", async () => {
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")], "account-B");

    await confirmAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(0);
    expect(anonymousImportPrompt.isOpen).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Imported 2 sequences"),
      "success"
    );
  });

  it("dismissing discards the offer without writing anything", async () => {
    promptAnonymousImport([makeDraft("d1")], "account-B");
    cancelAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(0);
    expect(anonymousImportPrompt.isOpen).toBe(false);
    expect(repoSaveSequenceMock).not.toHaveBeenCalled();
  });
});

describe("collision import — destination fencing and staleness", () => {
  it("fences every write to the account the OFFER was made about", async () => {
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")], "account-B");

    await confirmAnonymousImport();

    for (const call of repoSaveSequenceMock.mock.calls) {
      expect(call[1]).toMatchObject({ expectedOwnerId: "account-B" });
    }
  });

  it("refuses entirely when the account changed between the offer and the answer", async () => {
    // The collision signed them into B and the offer asked about B. If they
    // switch to C before answering, "yes" cannot be taken as consent to put
    // their guest work into C — an account they were never asked about.
    promptAnonymousImport([makeDraft("d1")], "account-B");
    signedInUid.value = "account-C";

    await confirmAnonymousImport();

    expect(repoSaveSequenceMock).not.toHaveBeenCalled();
    expect(anonymousImportPrompt.count).toBe(1);
    expect(anonymousImportPrompt.isOpen).toBe(true);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("different account"),
      "error"
    );
  });

  it("keeps fencing to the offered account when the session changes mid-import", async () => {
    // The repository is what ultimately refuses; what matters here is that the
    // expected owner never follows the switch.
    repoSaveSequenceMock.mockImplementationOnce(async () => {
      signedInUid.value = "account-C";
      return {};
    });
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")], "account-B");

    await confirmAnonymousImport();

    expect(
      repoSaveSequenceMock.mock.calls.every(
        (c: any[]) => c[1]?.expectedOwnerId === "account-B"
      )
    ).toBe(true);
  });

  it("fails closed, retaining drafts, when the destination cannot be read at confirm", async () => {
    promptAnonymousImport([makeDraft("d1")], "account-B");
    // Auth becomes unreadable between the offer and the answer.
    authReadThrows.value = true;

    await confirmAnonymousImport();

    // An unfenced write is exactly what must not happen here.
    expect(repoSaveSequenceMock).not.toHaveBeenCalled();
    expect(anonymousImportPrompt.count).toBe(1);
    expect(anonymousImportPrompt.isOpen).toBe(true);
  });

  it("fails closed when the offer carried no destination at all", async () => {
    // A caller that cannot name the account it signed into must not produce an
    // importable offer that writes somewhere unnamed.
    promptAnonymousImport([makeDraft("d1")]);

    await confirmAnonymousImport();

    expect(repoSaveSequenceMock).not.toHaveBeenCalled();
    expect(anonymousImportPrompt.count).toBe(1);
  });

  it("binds the destination synchronously, with no await before the state is set", () => {
    // The offer used to resolve the uid with an await and callers discard the
    // promise, so two collisions could interleave between the lookup and the
    // state write — leaving the generation guard and the drafts from different
    // offers. Everything the offer sets must land in one synchronous step.
    promptAnonymousImport([makeDraft("d1")], "account-B");

    expect(anonymousImportPrompt.isOpen).toBe(true);
    expect(anonymousImportPrompt.count).toBe(1);
    expect(anonymousImportPrompt.destinationUid).toBe("account-B");
  });

  it("keeps each offer's drafts and destination together when two arrive back to back", () => {
    promptAnonymousImport([makeDraft("first")], "account-B");
    promptAnonymousImport(
      [makeDraft("second-a"), makeDraft("second-b")],
      "account-C"
    );

    // The later offer wins outright: its drafts AND its destination, never a
    // mix of the two.
    expect(anonymousImportPrompt.count).toBe(2);
    expect(anonymousImportPrompt.destinationUid).toBe("account-C");
  });

  it("imports an out-of-order second offer into ITS own account", async () => {
    promptAnonymousImport([makeDraft("first")], "account-B");
    promptAnonymousImport([makeDraft("second")], "account-C");
    signedInUid.value = "account-C";

    await confirmAnonymousImport();

    expect(repoSaveSequenceMock).toHaveBeenCalledTimes(1);
    expect(repoSaveSequenceMock.mock.calls[0]?.[1]).toMatchObject({
      expectedOwnerId: "account-C",
    });
  });

  it("returns a draft the repository refused as still-outstanding, not imported", async () => {
    repoSaveSequenceMock.mockRejectedValue(
      Object.assign(new Error("owner changed"), { code: "UNAUTHORIZED" })
    );
    promptAnonymousImport([makeDraft("d1")], "account-B");

    await confirmAnonymousImport();

    // Refused for identity reasons is retryable work, not silently dropped.
    expect(anonymousImportPrompt.count).toBe(1);
  });

  it("a slow import does not resurrect drafts the user has since dismissed", async () => {
    let release: (() => void) | null = null;
    repoSaveSequenceMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({});
        })
    );
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")], "account-B");

    const inFlight = confirmAnonymousImport();
    // confirm awaits the destination-uid read before it writes, so wait until
    // the first write is genuinely in flight.
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    // User dismisses while that write is still open.
    cancelAnonymousImport();
    release!();
    await inFlight;

    expect(anonymousImportPrompt.count).toBe(0);
    expect(anonymousImportPrompt.isOpen).toBe(false);
  });

  it("an older import completing late does not clobber a newer offer", async () => {
    let release: (() => void) | null = null;
    repoSaveSequenceMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          release = () =>
            reject(
              Object.assign(new Error("offline"), { code: "unavailable" })
            );
        })
    );
    promptAnonymousImport([makeDraft("old-1")], "account-B");

    const inFlight = confirmAnonymousImport();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    // A newer collision produces a fresh offer before the old one settles.
    promptAnonymousImport(
      [makeDraft("new-1"), makeDraft("new-2")],
      "account-B"
    );
    release!();
    await inFlight;

    // The stale run must not overwrite the newer offer with its own failures.
    expect(anonymousImportPrompt.count).toBe(2);
    expect(anonymousImportPrompt.isOpen).toBe(true);
  });
});
