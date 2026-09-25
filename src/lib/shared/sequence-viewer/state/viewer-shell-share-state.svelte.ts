import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
import { buildViewerShareActions } from "../services/viewer-shell-model";
import { extractViewerStateQuery } from "../services/viewer-orchestrator-model";
import type { MandalaViewerController } from "./mandala-viewer-controller.svelte";
import type { TunnelViewController } from "../tunnel/tunnel-view-controller.svelte";
import type { ShareArtifact } from "$lib/shared/share/services/post-handoff";
import { copyEmbedCode } from "$lib/shared/share/services/post-handoff";
import { buildEmbedSnippet } from "$lib/shared/share/services/embed-snippet";
import type { SequenceSendSession } from "$lib/shared/inbox/state/send-sequence-state.svelte";

type ViewerShareActionId = "share-sequence" | "send-sequence" | "copy-link";
/** Where the file sheet opens: straight into preparing a file, or posting. */
type FileEntry = "download" | "publish";

/**
 * A render result is not an input to its own request: using its object URL here
 * would make a completed live export look stale. Post Studio is different: its
 * composed file exists before the sheet asks to deliver it.
 */
export function viewerVideoSourceIdentity(
  sourceKind: string,
  precomposedVideoUrl: string | null
): string {
  return `${sourceKind}:${precomposedVideoUrl ?? "live"}`;
}

/**
 * The art view a share is about. ArtPane owns both controllers, so it hands
 * them up here rather than rendering a sheet of its own — the shell already
 * hosts the one sheet every share entry point lands on.
 */
export interface ArtShareTarget {
  artType: "mandala" | "tunnel";
  controller: TunnelViewController;
  mandalaController: MandalaViewerController;
  /** A still from the mounted art stage, used only to identify the file being prepared. */
  capturePreview: () => string;
}

interface ViewerShellShareInputs {
  getContext: () => OrchestratorContext;
  getSequence: () => SequenceData;
}

interface ViewerShellShareDependencies {
  createSequenceSendSession: typeof import("$lib/shared/inbox/state/send-sequence-state.svelte").createSequenceSendSession;
  /** Recipients need an account; a guest's panel offers sign-up instead. */
  isFullAccount: () => boolean;
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
  let initialEntry = $state<"chooser" | "download" | "publish">("chooser");
  let preparedOrdinaryVideo = $state(false);
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
  /**
   * This share is OF a Post Studio render. The shell holds the blob (the state
   * never sees it); the flag is what lets the sheet open on Video instead of
   * Card, and what keeps a later plain share from being mistaken for this one.
   */
  let postShare = $state(false);
  let shareLinkFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let embedCodeCopied = $state(false);
  let embedFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The share panel: Share opens in the viewer's inspector column instead of
   * a dialog, so the stage keeps showing what is being shared. The rail
   * decides what that is; the panel only decides where it goes.
   */
  let panelOpen = $state(false);
  /**
   * The recipients' session while the panel is open to someone who can send.
   * Null for a guest (the panel offers sign-up in its place) and while closed.
   */
  let sendSession = $state.raw<SequenceSendSession | null>(null);

  const actions = $derived(buildViewerShareActions(shareLinkCopied));
  const statusMessage = $derived(shareLinkCopied ? "Link copied." : "");

  function destroy(): void {
    if (shareLinkFeedbackTimer) clearTimeout(shareLinkFeedbackTimer);
    if (embedFeedbackTimer) clearTimeout(embedFeedbackTimer);
  }

  /** The bare `/sequence/<code>` path segment a share URL resolved to, short
   *  code when one exists, else the inline-encoded id — the same identity
   *  Copy Link already carries, just without its view-state query string. */
  function currentSequenceCode(): string | null {
    try {
      const parsed = new URL(inputs.getContext().getShareUrl());
      const match = parsed.pathname.match(/\/sequence\/([^/]+)\/?$/);
      const code = match?.[1];
      return code ? decodeURIComponent(code) : null;
    } catch {
      return null;
    }
  }

  /**
   * Open the share panel beside the live stage. The panel stays open while
   * the person switches views in the rail, so what they share is whatever
   * the stage shows when they act, not what it showed when they opened it.
   */
  function openPanel(): void {
    if (panelOpen) return;
    dependencies.captureScanAction("share");
    panelOpen = true;
    ensureSendSession();
  }

  function closePanel(): void {
    panelOpen = false;
    sendSession = null;
  }

  function togglePanel(): void {
    if (panelOpen) closePanel();
    else openPanel();
  }

  /**
   * Recipients for an open panel. Idempotent, and a no-op for a guest, so the
   * shell can call it again when someone signs up with the panel open.
   */
  function ensureSendSession(): void {
    if (!panelOpen || sendSession || !dependencies.isFullAccount()) return;
    sendSession = dependencies.createSequenceSendSession(inputs.getSequence());
  }

  /**
   * A finished send leaves the panel open on fresh recipients: the person may
   * send the next view to someone else, copy the link, or close it.
   */
  function resetSendSession(): void {
    sendSession = null;
    ensureSendSession();
  }

  /**
   * The viewer state a message carries, read when Send is pressed. Same
   * full-state link Copy link builds, minus the sequence identity.
   */
  function currentViewParams(): string | undefined {
    return (
      extractViewerStateQuery(inputs.getContext().getShareUrl()) ?? undefined
    );
  }

