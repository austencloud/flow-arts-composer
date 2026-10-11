import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() factories are hoisted above every top-level statement, including
// plain `const` declarations - a factory that reads a later `const` directly
// (as `() => ({ toast })` does) throws "Cannot access 'toast' before
// initialization" the first time the mocked module loads. vi.hoisted() lifts
// the values alongside the mock registrations. Same fix as
// open-filed-card.test.ts.
const {
  openSendAttachmentSheet,
  openFiledCard,
  resolveForImport,
  getShortCodeManager,
  saveSequence,
  toast,
  getConversation,
} = vi.hoisted(() => {
  const resolveForImport = vi.fn();
  return {
    openSendAttachmentSheet: vi.fn(),
    openFiledCard: vi.fn(),
    resolveForImport,
    getShortCodeManager: vi.fn(() => ({ resolveForImport })),
    saveSequence: vi.fn(),
    toast: { info: vi.fn(), error: vi.fn() },
    // The real seam is ConversationManager.getConversation(id): Promise<Conversation | null>
    // exposed as the `conversationService` singleton. There is no
    // `conversationExists` helper, and adding one would duplicate a read the
    // manager already owns.
    getConversation: vi.fn(),
  };
});

vi.mock("#lib/shared/inbox/state/send-sequence-state.svelte.js", () => ({
  openSendAttachmentSheet: (...args: unknown[]) =>
    openSendAttachmentSheet(...args),
}));

vi.mock("#lib/shared/share-intake/services/open-filed-card.js", () => ({
  openFiledCard: (...args: unknown[]) => openFiledCard(...args),
}));

vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => getShortCodeManager(),
}));

