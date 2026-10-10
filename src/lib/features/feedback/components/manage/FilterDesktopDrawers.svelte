<!-- FilterDesktopDrawers - Side drawers for status/priority filters (desktop) -->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";
  import type { FilterBarUIState } from "../../state/filter-bar-ui-state.svelte";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import {
    STATUS_CONFIG,
    PRIORITY_CONFIG,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type {
    FeedbackStatus,
    FeedbackPriority,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FilterOptionGrid from "./FilterOptionGrid.svelte";

  interface Props {
    manageState: FeedbackManageState;
    uiState: FilterBarUIState;
  }

  const { manageState, uiState }: Props = $props();

  const hapticService = getHapticFeedback();

  function handleStatusFilter(status: FeedbackStatus | "all") {
    hapticService?.trigger("selection");
    manageState.setFilter("status", status);
    uiState.closeStatusDrawer();
  }

  function handlePriorityFilter(priority: FeedbackPriority | "all") {
    hapticService?.trigger("selection");
    manageState.setFilter("priority", priority);
    uiState.closePriorityDrawer();
  }

  // Prepare filter options for grid components
  const statusOptions = [
    {
      value: "all",
      label: "All Status",
      icon: "",
      color: "var(--semantic-success)",
    },
    ...Object.entries(STATUS_CONFIG).map(([value, config]) => ({
      value,
      label: config.label,
      icon: config.icon,
      color: config.color,
    })),
  ];

  const priorityOptions = [
    {
      value: "all",
      label: "All Priority",
      icon: "",
      color: "var(--semantic-success)",
    },
    ...Object.entries(PRIORITY_CONFIG).map(([value, config]) => ({
      value,
      label: config.label,
      icon: config.icon,
      color: config.color,
    })),
  ];
</script>

<!-- Status Filter Drawer (Right Side Panel) -->
<Drawer
  bind:isOpen={uiState.isStatusDrawerOpen}
  placement="right"
  ariaLabel="Status filter"
  class="filter-drawer"
>
  <div class="drawer-panel">
    <DrawerHeader
      title="Filter by Status"
      icon="fa-tasks"
      iconColor="var(--semantic-success)"
      onClose={() => uiState.closeStatusDrawer()}
    />
    <div class="filter-drawer-content">
      <FilterOptionGrid
        options={statusOptions}
        selectedValue={manageState.filters.status}
        onSelect={(v) => handleStatusFilter(v as FeedbackStatus | "all")}
        showIcons={true}
        isVertical={true}
      />
    </div>
  </div>
</Drawer>

<!-- Priority Filter Drawer (Right Side Panel) -->
<Drawer
  bind:isOpen={uiState.isPriorityDrawerOpen}
  placement="right"
  ariaLabel="Priority filter"
  class="filter-drawer"
>
  <div class="drawer-panel">
    <DrawerHeader
      title="Filter by Priority"
      icon="fa-flag"
      iconColor="var(--semantic-success)"
      onClose={() => uiState.closePriorityDrawer()}
    />
    <div class="filter-drawer-content">
      <FilterOptionGrid
        options={priorityOptions}
        selectedValue={manageState.filters.priority}
        onSelect={(v) => handlePriorityFilter(v as FeedbackPriority | "all")}
        showIcons={true}
        isVertical={true}
      />
    </div>
  </div>
</Drawer>

<style>
  .drawer-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(
      --theme-panel-bg,
      linear-gradient(180deg, #1e1e24 0%, #16161a 100%)
    );
  }

  .filter-drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 13px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
