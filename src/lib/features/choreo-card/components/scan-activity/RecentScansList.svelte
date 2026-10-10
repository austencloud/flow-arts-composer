<script lang="ts">
  import { formatTimeAgo } from "#lib/shared/i18n/i18n-formatters.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { ScanEventRow } from "#lib/features/choreo-card/state/scan-activity-state.svelte.js";

  interface Props {
    events: ScanEventRow[];
    selectedEventId: string | null;
    onEventClick: (eventId: string) => void;
    onCityClick: (city: string, eventId: string) => void;
    wordFor?: (code: string) => string | undefined;
    loading?: boolean;
    limit?: number;
  }

  let {
    events,
    selectedEventId,
    onEventClick,
    onCityClick,
    wordFor = () => undefined,
    loading = false,
    limit = 12,
  }: Props = $props();

  const rows = $derived(events.slice(0, limit));

  function relativeTime(timestamp: string): string {
    const milliseconds = Date.parse(timestamp);
    return Number.isFinite(milliseconds)
      ? formatTimeAgo(milliseconds)
      : "Time unavailable";
  }

  function displayWord(code: string): string {
    return simplifyRepeatedWord(wordFor(code) || code);
  }
</script>

<div class="list" aria-busy={loading}>
  {#if loading}
    {#each Array(6) as _, index (index)}
      <div class="skeleton-row" aria-hidden="true">
        <span class="skeleton-main"></span>
        <span class="skeleton-city"></span>
      </div>
    {/each}
    <span class="sr-status" role="status">Connecting to scan activity.</span>
  {:else}
    {#each rows as event (event.id)}
      <div class="row" class:selected={selectedEventId === event.id}>
        <button
          id={`scan-event-${event.id}`}
          class="event-action"
          type="button"
          aria-label="Inspect {displayWord(event.code)} scan"
          aria-pressed={selectedEventId === event.id}
          onclick={() => onEventClick(event.id)}
        >
          <span class="identity">
            <strong><TkaLabel text={displayWord(event.code)} darkMode /></strong
            >
            <span>{event.code}</span>
          </span>
          <span class="when">{relativeTime(event.timestamp)}</span>
        </button>

        {#if event.city}
          <FilterChipBase
            label={event.city}
            icon="fas fa-location-dot"
            mode="action"
            size="sm"
            onclick={() => onCityClick(event.city!, event.id)}
          />
        {:else}
          <span class="no-location">Location unavailable</span>
        {/if}
      </div>
    {/each}

    {#if rows.length === 0}
      <p class="empty">No scans match this view.</p>
    {/if}
  {/if}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  .row,
  .skeleton-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 64px;
    padding: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
  }

  .row.selected {
    border-color: color-mix(in srgb, var(--theme-accent) 65%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 10%,
      var(--theme-card-bg)
    );
  }

  .event-action {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 4px 8px;
    border: 0;
    border-radius: var(--border-radius-sm, 6px);
    background: transparent;
    color: var(--theme-text, #fff);
    cursor: pointer;
    text-align: left;
  }

  .event-action:hover {
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  }

  .event-action:focus-visible {
    outline: 2px solid var(--theme-accent, #34d399);
    outline-offset: 2px;
  }

  .identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .identity strong {
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity span,
  .when,
  .no-location {
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-compact, 12px);
  }

  .identity span {
    font-family: monospace;
  }

  .when {
    white-space: nowrap;
  }

  .no-location {
    max-width: 9rem;
    line-height: 1.25;
    text-align: right;
  }

  .empty {
    margin: 0;
    padding: 24px 12px;
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-sm, 14px);
    text-align: center;
  }

  .skeleton-main,
  .skeleton-city {
    display: block;
    height: 38px;
    border-radius: var(--border-radius-sm, 6px);
    background: linear-gradient(
      90deg,
      var(--theme-card-bg) 0%,
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08)) 50%,
      var(--theme-card-bg) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-city {
    width: 88px;
  }

  .sr-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-main,
    .skeleton-city {
      animation: none;
    }
  }

  @container (max-width: 420px) {
    .row {
      grid-template-columns: 1fr;
    }

    .no-location {
      max-width: none;
      padding: 0 8px 6px;
      text-align: left;
    }
  }
</style>
