<script lang="ts">
  import { goto } from "$app/navigation";
  import PropAwareThumbnail from "#lib/shared/browse/components/PropAwareThumbnail.svelte";
  import AdminActionButton from "#lib/shared/admin/components/AdminActionButton.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { formatTimeAgo } from "#lib/shared/i18n/i18n-formatters.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    scanPropConfigForPreview,
    sequenceForScanPreview,
    type CodeEntry,
    type ScanEventRow,
  } from "#lib/features/choreo-card/state/scan-activity-state.svelte.js";

  interface Props {
    code: string;
    entry: CodeEntry | null;
    event: ScanEventRow | null;
    relatedEvents: ScanEventRow[];
    onSelectEvent: (eventId: string) => void;
    onClose: () => void;
  }

  const { code, entry, event, relatedEvents, onSelectEvent, onClose }: Props =
    $props();

  const word = $derived(simplifyRepeatedWord(entry?.word || code));
  const previewSequence = $derived(sequenceForScanPreview(entry));
  const previewProps = $derived(scanPropConfigForPreview(entry, event));
  const location = $derived(
    event
      ? [event.city, event.country].filter(Boolean).join(", ") ||
          "Location unavailable"
      : "Waiting for the matching event"
  );

  function exactTime(timestamp: string | undefined): string {
    if (!timestamp) return "Time unavailable";
    const milliseconds = Date.parse(timestamp);
    if (!Number.isFinite(milliseconds)) return "Time unavailable";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "long",
    }).format(milliseconds);
  }

  function relativeTime(timestamp: string): string {
    const milliseconds = Date.parse(timestamp);
    return Number.isFinite(milliseconds)
      ? formatTimeAgo(milliseconds)
      : "Time unavailable";
  }

  function openCard(): void {
    void goto(`/q/${code}`);
  }

  async function copyLink(): Promise<void> {
    try {
      const url = new URL(`/q/${code}`, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      toast.success("Card link copied");
    } catch {
      toast.error("Could not copy the card link");
    }
  }
</script>

<aside class="peek" aria-label="Scan event inspector">
  <header class="peek-top">
    <div class="title-group">
      <h2 class="peek-title" aria-label={word}>
        <TkaLabel text={word} darkMode />
      </h2>
      <span class="code">{code}</span>
    </div>
    <button
      type="button"
      class="close"
      aria-label="Close scan inspector"
      onclick={onClose}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  <div class="inspector-grid">
    <div class="thumb">
      {#if previewSequence}
        <PropAwareThumbnail
          sequence={previewSequence}
          leftPropType={previewProps.leftPropType}
          rightPropType={previewProps.rightPropType}
          catDogModeEnabled={previewProps.catDogMode}
          eager
          allowQR={false}
        />
      {:else}
        <div class="thumb-empty" aria-live="polite">
          <i class="fas fa-id-card" aria-hidden="true"></i>
          <p>
            {#if entry && (!entry.metadataAvailable || !entry.integrityOk)}
              Card preview unavailable
            {:else}
              Loading card preview
            {/if}
          </p>
        </div>
      {/if}
    </div>

    <div class="details">
      <dl>
        <div>
          <dt>Scanned</dt>
          <dd>{exactTime(event?.timestamp)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{location}</dd>
        </div>
        <div>
          <dt>Card lifetime</dt>
          <dd>
            {#if entry?.metadataAvailable}
              {entry.scanCount} scan{entry.scanCount === 1 ? "" : "s"}
            {:else if entry}
              Count unavailable
            {:else}
              Loading count
            {/if}
          </dd>
        </div>
      </dl>

      <div class="actions">
        <AdminActionButton
          variant="primary"
          icon="fa-up-right-from-square"
          onclick={openCard}
        >
          Open card
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          icon="fa-link"
          onclick={copyLink}
        >
          Copy link
        </AdminActionButton>
      </div>
    </div>
  </div>

  <section class="related" aria-labelledby="related-scans-heading">
    <h3 id="related-scans-heading">Related scans in this window</h3>
    {#if relatedEvents.length > 0}
      <div class="related-list">
        {#each relatedEvents as related (related.id)}
          <button
            type="button"
            aria-label={`Inspect ${related.city || "location unavailable"} scan from ${relativeTime(related.timestamp)}`}
            onclick={() => onSelectEvent(related.id)}
          >
            <span>{related.city || "Location unavailable"}</span>
            <span>{relativeTime(related.timestamp)}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p>No other recent scans for this card.</p>
    {/if}
  </section>
</aside>

<style>
  .peek {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
    min-width: 0;
    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
    box-shadow: var(--shadow-elevated);
  }

  .peek-top,
  .title-group,
  .actions {
    display: flex;
    align-items: center;
  }

  .peek-top {
    gap: var(--spacing-sm, 8px);
  }

  .title-group {
    flex: 1;
    min-width: 0;
    gap: var(--spacing-sm, 8px);
  }

  .peek-title {
    overflow: hidden;
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-md, 16px);
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code {
    color: var(--theme-text-dim, #8b93a7);
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
  }

  .close {
    display: grid;
    flex: 0 0 var(--min-touch-target, 44px);
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    place-items: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text-dim, #8b93a7);
    cursor: pointer;
  }

  .close:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
  }

  .close:focus-visible,
  .related-list button:focus-visible {
    outline: 2px solid var(--theme-accent, #34d399);
    outline-offset: 2px;
  }

  .inspector-grid {
    display: grid;
    grid-template-columns: minmax(120px, 0.7fr) minmax(0, 1.3fr);
    gap: var(--spacing-md, 16px);
  }

  .thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 5 / 7;
    overflow: hidden;
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .thumb-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: 12px;
    color: var(--theme-text-dim, #8b93a7);
    text-align: center;
  }

  .thumb-empty i {
    font-size: 36px;
    opacity: 0.4;
  }

  .thumb-empty p,
  .related p {
    margin: 0;
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-sm, 14px);
  }

  .details {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--spacing-md, 16px);
  }

  dl {
    display: grid;
    gap: var(--spacing-sm, 8px);
    margin: 0;
  }

  dl div {
    display: grid;
    gap: 2px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  dt {
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
  }

  .related {
    display: grid;
    gap: var(--spacing-sm, 8px);
  }

  .related h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  .related-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .related-list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .related-list button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  @container (max-width: 480px) {
    .inspector-grid {
      grid-template-columns: 1fr;
    }

    .thumb {
      width: min(100%, 180px);
      justify-self: center;
    }

    .related-list {
      grid-template-columns: 1fr;
    }
  }
</style>
