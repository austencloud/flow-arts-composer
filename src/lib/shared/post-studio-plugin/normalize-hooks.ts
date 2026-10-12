import type { VideoEditorPlugin } from "@austencloud/video-editor/core";
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
  after: withMotionKeys,
};
