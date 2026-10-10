/**
 * Restoring a saved tunnel or 3D scene doesn't just open a viewer — it also
 * overwrites app-wide settings the user had dialed in themselves (effort
 * preset, path lines, trail look, prop types, the 2D background theme, every
 * `tka-viewer3d-*` knob…). Without this, restoring one saved piece of art
 * quietly rewrites what every OTHER sequence looks like afterward, with no
 * way back.
 *
 * `captureSettingsCheckpoint` snapshots everything either apply path can
 * touch, right before it touches it. `revertSettingsCheckpoint` puts it all
 * back — through the same live setters the apply paths use (so already-
 * mounted components pick up the change immediately, not just on next
 * reload) plus the raw localStorage keys a freshly-mounted viewer reads at
 * construct time.
 *
 * This file needs `.svelte.ts` (not plain `.ts`) because `animationSettings`
 * .trail comes from a `$state` singleton and its `additionalLayerColors`
 * field is a nested array — a shallow copy would keep sharing that array
 * with the live reactive object. `$state.snapshot()` is a rune; runes only
 * compile inside `.svelte`/`.svelte.ts` files, so we escalate the file type
 * here rather than risk a stale/mutated snapshot.
 */

import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import {
  animationSettings,
  type TrailSettings,
} from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import { EFFECTS_CONFIG_STORAGE_KEY } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  persistViewerMode,
  type ViewerMode,
} from "#lib/shared/sequence-viewer/services/viewer-state-persistence.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  normalizePropLook,
  type PropLook,
} from "#lib/shared/pictograph/prop/domain/prop-look.js";
import { BackgroundType } from "@austencloud/backgrounds";
import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
import { normalizeLegacyPropConfig } from "@tka/tka-types";
import { normalizeLegacyTrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";

const CHECKPOINT_STORAGE_KEY = "tka_settings_checkpoint";

// Raw keys either apply path writes directly (see open-tunnel-in-viewer.ts /
// open-3d-scene.ts). These string literals are load-bearing — they must stay
// byte-identical to the keys those two files use.
const TUNNEL_VIEW_STATE_KEY = "tka_tunnel_view_state";
const VIEWER_MODE_KEY = "tka-viewer-mode";
const SCENE_FEATURES_KEY = "tka-scene-features";
const VIEWER3D_KEY_PREFIX = "tka-viewer3d-";

export interface SettingsCheckpoint {
  /** What to call this checkpoint in the Undo toast, e.g. the tunnel/scene name. */
  label: string;
  capturedAt: number;
  semantic: {
    effortPreset: EffortId;
    pathShape: "arc" | "linear" | "concave";
    motionAwarePaths: boolean;
    leftPathLines: boolean;
    rightPathLines: boolean;
    trail: TrailSettings;
    leftPropType: PropType;
    rightPropType: PropType;
    /**
     * The prop version at capture time. Revert writes the props back through
     * the settings rule that resets the version when a new prop with a Version
     * 2 arrives, so without this an Undo that restored such a prop would also
     * drop the performer to Version 1. Optional because checkpoints saved
     * before versions were captured have none.
     */
    propArtwork?: PropLook;
    backgroundType: BackgroundType;
  };
  raw: {
    tunnelViewState: string | null;
    effectsConfig: string | null;
    viewerMode: string | null;
    sceneFeatures: string | null;
    /** Every `tka-viewer3d-*` key present at capture time, key → raw value.
     *  A key ABSENT from this map means it didn't exist yet at capture time,
     *  so revert deletes it rather than writing back a value it never had. */
    viewer3d: Record<string, string>;
  };
}

export function normalizeLegacySettingsCheckpoint<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (
    !source.semantic ||
    typeof source.semantic !== "object" ||
    Array.isArray(source.semantic)
  ) {
    return value;
  }
  const legacySemantic = source.semantic as Record<string, unknown>;
  const semantic = normalizeLegacyPropConfig({ ...legacySemantic }) as Record<
    string,
    unknown
  >;
  semantic.leftPathLines ??= legacySemantic.bluePathLines;
  semantic.rightPathLines ??= legacySemantic.redPathLines;
  delete semantic.bluePathLines;
  delete semantic.redPathLines;
  if (legacySemantic.trail !== undefined) {
    semantic.trail = normalizeLegacyTrailSettings(legacySemantic.trail);
  }
  return { ...source, semantic } as T;
}

function readViewer3DKeys(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(VIEWER3D_KEY_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

function writeRawKey(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Quota exceeded / private browsing — best effort, mirrors how the apply
    // paths themselves swallow storage failures.
  }
}

function restoreViewer3DKeys(captured: Record<string, string>): void {
  // Delete any tka-viewer3d-* key that exists now but didn't exist at
  // capture time (the apply path created it from nothing) — collect first,
  // then remove, since mutating localStorage mid-iteration skips indices.
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(VIEWER3D_KEY_PREFIX) && !(key in captured)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) writeRawKey(key, null);
  for (const [key, value] of Object.entries(captured)) writeRawKey(key, value);
}

