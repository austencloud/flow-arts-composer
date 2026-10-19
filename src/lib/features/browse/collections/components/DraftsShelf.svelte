<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { normalizeBrowsePrimary } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import {
    listDeviceDrafts,
    draftResumePath,
  } from "#lib/features/create/shared/services/draft-catalog.js";
  import type { DraftVersion } from "#lib/features/create/shared/services/draft-types.js";
  import PropAwareThumbnail from "#lib/shared/browse/components/PropAwareThumbnail.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import BackToBrowseButton from "#lib/features/browse/shared/components/BackToBrowseButton.svelte";
  import { createDraftsShelfState } from "../state/drafts-shelf-state.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  const { showBrowseBack = true }: { showBrowseBack?: boolean } = $props();

  const draftsState = createDraftsShelfState(listDeviceDrafts);
  let expanded = $state<string[]>([]);

  let wasActive = false;
  $effect(() => {
    const active = normalizeBrowsePrimary(navigationState.activeTab) === "you";
    if (active && !wasActive) void draftsState.refresh();
    wasActive = active;
  });

  function olderVersions(draft: {
    latest: DraftVersion;
    versions: DraftVersion[];
  }) {
    return draft.versions.filter((version) => version.id !== draft.latest.id);
  }

  function toggle(id: string): void {
    expanded = expanded.includes(id)
      ? expanded.filter((expandedId) => expandedId !== id)
      : [...expanded, id];
  }

  function modeLabel(mode: DraftVersion["mode"]): string {
    if (mode === "construct") return "Construct";
    if (mode === "generate") return "Generate";
    return "Assemble";
  }

  function savedLabel(savedAt: number): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(savedAt);
  }

  function title(version: DraftVersion): string {
    return (
      version.workspace.currentSequence?.name?.trim() ||
      `${modeLabel(version.mode)} draft`
    );
  }
</script>

<section class="drafts" aria-label="Drafts">
  <header class="drafts-header">
    {#if showBrowseBack}<BackToBrowseButton />{/if}
    <div>
      <h2>Drafts</h2>
      <p>On this device</p>
    </div>
  </header>

  {#if draftsState.loading}
    <p class="state" role="status">Loading drafts…</p>
  {:else if draftsState.error}
    <div class="state" role="alert">
      <span>{draftsState.error}</span>
      <button type="button" onclick={() => void draftsState.refresh()}
        >Retry</button
      >
    </div>
  {:else if draftsState.drafts.length === 0}
    <div class="state empty-state">
      <p>Your unfinished sequences will appear here.</p>
      <LinkChip href="/create/construct" data-sveltekit-reload
        >Start a sequence</LinkChip
      >
    </div>
  {:else}
    <div class="draft-list">
      {#each draftsState.drafts as draft (draft.id)}
        {@const older = olderVersions(draft)}
        <article class="draft">
          <div class="draft-preview">
            {#if draft.latest.workspace.currentSequence}
              <PropAwareThumbnail
                sequence={draft.latest.workspace.currentSequence}
                allowQR={false}
                shareRender={false}
              />
            {:else}
              <span class="placement-label">Start placement</span>
            {/if}
          </div>
          <div class="draft-body">
            <div class="draft-title-line">
              <h3>{title(draft.latest)}</h3>
              <span class="mode">{modeLabel(draft.latest.mode)}</span>
            </div>
            <p class="edited">Last edited {savedLabel(draft.latest.savedAt)}</p>
            <div class="draft-actions">
              <LinkChip
                href={draftResumePath(draft.latest)}
                data-sveltekit-reload>Resume</LinkChip
              >
              {#if older.length > 0}
                <button
                  type="button"
                  class="versions-toggle"
                  aria-expanded={expanded.includes(draft.id)}
                  onclick={() => toggle(draft.id)}
                >
                  {older.length} older {older.length === 1
                    ? "version"
                    : "versions"}
                  <i
                    class:rotated={expanded.includes(draft.id)}
                    class="fas fa-chevron-down"
                    aria-hidden="true"
                  ></i>
                </button>
              {/if}
            </div>
            {#if expanded.includes(draft.id)}
              <div
                class="versions"
                transition:growFade={{ duration: DURATION.normal }}
              >
                {#each older as version (version.id)}
                  <div class="version">
                    <span>{savedLabel(version.savedAt)}</span>
                    <LinkChip
                      href={draftResumePath(version)}
                      data-sveltekit-reload>Resume</LinkChip
                    >
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .drafts {
    width: 100%;
    max-width: 1000px;
    margin-inline: auto;
    padding: clamp(12px, 2.5cqi, 28px);
  }
  .drafts-header {
    display: flex;
    align-items: center;
    gap: 12px;
    width: fit-content;
    margin-bottom: 14px;
    padding: 10px 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
  }
  .drafts-header h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(18px, 2.4cqi, 24px);
  }
  .drafts-header p {
    margin: 3px 0 0;
    color: var(--theme-text-dim);
    font-size: 13px;
  }
  .draft-list {
    display: grid;
    gap: 10px;
  }
  .draft {
    display: grid;
    grid-template-columns: clamp(96px, 18%, 160px) minmax(0, 1fr);
    gap: 14px;
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
  }
  .draft-preview {
    display: grid;
    place-items: center;
    min-width: 0;
    aspect-ratio: 5 / 4;
    overflow: hidden;
    border-radius: 8px;
    background: var(--theme-panel-bg);
    color: var(--theme-text-dim);
  }
  .draft-preview :global(*) {
    max-width: 100%;
  }
  .placement-label {
    padding: 10px;
    font-size: 13px;
    text-align: center;
  }
  .draft-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7px;
  }
  .draft-title-line {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 12px;
  }
  .draft-title-line h3 {
    min-width: 0;
    margin: 0;
    color: var(--theme-text);
    font-size: 16px;
    overflow-wrap: anywhere;
  }
  .mode {
    color: var(--theme-text-dim);
    font-size: 12px;
  }
  .edited {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .draft-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .versions-toggle,
  .state button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .versions-toggle:hover,
  .state button:hover {
    filter: brightness(1.12);
  }
  .versions-toggle:focus-visible,
  .state button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .versions-toggle i {
    font-size: 11px;
    transition: transform var(--transition-fast);
  }
  .versions-toggle i.rotated {
    transform: rotate(180deg);
  }
  .versions {
    display: grid;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--theme-stroke);
  }
  .version {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--theme-text-dim);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 80px;
    margin: 0;
    padding: 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: 14px;
  }
  .empty-state {
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .empty-state p {
    margin: 0;
  }
  @media (max-width: 520px) {
    .draft {
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 10px;
    }
    .drafts {
      padding: 12px;
    }
    .draft-actions {
      gap: 4px;
    }
  }
</style>
