const ACTIVE_LAYER_SELECTOR =
  'dialog[open], [role="dialog"][aria-modal="true"]';

export interface ShortcutTargetResolutionOptions {
  targetSelector: string;
  scopeSelector?: string;
  ignoreEditableFocus?: boolean;
  excludedLayerSelector?: string;
  /**
   * Treat a disabled target as "this owner has nothing to offer" rather than
   * as a wall. Set by shortcuts whose targets carry a history, so an owner with
   * an empty one cannot swallow the key from an owner that has entries.
   */
  preferEnabled?: boolean;
}

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    style?.display === "none" ||
    style?.visibility === "hidden" ||
    style?.visibility === "collapse"
  ) {
    return false;
  }

  return element.getClientRects().length > 0;
}

/**
 * Returns whether keyboard input currently belongs to a text-editing control.
 * Global tools use this boundary before claiming keys so an editor behind a
 * drawer cannot turn a message into camera movement or a shortcut.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const editableHost = target.closest<HTMLElement>("[contenteditable]");
  if (
    editableHost &&
    editableHost.getAttribute("contenteditable")?.toLowerCase() !== "false"
  ) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;

  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(target.type);
}

const KEY_OWNING_LAYER_SELECTOR =
  'dialog[open], [role="dialog"], [role="alertdialog"], [role="radiogroup"]';

const FOCUSABLE_CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="treeitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Returns whether a bare key pressed right now belongs to the focused widget
 * rather than to a module-wide single-key shortcut. That is the case inside an
 * open dialog or drawer (the layer owns everything within it, including its
 * own focusable container), inside a roving-tabindex radiogroup (its arrows
 * move the selection), or on any control the user has Tabbed to. Only neutral
 * focus, such as <body> or a skip-link landmark, leaves the key free.
 *
 * Without this boundary the manager treats ArrowDown on a drawer's radio as a
 * grid-navigation shortcut, dismisses the drawer, and the user watches the
 * panel they were adjusting vanish under their fingers.
 */
export function isWidgetOwnedKeyboardTarget(
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(KEY_OWNING_LAYER_SELECTOR)) return true;
  return target.matches(FOCUSABLE_CONTROL_SELECTOR);
}

function getLayerZIndex(layer: HTMLElement): number {
  const value = layer.ownerDocument.defaultView?.getComputedStyle(layer).zIndex;
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTopLayer(
  document: Document,
  excludedLayerSelector: string | undefined
): HTMLElement | null {
  const layers = Array.from(
    document.querySelectorAll<HTMLElement>(ACTIVE_LAYER_SELECTOR)
  ).filter(
    (layer) =>
      isVisible(layer) &&
      (!excludedLayerSelector || !layer.matches(excludedLayerSelector))
  );

  return layers.reduce<HTMLElement | null>((top, layer) => {
    if (!top) return layer;
    return getLayerZIndex(layer) >= getLayerZIndex(top) ? layer : top;
  }, null);
}

function getDomDistance(from: Element, to: Element): number {
  const fromPath = new Map<Element, number>();
  let current: Element | null = from;
  let distance = 0;

  while (current) {
    fromPath.set(current, distance);
    current = current.parentElement;
    distance += 1;
  }

  current = to;
  distance = 0;
  while (current) {
    const sharedDistance = fromPath.get(current);
    if (sharedDistance !== undefined) return sharedDistance + distance;
    current = current.parentElement;
    distance += 1;
  }

  return Number.MAX_SAFE_INTEGER;
}

/**
 * Finds the active target for a semantic shortcut.
 *
 * Modal layers block the page behind them. A focused editor scope blocks its
 * siblings, and the nearest target wins when several independent editors share
 * a page.
 *
 * With `preferEnabled`, enabled targets are considered first. A host can embed
 * a shared control that brings its own bridge — the Stage renders the 3D scene
 * rail inside its own editor scope — and without this the nearer of the two
 * wins even while it is disabled, which reads to the user as Ctrl+Z doing
 * nothing at all.
 */
export function resolveShortcutTarget<T extends HTMLElement>(
  document: Document,
  options: ShortcutTargetResolutionOptions
): T | null {
  const activeElement = document.activeElement;
  if (options.ignoreEditableFocus && isEditableKeyboardTarget(activeElement)) {
    return null;
  }

  const visibleTargets = Array.from(
    document.querySelectorAll<T>(options.targetSelector)
  ).filter(isVisible);

  const topLayer = getTopLayer(document, options.excludedLayerSelector);
  let candidates = topLayer
    ? visibleTargets.filter((target) => topLayer.contains(target))
    : visibleTargets;

  const focusedScope = options.scopeSelector
    ? activeElement?.closest<HTMLElement>(options.scopeSelector)
    : null;
  if (focusedScope && (!topLayer || topLayer.contains(focusedScope))) {
    candidates = candidates.filter((target) => focusedScope.contains(target));
  }

  if (options.preferEnabled) {
    const enabled = candidates.filter(isShortcutTargetEnabled);
    if (enabled.length > 0) candidates = enabled;
  }

  if (candidates.length === 0) return null;
  if (!activeElement) return candidates[0] ?? null;

  return (
    candidates.reduce<T | null>((closest, candidate) => {
      if (!closest) return candidate;
      return getDomDistance(activeElement, candidate) <
        getDomDistance(activeElement, closest)
        ? candidate
        : closest;
    }, null) ?? null
  );
}

export function isShortcutTargetEnabled(target: HTMLElement): boolean {
  return !(
    (target instanceof HTMLButtonElement && target.disabled) ||
    target.getAttribute("aria-disabled") === "true"
  );
}
