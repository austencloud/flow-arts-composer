import type { logShareAction } from "#lib/shared/analytics/services/posthog-activity-logger.js";
import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ShareURLMetadata } from "#lib/shared/navigation/services/types.js";
import type { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type { PendingActionType } from "./pending-action-queue";
import type { ViewerUrlParamPatch } from "./viewer-url-state-codec";
import {
  buildViewerBrowserUrl,
  buildViewerShareDetails,
  buildViewerWebUrl,
} from "./viewer-orchestrator-model";

interface ViewerShareInputs {
  getSequence: () => SequenceData | null;
  getBpm: () => number;
  getDarkMode: () => boolean;
  getHapticService: () => HapticFeedback | null;
  /** Synchronous full-state snapshot as of the moment of Share/Copy. */
  getStateParams?: () => ViewerUrlParamPatch;
}

interface ViewerShareDependencies {
  getCurrentUrl: () => string;
  buildUrl: (sequence: SequenceData, metadata: ShareURLMetadata) => string;
  getNavigator: () => Navigator | null;
  setLocation: (url: string) => void;
  openWindow: (url: string) => void;
  showToast: typeof showToast;
  logShareAction: typeof logShareAction;
}

export function createViewerShareActions(
  inputs: ViewerShareInputs,
  dependencies: ViewerShareDependencies
) {
  function getShareDetails() {
    return buildViewerShareDetails({
      sequence: inputs.getSequence(),
      bpm: inputs.getBpm(),
      darkMode: inputs.getDarkMode(),
      fallbackUrl: dependencies.getCurrentUrl(),
      buildUrl: dependencies.buildUrl,
      getStateParams: inputs.getStateParams,
    });
  }

  async function copyViewerLink(
    shareMethod: "clipboard" | "viewer_copy_link"
  ): Promise<boolean> {
    const details = getShareDetails();
    const viewerNavigator = dependencies.getNavigator();
    if (typeof viewerNavigator?.clipboard?.writeText !== "function") {
      dependencies.showToast("Clipboard access is unavailable", "error");
      return false;
    }

    try {
      await viewerNavigator.clipboard.writeText(details.url);
      dependencies.showToast("Link copied to clipboard", "success");
      void dependencies.logShareAction("link_copy", {
        ...details.activityMetadata,
        shareMethod,
      });
      return true;
    } catch (error) {
      console.error("[SequenceViewer] Link copy failed:", error);
      dependencies.showToast("Could not copy link", "error");
      return false;
    }
  }

  function handleShare(): void {
    inputs.getHapticService()?.trigger("selection");
    const details = getShareDetails();
    const viewerNavigator = dependencies.getNavigator();

    if (viewerNavigator?.share) {
      viewerNavigator
        .share({
          title: details.title,
          text: details.text,
          url: details.url,
        })
        .then(() => {
          void dependencies.logShareAction("sequence_share", {
            ...details.activityMetadata,
            shareMethod: "native_link_share",
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error("[SequenceViewer] Native share failed:", error);
          dependencies.showToast("Could not open share options", "error");
        });
    } else if (viewerNavigator) {
      void copyViewerLink("clipboard");
    }
  }

  function handleCopyLink(): Promise<boolean> {
    inputs.getHapticService()?.trigger("selection");
    return copyViewerLink("viewer_copy_link");
  }

  function handleOpenInBrowser(
    pendingType: PendingActionType | null = null
  ): void {
    inputs.getHapticService()?.trigger("selection");
    const currentUrl = dependencies.getCurrentUrl();
    const webUrl = buildViewerWebUrl(currentUrl, pendingType);
    const browserUrl = buildViewerBrowserUrl(currentUrl, pendingType);
    if (!browserUrl || !webUrl) return;

    try {
      dependencies.setLocation(browserUrl);
    } catch {
      dependencies.openWindow(webUrl);
    }
  }

  /** Canonical share link, for callers that need the URL rather than an action. */
  function getShareUrl(): string {
    return getShareDetails().url;
  }

  return {
    handleShare,
    handleCopyLink,
    handleOpenInBrowser,
    getShareUrl,
  };
}
