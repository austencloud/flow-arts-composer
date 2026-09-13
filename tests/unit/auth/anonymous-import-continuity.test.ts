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
vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: vi.fn().mockResolvedValue({ currentUser: null }),
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
    promptAnonymousImport([makeDraft("d1")]);

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
    promptAnonymousImport([makeDraft("d1")]);

    await expect(confirmAnonymousImport()).resolves.toBeUndefined();
  });

  it("retrying after the failure clears the prompt once the write succeeds", async () => {
    repoSaveSequenceMock.mockRejectedValueOnce(retryable());
    promptAnonymousImport([makeDraft("d1")]);

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
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")]);

    await confirmAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(1);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Imported 1 sequence"),
      "success"
    );
  });

  it("clears the offer on a fully successful import", async () => {
    promptAnonymousImport([makeDraft("d1"), makeDraft("d2")]);

    await confirmAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(0);
    expect(anonymousImportPrompt.isOpen).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Imported 2 sequences"),
      "success"
    );
  });

  it("dismissing discards the offer without writing anything", () => {
    promptAnonymousImport([makeDraft("d1")]);
    cancelAnonymousImport();

    expect(anonymousImportPrompt.count).toBe(0);
    expect(anonymousImportPrompt.isOpen).toBe(false);
    expect(repoSaveSequenceMock).not.toHaveBeenCalled();
  });
});
