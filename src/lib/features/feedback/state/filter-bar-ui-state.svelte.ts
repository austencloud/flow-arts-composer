/**
 * Filter Bar UI State
 *
 * Local UI state management for FeedbackFilterBar component.
 * Handles drawer/sheet open states, animations, and UI-specific derivations.
 * Filter logic is delegated to feedback-manage-state.svelte.ts
 */

import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";

export function createFilterBarUIState(
  getManageState: () => FeedbackManageState
) {
  // Mobile sheet state
  let isSheetOpen = $state(false);
  let isSheetAnimating = $state(false);
  let activeSection = $state<"type" | "status" | "priority" | null>(null);

  // Desktop drawer states
  let isStatusDrawerOpen = $state(false);
  let isPriorityDrawerOpen = $state(false);

  // Derived: Current status label for button display
  const currentStatusLabel = $derived(() => {
    const status = getManageState().filters.status;
    if (status === "all") return "All Status";
    return status;
  });

  // Derived: Current priority label for button display
  const currentPriorityLabel = $derived(() => {
    const priority = getManageState().filters.priority;
    if (priority === "all") return "All Priority";
    return priority;
  });

  // Derived: Count of active filters
  const activeFilterCount = $derived(
    [
      getManageState().filters.type !== "all",
      getManageState().filters.status !== "all",
      getManageState().filters.priority !== "all",
    ].filter(Boolean).length
  );

  // Sheet control functions
  function openSheet() {
    isSheetOpen = true;
    isSheetAnimating = true;
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      isSheetAnimating = false;
    }, 350);
  }

  function closeSheet() {
    isSheetAnimating = true;
    setTimeout(() => {
      isSheetOpen = false;
      isSheetAnimating = false;
      document.body.style.overflow = "";
    }, 280);
  }

  // Drawer control functions
  function openStatusDrawer() {
    isStatusDrawerOpen = true;
  }

  function closeStatusDrawer() {
    isStatusDrawerOpen = false;
  }

  function openPriorityDrawer() {
    isPriorityDrawerOpen = true;
  }

  function closePriorityDrawer() {
    isPriorityDrawerOpen = false;
  }

  // Section toggle for mobile sheet accordion
  function toggleSection(section: "type" | "status" | "priority") {
    activeSection = activeSection === section ? null : section;
  }

  return {
    // Sheet state & controls
    get isSheetOpen() {
      return isSheetOpen;
    },
    get isSheetAnimating() {
      return isSheetAnimating;
    },
    get activeSection() {
      return activeSection;
    },
    openSheet,
    closeSheet,
    toggleSection,

    // Drawer state & controls
    get isStatusDrawerOpen() {
      return isStatusDrawerOpen;
    },
    get isPriorityDrawerOpen() {
      return isPriorityDrawerOpen;
    },
    openStatusDrawer,
    closeStatusDrawer,
    openPriorityDrawer,
    closePriorityDrawer,

    // Derived
    get currentStatusLabel() {
      return currentStatusLabel();
    },
    get currentPriorityLabel() {
      return currentPriorityLabel();
    },
    get activeFilterCount() {
      return activeFilterCount;
    },
  };
}

export type FilterBarUIState = ReturnType<typeof createFilterBarUIState>;
