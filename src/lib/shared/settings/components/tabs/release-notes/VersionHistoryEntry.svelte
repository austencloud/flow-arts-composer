<!-- VersionHistoryEntry - Read-only release block for the continuous history stream -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getReactiveLocale } from "$lib/shared/i18n/locale-state.svelte";
  import type {
    AppVersion,
    ChangelogCategory,
    ChangelogEntry,
  } from "$lib/shared/versioning/domain/models/version-models";
  import { PRE_RELEASE_VERSION } from "$lib/shared/versioning/domain/models/version-models";
  import { CHANGELOG_CATEGORIES } from "$lib/shared/versioning/domain/constants/changelog-constants";
  import type { Contributor } from "$lib/shared/versioning/domain/models/contributor-models";
  import ChangeGroupSection from "./ChangeGroupSection.svelte";
  import ContributorBadge from "./ContributorBadge.svelte";

  let {
    version,
    contributorMap,
    onOpenFeedback,
    onSelect,
  }: {
    version: AppVersion;
    contributorMap?: Map<string, Contributor>;
    onOpenFeedback: (entry: ChangelogEntry) => void;
    onSelect?: () => void;
  } = $props();

  const isPreRelease = $derived(version.version === PRE_RELEASE_VERSION);

  const formattedDate = $derived(
    version.releasedAt.toLocaleDateString(getReactiveLocale(), {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );

  const grouped = $derived.by(() => {
    const entries = version.changelogEntries ?? [];
    return {
      fixed: entries.filter((e) => e.category === "fixed"),
      added: entries.filter((e) => e.category === "added"),
      improved: entries.filter((e) => e.category === "improved"),
    } as Record<ChangelogCategory, ChangelogEntry[]>;
  });

  const populatedCategories = $derived(
    CHANGELOG_CATEGORIES.filter((c) => grouped[c].length > 0)
  );

  const totalChanges = $derived(version.changelogEntries?.length ?? 0);

  const contributors = $derived(
    (version.contributorIds ?? [])
      .map((id) => contributorMap?.get(id))
      .filter((c): c is Contributor => Boolean(c))
  );

  // Read-only stream: editing happens on the release you select.
  const noop = async () => {};
</script>

<article class="history-entry">
  <header class="entry-header">
    <div class="version-badge" class:pre-release={isPreRelease}>
      {isPreRelease ? t("settings_pre_release") : `v${version.version}`}
    </div>
    <time>{formattedDate}</time>
    {#if totalChanges > 0}
      <span class="total">{t("settings_change_count", { count: totalChanges })}</span>
    {/if}
    {#if onSelect}
      <button type="button" class="edit-link" onclick={onSelect}>
        <i class="fas fa-pen" aria-hidden="true"></i>
        {t("action_edit")}
      </button>
    {/if}
  </header>

  {#if version.releaseNotes}
    <p class="entry-notes">{version.releaseNotes}</p>
  {/if}

  {#if populatedCategories.length > 0}
    <div class="entry-groups" data-groups={populatedCategories.length}>
      {#each populatedCategories as cat (cat)}
        <ChangeGroupSection
          category={cat}
          entries={grouped[cat]}
          isAdmin={false}
          currentlyEditingId={null}
          onSaveEntry={noop}
          onDeleteEntry={noop}
          {onOpenFeedback}
          onStartAdd={() => {}}
          onCancelAdd={() => {}}
          onConfirmAdd={noop}
          onStartEdit={() => {}}
          onEndEdit={() => {}}
          {contributorMap}
        />
      {/each}
    </div>
  {/if}

  {#if contributors.length > 0}
    <div class="entry-contributors">
      {#each contributors as contrib (contrib.id)}
        <ContributorBadge contributor={contrib} size="sm" />
      {/each}
    </div>
  {/if}
</article>

<style>
  .history-entry {
    padding-block: clamp(1.5rem, 2vw, 3rem);
    border-top: 1px solid var(--theme-stroke);
    container-type: inline-size;
  }

  .entry-header {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .version-badge {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .version-badge.pre-release {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text-dim);
  }

  .entry-header time {
    font-size: var(--font-size-sm);
    color: var(--theme-text);
  }

  .total {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .edit-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
    min-height: var(--min-touch-target);
    padding: 0 0.9rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.6rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-normal);
  }

  .history-entry:hover .edit-link,
  .edit-link:focus-visible {
    opacity: 1;
  }

  .edit-link:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .entry-notes {
    margin: 0 0 1rem 0;
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--theme-text-dim);
    white-space: pre-wrap;
  }

  .entry-groups {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(1rem, 1.5vw, 2.5rem);
    align-items: start;
  }

  .entry-groups :global(.change-group) {
    margin-bottom: 0;
  }

  .entry-groups :global(.change-list) {
    display: grid;
    gap: 0.5rem;
  }

  /* Entry text uses the primary UI role at every desktop width. */
  .entry-groups :global(.change-item) {
    font-size: var(--font-size-base);
    line-height: 1.55;
  }

  .entry-groups :global(.change-list li) {
    margin-bottom: 0;
  }

  /* The count belongs beside its title, never flung to the far edge of a
     wide column. */
  .entry-groups :global(.group-title .count) {
    margin-left: 0;
  }

  @container (min-width: 950px) {
    .entry-groups[data-groups="2"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .entry-groups[data-groups="3"] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* A release with a single category spreads its own entries rather than
     running one long column down a wide canvas. */
  @container (min-width: 1600px) {
    .entry-groups[data-groups="1"] :global(.change-list) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (min-width: 2400px) {
    .entry-groups[data-groups="1"] :global(.change-list) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .entry-groups[data-groups="2"] :global(.change-list) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .entry-contributors {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

</style>
