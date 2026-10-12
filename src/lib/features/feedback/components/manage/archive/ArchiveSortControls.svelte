<!-- ArchiveSortControls - Sort controls for archived items list -->
<script lang="ts">
  type SortField = "date" | "type" | "title";
  type SortOrder = "asc" | "desc";

  let { sortBy = $bindable(), sortOrder = $bindable() } = $props<{
    sortBy: SortField;
    sortOrder: SortOrder;
  }>();

  function toggleSortOrder() {
    sortOrder = sortOrder === "asc" ? "desc" : "asc";
  }
</script>

<div class="sort-controls">
  <label>
    <span>Sort by:</span>
    <select bind:value={sortBy}>
      <option value="date">Date Archived</option>
      <option value="type">Type</option>
      <option value="title">Title</option>
    </select>
  </label>
  <button
    type="button"
    class="sort-order-btn"
    onclick={toggleSortOrder}
    aria-label={sortOrder === "asc" ? "Sort ascending" : "Sort descending"}
  >
    <i
      class="fas fa-sort-amount-{sortOrder === 'asc' ? 'up' : 'down'}"
      aria-hidden="true"
    ></i>
  </button>
</div>

<style>
  .sort-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 80%,
      transparent
    );
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
  }

  .sort-controls label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .sort-controls select {
    padding: 4px 8px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 90%,
      transparent
    );
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-compact);
    cursor: pointer;
  }

  .sort-controls select:hover {
    border-color: var(--theme-stroke-strong);
  }

  .sort-order-btn {
    padding: 6px 10px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: background var(--duration-normal), border-color var(--duration-normal), color var(--duration-normal), opacity var(--duration-normal), transform var(--duration-normal), box-shadow var(--duration-normal), width var(--duration-normal);
  }

  .sort-order-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  @media (max-width: 768px) {
    .sort-controls {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .sort-controls label {
      width: 100%;
    }

    .sort-controls select {
      flex: 1;
    }
  }
</style>
