import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
import { buildViewerShareActions } from "../services/viewer-shell-model";
import type { MandalaViewerController } from "./mandala-viewer-controller.svelte";
import type { TunnelViewController } from "../tunnel/tunnel-view-controller.svelte";
import type { ShareArtifact } from "$lib/shared/share/services/post-handoff";
import type { SequenceSendSession } from "$lib/shared/inbox/state/send-sequence-state.svelte";

type ViewerShareActionId = "share-sequence" | "send-sequence" | "copy-link";

/**
 * The art view a share is about. ArtPane owns both controllers, so it hands
 * them up here rather than rendering a sheet of its own — the shell already
 * hosts the one sheet every share entry point lands on.
 */
export interface ArtShareTarget {
  artType: "mandala" | "tunnel";
  controller: TunnelViewController;
  mandalaController: MandalaViewerController;
}

interface ViewerShellShareInputs {
  getContext: () => OrchestratorContext;
  getSequence: () => SequenceData;
}

interface ViewerShellShareDependencies {
  createSequenceSendSession: typeof import("$lib/shared/inbox/state/send-sequence-state.svelte").createSequenceSendSession;
  /** The Choreo Card the current pipeline draws for this sequence. */
  sendToStickerLab: typeof import("../services/send-to-sticker-lab").sendToStickerLab;
  captureScanAction: typeof import("$lib/shared/analytics/scan-analytics").captureScanAction;
}

