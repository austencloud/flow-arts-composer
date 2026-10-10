/**
 * PhotoPickerLayoutDetector
 *
 * Determines the optimal layout for ProfilePhotoPicker based on viewport dimensions.
 * Extracted from the component to enable testing and keep layout logic centralized.
 */

import type { LayoutConfig } from "#lib/shared/settings/domain/photo-picker-types.js";

/**
 * Layout breakpoints with documented rationale
 */
const BREAKPOINTS = {
  /**
   * Width threshold for modal vs drawer.
   * 768px is the standard tablet/desktop breakpoint and matches when sidebar nav appears.
   */
  DESKTOP_WIDTH: 768,

  /**
   * Minimum height for any modal layout.
   * Below this, content won't fit comfortably - use drawer instead.
   */
  MIN_MODAL_HEIGHT: 500,

  /**
   * Minimum height for side-by-side modal layout at moderate widths.
   * Both panels need vertical space to show all controls without scrolling.
   */
  SIDE_BY_SIDE_MIN_HEIGHT: 1000,

  /**
   * Width threshold for "wide viewport" classification.
   * At this width, narrower panels require less vertical space.
   */
  WIDE_VIEWPORT_WIDTH: 1400,

  /**
   * Minimum height for side-by-side at wide viewports.
   * Narrower panels = content stacks better = lower height requirement.
   */
  SIDE_BY_SIDE_MIN_HEIGHT_WIDE: 800,

  /**
   * Width threshold for wizard mode.
   * Below this, the standard generate UI doesn't fit - use step-by-step wizard.
   */
  COMPACT_WIDTH: 400,
} as const;

/**
 * Detects the optimal layout configuration for the photo picker.
 *
 * Layout hierarchy:
 * 1. Desktop + tall viewport -> Side-by-side modal
 * 2. Desktop + moderate height -> Tabbed modal
 * 3. Mobile + wide enough -> Drawer with tabs
 * 4. Mobile + narrow -> Drawer with wizard
 */
export function detectLayout(
  viewportWidth: number,
  viewportHeight: number
): LayoutConfig {
  // Desktop shows modal, mobile shows drawer
  // Use modal if we have desktop width AND enough height for at least tabbed modal
  const isDesktop =
    viewportWidth >= BREAKPOINTS.DESKTOP_WIDTH &&
    viewportHeight >= BREAKPOINTS.MIN_MODAL_HEIGHT;

  // Within modal: use side-by-side layout only if we have enough height
  // Wide viewports can use side-by-side at lower heights (narrower panels = less vertical space needed)
  const useSideBySide =
    viewportHeight >= BREAKPOINTS.SIDE_BY_SIDE_MIN_HEIGHT ||
    (viewportWidth >= BREAKPOINTS.WIDE_VIEWPORT_WIDTH &&
      viewportHeight >= BREAKPOINTS.SIDE_BY_SIDE_MIN_HEIGHT_WIDE);

  // Use wizard (step-by-step) mode on very small screens
  const useWizardMode = viewportWidth < BREAKPOINTS.COMPACT_WIDTH;

  return {
    isDesktop,
    useSideBySide,
    useWizardMode,
  };
}

/**
 * Export breakpoints for testing and documentation
 */
export { BREAKPOINTS };
