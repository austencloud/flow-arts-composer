<script lang="ts">
  const SEARCH_CONSOLE_URL =
    "https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Atkaflowarts.com";
  const BIGQUERY_URL =
    "https://console.cloud.google.com/bigquery?project=the-kinetic-alphabet";
  const POSTHOG_URL = "https://us.posthog.com/project/299320/dashboard";
  const DAILY_CHECK_URL =
    "https://github.com/austencloud/tka-platform/actions/workflows/seo-measurement.yml";

  let {
    refreshedAt,
    refreshing,
    onRefresh,
  }: {
    refreshedAt: Date | null;
    refreshing: boolean;
    onRefresh: () => void;
  } = $props();
</script>

<footer class="command-footer">
  <div class="source-actions">
    <a
      class="action-button"
      href={DAILY_CHECK_URL}
      target="_blank"
      rel="noreferrer"
    >
      <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
      Daily checker
    </a>
    <a
      class="action-button"
      href={SEARCH_CONSOLE_URL}
      target="_blank"
      rel="noreferrer"
    >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      Google search data
    </a>
    <a
      class="action-button"
      href={BIGQUERY_URL}
      target="_blank"
      rel="noreferrer"
    >
      <i class="fas fa-database" aria-hidden="true"></i>
      Stored scorecards
    </a>
    <a
      class="action-button"
      href={POSTHOG_URL}
      target="_blank"
      rel="noreferrer"
    >
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      Visitor behavior
    </a>
  </div>
  <div class="refresh-area">
    {#if refreshedAt}
      <span>
        Read at {refreshedAt.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    {/if}
    <button class="refresh-button" disabled={refreshing} onclick={onRefresh}>
      <i
        class="fas fa-rotate-right"
        class:fa-spin={refreshing}
        aria-hidden="true"
      ></i>
      {refreshing ? "Refreshing" : "Refresh numbers"}
    </button>
  </div>
</footer>

<style>
  .command-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 4px;
  }

  .source-actions,
  .refresh-area {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action-button,
  .refresh-button {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(15, 23, 42, 0.78));
    color: var(--theme-text, #f8fafc);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }

  .action-button:hover,
  .refresh-button:hover:not(:disabled) {
    border-color: color-mix(
      in srgb,
      var(--semantic-seo-accent) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-seo-accent) 9%,
      var(--theme-card-bg, #111827)
    );
  }

  .refresh-button {
    min-width: 10.5rem;
  }

  .refresh-button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .refresh-area > span {
    min-width: 9rem;
    color: var(--theme-text-dim, rgba(248, 250, 252, 0.5));
    font-size: var(--font-size-compact, 0.75rem);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 520px) {
    .command-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .source-actions,
    .refresh-area {
      display: grid;
      grid-template-columns: 1fr;
    }

    .action-button,
    .refresh-button {
      width: 100%;
    }

    .refresh-area > span {
      min-width: 0;
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-button,
    .refresh-button {
      transition: none;
    }
  }
</style>
