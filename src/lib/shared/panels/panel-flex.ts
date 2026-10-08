/**
 * How a panel is allowed to take space inside a PanelGroup.
 *
 * A panel is either *held* -- both grow and shrink are zero, so its flex-basis
 * alone decides its size -- or it takes a share of what is left. The
 * distinction matters for motion: a held panel's whole size lives in one
 * property, so that property has to be interpolable for the panel to animate.
 */
export interface PanelFlex {
  grow: number;
  shrink: number;
  basis: string;
}

export interface PanelFlexInput {
  fixedSize?: string;
  preferredSize?: string;
  defaultSize?: number;
}

export function resolvePanelFlex(
  panel: PanelFlexInput,
  options: { flexShare?: number; manuallySized?: boolean }
): PanelFlex {
  if (panel.fixedSize) {
    return { grow: 0, shrink: 0, basis: panel.fixedSize };
  }

  if (panel.preferredSize && !options.manuallySized) {
    return { grow: 0, shrink: 0, basis: panel.preferredSize };
  }

  return {
    grow: options.flexShare ?? panel.defaultSize ?? 1,
    shrink: 1,
    basis: "0px",
  };
}

export function panelFlexStyle(flex: PanelFlex): string {
  return `flex-grow: ${flex.grow}; flex-shrink: ${flex.shrink}; flex-basis: ${flex.basis}`;
}

export function isHeldPanel(flex: PanelFlex): boolean {
  return flex.grow === 0 && flex.shrink === 0;
}

function pxLength(basis: string): number | null {
  const match = /^(-?\d*\.?\d+)px$/.exec(basis.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Where each panel settles along the group's main axis, in px, once a running
 * flex transition finishes. Held panels keep their px basis; shared panels
 * split what is left by their grow factors, the way CSS does (a grow total
 * under 1 hands out only that fraction of the free space).
 *
 * Returns null when a held basis is not a px length (a content-sized dock) or
 * a shared panel starts from a non-zero basis: only layout knows those sizes.
 */
export function settledPanelSizes(
  flexes: readonly PanelFlex[],
  containerSize: number,
  reservedSize = 0
): number[] | null {
  let heldTotal = 0;
  let growTotal = 0;
  for (const flex of flexes) {
    const basis = pxLength(flex.basis);
    if (basis === null) return null;
    if (isHeldPanel(flex)) {
      heldTotal += basis;
    } else {
      if (basis !== 0) return null;
      growTotal += flex.grow;
    }
  }

  const free = Math.max(0, containerSize - reservedSize - heldTotal);
  const divisor = Math.max(1, growTotal);
  return flexes.map((flex) =>
    isHeldPanel(flex)
      ? (pxLength(flex.basis) ?? 0)
      : (free * flex.grow) / divisor
  );
}

/**
 * Whether a size change has to be measured before it can be animated.
 *
 * `flex-basis: 480px -> auto` is a discrete change: CSS has no interpolable
 * midpoint between a length and a content keyword, so the group re-lays out in
 * a single frame and every panel after the changed one teleports. Measuring
 * both ends in pixels turns it back into an ordinary length transition.
 *
 * This only holds while the panel is held at both ends. Once a panel takes a
 * flex share its basis is no longer its size, so pinning the basis would fight
 * the share instead of carrying the motion, and the declared grow transition is
 * already the right owner.
 */
export function needsMeasuredBasisHandoff(
  previous: PanelFlex,
  next: PanelFlex
): boolean {
  if (previous.basis === next.basis) return false;
  return isHeldPanel(previous) && isHeldPanel(next);
}
