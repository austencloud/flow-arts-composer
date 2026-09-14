import { createLayoutMotion } from "$lib/shared/transitions/layout-flip";
import { motionDuration } from "$lib/shared/transitions/motion";
import { DURATION } from "$lib/shared/transitions/transitions";

export interface ReparentOptions {
  target: HTMLElement | null;
  animate?: boolean;
  /** Move the mounted host, but measure/animate its visual surface independently
   * when sibling chrome (such as a loaned transport) changes its allocation. */
  visualSelector?: string;
  resize?: "scale" | "layout";
  /** Bottom-aligned control rows return to this stationary allocation while
   * their actual DOM parent (the canvas) is still flying independently. */
  returnAnchor?: HTMLElement | null;
  flightLayer?: "artwork" | "controls";
  /** A dependent control row must not dock underneath artwork still in flight. */
  canDock?: () => boolean;
  onMoving?: (moving: boolean) => void;
}
type ReparentTarget = HTMLElement | null | ReparentOptions;

interface ReparentAction {
  capture(): void;
  update(target: ReparentTarget): void;
  destroy(): void;
}

/**
 * Moves one already-mounted settings surface into the viewer's inspector slot.
 * Restoring the original position keeps the same component usable in standalone
 * art hosts and when a responsive layout changes back to the bottom dock.
 */
