/**
 * What the Fuse canvas shows: the grid, the glyphs, the step number, the props,
 * the hand paths and the mandala. Customize changes it; the combined preview
 * and its two solos draw from it.
 *
 * Fuse keeps its own choices, because it opens with the elemental glyph on and
 * the step number off, and turning one of them here should not change the
 * viewer. How the props move (path shape, By Motion, effort) is not a Fuse
 * choice: those read and write the one setting every surface shares, so the
 * props the canvas draws never disagree with what the panel says.
 *
 * One instance for the module: Customize and the canvas are different branches
 * of the page, and the choices outlive a trip to another tab.
 */
import {
  ANIMATION_DISPLAY_KEYS,
  AnimationVisibilityStateManager,
  getAnimationVisibilityManager,
  type AnimationVisibilitySettings,
  type GridMode,
} from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

const STORAGE_KEY = "tka-fuse-display";
const GRID_MODES: readonly GridMode[] = ["none", "8point", "auto"];

type DisplayChoices = Partial<
  Pick<AnimationVisibilitySettings, (typeof ANIMATION_DISPLAY_KEYS)[number]>
>;

/** A classified pair should identify itself while it moves, so the element is
 *  on. The step number is off: the two path cards count the steps already. */
const FUSE_DEFAULTS: DisplayChoices = {
  tkaGlyph: true,
  elementalGlyph: true,
  stepNumbers: false,
};

function readChoices(): DisplayChoices {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const stored = parsed as Record<string, unknown>;
    const choices: Record<string, unknown> = {};
    for (const key of ANIMATION_DISPLAY_KEYS) {
      const value = stored[key];
      const valid =
        key === "gridMode"
          ? GRID_MODES.includes(value as GridMode)
          : typeof value === "boolean";
      if (valid) choices[key] = value;
    }
    return choices as DisplayChoices;
  } catch {
    return {};
  }
}

function writeChoices(manager: AnimationVisibilityStateManager): void {
  try {
    const settings = manager.snapshot();
    const choices = Object.fromEntries(
      ANIMATION_DISPLAY_KEYS.map((key) => [key, settings[key]])
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // Storage full or blocked: the choices still hold for this page load.
  }
}

let display: AnimationVisibilityStateManager | null = null;

export function getFuseDisplay(): AnimationVisibilityStateManager {
  if (display) return display;
  const manager = new AnimationVisibilityStateManager({ ephemeral: true });
  const shared = getAnimationVisibilityManager();
  manager.setMotionPolicySource(shared);
  manager.updateSettings({ ...FUSE_DEFAULTS, ...readChoices() });
  // A policy change made through Fuse notifies only the shared manager's
  // observers; this repaints the Fuse canvases for it, and for one made
  // anywhere else.
  shared.registerObserver(() => manager.notifyObservers());
  manager.registerObserver(() => writeChoices(manager));
  display = manager;
  return manager;
}
