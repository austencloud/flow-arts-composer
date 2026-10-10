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
  import {
    CATEGORY_ICONS,
  } from "#lib/shared/versioning/domain/constants/changelog-constants.js";
  import type { Contributor } from "#lib/shared/versioning/domain/models/contributor-models.js";
  import type {
    ChangelogCategory,
    ChangelogEntry,
  } from "#lib/shared/versioning/domain/models/version-models.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ContributorBadge from "./tabs/release-notes/ContributorBadge.svelte";
  import ChangelogRichText from "./tabs/release-notes/ChangelogRichText.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

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

  // Group changelog entries by category
  const groupedChangelog = $derived.by(() => {
    if (!version?.changelogEntries) return [];

    const groups = new Map<ChangelogCategory, ChangelogEntry[]>();

    for (const entry of version.changelogEntries) {
      const existing = groups.get(entry.category) || [];
      existing.push(entry);
      groups.set(entry.category, existing);
    }

    return Array.from(groups.entries())
      .map(([category, entries]) => ({
        category,
        entries,
        ...CATEGORY_CONFIG[category],
      }))
      .sort((a, b) => a.order - b.order);
  });

  // Total count for summary
  const totalChanges = $derived(version?.changelogEntries?.length ?? 0);
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
              <span class="category-count">{group.entries.length}</span>
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
          {t("settings_all_releases")}
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
    transition: all 0.2s;
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
    transition: all 0.2s;
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
    transition: all 0.2s;
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
