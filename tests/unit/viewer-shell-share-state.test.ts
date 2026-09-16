import { describe, expect, it } from "vitest";
import { createViewerShellShareState } from "$lib/shared/sequence-viewer/state/viewer-shell-share-state.svelte";

function createShareState(
  onDismiss: () => void,
  createSequenceSendSession: () => unknown = () => null
) {
  return createViewerShellShareState(
    {
      getContext: () =>
        ({
          dismissPreview: onDismiss,
          viewerState: { viewerMode: "animation" },
        }) as never,
      getSequence: () => ({}) as never,
    },
    {
      captureScanAction: () => undefined,
      createSequenceSendSession,
      renderCardPreview: () => Promise.reject(new Error("unused")),
      sendToStickerLab: () => undefined,
    } as never
  );
}

describe("viewer share file preparation", () => {
  it("retires an old ordinary video only for the first explicit video preparation", () => {
    let dismissals = 0;
    const share = createShareState(() => dismissals++);

    share.selectAction("share-sequence");
    expect(dismissals).toBe(0);
    expect(share.prepareFile("card")).toBe(false);
    expect(dismissals).toBe(0);
    expect(share.prepareFile("video")).toBe(true);
    expect(dismissals).toBe(1);
    expect(share.prepareFile("video")).toBe(false);
    expect(dismissals).toBe(1);

    share.setPostSheetOpen(false);
    share.selectAction("share-sequence");
    expect(share.prepareFile("video")).toBe(true);
    expect(dismissals).toBe(2);
  });

  it("marks a live scene take as a resumed share session", () => {
    const share = createShareState(() => undefined);

    share.shareScene();
    share.suspendForSceneTake();
    expect(share.postSheetOpen).toBe(false);
    expect(share.preserveSession).toBe(true);

    share.resumeAfterSceneTake();
    expect(share.postSheetOpen).toBe(true);
    expect(share.preserveSession).toBe(true);

    share.markSessionResumed();
    expect(share.preserveSession).toBe(false);
  });
});

describe("viewer send mode", () => {
  const session = {
    payload: {},
    previewBlob: null,
    previewPending: true,
  };

  it("morphs into send mode and closes an open share sheet", () => {
    let sessions = 0;
    const share = createShareState(
      () => undefined,
      () => {
        sessions++;
        return session;
      }
    );

    share.shareScene();
    expect(share.postSheetOpen).toBe(true);

    share.sendToInbox();
    expect(share.sendModeActive).toBe(true);
    expect(share.sendSession).toBe(session);
    expect(share.postSheetOpen).toBe(false);

    // Re-entering while active keeps the session the person is working in.
    share.sendToInbox();
    expect(sessions).toBe(1);

    share.exitSendMode();
    expect(share.sendModeActive).toBe(false);
    expect(share.sendSession).toBeNull();
  });

  it("stays a viewer when the guest gate takes over", () => {
    const share = createShareState(
      () => undefined,
      () => null
    );

    share.sendToInbox();
    expect(share.sendModeActive).toBe(false);
  });
});
