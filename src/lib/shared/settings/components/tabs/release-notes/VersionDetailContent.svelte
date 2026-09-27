<!-- VersionDetailContent - Changelog content for a single version, usable inline or in a drawer -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getReactiveLocale } from "$lib/shared/i18n/locale-state.svelte";
  import { onMount } from "svelte";
  import type {
    AppVersion,
    ChangelogCategory,
    ChangelogEntry,
  } from "$lib/shared/versioning/domain/models/version-models";
  import { CHANGELOG_CATEGORIES } from "$lib/shared/versioning/domain/constants/changelog-constants";
  import { changelogPlainText } from "$lib/shared/versioning/domain/utils/changelog-rich-text";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import type { FeedbackItem } from "$lib/shared/feedback/domain/models/feedback-models";
  import { feedbackService } from "$lib/shared/feedback/services/feedback-repository";
  import { createFeedbackManageState } from "$lib/shared/feedback/state/feedback-manage-state.svelte";
  import EditableReleaseNotes from "./EditableReleaseNotes.svelte";
  import ChangeGroupSection from "./ChangeGroupSection.svelte";
  import VersionHeader from "./VersionHeader.svelte";
  import NoChangelogState from "./NoChangelogState.svelte";
  import ActionToast from "./ActionToast.svelte";
  import ContributorBadge from "./ContributorBadge.svelte";
  import { getContributorLoader } from "$lib/shared/feedback/get-contributor-loader";
  import type { Contributor } from "$lib/shared/versioning/domain/models/contributor-models";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { changelogEditState } from "./state/changelog-edit-state.svelte";
  import * as versionService from "$lib/shared/feedback/services/version-service";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";

  let {
    version,
    onVersionUpdated,
    showCloseButton = true,
    onClose,
  }: {
    version: AppVersion;
    onVersionUpdated?: () => void;
    showCloseButton?: boolean;
    onClose?: () => void;
  } = $props();

  // Contributor state
  let allContributors = $state<Contributor[]>([]);
  const contributorMap = $derived(
    new Map(allContributors.map((c) => [c.id, c]))
  );

  // UI state
  let currentlyEditingId = $state<string | null>(null);
  let selectedFeedback = $state<FeedbackItem | null>(null);
  let isLoadingFeedback = $state(false);
  let feedbackPanelOpen = $state(false);
  let addingToCategory = $state<ChangelogCategory | null>(null);
  let newEntryText = $state("");

  // Create a manage state for editing feedback in release notes context
  const manageState = createFeedbackManageState();

  // Toast
  type ToastType = "action" | "undone" | "redone";
  let toastMessage = $state<string | null>(null);
  let toastType = $state<ToastType>("action");
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Reset UI state when version changes (user clicked different release)
  $effect(() => {
    // Read version to create dependency
    const _ = version;
    // Reset all edit/add states
    addingToCategory = null;
    newEntryText = "";
    currentlyEditingId = null;
  });

  // Derived
  const isAdmin = $derived(authState.isEffectiveAdmin);
  const hasChangelog = $derived(
    version?.changelogEntries && version.changelogEntries.length > 0
  );

  const groupedChangelog = $derived.by(() => {
    const entries = version?.changelogEntries;
    if (!entries) return { fixed: [], added: [], improved: [] };
    return {
      fixed: entries.filter((e) => e.category === "fixed"),
      added: entries.filter((e) => e.category === "added"),
      improved: entries.filter((e) => e.category === "improved"),
    };
  });

  // Only categories with entries earn a column. The empty ones an admin still
  // needs are collected into a single compact row underneath.
  const populatedCategories = $derived(
    CHANGELOG_CATEGORIES.filter((c) => groupedChangelog[c].length > 0)
  );
  const emptyCategories = $derived(
    isAdmin
      ? CHANGELOG_CATEGORIES.filter((c) => groupedChangelog[c].length === 0)
      : []
  );

  function showToast(msg: string, type: ToastType) {
    toastMessage = msg;
    toastType = type;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => (toastMessage = null), 3000);
  }

  // Edit state
  function startEdit(id: string) {
    if (addingToCategory) {
      cancelAdd();
    }
    currentlyEditingId = id;
  }
  function endEdit() {
    currentlyEditingId = null;
  }

  function openFeedback(entry: ChangelogEntry) {
    if (addingToCategory) {
      cancelAdd();
    }
    if (entry.feedbackId) {
      void loadAndOpenFeedback(entry.feedbackId);
    }
  }

  async function loadAndOpenFeedback(feedbackId: string) {
    isLoadingFeedback = true;
    try {
      const feedback = await feedbackService.getFeedback(feedbackId);
      if (feedback) {
        selectedFeedback = feedback;
        feedbackPanelOpen = true;
      }
    } catch (err) {
      console.error("Failed to load feedback:", err);
    } finally {
      isLoadingFeedback = false;
    }
  }

  function closeFeedbackPanel() {
    feedbackPanelOpen = false;
    selectedFeedback = null;
  }

  function handlePanelClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (currentlyEditingId && !target.closest(".edit-container")) {
      endEdit();
    }
    if (
      addingToCategory &&
      !target.closest(".add-entry-form") &&
      !target.closest(".add-entry-btn")
    ) {
      cancelAdd();
    }
  }

  function startAdd(cat: ChangelogCategory) {
    addingToCategory = cat;
    newEntryText = "";
  }
  function cancelAdd() {
    addingToCategory = null;
    newEntryText = "";
  }

  async function confirmAdd() {
    if (!version || !addingToCategory || !newEntryText.trim()) return;
    const entry: ChangelogEntry = {
      category: addingToCategory,
      text: newEntryText.trim(),
    };
    await versionService.addChangelogEntry(version.version, entry);
    version.changelogEntries = [...(version.changelogEntries || []), entry];
    cancelAdd();
    onVersionUpdated?.();
  }

  async function handleSave(cat: ChangelogCategory, idx: number, text: string) {
    if (!version) return;
    const entries = version.changelogEntries || [];
    const catEntries = entries.filter((e) => e.category === cat);
    const entry = catEntries[idx];
    if (!entry) return;

    const absIdx = entries.indexOf(entry);
    const oldText = entry.text;
    const updated: ChangelogEntry = {
      category: cat,
      text,
      ...(entry.feedbackId && { feedbackId: entry.feedbackId }),
    };

    await versionService.updateChangelogEntry(version.version, absIdx, updated);
    version.changelogEntries![absIdx] = updated;
    changelogEditState.pushUndo({
      type: "edit",
      oldText,
      absoluteIndex: absIdx,
    });
    onVersionUpdated?.();
  }

  async function handleDelete(cat: ChangelogCategory, idx: number) {
    if (!version) return;
    const entries = version.changelogEntries || [];
    const catEntries = entries.filter((e) => e.category === cat);
    const entry = catEntries[idx];
    if (!entry) return;

    const absIdx = entries.indexOf(entry);
    const deleted = { ...entry };

    await versionService.deleteChangelogEntry(version.version, absIdx);
    version.changelogEntries!.splice(absIdx, 1);
    version.changelogEntries = [...version.changelogEntries!];

    changelogEditState.pushUndo({
      type: "delete",
      entry: deleted,
      absoluteIndex: absIdx,
    });
    showToast(t("settings_entry_deleted"), "action");
    onVersionUpdated?.();
  }

  async function handleSaveReleaseNotes(text: string) {
    if (!version) return;
    const oldText = version.releaseNotes || "";
    await versionService.updateReleaseNotes(version.version, text);
    version.releaseNotes = text;
    changelogEditState.pushUndo({ type: "editReleaseNotes", oldText });
    onVersionUpdated?.();
  }

  // Undo/redo
  async function handleUndo() {
    if (!version) return;
    try {
      const msg = await changelogEditState.undo(version);
      if (msg) showToast(msg, "undone");
      onVersionUpdated?.();
    } catch {
      showToast(t("settings_undo_failed"), "action");
    }
  }

  async function handleRedo() {
    if (!version) return;
    try {
      const msg = await changelogEditState.redo(version);
      if (msg) showToast(msg, "redone");
      onVersionUpdated?.();
    } catch {
      showToast(t("settings_redo_failed"), "action");
    }
  }

  function formatReleaseNotesForCopy(): string {
    if (!version) return "";
    const lines: string[] = [];

    lines.push(`Flow Arts Composer v${version.version}`);
    lines.push(
      t("settings_released_on", {
        date: version.releasedAt.toLocaleDateString(getReactiveLocale(), { year: "numeric", month: "long", day: "numeric" }),
      })
    );
    lines.push("");

    if (version.releaseNotes) {
      lines.push(version.releaseNotes);
      lines.push("");
    }

    const cats = [
      { key: "added", label: t("settings_changelog_added") },
      { key: "improved", label: t("settings_changelog_improved") },
      { key: "fixed", label: t("settings_changelog_fixed") },
    ] as const;

    for (const { key, label } of cats) {
      const entries = groupedChangelog[key];
      if (entries.length > 0) {
        lines.push(`${label}:`);
        for (const entry of entries) {
          lines.push(`• ${changelogPlainText(entry.text)}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  async function handleUpdateEntryContributors(
    cat: ChangelogCategory,
    catIdx: number,
    contributorIds: string[]
  ) {
    if (!version) return;
    const entries = version.changelogEntries || [];
    const catEntries = entries.filter((e) => e.category === cat);
    const entry = catEntries[catIdx];
    if (!entry) return;
    const absIdx = entries.indexOf(entry);

    await versionService.updateEntryContributors(
      version.version,
      absIdx,
      contributorIds
    );

    // Update local state so the UI reflects the change immediately
    version.changelogEntries![absIdx] = {
      ...version.changelogEntries![absIdx]!,
      contributorIds: contributorIds.length > 0 ? contributorIds : undefined,
    };
    version.changelogEntries = [...version.changelogEntries!];

    // Recompute version-level contributors as union of all entries
    const allIds = new Set<string>();
    for (const e of version.changelogEntries!) {
      if (e.contributorIds) {
        for (const id of e.contributorIds) allIds.add(id);
      }
    }
    version.contributorIds = allIds.size > 0 ? [...allIds] : undefined;

    onVersionUpdated?.();
  }

  onMount(() => {
    const loader = getContributorLoader();
    loader.getAll().then((list) => {
      allContributors = list;
    });

    return () => {
      if (toastTimeout) clearTimeout(toastTimeout);
    };
  });
</script>

<div
  data-edit-history-shortcut-scope
  class="version-detail-body"
  onclick={handlePanelClick}
  role="presentation"
>
  <EditHistoryShortcutBridge
    onUndo={handleUndo}
    onRedo={handleRedo}
    canUndo={changelogEditState.canUndo}
    canRedo={changelogEditState.canRedo}
  />
  <VersionHeader
    version={version.version}
    releasedAt={version.releasedAt}
    onClose={showCloseButton ? onClose : undefined}
    getCopyData={formatReleaseNotesForCopy}
    layout={showCloseButton ? "drawer" : "inline"}
  />

  {#if version.releaseNotes}
    <section>
      <h3>{t("tab_settings_release_notes")}</h3>
      <EditableReleaseNotes
        text={version.releaseNotes}
        canEdit={isAdmin}
        onSave={handleSaveReleaseNotes}
        itemId="release-notes"
        isEditing={currentlyEditingId === "release-notes"}
        onStartEdit={startEdit}
        onEndEdit={endEdit}
      />
    </section>
  {/if}

  {#if hasChangelog || isAdmin}
    <section>
      <h3>{t("settings_what_changed")}</h3>
      {#if !hasChangelog && isAdmin}<p class="hint">
          {t("settings_no_entries_add_below")}
        </p>{/if}
      <div class="change-groups" data-groups={populatedCategories.length}>
        {#each populatedCategories as cat (cat)}
          <ChangeGroupSection
            category={cat}
            entries={groupedChangelog[cat]}
            {isAdmin}
            isAddingEntry={addingToCategory === cat}
            bind:newEntryText
            {currentlyEditingId}
            onSaveEntry={(i, t) => handleSave(cat, i, t)}
            onDeleteEntry={(i) => handleDelete(cat, i)}
            onOpenFeedback={openFeedback}
            onStartAdd={() => startAdd(cat)}
            onCancelAdd={cancelAdd}
            onConfirmAdd={confirmAdd}
            onStartEdit={startEdit}
            onEndEdit={endEdit}
            {allContributors}
            {contributorMap}
            onUpdateEntryContributors={(i, ids) => handleUpdateEntryContributors(cat, i, ids)}
          />
        {/each}
      </div>

      {#if emptyCategories.length > 0}
        <div class="empty-adders" data-groups={emptyCategories.length}>
          {#each emptyCategories as cat (cat)}
            <ChangeGroupSection
              category={cat}
              entries={groupedChangelog[cat]}
              {isAdmin}
              isAddingEntry={addingToCategory === cat}
              bind:newEntryText
              {currentlyEditingId}
              onSaveEntry={(i, t) => handleSave(cat, i, t)}
              onDeleteEntry={(i) => handleDelete(cat, i)}
              onOpenFeedback={openFeedback}
              onStartAdd={() => startAdd(cat)}
              onCancelAdd={cancelAdd}
              onConfirmAdd={confirmAdd}
              onStartEdit={startEdit}
              onEndEdit={endEdit}
              {allContributors}
              {contributorMap}
              onUpdateEntryContributors={(i, ids) => handleUpdateEntryContributors(cat, i, ids)}
            />
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <NoChangelogState />
  {/if}

  {#if version?.contributorIds?.length && contributorMap.size > 0}
    <section>
      <h3>{t("settings_contributors")}</h3>
      <div class="contributors-grid">
        {#each version.contributorIds as cid (cid)}
          {@const contrib = contributorMap.get(cid)}
          {#if contrib}
            <ContributorBadge contributor={contrib} size="md" />
          {/if}
        {/each}
      </div>
    </section>
  {/if}
</div>

{#if selectedFeedback}
  <Drawer
    bind:isOpen={feedbackPanelOpen}
    placement="right"
    ariaLabel={t("settings_edit_feedback", { title: selectedFeedback.title })}
  >
    {#await import("$lib/features/feedback/components/manage/FeedbackDetailPanel.svelte") then mod}
      <mod.default
        item={selectedFeedback}
        {manageState}
        onClose={closeFeedbackPanel}
        readOnly={!isAdmin}
      />
    {/await}
  </Drawer>
{/if}

{#if toastMessage}
  <ActionToast
    message={toastMessage}
    showUndo={toastType === "action" && changelogEditState.canUndo}
    showRedo={toastType === "undone" && changelogEditState.canRedo}
    onUndo={() => void handleUndo()}
    onRedo={() => void handleRedo()}
  />
{/if}

<style>
  .version-detail-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: clamp(1.5rem, 1.6vw, 3rem) clamp(1.5rem, 2vw, 4rem);
    overflow-y: auto;
    container-type: inline-size;
  }

  section {
    margin-bottom: 1.5rem;
  }

  /* One column on narrow panes; the three categories sit side by side once
     there is room, so a wide canvas gains columns instead of dead rail. */
  .change-groups {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(1rem, 1.5vw, 2.5rem);
    align-items: start;
  }

  /* The gap owns the spacing now, not each group's own bottom margin. */
  .change-groups :global(.change-group) {
    margin-bottom: 0;
  }

  /* One column per category that actually has entries, so the row is always
     balanced no matter which categories a release happens to use. */
  @container (min-width: 950px) {
    .change-groups[data-groups="2"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .change-groups[data-groups="3"] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* Wide columns would fling the count badge to the far edge, stranding it
     from the title it belongs to. Keep it next to the label. */
  .change-groups :global(.group-title .count),
  .empty-adders :global(.group-title .count) {
    margin-left: 0;
  }

  /* A release with one or two categories spreads that category's own entries
     instead of running a single long column down a wide canvas. */
  .change-groups :global(.change-list) {
    display: grid;
    gap: 0.5rem;
  }

  .change-groups :global(.change-list li) {
    margin-bottom: 0;
  }

  /* Entry text uses the primary UI role at every desktop width. */
  .change-groups :global(.change-item) {
    font-size: var(--font-size-base);
    line-height: 1.55;
  }

  @container (min-width: 1800px) {
    .change-groups[data-groups="1"] :global(.change-list) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (min-width: 2600px) {
    .change-groups[data-groups="1"] :global(.change-list) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .change-groups[data-groups="2"] :global(.change-list) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Admin-only: categories with nothing in them collapse to one quiet row of
     add buttons rather than each holding an empty column. */
  .empty-adders {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(0.75rem, 1vw, 1.5rem);
    margin-top: clamp(1rem, 1.5vw, 2rem);
    padding-top: clamp(1rem, 1.5vw, 2rem);
    border-top: 1px solid var(--theme-stroke);
    opacity: 0.75;
  }

  .empty-adders:hover,
  .empty-adders:focus-within {
    opacity: 1;
  }

  @container (min-width: 900px) {
    .empty-adders[data-groups="2"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .empty-adders[data-groups="3"] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  section h3 {
    margin: 0 0 12px 0;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .contributors-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hint {
    margin: 0 0 16px 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    font-style: italic;
  }

  @media (max-width: 768px) {
    .version-detail-body {
      padding: 16px;
      flex: 1;
      min-height: 0;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
    }
  }
</style>
