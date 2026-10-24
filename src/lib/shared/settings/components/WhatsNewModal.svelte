<!--
  WhatsNewModal - Beautiful changelog modal for version updates

  Displays structured changelog data with category cards,
  proper visual hierarchy, and celebration energy.
-->
<script lang="ts">
  import { whatsNewState } from "../state/whats-new-state.svelte";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { getContributorLoader } from "#lib/shared/feedback/get-contributor-loader.js";
  import { CATEGORY_ICONS } from "#lib/shared/versioning/domain/constants/changelog-constants.js";
  import type { Contributor } from "#lib/shared/versioning/domain/models/contributor-models.js";
  import type {
    ChangelogCategory,
    ChangelogEntry,
  } from "#lib/shared/versioning/domain/models/version-models.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ContributorBadge from "./tabs/release-notes/ContributorBadge.svelte";
  import ChangelogRichText from "./tabs/release-notes/ChangelogRichText.svelte";
  import ChangelogEntryMedia from "./tabs/release-notes/ChangelogEntryMedia.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";

  // Category display order and colors
  const CATEGORY_CONFIG: Record<
    ChangelogCategory,
    { order: number; color: string; bgColor: string }
  > = {
    added: {
      order: 1,
      color: "var(--semantic-success)",
      bgColor: "color-mix(in srgb, var(--semantic-success) 12%, transparent)",
    },
    improved: {
      order: 2,
      color: "var(--semantic-info)",
      bgColor: "color-mix(in srgb, var(--semantic-info) 12%, transparent)",
    },
    fixed: {
      order: 3,
      color: "var(--semantic-warning)",
      bgColor: "color-mix(in srgb, var(--semantic-warning) 12%, transparent)",
    },
  };

  // Derived state
  const version = $derived(whatsNewState.version);
  const isOpen = $derived(whatsNewState.isOpen);

  let contributors = $state<Map<string, Contributor>>(new Map());

  $effect(() => {
    if (!version?.contributorIds?.length) {
      contributors = new Map();
      return;
    }
    const loader = getContributorLoader();
    loader.getByIds(version.contributorIds).then((list) => {
      contributors = new Map(list.map((c) => [c.id, c]));
    });
  });

  // What's New is a glance, not the record: each column shows its first few
  // lines and Release Notes holds the rest, like the update email does.
  const COLUMN_PREVIEW = 4;

  // Notes with an example clip or picture lead the sheet, one at a time in
  // a strip to step through, in the order the notes run (new features
  // first). Every other note is a line of text in the columns below.
  const featured = $derived(
    (version?.changelogEntries?.filter((entry) => entry.media) ?? []).sort(
      (a, b) =>
        CATEGORY_CONFIG[a.category].order - CATEGORY_CONFIG[b.category].order
    )
  );

  let track = $state<HTMLElement | null>(null);
  let slide = $state(0);
  const still = reducedMotion();

  function showSlide(index: number) {
    if (!track) return;
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: still ? "auto" : "smooth",
    });
  }

  function syncSlide() {
    if (track) slide = Math.round(track.scrollLeft / track.clientWidth);
  }

  // Group the remaining entries by category
  const groupedChangelog = $derived.by(() => {
    if (!version?.changelogEntries) return [];

    const groups = new Map<ChangelogCategory, ChangelogEntry[]>();

    for (const entry of version.changelogEntries) {
      const existing = groups.get(entry.category) || [];
      existing.push(entry);
      groups.set(entry.category, existing);
    }

    return Array.from(groups.entries())
      .map(([category, entries]) => {
        const listed = entries.filter((entry) => !entry.media);
        return {
          category,
          total: entries.length,
          entries: listed.slice(0, COLUMN_PREVIEW),
          hidden: Math.max(0, listed.length - COLUMN_PREVIEW),
          ...CATEGORY_CONFIG[category],
        };
      })
      .filter((group) => group.entries.length > 0)
      .sort((a, b) => a.order - b.order);
  });

  // Total count for summary
  const totalChanges = $derived(version?.changelogEntries?.length ?? 0);
  const isTrimmed = $derived(
    groupedChangelog.some((group) => group.hidden > 0)
  );
  const categoryCount = $derived(Math.min(groupedChangelog.length, 3));
  const layoutWidth = $derived(
    totalChanges >= 8 || categoryCount === 3
      ? "wide"
      : totalChanges >= 4 || categoryCount === 2
        ? "medium"
        : "compact"
  );

  function handleClose() {
    whatsNewState.close();
  }

  async function handleViewAllReleases() {
    whatsNewState.close();
    await handleModuleChange("settings", "release-notes");
  }
</script>

