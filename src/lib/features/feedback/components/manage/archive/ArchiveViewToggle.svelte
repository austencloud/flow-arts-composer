<!-- ArchiveViewToggle - Toggle between releases and all items views -->
<script lang="ts">
  type ViewMode = "releases" | "all";

  const { viewMode, onViewModeChange } = $props<{
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
  }>();
</script>

<div class="view-toggle">
  <button
    type="button"
    class="toggle-btn"
    class:active={viewMode === "releases"}
    onclick={() => onViewModeChange("releases")}
  >
    <i class="fas fa-tags" aria-hidden="true"></i>
    By Release
  </button>
  <button
    type="button"
    class="toggle-btn"
    class:active={viewMode === "all"}
    onclick={() => onViewModeChange("all")}
  >
    <i class="fas fa-list" aria-hidden="true"></i>
    All Items
  </button>
</div>

<style>
  .view-toggle {
    display: flex;
    gap: 4px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 90%,
      transparent
    );
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--duration-normal), border-color var(--duration-normal), color var(--duration-normal), opacity var(--duration-normal), transform var(--duration-normal), box-shadow var(--duration-normal);
    white-space: nowrap;
  }

  .toggle-btn:hover {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .toggle-btn.active {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .toggle-btn i {
    font-size: var(--font-size-compact);
  }

  @media (max-width: 768px) {
    .view-toggle {
      width: 100%;
    }

    .toggle-btn {
      flex: 1;
      justify-content: center;
    }
  }
</style>