export function createViewerShellShareState(
  inputs: ViewerShellShareInputs,
  dependencies: ViewerShellShareDependencies
) {
  let shareLinkCopied = $state(false);
  let postSheetOpen = $state(false);
  let initialEntry = $state<"chooser" | "download">("chooser");
  let preparedOrdinaryVideo = $state(false);
  let preserveSession = $state(false);
  /**
   * `$state.raw`: these are class instances with private fields, and a deep
   * proxy around them breaks their own reactivity and their `#private` access.
   * Their internal `$state` fields stay reactive through the raw reference,
   * which is exactly what the sheet reads (progress, the finished blob).
   */
  let artShare = $state.raw<ArtShareTarget | null>(null);
  /**
   * The art view currently on screen, registered by ArtPane while it is active.
   * Distinct from `artShare`, which is the target of an OPEN sheet: this one
   * only answers "what would the header's Share be about right now."
   */
  let registeredArtTarget = $state.raw<ArtShareTarget | null>(null);
  /** This share came from the 3D pane, so the sheet opens on Video. */
  let sceneShare = $state(false);
  /**
   * This share is OF a Post Studio render. The shell holds the blob (the state
   * never sees it); the flag is what lets the sheet open on Video instead of
   * Card, and what keeps a later plain share from being mistaken for this one.
   */
  let postShare = $state(false);
  /**
   * The sheet is hidden for a live 3D take, not dismissed. Hiding it closes the
   * native <dialog>, which fires `close`, which calls back through
   * `setPostSheetOpen(false)` — so without this flag the take's own step-aside
   * ends the very share session it is fulfilling, and the sheet comes back on
   * Card with the finished take buried behind the picker.
   */
  let sceneTakeSuspended = $state(false);
  let shareLinkFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Send mode: the recipients take the viewer's inspector column while the
   * stage keeps showing the view being sent. Null when the viewer is not
   * sending.
   */
  let sendSession = $state.raw<SequenceSendSession | null>(null);

  const actions = $derived(buildViewerShareActions(shareLinkCopied));
  const statusMessage = $derived(shareLinkCopied ? "Link copied." : "");

  function destroy(): void {
    if (shareLinkFeedbackTimer) clearTimeout(shareLinkFeedbackTimer);
  }

  /**
   * Enter send mode. The stage stays live behind the recipients, so nothing
   * is drawn for it. A share sheet that was open (Send in Flow Arts Composer
   * lives in it too) closes first: the viewer is about to become the sending
   * surface, and a dialog over it would hide the recipients it is asking for.
   */
  function sendToInbox(): void {
    const sequence = inputs.getSequence();
    dependencies.captureScanAction("send");
    if (sendSession) return;
    const session = dependencies.createSequenceSendSession(sequence);
    if (!session) return;
    if (postSheetOpen) {
      postSheetOpen = false;
      endShareSession();
    }
    sendSession = session;
  }

  /** Cancel, Escape, or a completed send: the viewer is a viewer again. */
  function exitSendMode(): void {
    sendSession = null;
  }

  /**
   * Opens the post-handoff sheet.
   *
   * Deliberately NOT ctx.handleShare() any more: that shared a bare LINK, and
   * Instagram rejects a URL share as a feed post, so the OS sheet was a dead
   * end for the case people actually want. The sheet carries the file.
   */
  function shareSequence(): void {
    dependencies.captureScanAction("share");
    artShare = null;
    sceneShare = false;
    postShare = false;
    sceneTakeSuspended = false;
    initialEntry = "chooser";
    preparedOrdinaryVideo = false;
    preserveSession = false;
    postSheetOpen = true;
  }

  /**
   * Share the post the studio just rendered. The render itself already reached
   * the shell through `onExported`; this only opens the sheet as a session
   * about that file, so it lands on Video with the composed post in the slot
   * rather than on Card as if the studio never happened.
   */
  function sharePost(): void {
    dependencies.captureScanAction("share", { source: "post_studio" });
    artShare = null;
    sceneShare = false;
    postShare = true;
    sceneTakeSuspended = false;
    initialEntry = "chooser";
    preparedOrdinaryVideo = false;
    preserveSession = false;
    postSheetOpen = true;
  }

  /**
   * Retires whatever the open sheet was a share OF. The session is what makes
   * the sheet's video slot a mandala instead of the animation, or labels it
   * Scene instead of Video — it has to die with the sheet, or the next plain
   * share opens still pointed at the last one.
   */
  function endShareSession(): void {
    const hadRender = sceneShare || !!artShare;
    sceneShare = false;
    postShare = false;
    sceneTakeSuspended = false;
    preparedOrdinaryVideo = false;
    preserveSession = false;
    // Retire the render along with the session that asked for it. The viewer
    // suppresses its own result overlay only while the sheet owns the render, so
    // leaving the blob behind means closing the sheet reveals an "Export
    // complete — Save" panel offering a second delivery of the file the sheet
    // just handled. True of a scene take as much as of a mandala or tunnel.
    if (hadRender) inputs.getContext().dismissPreview();
    if (!artShare) return;
    artShare.mandalaController.clearExportBlob();
    artShare = null;
  }

  /**
   * Share what is on screen, not the sequence behind it. From the Mandala or
   * Tunnel view the artifact is that render, so the sheet opens on it and asks
   * for it immediately. Austen (2026-08-11): "if I'm in the tunnel there should
   * be a big fat share button specifically for sharing that tunnel."
   */
  function shareArt(target: ArtShareTarget): void {
    dependencies.captureScanAction("share", {
      source: `art_${target.artType}`,
    });
    // Start the slot empty. Both render paths keep their last result around —
    // the shared exporter's preview and the mandala's held blob — and either
    // one would be adopted as this share's artifact and labelled as the art the
    // user is looking at, which it may not be.
    inputs.getContext().dismissPreview();
    target.mandalaController.clearExportBlob();
    artShare = target;
    sceneShare = false;
    postShare = false;
    sceneTakeSuspended = false;
    initialEntry = "chooser";
    preparedOrdinaryVideo = false;
    preserveSession = false;
    postSheetOpen = true;
  }

  /**
   * The 3D pane's Share. Unlike the art views this needs no target: a scene
   * share IS the animation export — `handleExport` records the live 3D stage
   * whenever 3D is the editing pane — so the only thing that differs from a
   * plain share is which artifact the sheet opens on.
   */
  function shareScene(): void {
    dependencies.captureScanAction("share", { source: "scene_3d" });
    // Same reason as shareArt: an old animation render still sitting in the
    // preview slot would be adopted as this share's video.
    inputs.getContext().dismissPreview();
    artShare = null;
    sceneShare = true;
    postShare = false;
    sceneTakeSuspended = false;
    initialEntry = "chooser";
    preparedOrdinaryVideo = false;
    preserveSession = false;
    postSheetOpen = true;
  }

  /** ArtPane says what it is showing while it is up, and withdraws on park. */
  function setArtShareTarget(target: ArtShareTarget | null): void {
    registeredArtTarget = target;
  }

  async function copyShareLink(): Promise<void> {
    dependencies.captureScanAction("copy_link");
    const copied = await inputs.getContext().handleCopyLink();
    if (!copied) return;

    shareLinkCopied = true;
    if (shareLinkFeedbackTimer) clearTimeout(shareLinkFeedbackTimer);
    shareLinkFeedbackTimer = setTimeout(() => {
      shareLinkCopied = false;
      shareLinkFeedbackTimer = null;
    }, 1800);
  }

  /**
   * The header's Share, resolved against the pane the user is looking at.
   *
   * One Share, in one place, that shares the thing on screen: the mandala from
   * the Mandala pane, the tunnel from the Tunnel pane, the live 3D take from
   * the 3D pane, the card everywhere else. Austen (2026-08-11): "Let's keep
   * Share in one consistent place in the header always, we don't need it in
   * two places" — the button consolidated, the payload did not.
   */
  function shareCurrentView(): void {
    const viewerMode = inputs.getContext().viewerState.viewerMode;
    if (viewerMode === "animation-3d") {
      shareScene();
      return;
    }
    // In the studio, Share means "share the post". If nothing has been
    // rendered yet the shell falls back to the plain card/video sheet, but the
    // session still records where it came from.
    if (viewerMode === "post-studio") {
      sharePost();
      return;
    }
    if (registeredArtTarget) {
      shareArt(registeredArtTarget);
      return;
    }
    shareSequence();
  }

  /** A link-only or inbox share keeps its existing preview. A 2D video file
   * must retire an older export only when the user explicitly prepares one. */
  function prepareFile(artifact: ShareArtifact): boolean {
    if (
      artifact !== "video" ||
      artShare ||
      sceneShare ||
      postShare ||
      preparedOrdinaryVideo
    )
      return false;
    inputs.getContext().dismissPreview();
    preparedOrdinaryVideo = true;
    return true;
  }

  /** The existing Export control enters the same file-preparation sheet. */
  function openFilePreparation(): void {
    artShare = null;
    sceneShare = false;
    postShare = false;
    sceneTakeSuspended = false;
    initialEntry = "download";
    preparedOrdinaryVideo = false;
    preserveSession = false;
    postSheetOpen = true;
  }

  function selectAction(actionId: string): void {
    switch (actionId as ViewerShareActionId) {
      case "share-sequence":
        shareCurrentView();
        break;
      case "send-sequence":
        sendToInbox();
        break;
      case "copy-link":
        void copyShareLink();
        break;
    }
  }

  function sendToStickerLab(): void {
    dependencies.captureScanAction("send_to_sticker_lab");
    dependencies.sendToStickerLab(inputs.getSequence());
  }

  return {
    get actions() {
      return actions;
    },
    get statusMessage() {
      return statusMessage;
    },
    get postSheetOpen() {
      return postSheetOpen;
    },
    get artShare() {
      return artShare;
    },
    get sceneShare() {
      return sceneShare;
    },
    get postShare() {
      return postShare;
    },
    get initialEntry() {
      return initialEntry;
    },
    get preserveSession() {
      return preserveSession;
    },
    get sendSession() {
      return sendSession;
    },
    get sendModeActive() {
      return sendSession !== null;
    },
    /** The user opening or dismissing the sheet. Dismissing ends the session. */
    setPostSheetOpen(open: boolean) {
      postSheetOpen = open;
      if (open) {
        sceneTakeSuspended = false;
        return;
      }
      if (sceneTakeSuspended) return;
      endShareSession();
    },
    /**
     * Hide the sheet for a live 3D take WITHOUT ending the session. The take is
     * a camera performance on the stage the sheet is covering, so the sheet gets
     * out of the way and comes back with the result — and it has to come back as
     * the same share, or it reopens on Card and buries the take it just asked
     * for.
     */
    suspendForSceneTake() {
      sceneTakeSuspended = true;
      preserveSession = true;
      postSheetOpen = false;
    },
    resumeAfterSceneTake() {
      sceneTakeSuspended = false;
      postSheetOpen = true;
    },
    markSessionResumed() {
      preserveSession = false;
    },
    getShareUrl(): string {
      return inputs.getContext().getShareUrl();
    },
    sendToInbox,
    exitSendMode,
    setArtShareTarget,
    selectAction,
    prepareFile,
    openFilePreparation,
    sendToStickerLab,
    shareScene,
    sharePost,
    destroy,
  };
}
