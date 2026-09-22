import { describe, expect, it } from "vitest";
import {
  createViewerShellShareState,
  viewerVideoSourceIdentity,
} from "$lib/shared/sequence-viewer/state/viewer-shell-share-state.svelte";

interface ShareStateOptions {
  createSequenceSendSession?: () => unknown;
  isFullAccount?: () => boolean;
  getShareUrl?: () => string;
  viewerMode?: string;
}

function createShareState(
  onDismiss: () => void,
  options: ShareStateOptions = {}
) {
  const {
    createSequenceSendSession = () => null,
    isFullAccount = () => true,
    getShareUrl = () => "https://tka.run/sequence/OMY3?v=OMY3",
    viewerMode = "animation",
  } = options;
  return createViewerShellShareState(
    {
      getContext: () =>
        ({
          dismissPreview: onDismiss,
          viewerState: { viewerMode },
          getShareUrl,
        }) as never,
      getSequence: () => ({}) as never,
    },
    {
      captureScanAction: () => undefined,
      createSequenceSendSession,
      isFullAccount,
      sendToStickerLab: () => undefined,
    } as never
  );
}

describe("viewer share file preparation", () => {
  it("retires an old ordinary video only for the first explicit video preparation", () => {
    let dismissals = 0;
    const share = createShareState(() => dismissals++);

    share.downloadCurrentView();
    expect(dismissals).toBe(0);
    expect(share.prepareFile("card")).toBe(false);
    expect(dismissals).toBe(0);
    expect(share.prepareFile("video")).toBe(true);
    expect(dismissals).toBe(1);
    expect(share.prepareFile("video")).toBe(false);
    expect(dismissals).toBe(1);

    share.setPostSheetOpen(false);
    share.downloadCurrentView();
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

  it("keeps a rendered post's source kind stable when its sheet reopens", () => {
    const share = createShareState(() => undefined);

    share.sharePost();
    const sourceKind = share.videoSourceKind;
    share.setPostSheetOpen(false);

    share.sharePost();
    expect(share.videoSourceKind).toBe(sourceKind);
    expect(sourceKind).toBe("post");
  });

  it("does not make a live result stale, while a changed precomposed post is new input", () => {
    expect(viewerVideoSourceIdentity("scene", null)).toBe("scene:live");
    expect(viewerVideoSourceIdentity("scene", null)).toBe("scene:live");
    expect(viewerVideoSourceIdentity("post", "blob:post-a")).not.toBe(
      viewerVideoSourceIdentity("post", "blob:post-b")
    );
  });
});

describe("viewer share panel", () => {
  it("opens beside the stage with recipients, and Share closes it again", () => {
    let sessions = 0;
    const share = createShareState(() => undefined, {
      createSequenceSendSession: () => ({ payload: { id: ++sessions } }),
    });

    share.selectAction("share-sequence");
    expect(share.panelOpen).toBe(true);
    expect(share.sendSession).not.toBeNull();
    expect(share.postSheetOpen).toBe(false);

    // A second open keeps the recipients the person is working in.
    share.openPanel();
    expect(sessions).toBe(1);

    share.selectAction("share-sequence");
    expect(share.panelOpen).toBe(false);
    expect(share.sendSession).toBeNull();
  });

  it("stays open over a file sheet, which opens straight into the file", () => {
    const share = createShareState(() => undefined, { viewerMode: "card" });

    share.openPanel();
    share.downloadCurrentView();
    expect(share.postSheetOpen).toBe(true);
    expect(share.initialEntry).toBe("download");
    expect(share.panelOpen).toBe(true);

    share.setPostSheetOpen(false);
    expect(share.panelOpen).toBe(true);
  });

  it("offers a guest sign-up in place of recipients, and fills them in once signed up", () => {
    let signedUp = false;
    const share = createShareState(() => undefined, {
      createSequenceSendSession: () => ({ payload: {} }),
      isFullAccount: () => signedUp,
    });

    share.openPanel();
    expect(share.panelOpen).toBe(true);
    expect(share.sendSession).toBeNull();

    signedUp = true;
    share.ensureSendSession();
    expect(share.sendSession).not.toBeNull();
  });

  it("carries the view on stage when Send is pressed, not when the panel opened", () => {
    let url = "https://tka.run/sequence/OMY3?v=OMY3&pane=card";
    const share = createShareState(() => undefined, {
      getShareUrl: () => url,
    });

    share.openPanel();
    url = "https://tka.run/sequence/OMY3?v=OMY3&pane=animation&fx=trail&s=abc";
    expect(share.currentViewParams()).toBe("pane=animation&fx=trail&s=abc");

    url = "https://tka.run/sequence/OMY3?v=OMY3";
    expect(share.currentViewParams()).toBeUndefined();
  });

  it("starts fresh recipients after a send without closing", () => {
    const share = createShareState(() => undefined, {
      createSequenceSendSession: () => ({ payload: {} }),
    });

    share.openPanel();
    const first = share.sendSession;
    share.resetSendSession();
    expect(share.panelOpen).toBe(true);
    expect(share.sendSession).not.toBeNull();
    expect(share.sendSession).not.toBe(first);
  });
});
