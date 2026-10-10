import type { CollectedTunnel } from "../domain/tunnel-collection-types";
import { collectedTunnelViewerSequence } from "../domain/collected-tunnel-source";
import { openSequenceOverlay } from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";
import { persistViewerMode } from "#lib/shared/sequence-viewer/services/viewer-state-persistence.js";
import { stageTunnelSnapshotForViewer } from "#lib/shared/sequence-viewer/tunnel/stage-tunnel-snapshot-for-viewer.js";
import {
  captureSettingsCheckpoint,
  revertSettingsCheckpoint,
} from "#lib/shared/collections/settings-checkpoint.svelte.js";
import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { closeSequenceOverlay } from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";
import { migrateTunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";

/**
 * Reproduce a saved tunnel in the real sequence viewer: apply the snapshot's
 * global/persisted state, then open the viewer overlay with its sequence. The
 * viewer boots showing the exact saved tunnel. With `autoExport`, an intent
 * flag is seeded so the viewer fires its tunnel video export once ready.
 *
 * Two seam classes are in play, and the ordering below is load-bearing:
 *
 *  - **Live singletons** (visibility manager, animationSettings, settingsService)
 *    are app-wide; setting them here applies immediately and the freshly-mounted
 *    viewer reads the same instances.
 *  - **Per-mount state** (tunnel controller, effects config, viewer mode) is
 *    reconstructed every time the viewer mounts. The viewer overlay is gated by
 *    `{#if overlay.sequence}` in SequenceViewerDrawerHost, so it unmounts on
 *    close and mounts FRESH on open — a fresh `TunnelViewController`
 *    (`loadTunnelViewState`), `createEffectsConfigState({persist:true})`
 *    (`loadStoredConfig` → EFFECTS_CONFIG_STORAGE_KEY), and `createViewerState`
 *    (`loadViewerMode`) each re-read localStorage at construct time. So we
 *    pre-seed those localStorage keys BEFORE calling `openSequenceOverlay`.
 *    `openSequenceOverlay` flips reactive state; the fresh mount runs in a later
 *    microtask, after these synchronous writes have landed.
 *
 * Every one of these writes overwrites settings the user configured for
 * themselves, with no prior warning. So the very first thing this function
 * does is snapshot the pre-apply state (`captureSettingsCheckpoint`), and
 * once the tunnel is open it shows a toast with an Undo button that puts
 * everything back (`revertSettingsCheckpoint`) and closes the viewer this
 * call opened — undoing the whole gesture, not just the settings.
 */
/** Session key: ArtPane consumes this once on mount and auto-fires the tunnel
 *  video export as soon as the playback controller is ready. sessionStorage so
 *  a stray flag can't survive into a later browser session. */
export const TUNNEL_AUTO_EXPORT_INTENT_KEY = "tka_tunnel_auto_export";

export function openTunnelInViewer(
  tunnel: CollectedTunnel,
  options: { autoExport?: boolean } = {}
): void {
  const snap = migrateTunnelSnapshot(tunnel.snapshot);

  // First act, before any global gets touched — see the settings-checkpoint
  // paragraph above.
  captureSettingsCheckpoint(tunnel.name);

  if (options.autoExport && typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(TUNNEL_AUTO_EXPORT_INTENT_KEY, "1");
    } catch {
      // storage unavailable — viewer still opens; user exports manually.
    }
  }

  stageTunnelSnapshotForViewer(snap);

  // 4. Viewer mode → tunnel. A fresh createViewerState() reads this key via
  //    loadViewerMode() ('tunnel' is a valid persisted ViewerMode).
  persistViewerMode("tunnel");

  // 5. Rebuild the saved sequence and open. A tunnel with no authored
  //    composition passes `undefined` here and the tunnel controller falls back
  //    to a one-performer cast around this same sequence — see
  //    collected-tunnel-source.ts for why that fallback now has one owner.
  openSequenceOverlay(collectedTunnelViewerSequence(tunnel), {
    analyticsSource: "tunnel_collection",
    initialBpm: snap.playback.bpm,
    initialPlaybackMode: snap.playback.playbackMode,
    tunnelComposition: tunnel.composition,
  });

  showToast({
    message: options.autoExport
      ? `Creating video for "${tunnel.name}"`
      : `Opened "${tunnel.name}" with its saved settings`,
    type: "success",
    duration: 8000,
    action: {
      label: "Undo",
      onClick: () => {
        revertSettingsCheckpoint();
        closeSequenceOverlay();
      },
    },
  });
}