vi.mock("#lib/features/library/get-library-save-service.js", () => ({
  getLibrarySaveService: () => ({ saveSequence }),
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({ toast }));

vi.mock("#lib/shared/messaging/services/conversation-manager.js", () => ({
  conversationService: {
    getConversation: (...args: unknown[]) => getConversation(...args),
  },
}));

import { routeIntake } from "#lib/shared/share-intake/services/intake-router.js";
import type { IntakeClassification } from "#lib/shared/share-intake/domain/share-intake-models.js";

function png(name: string): File {
  return new File([new Uint8Array([1])], name, { type: "image/png" });
}

function classification(
  overrides: Partial<IntakeClassification> = {}
): IntakeClassification {
  return {
    items: [],
    textCode: null,
    residualText: null,
    problems: [],
    ...overrides,
  };
}

const CONTEXT = { receiptId: "si_1" };

describe("routeIntake", () => {
  beforeEach(() => {
    openSendAttachmentSheet.mockReset();
    openFiledCard.mockReset();
    openFiledCard.mockResolvedValue(undefined);
    resolveForImport.mockReset();
    saveSequence.mockReset();
    getShortCodeManager.mockReset();
    getShortCodeManager.mockReturnValue({ resolveForImport });
    toast.info.mockReset();
    toast.error.mockReset();
    getConversation.mockReset();
    getConversation.mockResolvedValue({ id: "conv_paul" });
  });

  it("opens the conversation picker for a plain image", async () => {
    const result = await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet).toHaveBeenCalledTimes(1);
    expect(openSendAttachmentSheet.mock.calls[0][0].type).toBe("image");
    expect(result.cards).toHaveLength(0);
    expect(result.opened).toBe("picker");
  });

  it("hands the picker the intake receiptId so the send can resolve it", async () => {
    // Trace 2.14. Without this the drawer cannot tell WHICH record the bytes
    // it just sent belonged to.
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet.mock.calls[0][1]).toMatchObject({
      receiptId: "si_1",
    });
  });

  it("goes through openSendAttachmentSheet, not inboxState directly", async () => {
    // Named as its own test because an earlier revision poked inboxState and
    // left openSendAttachmentSheet a dead export.
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );
    expect(openSendAttachmentSheet).toHaveBeenCalled();
  });

  it("passes residual text through as the prefilled note", async () => {
    await routeIntake(
      classification({
        items: [{ kind: "image", file: png("a.png") }],
        residualText: "look at this",
      }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet.mock.calls[0][1]).toMatchObject({
      note: "look at this",
    });
  });

  it("resolves a doc-backed card without touching the library", async () => {
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "ABC" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "AB12", file: png("c.png") }],
      }),
      "user-1",
      CONTEXT
    );

    expect(resolveForImport).toHaveBeenCalledWith("AB12", "user-1");
    expect(result.cards[0]).toMatchObject({
      code: "AB12",
      docBacked: true,
      targetId: "s1",
    });
    expect(saveSequence).not.toHaveBeenCalled();
    expect(openSendAttachmentSheet).not.toHaveBeenCalled();
  });

  it("OPENS THE VIEWER on the filed card - trace 1.13", async () => {
    // The headline gap in every previous revision: cards were computed and
    // then thrown away, so a shared card produced nothing on screen.
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "ABC" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "AB12", file: png("c.png") }],
      }),
      "user-1",
      CONTEXT
    );

    expect(openFiledCard).toHaveBeenCalledWith({
      code: "AB12",
      sequence: { id: "s1", word: "ABC" },
      extraCards: 0,
      word: "ABC",
    });
    expect(result.opened).toBe("card");
  });

  it("opens one viewer and reports the rest when a share carries several cards", async () => {
    resolveForImport
      .mockResolvedValueOnce({
        sequence: { id: "s1", word: "A" },
        docBacked: true,
      })
      .mockResolvedValueOnce({
        sequence: { id: "s2", word: "B" },
        docBacked: true,
      });

    await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AA11", file: png("a.png") },
          { kind: "card", code: "BB22", file: png("b.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(openFiledCard).toHaveBeenCalledTimes(1);
    expect(openFiledCard.mock.calls[0][0].extraCards).toBe(1);
  });

  it("saves a printed (non-doc-backed) card to the library before filing it", async () => {
    // ScanCardSheet.svelte:172-227 does exactly this. Without it the "card" points at
    // nothing.
    resolveForImport.mockResolvedValue({
      sequence: { id: "inline", word: "ABC" },
      docBacked: false,
    });
    saveSequence.mockResolvedValue({ sequenceId: "lib-9", persisted: true });

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "AB12", file: png("c.png") }],
      }),
      "user-1",
      CONTEXT
    );

    expect(saveSequence).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inline" }),
      {
        name: "ABC",
        visibility: "public",
        tags: [],
        notes: "",
        // Every save entry point stamps the UI path it came from so the
        // lifecycle funnel can break saves down by origin
        // (SaveToLibraryOptions.analyticsSource). Printed-card intake is
        // "share_intake" - dropping it would silently strand this path in the
        // funnel's unattributed bucket.
        analyticsSource: "share_intake",
      }
    );
    expect(result.cards[0].targetId).toBe("lib-9");
  });

  it("queues the images and does not open the picker when a card also resolved", async () => {
    // Design decision: two overlays fighting for the back gesture is worse
    // than one reported deferral.
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "A" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AB12", file: png("c.png") },
          { kind: "image", file: png("photo.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(openFiledCard).toHaveBeenCalledTimes(1);
    expect(openSendAttachmentSheet).not.toHaveBeenCalled();
    expect(result.queued.map((f) => f.name)).toEqual(["photo.png"]);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ name: "photo.png", reason: "send-dropped" })
    );
  });

  it("reports an unresolvable code ONCE, as both unresolved and one problem", async () => {
    // The router is the single author of resolve-failed problems. An earlier
    // revision pushed one here AND let the runner synthesize a second from
    // `unresolved`, so one bad code produced two identical entries.
    resolveForImport.mockResolvedValue(null);

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "BAD1", file: png("c.png") }],
      }),
      null,
      CONTEXT
    );

    expect(result.cards).toHaveLength(0);
    expect(result.unresolved).toEqual(["BAD1"]);
    expect(
      result.problems.filter((p) => p.reason === "resolve-failed")
    ).toHaveLength(1);
    expect(result.opened).toBeNull();
  });

  it("keeps routing the other codes when one resolve rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    resolveForImport
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        sequence: { id: "s2", word: "B" },
        docBacked: true,
      });

    const result = await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AA11", file: png("a.png") },
          { kind: "card", code: "BB22", file: png("b.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(result.unresolved).toEqual(["AA11"]);
    expect(result.cards).toHaveLength(1);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ name: "AA11", reason: "resolve-failed" })
    );
  });

  it("records resolve-failed when the manager itself is unconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getShortCodeManager.mockImplementation(() => {
      throw new Error(
        "getShortCodeManager(): call configureShortCodeManager() first"
      );
    });

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "AB12", file: png("c.png") }],
      }),
      null,
      CONTEXT
    );

    expect(result.unresolved).toEqual(["AB12"]);
    expect(result.problems[0].reason).toBe("resolve-failed");
  });

  it("resolves a code found in shared text", async () => {
    resolveForImport.mockResolvedValue({
      sequence: { id: "s2", word: "B" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({ textCode: "XY99" }),
      null,
      CONTEXT
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].code).toBe("XY99");
  });

  it("dedupes a code that appears in both an image and the text", async () => {
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "A" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [{ kind: "card", code: "AB12", file: png("c.png") }],
        textCode: "AB12",
      }),
      null,
      CONTEXT
    );

    expect(resolveForImport).toHaveBeenCalledTimes(1);
    expect(result.cards).toHaveLength(1);
  });

  it("ignores a duplicate item entirely", async () => {
    const result = await routeIntake(
      classification({
        items: [{ kind: "duplicate", code: "AB12", file: png("b.png") }],
      }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet).not.toHaveBeenCalled();
    expect(openFiledCard).not.toHaveBeenCalled();
    expect(result.cards).toHaveLength(0);
    expect(result.queued).toHaveLength(0);
  });

  it("queues images past the first and records them rather than dropping them", async () => {
    const result = await routeIntake(
      classification({
        items: [
          { kind: "image", file: png("a.png") },
          { kind: "image", file: png("b.png") },
          { kind: "image", file: png("c.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(openSendAttachmentSheet).toHaveBeenCalledTimes(1);
    expect(result.queued.map((f) => f.name)).toEqual(["b.png", "c.png"]);
    expect(result.problems.map((p) => p.reason)).toEqual([
      "send-dropped",
      "send-dropped",
    ]);
  });

  it("reports nothing opened for an empty classification", async () => {
    const result = await routeIntake(classification(), null, CONTEXT);
    expect(result.opened).toBeNull();
  });

  it("toasts the count of images left queued behind the picker", async () => {
    // The router is the only place that knows how many images did NOT reach a
    // screen. Without this the user sees one picker open and nothing else -
    // the other two files are gone as far as they can tell.
    await routeIntake(
      classification({
        items: [
          { kind: "image", file: png("a.png") },
          { kind: "image", file: png("b.png") },
          { kind: "image", file: png("c.png") },
        ],
      }),
      null,
      CONTEXT
    );

    expect(toast.info).toHaveBeenCalledWith(
      "2 more images are saved. Share again to send them."
    );
  });

  it("says nothing when only one image was shared and none are queued", async () => {
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      null,
      CONTEXT
    );

    expect(toast.info).not.toHaveBeenCalled();
  });

  it("pre-selects the tapped conversation for an image share", async () => {
    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      "user-1",
      { receiptId: "si_1", targetConversationId: "conv_paul" }
    );

    expect(openSendAttachmentSheet).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image" }),
      expect.objectContaining({ conversationId: "conv_paul" })
    );
  });

  it("prefers an explicitly tapped person over a card in the same share", async () => {
    // Cards normally win a mixed share. But tapping a face in the system sheet
    // states a destination, and Android's own guidance is that a Direct Share
    // tap must act on THAT target rather than show a disambiguation UI. So an
    // explicit target inverts the rule - only when one is present.
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "A" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AB12", file: png("card.png") },
          { kind: "image", file: png("photo.png") },
        ],
      }),
      "user-1",
      { receiptId: "si_1", targetConversationId: "conv_paul" }
    );

    expect(result.opened).toBe("picker");
    expect(openFiledCard).not.toHaveBeenCalled();
    // The suppressed card is REPORTED, not silently dropped.
    expect(result.queued).toHaveLength(1);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ name: "AB12", reason: "send-dropped" })
    );
  });

  it("still lets cards win when no target was tapped", async () => {
    resolveForImport.mockResolvedValue({
      sequence: { id: "s1", word: "A" },
      docBacked: true,
    });

    const result = await routeIntake(
      classification({
        items: [
          { kind: "card", code: "AB12", file: png("card.png") },
          { kind: "image", file: png("photo.png") },
        ],
      }),
      "user-1",
      { receiptId: "si_1" }
    );

    expect(result.opened).toBe("card");
    expect(openFiledCard).toHaveBeenCalled();
  });

  it("opens the plain picker when the tapped conversation is gone", async () => {
    // The user left the group, or the shortcut outlived its conversation. The
    // photo is what they care about; never dead-end on a stale id.
    getConversation.mockResolvedValueOnce(null);

    await routeIntake(
      classification({ items: [{ kind: "image", file: png("a.png") }] }),
      "user-1",
      { receiptId: "si_1", targetConversationId: "conv_gone" }
    );

    const options = openSendAttachmentSheet.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(options.conversationId).toBeUndefined();
  });
});