/**
 * Snapshot every setting either `openTunnelInViewer` or `applyScene3DLook`
 * is about to overwrite. Call as the FIRST act of an apply path, before any
 * mutation. Overwrites any previous checkpoint — only the most recent apply
 * can be undone (matches the design's "not in v1" note on a full history).
 */
export function captureSettingsCheckpoint(label: string): void {
  if (typeof localStorage === "undefined") return;

  const vm = getAnimationVisibilityManager();
  const settings = settingsService.settings;

  const checkpoint: SettingsCheckpoint = {
    label,
    capturedAt: Date.now(),
    semantic: {
      effortPreset: vm.getEffortPreset(),
      pathShape: vm.getPathShape(),
      motionAwarePaths: vm.getMotionAwarePaths(),
      leftPathLines: vm.getVisibility("leftPathLines"),
      rightPathLines: vm.getVisibility("rightPathLines"),
      trail: $state.snapshot(animationSettings.trail) as TrailSettings,
      leftPropType: settings.leftPropType ?? PropType.STAFF,
      rightPropType: settings.rightPropType ?? PropType.STAFF,
      propArtwork: normalizePropLook(settings.propArtwork),
      backgroundType: settings.backgroundType ?? BackgroundType.COSMIC,
    },
    raw: {
      tunnelViewState: localStorage.getItem(TUNNEL_VIEW_STATE_KEY),
      effectsConfig: localStorage.getItem(EFFECTS_CONFIG_STORAGE_KEY),
      viewerMode: localStorage.getItem(VIEWER_MODE_KEY),
      sceneFeatures: localStorage.getItem(SCENE_FEATURES_KEY),
      viewer3d: readViewer3DKeys(),
    },
  };

  try {
    localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoint));
  } catch {
    // Quota exceeded / private browsing — the apply still proceeds; Undo
    // just won't be offered for this one (no checkpoint to revert to).
  }
}

/**
 * Undo the most recent `captureSettingsCheckpoint` — re-applies the snapshot
 * through the same live setters the apply paths use (so mounted components
 * resync immediately) and restores the raw localStorage keys a freshly-
 * mounted viewer would read. Returns the checkpoint's label for toast copy,
 * or null if there was nothing to revert (already undone, or never captured).
 */
export function revertSettingsCheckpoint(): string | null {
  if (typeof localStorage === "undefined") return null;

  let checkpoint: SettingsCheckpoint;
  try {
    const raw = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    if (!raw) return null;
    checkpoint = normalizeLegacySettingsCheckpoint(
      JSON.parse(raw) as SettingsCheckpoint
    );
  } catch {
    return null;
  }

  const vm = getAnimationVisibilityManager();
  vm.setEffortPreset(checkpoint.semantic.effortPreset);
  vm.setPathShape(checkpoint.semantic.pathShape);
  vm.setMotionAwarePaths(checkpoint.semantic.motionAwarePaths);
  vm.setVisibility("leftPathLines", checkpoint.semantic.leftPathLines);
  vm.setVisibility("rightPathLines", checkpoint.semantic.rightPathLines);
  animationSettings.updateSettings({ trail: checkpoint.semantic.trail });
  void settingsService.updateSettings({
    leftPropType: checkpoint.semantic.leftPropType,
    rightPropType: checkpoint.semantic.rightPropType,
    // An old checkpoint names no version, so the write names none either and
    // the settings rule decides, as it did before checkpoints held a version.
    // Forcing Version 1 there would silently change a version the performer
    // may have kept on purpose.
    ...(checkpoint.semantic.propArtwork === undefined
      ? {}
      : { propArtwork: normalizePropLook(checkpoint.semantic.propArtwork) }),
    backgroundType: checkpoint.semantic.backgroundType,
  });

  writeRawKey(TUNNEL_VIEW_STATE_KEY, checkpoint.raw.tunnelViewState);
  writeRawKey(EFFECTS_CONFIG_STORAGE_KEY, checkpoint.raw.effectsConfig);
  writeRawKey(SCENE_FEATURES_KEY, checkpoint.raw.sceneFeatures);

  if (checkpoint.raw.viewerMode) {
    persistViewerMode(checkpoint.raw.viewerMode as ViewerMode);
  } else {
    writeRawKey(VIEWER_MODE_KEY, null);
  }

  restoreViewer3DKeys(checkpoint.raw.viewer3d);

  // Once reverted, this checkpoint has done its job — clear it so a second
  // Undo click (or a stray call) doesn't re-apply stale settings.
  writeRawKey(CHECKPOINT_STORAGE_KEY, null);

  return checkpoint.label;
}
