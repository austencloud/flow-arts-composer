<!-- ChangeGroupSection - Single changelog category with admin editing -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type {
    ChangelogCategory,
    ChangelogEntry,
  } from "#lib/shared/versioning/domain/models/version-models.js";
  import type { Contributor } from "#lib/shared/versioning/domain/models/contributor-models.js";
  import {
    CATEGORY_ICONS,
  } from "#lib/shared/versioning/domain/constants/changelog-constants.js";
  import EditableChangelogItem from "./EditableChangelogItem.svelte";

  let {
    category,
    entries,
    isAdmin = false,
    isAddingEntry = false,
    newEntryText = $bindable(""),
    currentlyEditingId,
    onSaveEntry,
    onDeleteEntry,
    onOpenFeedback,
    onStartAdd,
    onCancelAdd,
    onConfirmAdd,
    onStartEdit,
    onEndEdit,
    allContributors,
    contributorMap,
    onUpdateEntryContributors,
  }: {
    category: ChangelogCategory;
    entries: ChangelogEntry[];
    isAdmin?: boolean;
    isAddingEntry?: boolean;
    newEntryText?: string;
    currentlyEditingId: string | null;
    onSaveEntry: (index: number, newText: string) => Promise<void>;
    onDeleteEntry: (index: number) => Promise<void>;
    onOpenFeedback: (entry: ChangelogEntry) => void;
    onStartAdd: () => void;
    onCancelAdd: () => void;
    onConfirmAdd: () => Promise<void>;
    onStartEdit: (id: string) => void;
    onEndEdit: () => void;
    allContributors?: Contributor[];
    contributorMap?: Map<string, Contributor>;
    onUpdateEntryContributors?: (index: number, ids: string[]) => void;
  } = $props();
</script>

<div class="change-group">
  <h4 class="group-title {category}">
    <i class="fas {CATEGORY_ICONS[category]}" aria-hidden="true"></i>
    {t(`settings_changelog_${category}`)}
    <span class="count">{entries.length}</span>
  </h4>

  <ul class="change-list">
    {#each entries as entry, index (entry.feedbackId ?? entry.text)}
      {@const itemId = `${category}-${index}`}
      <li>
        <EditableChangelogItem
          {entry}
          canEdit={isAdmin}
          onSave={(newText) => onSaveEntry(index, newText)}
          onDelete={isAdmin ? () => onDeleteEntry(index) : undefined}
          onOpenFeedback={() => onOpenFeedback(entry)}
          {itemId}
          isEditing={currentlyEditingId === itemId}
          {onStartEdit}
          {onEndEdit}
          contributors={entry.contributorIds
            ? entry.contributorIds
                .map((id) => contributorMap?.get(id))
                .filter((c): c is Contributor => !!c)
            : undefined}
          {allContributors}
          onUpdateContributors={onUpdateEntryContributors
            ? (ids) => onUpdateEntryContributors(index, ids)
            : undefined}
        />
      </li>
    {/each}

    {#if isAdmin && isAddingEntry}
      <li class="add-entry-form">
        <textarea
          bind:value={newEntryText}
          placeholder={t(`settings_changelog_${category}_placeholder`)}
          rows="2"
        ></textarea>
        <div class="add-entry-actions">
          <button
            type="button"
            class="glass-btn primary"
            onclick={() => void onConfirmAdd()}
            disabled={!newEntryText.trim()}
          >
            <i class="fas fa-plus" aria-hidden="true"></i> {t("action_add")}
          </button>
          <button type="button" class="glass-btn" onclick={onCancelAdd}
            >{t("action_cancel")}</button
          >
        </div>
      </li>
    {:else if isAdmin}
      <li>
        <button type="button" class="add-entry-btn" onclick={onStartAdd}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          {t(`settings_changelog_${category}_add`)}
        </button>
      </li>
    {/if}
  </ul>
</div>

<style>
  .change-group {
    margin-bottom: 20px;
  }
  .change-group:last-child {
    margin-bottom: 0;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .group-title .count {
    margin-left: auto;
    padding: 2px 8px;
    background: var(--theme-card-hover-bg);
    border-radius: 10px;
    font-size: var(--font-size-compact);
    font-weight: 500;
  }

  .group-title.fixed {
    color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 70%,
      white
    );
  }
  .group-title.fixed i {
    color: var(--semantic-error, var(--semantic-error));
  }
  .group-title.added {
    color: var(--theme-accent);
  }
  .group-title.added i {
    color: var(--theme-accent, var(--theme-accent-strong));
  }
  .group-title.improved {
    color: var(--semantic-info);
  }
  .group-title.improved i {
    color: var(--semantic-info, var(--semantic-info));
  }

  .change-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Plain rows split by hairlines, like every other settings list. */
  .change-list li + li {
    border-top: 1px solid var(--theme-stroke);
  }

  .add-entry-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 1px dashed var(--theme-stroke-strong);
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .add-entry-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 30%,
      transparent
    );
    color: var(--theme-accent);
  }

  .add-entry-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 8px;
  }

  .add-entry-form textarea {
    width: 100%;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-sm);
    line-height: 1.5;
    font-family: inherit;
    resize: vertical;
    min-height: 60px;
  }

  .add-entry-form textarea:focus {
    outline: none;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 50%,
      transparent
    );
  }

  .add-entry-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .glass-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .glass-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    transform: translateY(-1px);
  }

  .glass-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .glass-btn.primary {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 30%,
      transparent
    );
    color: var(--theme-accent);
  }

  .glass-btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }
</style>
