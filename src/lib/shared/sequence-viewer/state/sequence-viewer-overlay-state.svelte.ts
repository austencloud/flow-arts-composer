import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ViewMode } from "$lib/shared/sequence-viewer/domain/viewer-orchestrator-context";
import type { ViewerMode } from "$lib/shared/sequence-viewer/state/viewer-state.svelte";
import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type {
  TunnelComposition,
  TunnelSaveTarget,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import type { TunnelSavedCallback } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { getShortCodeShareMessage } from "$lib/shared/qr/domain/short-code-error";
import {
  mutateCurrentUrl,
  removeCurrentUrlParams,
  writeUrl,
} from "$lib/shared/navigation/services/url-state";
import { VIEWER_STATE_PARAM_NAMES } from "../services/viewer-url-state-codec";
import type { SequenceViewerSource } from "$lib/shared/sequence-viewer/analytics/viewer-events";

import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

let _collectionPropType = $state<PropType | null>(null);
let _isOpen = $state(false);
let _sequence = $state<SequenceData | null>(null);
let _variations = $state<SequenceData[]>([]);
let _variationIndex = $state(0);
let _returnLabel = $state("Back");
let _initialBpm = $state(60);
let _initialPlaybackMode = $state<PlaybackMode>("continuous");
let _initialStep = $state(0);
let _initialViewMode = $state<ViewMode | undefined>();
let _initialViewerMode = $state<ViewerMode | undefined>();
let _tunnelComposition = $state<TunnelComposition | null>(null);
let _tunnelSaveTarget = $state<TunnelSaveTarget | null>(null);
let _onTunnelSaved = $state<TunnelSavedCallback | null>(null);
let _dismissPath = $state<string | null>(null);
let _handPathMode = $state(false);
let _playOnOpen = $state(false);
let _shareOnOpen = $state(false);
let _openedFromUrl = $state(false);
let _activeShortCode = $state<string | null>(null);
let _analyticsSource = $state<SequenceViewerSource>("external_link");
let _openToken = $state(0);

export function openSequenceOverlay(
  sequence: SequenceData,
  options: {
    analyticsSource: SequenceViewerSource;
    returnLabel?: string;
    collectionPropType?: PropType | null;
    initialBpm?: number;
    initialPlaybackMode?: PlaybackMode;
    initialStep?: number;
    initialViewMode?: ViewMode;
    initialViewerMode?: ViewerMode;
    skipHistoryPush?: boolean;
    dismissPath?: string;
    variations?: SequenceData[];
    handPathMode?: boolean;
    /** Open on the 2D animation surface and request playback. */
    playOnOpen?: boolean;
    shareOnOpen?: boolean;
    fromUrl?: boolean;
    shortCode?: string;
    tunnelComposition?: TunnelComposition;
    tunnelSaveTarget?: TunnelSaveTarget;
    onTunnelSaved?: TunnelSavedCallback;
  }
): void {
  _sequence = sequence;
  _collectionPropType = options.collectionPropType ?? null;
  _variations = options.variations ?? [sequence];
  _variationIndex = _variations.findIndex((v) => v.id === sequence.id);
  if (_variationIndex < 0) _variationIndex = 0;
  _returnLabel = options.returnLabel || "Back";
  _initialBpm = options.initialBpm || 60;
  _initialPlaybackMode = options.initialPlaybackMode ?? "continuous";
  _initialStep = options.initialStep || 0;
  _initialViewMode = options.initialViewMode;
  _initialViewerMode = options.initialViewerMode;
  _tunnelComposition = options.tunnelComposition ?? null;
  _tunnelSaveTarget = options.tunnelSaveTarget ?? null;
  _onTunnelSaved = options.onTunnelSaved ?? null;
  _dismissPath = options.dismissPath || null;
  _handPathMode = options.handPathMode ?? false;
  _playOnOpen = options.playOnOpen ?? false;
  _shareOnOpen = options.shareOnOpen ?? false;
  _openedFromUrl = options.fromUrl ?? false;
  _activeShortCode = options.shortCode ?? null;
  _analyticsSource = options.analyticsSource;
  _isOpen = true;
  const token = ++_openToken;

  if (!options.skipHistoryPush) {
    writeUrl("", {
      mode: "push",
      state: { sequenceOverlay: true },
    });
  }

  if (!options.fromUrl && typeof window !== "undefined") {
    const url = new URL(window.location.href);
    if (url.searchParams.has("v")) {
      removeCurrentUrlParams(["v"], {
        state: { sequenceOverlay: true },
      });
    }
    void mintAndSyncShortCode(sequence, token);
  } else if (options.shortCode) {
    _activeShortCode = options.shortCode;
  }
}

async function waitForAuthSettled(timeoutMs = 5000): Promise<void> {
  if (!authState.loading) return;
  const start = Date.now();
  while (authState.loading && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function mintAndSyncShortCode(
  sequence: SequenceData,
  token: number
): Promise<void> {
  const manager = getShortCodeManager();
  if (!manager) return;

  await waitForAuthSettled();
  if (token !== _openToken || !_isOpen) return;

  // Short codes are signed-in only. Guests get no shareable `?v=` code — the
  // dense self-contained "s~..." code that used to fill that gap is gone (it
  // produced unscannable QRs and unwieldy URLs). A guest's URL bar simply
  // stays clean; signing in unlocks sharing.
  if (!authState.isAuthenticated) return;

  let code: string | null = null;
  try {
    const result = await manager.createShortCode(sequence, {
      embedSequenceData: true,
    });
    code = result.code;
  } catch (firebaseError) {
    const shareMessage = getShortCodeShareMessage(firebaseError);
    if (shareMessage && token === _openToken && _isOpen) {
      const failure =
        firebaseError instanceof Error
          ? firebaseError
          : new Error(String(firebaseError));
      getErrorHandler().showUserError({
        message: shareMessage,
        technicalDetails: failure.message,
        error: failure,
        severity: "warning",
        context: {
          module: "sequence-viewer",
          action: "createShareLink",
        },
      });
      return;
    }
    // Firestore write failed (offline / transient) — skip URL sync rather
    // than fall back to a dense inline code. The overlay still works; only
    // the shareable `?v=` param is absent.
    console.warn(
      "[SequenceViewerOverlay] URL sync skipped - short code mint failed.",
      firebaseError
    );
    return;
  }

  if (!code || token !== _openToken || !_isOpen) return;
  _activeShortCode = code;
  mutateCurrentUrl(
    (url) => {
      url.searchParams.set("v", code);
    },
    { state: { sequenceOverlay: true } }
  );
}

export function closeSequenceOverlay(): void {
  if (typeof window !== "undefined") {
    removeCurrentUrlParams(["v", ...VIEWER_STATE_PARAM_NAMES], {
      removeState: ["sequenceOverlay"],
    });
  }
  _isOpen = false;
  _sequence = null;
  _variations = [];
  _variationIndex = 0;
  _returnLabel = "Back";
  _collectionPropType = null;
  _initialBpm = 60;
  _initialPlaybackMode = "continuous";
  _initialStep = 0;
  _initialViewMode = undefined;
  _initialViewerMode = undefined;
  _tunnelComposition = null;
  _tunnelSaveTarget = null;
  _onTunnelSaved = null;
  _dismissPath = null;
  _handPathMode = false;
  _playOnOpen = false;
  _shareOnOpen = false;
  _openedFromUrl = false;
  _activeShortCode = null;
  _analyticsSource = "external_link";
}

export function switchVariation(index: number): void {
  if (index < 0 || index >= _variations.length) return;
  const variation = _variations[index];
  if (!variation) return;
  _variationIndex = index;
  _sequence = variation;
}

export function isSequenceOverlayOpen(): boolean {
  return _isOpen;
}

export function getSequenceOverlayState() {
  return {
    get isOpen() {
      return _isOpen;
    },
    get sequence() {
      return _sequence;
    },
    get variations() {
      return _variations;
    },
    get variationIndex() {
      return _variationIndex;
    },
    get collectionPropType() {
      return _collectionPropType;
    },
    get returnLabel() {
      return _returnLabel;
    },
    get initialBpm() {
      return _initialBpm;
    },
    get initialPlaybackMode() {
      return _initialPlaybackMode;
    },
    get initialStep() {
      return _initialStep;
    },
    get initialViewMode() {
      return _initialViewMode;
    },
    get initialViewerMode() {
      return _initialViewerMode;
    },
    get tunnelComposition() {
      return _tunnelComposition;
    },
    get tunnelSaveTarget() {
      return _tunnelSaveTarget;
    },
    get onTunnelSaved() {
      return _onTunnelSaved;
    },
    get dismissPath() {
      return _dismissPath;
    },
    get handPathMode() {
      return _handPathMode;
    },
    get playOnOpen() {
      return _playOnOpen;
    },
    get shareOnOpen() {
      return _shareOnOpen;
    },
    get openedFromUrl() {
      return _openedFromUrl;
    },
    get activeShortCode() {
      return _activeShortCode;
    },
    get analyticsSource() {
      return _analyticsSource;
    },
    /** Changes for every open, including replacing an already-open sequence. */
    get sessionKey() {
      return _openToken;
    },
  };
}
