import type {
  PostProject,
  VideoEditorPlugin,
} from "@austencloud/video-editor/core";
import { normalizeAnimationSplit } from "#lib/shared/media-composition/domain/post-animation-split.js";
import { normalizePanelLift } from "#lib/shared/media-composition/domain/post-panel-lift.js";
import {
  mergeSeparateTunnelHook,
  splitTunnelHookTitles,
} from "#lib/shared/media-composition/domain/post-project-hook-migration.js";
import { withMotionKeys } from "#lib/shared/media-composition/domain/post-project-motion-keys.js";

// This module and everything it reaches must never import the plugin index by
// value: create-plugin imports it, and the index re-exports create-plugin.

/**
 * The two tka steps around the core layout pass. `before` brings older saved
 * projects up to the current shape (a separate tunnel hook folded into its
 * animation, opening titles split out of it); `after` writes the tunnel and
 * hand-off moves as the animation's own box keys.
 */
export const TKA_NORMALIZE: NonNullable<VideoEditorPlugin["normalize"]> = {
  before: (project) => splitTunnelHookTitles(mergeSeparateTunnelHook(project)),
  after: (project) => withNormalizedSplits(withMotionKeys(project)),
};

/**
 * Every animation's split as `normalizeAnimationSplit` keeps it, and its
 * lifted panel as `normalizePanelLift` keeps it.
 */
function withNormalizedSplits(project: PostProject): PostProject {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    let trackChanged = false;
    const items = track.items.map((item) => {
      if (item.kind !== "animation" || (!item.split && !item.panelLift))
        return item;
      const split = item.split && normalizeAnimationSplit(item.split);
      const panelLift = item.panelLift && normalizePanelLift(item.panelLift);
      if (split === item.split && panelLift === item.panelLift) return item;
      trackChanged = true;
      const next = { ...item };
      if (split) next.split = split;
      if (panelLift) next.panelLift = panelLift;
      return next;
    });
    if (!trackChanged) return track;
    changed = true;
    return { ...track, items };
  });
  return changed ? { ...project, tracks } : project;
}
