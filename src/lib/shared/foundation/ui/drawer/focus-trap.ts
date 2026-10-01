/**
 * FocusTrapHandler - Manages focus trapping within modal elements
 *
 * Traps keyboard focus inside a container element, preventing Tab navigation
 * from escaping. Essential for WAI-ARIA compliant modal dialogs.
 *
 * Features:
 * - Traps Tab and Shift+Tab within container
 * - Handles dynamic content (recalculates focusable elements)
 * - Stores and restores previous focus on deactivate
 * - Marks background content as inert
 *
 * This is a plain helper class, not an inversify service - instantiated directly by components.
 */

/**
 * Default CSS class names that should remain interactive when drawer is open.
 * These elements are excluded from the `inert` attribute.
 */
export const DEFAULT_INERT_EXCLUSIONS = [
  "desktop-navigation-sidebar", // Allow navigation away from drawer
  "bottom-navigation", // Allow module switching on mobile
  "drawer-overlay", // Allow backdrop click to dismiss
  "drawer-interactive-portal", // Keep drawer-owned popovers interactive outside the drawer DOM
  "mind-overlay", // The ghost presenter's operator card must outlive any drawer
] as const;

export interface FocusTrapOptions {
  /** Element to focus when trap activates. Defaults to first focusable element. */
  initialFocus?: HTMLElement | null;
  /**
   * When true (and no explicit `initialFocus` is given), move focus to the
   * container itself rather than its first focusable control. Keeps the WAI-ARIA
   * dialog contract (focus enters the dialog, Tab is trapped) without lighting up
   * a `:focus-visible` ring on a header button the moment the dialog opens.
   */
  focusContainerOnInitial?: boolean;
  /** Whether to return focus to trigger element on deactivate. Default: true */
  returnFocusOnDeactivate?: boolean;
  /** Whether to set inert on sibling elements. Default: true */
  setInertOnSiblings?: boolean;
  /**
   * CSS class names of elements that should remain interactive (not set to inert).
   * Default: navigation sidebars and drawer overlays.
   * Pass empty array to make everything except the drawer inert.
   */
  inertExclusions?: readonly string[];
  /** Callback when user tries to escape (optional) */
  onEscapeAttempt?: () => void;
}