{#if version}
  <BaseModal
    open={isOpen}
    size="fit"
    animation="pop"
    labelledBy="whats-new-title"
    class="whats-new-modal layout-{layoutWidth}"
    onclose={() => whatsNewState.dismiss()}
  >
    {#snippet header()}
      <header class="modal-header">
        <div class="version-badge">
          <i class="fas fa-rocket" aria-hidden="true"></i>
          <span>v{version.version}</span>
        </div>
        <div class="header-text">
          <h1 id="whats-new-title">{t("settings_whats_new")}</h1>
          <p class="subtitle">
            {t("settings_release_update_count", { count: totalChanges })}
          </p>
        </div>
        <button
          class="close-btn"
          onclick={handleClose}
          aria-label={t("action_close")}
          type="button"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </header>
    {/snippet}

    <div class="release-body">
      {#snippet featuredItem(entry: ChangelogEntry)}
        {@const config = CATEGORY_CONFIG[entry.category]}
        <div
          class="featured-media"
          style="--media-width: {entry.media!.width}px; --media-ratio: {entry
            .media!.width / entry.media!.height};"
        >
          <ChangelogEntryMedia media={entry.media!} />
        </div>
        <div class="featured-text">
          <span
            class="featured-kind"
            style="--cat-color: {config.color}; --cat-bg: {config.bgColor};"
          >
            <i class="fas {CATEGORY_ICONS[entry.category]}" aria-hidden="true"
            ></i>
            {t(`settings_changelog_${entry.category}`)}
          </span>
          <p>
            <ChangelogRichText text={entry.text} onNavigate={handleClose} />
          </p>
        </div>
      {/snippet}

      {#if featured.length > 1}
        <section class="strip" aria-roledescription="carousel">
          <div class="strip-track" bind:this={track} onscroll={syncSlide}>
            {#each featured as entry, index}
              <div
                class="featured-item strip-card"
                aria-roledescription="slide"
                aria-label="{index + 1} / {featured.length}"
                inert={index !== slide}
              >
                {@render featuredItem(entry)}
              </div>
            {/each}
          </div>
          <div class="strip-nav">
            <button
              class="strip-btn"
              type="button"
              aria-label={t("action_back")}
              disabled={slide === 0}
              onclick={() => showSlide(slide - 1)}
            >
              <i class="fas fa-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="strip-dots">
              {#each featured as entry, index}
                <button
                  class="strip-dot"
                  class:current={index === slide}
                  type="button"
                  aria-label={entry.media!.alt}
                  aria-current={index === slide}
                  onclick={() => showSlide(index)}
                ></button>
              {/each}
            </div>
            <span class="strip-count" aria-hidden="true">
              {slide + 1} / {featured.length}
            </span>
            <button
              class="strip-btn"
              type="button"
              aria-label={t("action_next")}
              disabled={slide === featured.length - 1}
              onclick={() => showSlide(slide + 1)}
            >
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </section>
      {:else if featured.length}
        <div class="featured-item">
          {@render featuredItem(featured[0]!)}
        </div>
      {/if}

      <div class="category-grid" data-category-count={categoryCount}>
        {#each groupedChangelog as group}
          <div
            class="category-card"
            style="--cat-color: {group.color}; --cat-bg: {group.bgColor};"
          >
            <div class="category-header">
              <div class="category-icon">
                <i
                  class="fas {CATEGORY_ICONS[group.category]}"
                  aria-hidden="true"
                ></i>
              </div>
              <h3>{t(`settings_changelog_${group.category}`)}</h3>
              <span class="category-count">{group.total}</span>
            </div>
            <ul class="category-list">
              {#each group.entries as entry}
                <li>
                  <ChangelogRichText
                    text={entry.text}
                    onNavigate={handleClose}
                  />
                  {#if entry.contributorIds?.length}
                    <span class="entry-contributors">
                      {#each entry.contributorIds as cid}
                        {@const contrib = contributors.get(cid)}
                        {#if contrib}
                          <ContributorBadge contributor={contrib} />
                        {/if}
                      {/each}
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if group.hidden > 0}
              <p class="category-more">
                {t("settings_more_count", { count: group.hidden })}
              </p>
            {/if}
          </div>
        {/each}
      </div>

      {#if version?.contributorIds?.length && contributors.size > 0}
        <div class="contributors-footer">
          <h4 class="contributors-title">{t("settings_contributors")}</h4>
          <div class="contributors-list">
            {#each version.contributorIds as cid}
              {@const contrib = contributors.get(cid)}
              {#if contrib}
                <ContributorBadge contributor={contrib} size="md" />
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      {#if groupedChangelog.length === 0}
        <div class="empty-state">
          <i class="fas fa-box-open" aria-hidden="true"></i>
          <p>{t("settings_no_detailed_changelog")}</p>
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <footer class="modal-footer">
        <button
          class="footer-btn secondary"
          onclick={handleViewAllReleases}
          type="button"
        >
          <i class="fas fa-history" aria-hidden="true"></i>
          {isTrimmed
            ? t("settings_see_all_changes", { count: totalChanges })
            : t("settings_all_releases")}
        </button>
        <button class="footer-btn primary" onclick={handleClose} type="button">
          <i class="fas fa-check" aria-hidden="true"></i>
          {t("settings_got_it")}
        </button>
      </footer>
    {/snippet}
  </BaseModal>
{/if}

<style>
  :global(dialog.base-modal.whats-new-modal[data-size="fit"]) {
    --modal-backdrop-bg: rgba(0, 0, 0, 0.85);
    --modal-backdrop-blur: 8px;
    box-sizing: border-box;
    width: min(
      calc(
        100vw - 2rem - env(safe-area-inset-left, 0px) -
          env(safe-area-inset-right, 0px)
      ),
      88rem
    );
    width: min(
      calc(
        100dvw - 2rem - env(safe-area-inset-left, 0px) -
          env(safe-area-inset-right, 0px)
      ),
      88rem
    );
    max-width: none;
    max-height: calc(
      var(--viewport-height, 100dvh) - 2rem - env(safe-area-inset-top, 0px) -
        env(safe-area-inset-bottom, 0px)
    );
    height: fit-content;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  :global(dialog.base-modal.whats-new-modal.layout-compact[data-size="fit"]) {
    width: min(
      calc(
        100dvw - 2rem - env(safe-area-inset-left, 0px) -
          env(safe-area-inset-right, 0px)
      ),
      54rem
    );
  }

  :global(dialog.base-modal.whats-new-modal.layout-medium[data-size="fit"]) {
    width: min(
      calc(
        100dvw - 2rem - env(safe-area-inset-left, 0px) -
          env(safe-area-inset-right, 0px)
      ),
      76rem
    );
  }

  .modal-header {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 20px 24px;
    padding-right: 56px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-accent) 8%, transparent) 0%,
      transparent 100%
    );
    border-bottom: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .version-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      color-mix(in srgb, var(--theme-accent) 70%, var(--semantic-info)) 100%
    );
    border-radius: 24px;
    color: white;
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.5px;
    box-shadow: 0 4px 16px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .version-badge i {
    font-size: var(--font-size-compact);
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .modal-header h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--theme-text);
  }

  .subtitle {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal),
      width var(--duration-normal),
      height var(--duration-normal);
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .release-body {
    container: release-notes / inline-size;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* A featured example's width is capped by the viewport height too, so
     the columns below stay on screen. */
  .featured-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-inline-size: min(100%, 40rem);
    margin-inline: auto;
  }

  /* The example's height is what the viewport limits, so a wide picture
     gets its width from that height and its own shape. */
  .featured-media {
    inline-size: min(
      100%,
      calc(32dvh * var(--media-ratio, 1)),
      var(--media-width)
    );
    min-inline-size: min(100%, 16rem);
  }

  .featured-media :global(.entry-media) {
    margin: 0 auto;
  }

  .featured-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--theme-text);
    text-align: center;
  }

  .featured-text p {
    margin: 0;
  }

  .featured-kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 10px;
    background: var(--cat-bg);
    color: var(--cat-color);
    font-size: var(--font-size-compact);
    font-weight: 600;
  }

  /* With room beside the clip, its caption sits next to it, so the columns
     below stay on screen on a laptop too. */
  @container release-notes (min-width: 50rem) {
    .featured-item {
      flex-direction: row;
      gap: 28px;
      max-inline-size: min(100%, 60rem);
    }

    /* A percentage width can't resolve while the row sizes itself, so the
       row would stretch to its cap and sit off centre. */
    .featured-media {
      flex: none;
      inline-size: min(
        calc(32dvh * var(--media-ratio, 1)),
        var(--media-width),
        34rem
      );
    }

    .featured-text {
      align-items: flex-start;
      max-inline-size: 28rem;
      text-align: start;
    }
  }

  /* The strip: one example at a time, swiped or stepped with the buttons.
     Every card is a full track wide, so a step is one track width. */
  .strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .strip-track {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }

  .strip-track::-webkit-scrollbar {
    display: none;
  }

  .strip-card {
    flex: 0 0 100%;
    max-inline-size: none;
    justify-content: center;
    scroll-snap-align: center;
  }

  .strip-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .strip-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text);
    cursor: pointer;
    transition:
      background var(--duration-normal),
      opacity var(--duration-normal);
  }

  .strip-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .strip-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .strip-dots {
    display: flex;
  }

  /* The dot is small; its button keeps a full touch target around it. */
  .strip-dot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 44px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
  }

  .strip-dot::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-text-dim);
    opacity: 0.5;
    transition:
      background var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal);
  }

  .strip-dot.current::after {
    background: var(--theme-accent);
    opacity: 1;
    transform: scale(1.3);
  }

  /* A phone has no room for a full touch target per dot, so it counts. */
  .strip-count {
    display: none;
    min-inline-size: 4ch;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: var(--theme-text-dim);
  }

  @container release-notes (max-width: 30rem) {
    .strip-dots {
      display: none;
    }

    .strip-count {
      display: block;
    }
  }

  .category-more {
    margin: 4px 0 0;
    padding-inline-start: 16px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  /* Category Grid */
  .category-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .category-card {
    container: release-category / inline-size;
    padding: 16px;
    background: var(--cat-bg);
    border: 1.5px solid color-mix(in srgb, var(--cat-color) 20%, transparent);
    border-radius: 14px;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal),
      width var(--duration-normal),
      grid-template-columns var(--duration-normal);
  }

  .category-card:hover {
    border-color: color-mix(in srgb, var(--cat-color) 35%, transparent);
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .category-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: color-mix(in srgb, var(--cat-color) 20%, transparent);
    border-radius: 8px;
    color: var(--cat-color);
    font-size: var(--font-size-sm);
  }

  .category-header h3 {
    flex: 1;
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--cat-color);
  }

  .category-count {
    padding: 4px 10px;
    background: color-mix(in srgb, var(--cat-color) 15%, transparent);
    border-radius: 10px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--cat-color);
  }

  .category-list {
    margin: 0;
    padding: 0;
    list-style: none;
    columns: 1;
  }

  @container release-notes (min-width: 42rem) {
    .category-grid[data-category-count="2"],
    .category-grid[data-category-count="3"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .category-grid[data-category-count="3"] > :last-child {
      grid-column: 1 / -1;
    }
  }

  @container release-notes (min-width: 68rem) {
    .category-grid[data-category-count="3"] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .category-grid[data-category-count="3"] > :last-child {
      grid-column: auto;
    }
  }

  @container release-category (min-width: 42rem) {
    .category-list {
      columns: 2;
      column-gap: 24px;
    }
  }

  .category-list li {
    position: relative;
    padding: 6px 0 6px 16px;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
    line-height: 1.5;
    break-inside: avoid;
  }

  .category-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 14px;
    width: 6px;
    height: 6px;
    background: var(--cat-color);
    border-radius: 50%;
    opacity: 0.7;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    color: var(--theme-text-dim);
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .entry-contributors {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .contributors-footer {
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
  }

  .contributors-title {
    margin: 0 0 12px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theme-text-dim);
  }

  .contributors-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .footer-btn {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    inline-size: auto;
    min-inline-size: 12rem;
    min-height: var(--min-touch-target);
    padding: 12px 20px;
    border-radius: 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal);
  }

  .footer-btn.primary {
    min-inline-size: 14rem;
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      color-mix(in srgb, var(--theme-accent) 80%, var(--semantic-info)) 100%
    );
    border: none;
    color: white;
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .footer-btn.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .footer-btn.primary:active {
    transform: translateY(0);
  }

  .footer-btn.secondary {
    background: transparent;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
  }

  .footer-btn.secondary:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  /* Wide-screen tiers change the modal's composition band. Type keeps the
     same logical roles at every width. */
  @media (min-width: 1680px) {
    :global(dialog.base-modal.whats-new-modal.layout-wide[data-size="fit"]) {
      width: min(
        calc(
          100dvw - 3rem - env(safe-area-inset-left, 0px) -
            env(safe-area-inset-right, 0px)
        ),
        100rem
      );
    }

    :global(dialog.base-modal.whats-new-modal.layout-medium[data-size="fit"]) {
      width: min(
        calc(
          100dvw - 3rem - env(safe-area-inset-left, 0px) -
            env(safe-area-inset-right, 0px)
        ),
        86rem
      );
    }

    :global(dialog.base-modal.whats-new-modal.layout-compact[data-size="fit"]) {
      width: min(
        calc(
          100dvw - 3rem - env(safe-area-inset-left, 0px) -
            env(safe-area-inset-right, 0px)
        ),
        60rem
      );
    }

    :global(dialog.base-modal.whats-new-modal[data-size="fit"]) {
      border-radius: 24px;
    }

    .release-body {
      padding: 32px;
      gap: 20px;
    }

    .category-card {
      padding: 22px;
    }

    .category-list li {
      padding: 8px 0 8px 18px;
    }

    .category-list li::before {
      top: 16px;
    }

    .modal-header {
      padding: 24px 32px;
      padding-right: 64px;
    }

    .modal-footer {
      padding: 20px 32px;
    }
  }

  @media (min-width: 2600px) {
    /* Native wide canvas: widen the authored band and allow a third text
       column without magnifying the modal controls. */
    :global(dialog.base-modal.whats-new-modal.layout-wide[data-size="fit"]) {
      width: min(
        calc(
          100dvw - 5rem - env(safe-area-inset-left, 0px) -
            env(safe-area-inset-right, 0px)
        ),
        120rem
      );
    }

    :global(dialog.base-modal.whats-new-modal.layout-medium[data-size="fit"]) {
      width: min(
        calc(
          100dvw - 5rem - env(safe-area-inset-left, 0px) -
            env(safe-area-inset-right, 0px)
        ),
        104rem
      );
    }

    :global(dialog.base-modal.whats-new-modal.layout-compact[data-size="fit"]) {
      width: min(
        calc(
          100dvw - 5rem - env(safe-area-inset-left, 0px) -
            env(safe-area-inset-right, 0px)
        ),
        72rem
      );
    }

    @container release-category (min-width: 90rem) {
      .category-list {
        columns: 3;
        column-gap: 40px;
      }
    }
  }

  @media (max-width: 540px) {
    :global(dialog.base-modal.whats-new-modal.layout-wide[data-size="fit"]),
    :global(dialog.base-modal.whats-new-modal.layout-medium[data-size="fit"]),
    :global(dialog.base-modal.whats-new-modal.layout-compact[data-size="fit"]) {
      width: calc(
        100dvw - 1rem - env(safe-area-inset-left, 0px) -
          env(safe-area-inset-right, 0px)
      );
      max-height: calc(
        var(--viewport-height, 100dvh) - 1rem - env(safe-area-inset-top, 0px) -
          env(safe-area-inset-bottom, 0px)
      );
      border-radius: 16px;
    }

    .modal-header {
      padding: 16px;
      padding-right: 48px;
    }

    .release-body {
      padding: 16px;
    }

    .category-card {
      padding: 14px;
    }

    .modal-footer {
      justify-content: stretch;
      padding: 12px 16px;
    }

    .footer-btn {
      flex: 1 1 0;
      min-inline-size: 0;
      padding: 10px 16px;
      font-size: var(--font-size-sm);
    }

    .footer-btn.primary {
      min-inline-size: 0;
    }
  }

  /* Wide-but-short devices get every usable vertical pixel and denser chrome.
     The release text stays at the normal readable size; only surrounding space
     is reduced before the body is allowed to scroll. */
  @media (max-height: 600px) {
    :global(dialog.base-modal.whats-new-modal.layout-wide[data-size="fit"]),
    :global(dialog.base-modal.whats-new-modal.layout-medium[data-size="fit"]),
    :global(dialog.base-modal.whats-new-modal.layout-compact[data-size="fit"]) {
      width: calc(
        100dvw - 0.75rem - env(safe-area-inset-left, 0px) -
          env(safe-area-inset-right, 0px)
      );
      max-height: calc(
        var(--viewport-height, 100dvh) - 0.75rem -
          env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
      );
      border-radius: 14px;
    }

    .modal-header {
      gap: 10px;
      padding: 10px 14px;
      padding-right: 52px;
    }

    .version-badge {
      gap: 6px;
      padding: 6px 10px;
    }

    .close-btn {
      top: 9px;
      right: 10px;
      width: var(--min-touch-target);
      height: var(--min-touch-target);
    }

    .release-body {
      gap: 10px;
      padding: 12px;
    }

    @container release-notes (min-width: 50rem) {
      .category-grid[data-category-count="3"] {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .category-grid[data-category-count="3"] > :last-child {
        grid-column: auto;
      }
    }

    .category-grid {
      gap: 10px;
    }

    .category-card {
      padding: 12px;
    }

    .category-header {
      margin-bottom: 8px;
    }

    .modal-footer {
      gap: 10px;
      padding: 8px 12px;
    }

    .footer-btn {
      padding: 8px 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .footer-btn:hover {
      transform: none;
    }
  }

  @media (prefers-contrast: high) {
    :global(dialog.base-modal.whats-new-modal[data-size="fit"]) {
      border-width: 2px;
    }

    .category-card {
      border-width: 2px;
    }
  }
</style>
