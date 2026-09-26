<!-- ReleaseNotesTab - Master-detail version history with container query responsive layout -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { createVersionState } from "$lib/shared/feedback/state/version-state.svelte";
  import type { AppVersion } from "$lib/shared/versioning/domain/models/version-models";
  import VersionCard from "./release-notes/VersionCard.svelte";
  import VersionListItem from "./release-notes/VersionListItem.svelte";
  import VersionDetailContent from "./release-notes/VersionDetailContent.svelte";
  import VersionDetailPanel from "./release-notes/VersionDetailPanel.svelte";
  import VersionHistoryEntry from "./release-notes/VersionHistoryEntry.svelte";
  import { getContributorLoader } from "$lib/shared/feedback/get-contributor-loader";
  import type { Contributor } from "$lib/shared/versioning/domain/models/contributor-models";

  const versionState = createVersionState();

  // Load versions on mount
  $effect(() => {
    versionState.loadVersions();
  });

  let selectedVersion = $state<AppVersion | null>(null);
  let isPanelOpen = $state(false);

  // No auto-selection: the stream shows every release read-only, and a release
  // only becomes the editor when it is explicitly picked.

  // The history stream renders every release, not just the selected one — this
  // page is the record of the work, so the record is what the canvas shows.
  // Mount in batches so 40+ releases don't all build at once.
  const STREAM_BATCH = 8;
  let visibleCount = $state(STREAM_BATCH);
  let streamElement = $state<HTMLElement | null>(null);
  let allContributors = $state<Contributor[]>([]);
  const contributorMap = $derived(
    new Map(allContributors.map((c) => [c.id, c]))
  );

  const streamVersions = $derived(
    versionState.versions.slice(0, visibleCount)
  );

  $effect(() => {
    getContributorLoader()
      .getAll()
      .then((list) => {
        allContributors = list;
      });
  });

  // Which release the reader is actually on. Browse has a scroll-spy, but it
  // reads positions out of its virtualizer, so there is nothing to reuse here.
  let activeVersion = $state<string | null>(null);
  let railElement = $state<HTMLElement | null>(null);

  /**
   * The release you are reading is the last one whose heading has passed the
   * top quarter of the panel. Geometry, not intersection ratios: a tall release
   * and a short one can both be fully on screen, and ratio can't tell you which
   * one you're looking at.
   */
  function readActiveVersion() {
    if (!streamElement) return;
    const line =
      streamElement.getBoundingClientRect().top +
      Math.min(streamElement.clientHeight * 0.25, 160);
    let current: string | null = null;
    for (const section of streamElement.querySelectorAll<HTMLElement>(".stream-section")) {
      if (section.getBoundingClientRect().top <= line) {
        current = section.dataset.version ?? null;
      } else break;
    }
    const first = streamElement.querySelector<HTMLElement>(".stream-section");
    activeVersion = current ?? first?.dataset.version ?? null;
  }

  /** Tracks the current release while the stream scrolls. */
  function spyOnScroll(node: HTMLElement) {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        readActiveVersion();
      });
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    readActiveVersion();
    return {
      destroy: () => node.removeEventListener("scroll", onScroll),
    };
  }

  // Newly mounted releases change what sits under the read line.
  $effect(() => {
    streamVersions.length;
    readActiveVersion();
  });

  // Keep the current release visible in the rail as the stream scrolls.
  $effect(() => {
    if (!activeVersion || !railElement) return;
    const item = railElement.querySelector<HTMLElement>(
      `[data-rail-version="${CSS.escape(activeVersion)}"]`
    );
    if (!item) return;
    const railRect = railElement.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < railRect.top || itemRect.bottom > railRect.bottom) {
      railElement.scrollTo({
        top: item.offsetTop - railElement.clientHeight / 2 + item.clientHeight / 2,
        behavior: "smooth",
      });
    }
  });

  /** Grows the stream when its tail scrolls into view. */
  function revealOnScroll(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (visibleCount >= versionState.versions.length) return;
        visibleCount += STREAM_BATCH;
      },
      { root: streamElement, rootMargin: "600px" }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  /** Brings a release into view, mounting it first if the stream hasn't reached it. */
  function jumpToVersion(version: AppVersion) {
    const index = versionState.versions.findIndex(
      (v) => v.version === version.version
    );
    if (index >= visibleCount) {
      visibleCount = index + STREAM_BATCH;
    }
    activeVersion = version.version;

    requestAnimationFrame(() => {
      document
        .getElementById(`release-${version.version}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  /** Wide mode: open a release in the editor, in place in the stream. */
  function selectVersion(version: AppVersion) {
    selectedVersion = version;
    jumpToVersion(version);
  }

  /** Narrow mode: select version and open drawer */
  function openVersionDetail(version: AppVersion) {
    selectedVersion = version;
    isPanelOpen = true;
  }

  function handleListKeydown(e: KeyboardEvent) {
    if (!versionState.versions.length) return;
    const currentIndex = activeVersion
      ? versionState.versions.findIndex((v) => v.version === activeVersion)
      : -1;

    let newIndex = currentIndex;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = Math.min(currentIndex + 1, versionState.versions.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = Math.max(currentIndex - 1, 0);
    } else if (e.key === "Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      newIndex = versionState.versions.length - 1;
    }

    const target = versionState.versions[newIndex];
    if (newIndex !== currentIndex && target) {
      jumpToVersion(target);
    }
  }

  async function handleVersionUpdated() {
    await versionState.loadVersions();
    if (selectedVersion) {
      const updated = versionState.versions.find(
        (v) => v.version === selectedVersion?.version
      );
      // If the selected version was removed, fall back to first
      selectedVersion = updated ?? versionState.versions[0] ?? null;
    }
  }
</script>

<div class="release-notes-tab">
  <header class="tab-header">
    <div class="header-content">
      <h2>
        <i class="fas fa-gift" aria-hidden="true"></i>
        {t("tab_settings_release_notes")}
      </h2>
    </div>
  </header>

  <div class="master-detail-layout">
    <!-- Master: version list -->
    <aside
      class="version-list-panel themed-scrollbar"
      bind:this={railElement}
    >
      {#if versionState.isLoading && versionState.versions.length === 0}
        <div class="loading-state">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      {:else if versionState.error}
        <div class="error-state">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <p>{versionState.error}</p>
          <button type="button" onclick={() => versionState.loadVersions()}>
            {t("action_retry")}
          </button>
        </div>
      {:else if versionState.versions.length === 0}
        <div class="empty-state">
          <i class="fas fa-rocket" aria-hidden="true"></i>
          <h3>{t("settings_no_releases_yet")}</h3>
          <p>{t("settings_check_back_for_updates")}</p>
        </div>
      {:else}
        <!-- Wide mode: compact list items -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="version-list-compact"
          role="listbox"
          tabindex="0"
          aria-label={t("settings_version_list")}
          onkeydown={handleListKeydown}
        >
          {#each versionState.versions as version (version.version)}
            <div class="rail-slot" data-rail-version={version.version}>
              <VersionListItem
                {version}
                isActive={activeVersion === version.version}
                onclick={() => jumpToVersion(version)}
              />
            </div>
          {/each}
        </div>
        <!-- Narrow mode: full cards -->
        <div class="version-list-cards">
          {#each versionState.versions as version (version.version)}
            <VersionCard {version} onclick={() => openVersionDetail(version)} />
          {/each}
        </div>
      {/if}
    </aside>

    <!-- Detail: the full release history (wide mode only) -->
    <main
      class="version-detail-panel themed-scrollbar"
      bind:this={streamElement}
      use:spyOnScroll
    >
      {#if versionState.versions.length > 0}
        <div class="history-stream">
          {#each streamVersions as version (version.version)}
            <div
              id="release-{version.version}"
              class="stream-section"
              data-version={version.version}
            >
              {#if selectedVersion?.version === version.version}
                <VersionDetailContent
                  {version}
                  onVersionUpdated={handleVersionUpdated}
                  showCloseButton={false}
                />
              {:else}
                <VersionHistoryEntry
                  {version}
                  {contributorMap}
                  onOpenFeedback={() => selectVersion(version)}
                  onSelect={() => selectVersion(version)}
                />
              {/if}
            </div>
          {/each}

          {#if visibleCount < versionState.versions.length}
            <div class="stream-sentinel" use:revealOnScroll aria-hidden="true">
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              {t("settings_loading_earlier_releases")}
            </div>
          {:else}
            <p class="stream-end">
              {t("settings_release_count_end", { count: versionState.versions.length })}
            </p>
          {/if}
        </div>
      {:else}
        <div class="no-selection">
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <p>{t("settings_select_version_details")}</p>
        </div>
      {/if}
    </main>
  </div>

  <!-- Drawer for narrow mode -->
  <VersionDetailPanel
    version={selectedVersion}
    bind:isOpen={isPanelOpen}
    onVersionUpdated={handleVersionUpdated}
  />
</div>

<style>
  .release-notes-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    container-type: inline-size;
  }

  .tab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 16px 0;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .header-content h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--theme-text);
  }

  .header-content h2 i {
    color: var(--theme-accent);
  }

  .master-detail-layout {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 0;
  }

  /* Master panel — floor of 280px, grows with the canvas */
  .version-list-panel {
    flex-shrink: 0;
    width: 280px;
    overflow-y: auto;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-right: 1px solid var(--theme-stroke);
  }

  /* Detail panel */
  .version-detail-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .history-stream {
    display: flex;
    flex-direction: column;
    padding: 0 clamp(1.5rem, 2vw, 4rem) clamp(2rem, 3vw, 5rem);
  }

  /* The stream owns the horizontal band; the selected release's own editor
     padding would otherwise double it up. */
  .history-stream :global(.version-detail-body) {
    padding-inline: 0;
    overflow: visible;
  }

  .stream-section:first-child :global(.history-entry) {
    border-top: none;
  }

  .stream-sentinel,
  .stream-end {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: clamp(1.5rem, 2vw, 3rem) 0;
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .stream-end {
    border-top: 1px solid var(--theme-stroke);
  }

  /* Default: wide mode - show compact list and detail */
  .version-list-compact {
    display: flex;
    flex-direction: column;
  }

  .version-list-cards {
    display: none;
  }

  /* No selection empty state */
  .no-selection {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--theme-text-dim);
  }

  .no-selection i {
    font-size: var(--font-size-xl);
    opacity: 0.5;
  }

  .no-selection p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  /* Narrow mode: hide detail panel, show cards instead of list items */
  @container (max-width: 699px) {
    .version-list-panel {
      width: 100%;
      border-right: none;
    }

    .version-list-compact {
      display: none;
    }

    .version-list-cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 4px;
    }

    .version-detail-panel {
      display: none;
    }
  }

  /* Wide canvases: the rail grows instead of stranding the detail pane */
  @container (min-width: 1400px) {
    .version-list-panel {
      width: 21rem;
    }
  }

  /* The rail can use more of a wide canvas without changing the logical size
     of its text. */
  @container (min-width: 2000px) {
    .version-list-panel {
      width: 25rem;
    }
  }

  @container (min-width: 2800px) {
    .version-list-panel {
      width: 30rem;
    }
  }

  /* Loading state */
  .loading-state {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-card {
    height: 72px;
    background: var(--theme-card-bg);
    border-radius: 12px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Error state */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 50px 24px;
    text-align: center;
  }

  .error-state i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-error);
    margin-bottom: 12px;
  }

  .error-state p {
    margin: 0 0 16px 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  .error-state button {
    padding: 8px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .error-state button:hover {
    background: var(--theme-card-hover-bg);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 24px;
    text-align: center;
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 40%,
      transparent
    );
    margin-bottom: 16px;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-card {
      animation: none;
    }
  }
</style>