export function reparentToInspector(
  node: HTMLElement,
  target: ReparentTarget
): ReparentAction {
  const origin = node.parentNode;
  const originNextSibling = node.nextSibling;
  const key = `handoff-${crypto.randomUUID()}`;
  node.dataset.surfaceHandoff = key;
  const initialOptions =
    target && !(target instanceof HTMLElement) ? target : null;
  const visualSelector = initialOptions?.visualSelector;
  const motion = createLayoutMotion({
    resize: initialOptions?.resize,
    getRoot: () => node.ownerDocument.body,
    groups: [
      {
        selector: `[data-surface-handoff="${key}"]${visualSelector ? ` ${visualSelector}` : ""}`,
        datasetKey: "surfaceHandoff",
      },
    ],
    getDuration: () => motionDuration(DURATION.emphasis),
  });
  let version = 0;
  let savedStyle: string | null | undefined;
  let destination: HTMLElement | null = null;
  let movingCallback: ReparentOptions["onMoving"];
  let trackingFrame = 0;
  let dockingFrame = 0;
  let stationaryFlight: ReturnType<typeof setTimeout> | undefined;

  function restoreStyle(): void {
    delete node.dataset.surfaceFlight;
    if (savedStyle === undefined) return;
    if (savedStyle === null) node.removeAttribute("style");
    else node.setAttribute("style", savedStyle);
    savedStyle = undefined;
  }

  function move(nextTarget: HTMLElement | null): void {
    if (nextTarget) {
      if (node.parentNode !== nextTarget) nextTarget.appendChild(node);
      return;
    }

    if (!origin || node.parentNode === origin) return;
    if (originNextSibling?.parentNode === origin) {
      origin.insertBefore(node, originNextSibling);
    } else {
      origin.appendChild(node);
    }
  }

  function update(value: ReparentTarget): void {
    const options =
      value && !(value instanceof HTMLElement) ? value : { target: value };
    const next = options.target;
    if (next === destination && savedStyle !== undefined) return;
    if (next === destination && node.parentNode === (next ?? origin)) return;
    destination = next;
    const ticket = ++version;
    cancelAnimationFrame(trackingFrame);
    cancelAnimationFrame(dockingFrame);
    clearTimeout(stationaryFlight);
    movingCallback?.(false);
    movingCallback = options.onMoving;
    const before = node.getBoundingClientRect();
    const animate =
      options.animate &&
      node.isConnected &&
      before.width > 0 &&
      before.height > 0 &&
      motionDuration(DURATION.emphasis) > 0;
    const captured = animate && (motion.hasCapture || motion.capture());
    if (!captured) motion.cancel();
    restoreStyle();
    move(next);
    const measured = node.getBoundingClientRect();
    const anchor = next === null ? options.returnAnchor : null;
    const anchorRect = anchor?.getBoundingClientRect();
    // The canvas is flying independently. Its transform scales descendant
    // rectangles, but a loaned control row must aim at the host's layout size,
    // not inherit that artwork scale a second time.
    const localRect =
      options.resize === "layout"
        ? {
            left: measured.left,
            top: measured.top,
            width: node.offsetWidth || measured.width,
            height: node.offsetHeight || measured.height,
          }
        : measured;
    const rect = anchorRect
      ? {
          left: anchorRect.left,
          top: anchorRect.bottom - localRect.height,
          width: anchorRect.width,
          height: localRect.height,
        }
      : localRect;
    if (!captured || rect.width < 1 || rect.height < 1) {
      motion.discard();
      return;
    }

    // The live surface travels above both clipping hosts. It is never cloned:
    // the renderer keeps drawing while the surrounding workspace rearranges.
    savedStyle = node.getAttribute("style");
    const host =
      anchor ?? next ?? (origin instanceof HTMLElement ? origin : null);
    const hostRect = host?.getBoundingClientRect();
    const hostWidth =
      options.resize === "layout" ? host?.clientWidth : hostRect?.width;
    const hostHeight =
      options.resize === "layout" ? host?.clientHeight : hostRect?.height;
    node.ownerDocument.body.appendChild(node);
    node.dataset.surfaceFlight = "true";
    Object.assign(node.style, {
      position: "fixed",
      inset: "auto",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      maxWidth: "none",
      maxHeight: "none",
      zIndex:
        options.flightLayer === "controls"
          ? "calc(var(--z-debug, 1000) + 1)"
          : "var(--z-debug, 1000)",
      pointerEvents: "none",
    });
    movingCallback?.(true);
    const animations = motion.play();
    // The inspector track is closing while the phone arrives. Follow that
    // destination during the flight so docking cannot add a final side-step.
    const track = () => {
      if (ticket !== version || !host || !hostRect) return;
      const current = host.getBoundingClientRect();
      if (current.width > 0 && current.height > 0) {
        node.style.left = `${rect.left + current.left - hostRect.left}px`;
        node.style.top = `${rect.top + (anchor ? current.bottom - hostRect.bottom : current.top - hostRect.top)}px`;
        const width =
          options.resize === "layout" ? host.clientWidth : current.width;
        const height =
          options.resize === "layout" ? host.clientHeight : current.height;
        node.style.width = `${Math.max(1, rect.width + width - (hostWidth ?? width))}px`;
        node.style.height = `${Math.max(1, rect.height + (anchor ? 0 : height - (hostHeight ?? height)))}px`;
      }
      trackingFrame = requestAnimationFrame(track);
    };
    trackingFrame = requestAnimationFrame(track);
    const settle = () => {
      if (ticket !== version) return;
      if (options.canDock?.() === false) {
        dockingFrame = requestAnimationFrame(settle);
        return;
      }
      cancelAnimationFrame(trackingFrame);
      restoreStyle();
      move(destination);
      movingCallback?.(false);
    };
    // A control row can occupy the same rectangle in both modes. It still
    // needs to stay above the destination's entrance fade, not disappear and
    // reappear merely because there was no distance to travel.
    if (animations.length === 0 && options.resize === "layout") {
      stationaryFlight = setTimeout(settle, motionDuration(DURATION.emphasis));
    } else if (animations.length === 0) settle();
    else
      void Promise.all(
        animations.map((animation) => animation.finished.catch(() => undefined))
      ).then(settle);
  }

  update(target);
  return {
    capture: () => {
      motion.capture();
    },
    update,
    destroy: () => {
      ++version;
      cancelAnimationFrame(trackingFrame);
      cancelAnimationFrame(dockingFrame);
      clearTimeout(stationaryFlight);
      motion.cancel();
      restoreStyle();
      // Svelte may already have removed the owning block before action cleanup.
      // Restoring a detached node here would resurrect a dead canvas over the
      // replacement. A still-loaned node does need to leave its external host.
      if (node.parentNode) move(null);
      movingCallback?.(false);
      delete node.dataset.surfaceHandoff;
    },
  };
}
