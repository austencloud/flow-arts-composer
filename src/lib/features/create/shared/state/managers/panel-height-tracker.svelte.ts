/**
 * Panel Height Tracker
 *
 * Consolidates panel height tracking effects using ResizeObserver.
 * Tracks tool panel and button panel heights for accurate positioning.
 *
 * Domain: Create module - Panel Height Management
 */

import { untrack } from "svelte";
import {
  isInMovingPanelGroup,
  PANEL_SETTLE_EVENT,
} from "#lib/shared/panels/panel-motion.js";
import type { PanelCoordinationState } from "../panel-coordination-state.svelte";

export interface PanelHeightTrackerConfig {
  toolPanelElement: HTMLElement | null;
  buttonPanelElement: HTMLElement | null;
  panelState: PanelCoordinationState;
  /** The collapsed tool panel has no visible overlays to position. */
  isToolPanelVisible?: () => boolean;
}

export type PanelHeightTrackerCleanup = (options?: {
  /** Leave the published metrics in place for a replacement tracker. */
  keepMetrics?: boolean;
}) => void;

/**
 * Creates panel height tracking effects
 * @returns Cleanup function
 */
export function createPanelHeightTracker(
  config: PanelHeightTrackerConfig
): PanelHeightTrackerCleanup {
  const {
    toolPanelElement,
    buttonPanelElement,
    panelState,
    isToolPanelVisible = () => true,
  } = config;

  const cleanups: (() => void)[] = [];
  const rootElement =
    typeof document !== "undefined" ? document.documentElement : null;
  let scheduledFrame: number | null = null;
  let lastToolPanelHeight: number | null = null;
  let lastToolPanelWidth: number | null = null;
  let lastNavigationBarHeight: number | null = null;
  const lastRootMetrics = new Map<string, string>();

  const setRootMetric = (name: string, value: string) => {
    if (!rootElement || lastRootMetrics.get(name) === value) return;
    rootElement.style.setProperty(name, value);
    lastRootMetrics.set(name, value);
  };

  const setToolPanelHeight = (height: number) => {
    if (lastToolPanelHeight === height) return;
    lastToolPanelHeight = height;
    panelState.setToolPanelHeight(height);
  };

  const setToolPanelWidth = (width: number) => {
    if (lastToolPanelWidth === width) return;
    lastToolPanelWidth = width;
    panelState.setToolPanelWidth(width);
  };

  const setNavigationBarHeight = (height: number) => {
    if (lastNavigationBarHeight === height) return;
    lastNavigationBarHeight = height;
    panelState.setNavigationBarHeight(height);
  };

  const clearCreatePanelMetrics = () => {
    if (!rootElement) {
      return;
    }
    rootElement.style.removeProperty("--create-panel-left");
    rootElement.style.removeProperty("--create-panel-inset-right");
    rootElement.style.removeProperty("--create-panel-top");
    rootElement.style.removeProperty("--create-panel-bottom");
    rootElement.style.removeProperty("--create-panel-width");
    lastRootMetrics.clear();
    setNavigationBarHeight(64);
  };

  const updateToolPanelMetrics = () => {
    if (!untrack(isToolPanelVisible)) return;
    if (!toolPanelElement) {
      setToolPanelHeight(0);
      setToolPanelWidth(0);
      clearCreatePanelMetrics();
      return;
    }

    if (typeof window === "undefined") {
      setToolPanelHeight(toolPanelElement.clientHeight ?? 0);
      setToolPanelWidth(toolPanelElement.clientWidth ?? 0);
      return;
    }

    const rect = toolPanelElement.getBoundingClientRect();
    setToolPanelHeight(rect.height);
    setToolPanelWidth(rect.width);

    if (!rootElement) {
      return;
    }

    const insetRight = Math.max(window.innerWidth - rect.right, 0);
    const insetBottom = Math.max(window.innerHeight - rect.bottom, 0);
    const insetTop = Math.max(rect.top, 0);
    const insetLeft = Math.max(rect.left, 0);
    const width = Math.max(rect.width, 0);

    setRootMetric("--create-panel-left", `${insetLeft}px`);
    setRootMetric("--create-panel-inset-right", `${insetRight}px`);
    setRootMetric("--create-panel-top", `${insetTop}px`);
    setRootMetric("--create-panel-bottom", `${insetBottom}px`);
    setRootMetric("--create-panel-width", `${width}px`);

    // Update navigation bar height based on remaining viewport space
    setNavigationBarHeight(insetBottom);
  };

  // A collapsing workspace can notify both panels several times in one paint.
  // Read the settled rectangle once, then publish the final overlay geometry.
  // While the workspace slides, every frame resizes the tool panel; measuring
  // then forced an extra layout and rewrote root variables that restyle the
  // whole page each frame. The panel group's settle event measures once.
  const scheduleToolPanelMetrics = () => {
    if (scheduledFrame !== null) return;
    if (toolPanelElement && isInMovingPanelGroup(toolPanelElement)) return;
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = null;
      updateToolPanelMetrics();
    });
  };

  // Track tool panel height
  if (toolPanelElement) {
    // The first sequence brings the button panel with it, which replaces this
    // tracker while the workspace is opening. A tracker born mid-slide waits
    // for the settle event like every other measurement.
    if (!isInMovingPanelGroup(toolPanelElement)) updateToolPanelMetrics();

    const toolResizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0) {
        return;
      }
      scheduleToolPanelMetrics();
    });
    toolResizeObserver.observe(toolPanelElement);
    cleanups.push(() => toolResizeObserver.disconnect());

    if (typeof window !== "undefined") {
      const handleViewportChange = () => scheduleToolPanelMetrics();
      const handlePanelSettle = (event: Event) => {
        if (
          event.target instanceof Node &&
          event.target.contains(toolPanelElement)
        ) {
          scheduleToolPanelMetrics();
        }
      };
      window.addEventListener("resize", handleViewportChange);
      window.addEventListener("orientationchange", handleViewportChange);
      window.addEventListener("scroll", handleViewportChange, true);
      document.addEventListener(PANEL_SETTLE_EVENT, handlePanelSettle);

      cleanups.push(() => {
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("orientationchange", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
        document.removeEventListener(PANEL_SETTLE_EVENT, handlePanelSettle);
      });
    }
  }

  // Track button panel height
  if (buttonPanelElement) {
    const buttonResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        panelState.setButtonPanelHeight(entry.contentRect.height);
      }
      scheduleToolPanelMetrics();
    });
    buttonResizeObserver.observe(buttonPanelElement);
    cleanups.push(() => buttonResizeObserver.disconnect());
  }

  return ({ keepMetrics = false }: { keepMetrics?: boolean } = {}) => {
    if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame);
    cleanups.forEach((cleanup) => cleanup());
    // A replacement tracker publishes the same values again. Clearing them in
    // between restyled the whole page twice while the workspace opened.
    if (!keepMetrics) clearCreatePanelMetrics();
  };
}
