/**
 * How a Fuse follower operation presents itself: the LOOP primitive's colour.
 *
 * Every operation Fuse can apply to the follower path IS a LOOP transformation
 * primitive, and those primitives already carry brand colours that sequence
 * cards, export headers, and the Extend drawer all render. The Invert and
 * Rewind toggles wear those colours so the control and the LOOP surfaces
 * agree.
 *
 * The rule as a whole is not painted this way. A rule is named by the timing
 * and direction it pins (fuse-tnd-rule.ts), and the result strip, the follower
 * footer and the rail wear that mode's element instead. Painting the rule in
 * its operations' colours on top of that had two colour systems on one node.
 *
 * The colour VALUES stay owned by loop-option-color.ts.
 */

import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { loopComponentColors } from "$lib/shared/components/loop-picker/loop-option-color";

const FALLBACK_ACCENT = "var(--theme-accent, #8b5cf6)";

/**
 * The brand colour of ONE primitive, for a control that edits a single axis of
 * the rule — the Invert toggle, the Rewind toggle.
 */
export function fuseComponentColor(component: LOOPComponent): string {
  return loopComponentColors([component])[0] ?? FALLBACK_ACCENT;
}
