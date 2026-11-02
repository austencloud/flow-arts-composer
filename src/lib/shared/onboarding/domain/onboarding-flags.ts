/**
 * Onboarding Flags
 *
 * AUTO_TOURS_ENABLED (off) gates the step-editor coach-mark walkthroughs that
 * auto-pop while a user works. Unfinished, so they stay off: a new user never
 * gets interrupted mid-task by one of these. (The Fuse walkthrough was deleted
 * 2026-07-10.)
 *
 * Nothing offers the Create guided-build tutorial on its own. The first-visit
 * offer on the Construct tab, and the flag that gated it, were removed
 * 2026-11-01. The Settings "replay tutorial" path (appEntryState.replay)
 * starts it regardless of these flags.
 *
 * Flip AUTO_TOURS_ENABLED to true when the coach marks are polished.
 */
export const AUTO_TOURS_ENABLED = false;

/**
 * First-ever 3D-viewer open guided setup (scene → formation → presets).
 * Spec: docs/superpowers/specs/2026-08-23-viewer3d-intro-presets-design.md.
 * Independent of AUTO_TOURS_ENABLED — this is a one-shot overlay on the 3D
 * pane, not an auto-popping coach mark.
 */
export const VIEWER3D_INTRO_ENABLED = true;