// Selector for all focusable elements
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export class FocusTrap {
  private container: HTMLElement | null = null;
  private previouslyFocused: HTMLElement | null = null;
  private inertElements: HTMLElement[] = [];
  private isActive = false;
  private handleKeydownBound: ((e: KeyboardEvent) => void) | null = null;

  constructor(private options: FocusTrapOptions = {}) {
    this.options = {
      returnFocusOnDeactivate: true,
      setInertOnSiblings: true,
      inertExclusions: DEFAULT_INERT_EXCLUSIONS,
      ...options,
    };
  }

  /**
   * Activate focus trap on the given container
   */
  activate(
    container: HTMLElement,
    returnFocusTarget = document.activeElement as HTMLElement | null
  ) {
    if (this.isActive) {
      this.deactivate();
    }

    this.container = container;
    this.isActive = true;

    // Store currently focused element for later restoration
    this.previouslyFocused = returnFocusTarget;

    // Set up keydown handler
    this.handleKeydownBound = this.handleKeydown.bind(this);
    document.addEventListener("keydown", this.handleKeydownBound);

    // Mark siblings as inert
    if (this.options.setInertOnSiblings) {
      this.setInertOnSiblings(true);
    }

    // Focus initial element
    this.focusInitialElement();
  }

  /**
   * Deactivate focus trap and restore previous focus
   */
  deactivate() {
    if (!this.isActive) return;

    this.isActive = false;

    // Remove keydown handler
    if (this.handleKeydownBound) {
      document.removeEventListener("keydown", this.handleKeydownBound);
      this.handleKeydownBound = null;
    }

    if (this.options.setInertOnSiblings) {
      this.setInertOnSiblings(false);
    }

    // Restore focus to previously focused element. Captured to a local
    // BEFORE nulling `this.previouslyFocused` below — the deferred callback
    // closes over `this`, not a snapshot, so reading `this.previouslyFocused`
    // inside the timeout always saw the value this same method had already
    // cleared, making focus restoration a silent no-op for every consumer
    // (Drawer, ErrorModal, and the onboarding overlays alike).
    const elementToRefocus = this.previouslyFocused;
    if (this.options.returnFocusOnDeactivate && elementToRefocus) {
      // Use setTimeout to ensure focus restoration happens after any animations
      setTimeout(() => {
        if (document.body.contains(elementToRefocus)) {
          elementToRefocus.focus();
        }
      }, 0);
    }

    this.container = null;
    this.previouslyFocused = null;
  }

  updateOptions(options: Partial<FocusTrapOptions>) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Check if focus trap is currently active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  private getFocusableElements(): HTMLElement[] {
    if (!this.container) return [];

    const elements = Array.from(
      this.container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );

    // Filter out elements that are not visible or have display:none
    return elements.filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        el.offsetParent !== null
      );
    });
  }

  /**
   * Focus the initial element when trap activates
   */
  private focusInitialElement() {
    // If custom initial focus specified, use it
    if (
      this.options.initialFocus &&
      this.container?.contains(this.options.initialFocus)
    ) {
      this.options.initialFocus.focus();
      return;
    }

    // Prefer focusing the container itself (no visible focus ring on a control)
    if (this.options.focusContainerOnInitial && this.container) {
      if (!this.container.hasAttribute("tabindex")) {
        this.container.setAttribute("tabindex", "-1");
      }
      this.container.focus();
      return;
    }

    // Otherwise focus first focusable element
    const focusable = this.getFocusableElements();
    if (focusable.length > 0) {
      focusable[0]!.focus();
    } else if (this.container) {
      // If no focusable elements, make container focusable and focus it
      if (!this.container.hasAttribute("tabindex")) {
        this.container.setAttribute("tabindex", "-1");
      }
      this.container.focus();
    }
  }

  /**
   * Handle Tab key to trap focus
   */
  private handleKeydown(event: KeyboardEvent) {
    if (!this.isActive || !this.container) return;

    // Only handle Tab key
    if (event.key !== "Tab") return;

    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      // No focusable elements - prevent Tab from leaving
      event.preventDefault();
      return;
    }

    const firstFocusable = focusable[0]!;
    const lastFocusable = focusable[focusable.length - 1]!;
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (
        activeElement === firstFocusable ||
        !this.container.contains(activeElement)
      ) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (
        activeElement === lastFocusable ||
        !this.container.contains(activeElement)
      ) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  /**
   * Check if an element should be excluded from inert based on its classes
   */
  private shouldExcludeFromInert(element: HTMLElement): boolean {
    const exclusions = this.options.inertExclusions ?? DEFAULT_INERT_EXCLUSIONS;
    return exclusions.some((className) =>
      element.classList.contains(className)
    );
  }

  /**
   * Set inert attribute on sibling elements to prevent screen reader access
   */
  private setInertOnSiblings(inert: boolean) {
    if (!this.container) return;

    if (inert) {
      // Find all siblings of ancestors up to body
      this.inertElements = [];
      let current: HTMLElement | null = this.container;

      while (current && current !== document.body) {
        const parent: HTMLElement | null = current.parentElement;
        if (parent) {
          // Mark all siblings as inert
          const currentElement = current; // Capture for closure
          Array.from(parent.children).forEach((sibling) => {
            if (sibling !== currentElement && sibling instanceof HTMLElement) {
              // Skip elements in the exclusion list (navigation, overlays, etc.)
              if (this.shouldExcludeFromInert(sibling)) {
                return;
              }
              // Don't set inert on elements that already have it
              if (!sibling.hasAttribute("inert")) {
                sibling.setAttribute("inert", "");
                this.inertElements.push(sibling);
              }
            }
          });
        }
        current = parent;
      }
    } else {
      // Remove inert from elements we set it on
      this.inertElements.forEach((el) => {
        el.removeAttribute("inert");
      });
      this.inertElements = [];
    }
  }
}