  /**
   * Opens the file sheet on the sequence itself (card or animation).
   *
   * Deliberately NOT ctx.handleShare(): that shares a bare LINK, and Instagram
   * rejects a URL share as a feed post. The sheet carries the file.
   */
  function shareSequence(entry: FileEntry): void {
    dependencies.captureScanAction("share", { source: `panel_${entry}` });
    artShare = null;
    postShare = false;
    initialEntry = entry;
    preparedOrdinaryVideo = false;
    postSheetOpen = true;
  }

  /**
   * Share the post the studio just rendered. The render itself already reached
   * the shell through `onExported`; this only opens the sheet as a session
   * about that file, so it lands on Video with the composed post in the slot
   * rather than on Card as if the studio never happened.
   */
  function sharePost(entry: FileEntry = "download"): void {
    dependencies.captureScanAction("share", { source: "post_studio" });
    artShare = null;
    postShare = true;
    initialEntry = entry;
    preparedOrdinaryVideo = false;
    postSheetOpen = true;
  }

  /**
   * Retires whatever the open sheet was a share OF. The session is what makes
   * the sheet's video slot a mandala instead of the animation — it has to die
   * with the sheet, or the next plain share opens still pointed at the last
   * one.
   */
  function endShareSession(): void {
    const hadRender = !!artShare;
    postShare = false;
    preparedOrdinaryVideo = false;
    // Retire the render along with the session that asked for it. The viewer
    // suppresses its own result overlay only while the sheet owns the render, so
    // leaving the blob behind means closing the sheet reveals an "Export
    // complete — Save" panel offering a second delivery of the file the sheet
    // just handled.
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
  function shareArt(target: ArtShareTarget, entry: FileEntry): void {
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
    postShare = false;
    initialEntry = entry;
    preparedOrdinaryVideo = false;
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
   * Copies the paste-ready `<iframe>` + attribution snippet for the sequence
   * on stage. Mirrors `copyShareLink`'s feedback timing so the button swaps
   * its label the same way "Copy link" does.
   */
  async function copyEmbedSnippet(): Promise<void> {
    dependencies.captureScanAction("copy_embed");
    const code = currentSequenceCode();
    if (!code) return;

    const html = buildEmbedSnippet({ code, word: inputs.getSequence().word });
    const result = await copyEmbedCode(html);
    if (result.status !== "done") return;

    embedCodeCopied = true;
    if (embedFeedbackTimer) clearTimeout(embedFeedbackTimer);
    embedFeedbackTimer = setTimeout(() => {
      embedCodeCopied = false;
      embedFeedbackTimer = null;
    }, 1800);
  }

  /**
   * The panel's Download (or Publish), resolved against the view on stage.
   *
   * The file follows the rail: the mandala from the Mandala pane, the tunnel
   * from the Tunnel pane, the composed post from Post Studio, the sequence
   * card or animation everywhere else. A 3D take is not prepared here: it is
   * filmed on the stage, and the shell hands over the finished film itself.
   * The panel stays open behind the sheet, so closing the sheet returns the
   * person to it.
   */
  function prepareCurrentView(entry: FileEntry): void {
    const viewerMode = inputs.getContext().viewerState.viewerMode;
    // In the studio the file is the post, including before its first render.
    if (viewerMode === "post-studio") {
      sharePost(entry);
      return;
    }
    if (registeredArtTarget) {
      shareArt(registeredArtTarget, entry);
      return;
    }
    shareSequence(entry);
  }

  /** Hand the link to the OS share sheet (Messages, Mail, AirDrop, ...). */
  function shareLinkNatively(): void {
    dependencies.captureScanAction("native_share");
    inputs.getContext().handleShare();
  }

  /** A link-only or inbox share keeps its existing preview. A 2D video file
   * must retire an older export only when the user explicitly prepares one. */
  function prepareFile(artifact: ShareArtifact): boolean {
    if (artifact !== "video" || artShare || postShare || preparedOrdinaryVideo)
      return false;
    inputs.getContext().dismissPreview();
    preparedOrdinaryVideo = true;
    return true;
  }

  function selectAction(actionId: string): void {
    switch (actionId as ViewerShareActionId) {
      case "share-sequence":
        togglePanel();
        break;
      case "send-sequence":
        openPanel();
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
    get postShare() {
      return postShare;
    },
    get initialEntry() {
      return initialEntry;
    },
    get videoSourceKind() {
      return artShare?.artType ?? (postShare ? "post" : "animation");
    },
    get panelOpen() {
      return panelOpen;
    },
    get sendSession() {
      return sendSession;
    },
    get linkCopied() {
      return shareLinkCopied;
    },
    get embedCopied() {
      return embedCodeCopied;
    },
    /** The user opening or dismissing the sheet. Dismissing ends the session. */
    setPostSheetOpen(open: boolean) {
      postSheetOpen = open;
      if (!open) endShareSession();
    },
    getShareUrl(): string {
      return inputs.getContext().getShareUrl();
    },
    openPanel,
    closePanel,
    togglePanel,
    ensureSendSession,
    resetSendSession,
    currentViewParams,
    copyShareLink,
    copyEmbedSnippet,
    shareLinkNatively,
    downloadCurrentView: () => prepareCurrentView("download"),
    publishCurrentView: () => prepareCurrentView("publish"),
    setArtShareTarget,
    selectAction,
    prepareFile,
    sendToStickerLab,
    sharePost,
    destroy,
  };
}
