/**
 * Tint resolution for LOOP option buttons.
 *
 * The six transformation primitives already have brand colors that sequence
 * cards, export headers, and the layered preview all render (LOOP_ICON_COLORS
 * in @tka/render-composition). The Extend drawer used a single accent for
 * every option, so Swapped and Inverted looked identical there while looking
 * different everywhere else. This maps a LOOPType back onto those same hexes.
 *
 * LOOP_ICON_COLORS itself stays untouched: it is shared with MCP export
 * rendering and locked by a test, and the orientation repeat below is not a
 * transformation primitive, so it does not belong in that map.
 */

import { LOOP_ICON_COLORS } from "@tka/render-composition";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { parseLoopComponents } from "#lib/shared/create/services/loop-type-utils.js";
import type { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";

/**
 * Amber, deliberately outside the six primitive hues: the orientation repeat
 * transforms nothing, and reusing a primitive's color would claim otherwise.
 */
export const ORIENTATION_REPEAT_COLOR = "#f5c542";

/** Canonical strip order, so a composite's gradient always reads the same way. */
const DISPLAY_ORDER: LOOPComponent[] = [
  LOOPComponent.ROTATED,
  LOOPComponent.MIRRORED,
  LOOPComponent.FLIPPED,
  LOOPComponent.SWAPPED,
  LOOPComponent.INVERTED,
  LOOPComponent.REWOUND,
];

const COMPONENT_COLORS: Partial<Record<LOOPComponent, string>> = {
  [LOOPComponent.ROTATED]: LOOP_ICON_COLORS.rotated,
  [LOOPComponent.MIRRORED]: LOOP_ICON_COLORS.mirrored,
  [LOOPComponent.FLIPPED]: LOOP_ICON_COLORS.flipped,
  [LOOPComponent.SWAPPED]: LOOP_ICON_COLORS.swapped,
  [LOOPComponent.INVERTED]: LOOP_ICON_COLORS.inverted,
  [LOOPComponent.REWOUND]: LOOP_ICON_COLORS.rewound,
};

/**
 * The colors for a set of primitives, in canonical order. Callers that already
 * know their components (Fuse's follower transforms) use this directly rather
 * than round-tripping through a LOOP type string.
 */
export function loopComponentColors(
  components: Iterable<LOOPComponent>
): string[] {
  const present = new Set(components);
  return DISPLAY_ORDER.filter((c) => present.has(c))
    .map((c) => COMPONENT_COLORS[c])
    .filter((c): c is string => Boolean(c));
}

/**
 * The colors a LOOP type is built from, in canonical order. Empty only for a
 * type naming no known primitive, which callers fall back on.
 */
export function loopTypeColors(loopType: LOOPType | string): string[] {
  return loopComponentColors(parseLoopComponents(loopType));
}

/**
 * CSS custom properties for one option button: the two stops its wash,
 * border, and glow are mixed from. One primitive sets both stops to the same
 * hue (a flat tint); a composite sets the first and last of its primitives,
 * so "Swapped / Inverted" reads green into orange — the same two hues its
 * badge carries on a sequence card.
 *
 * Two stops rather than N because the button mixes each stop with transparent
 * at a different strength; a raw N-stop gradient string could not carry that.
 */
export function loopOptionTint(colors: string[]): string {
  if (colors.length === 0) return "";
  const first = colors[0];
  const last = colors[colors.length - 1];
  // A flat tint wants its second stop faint — that fade is what gives the
  // button depth. A composite wants its second stop strong enough to actually
  // READ as a second colour; at the faint value the orange half of
  // "Swapped / Inverted" was invisible against the green.
  const secondStop = first === last ? "9%" : "24%";
  return `--loop-c1: ${first}; --loop-c2: ${last}; --loop-c2-mix: ${secondStop};`;
}

/** Convenience for the common "type in, style out" call. */
export function loopTypeTint(loopType: LOOPType | string): string {
  return loopOptionTint(loopTypeColors(loopType));
}
