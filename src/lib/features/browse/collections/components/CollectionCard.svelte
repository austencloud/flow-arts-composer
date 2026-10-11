<!--
CollectionCard.svelte

One collection in the My Collections grid. Clicking the card opens the
collection; the kebab button (or a right-click) opens Rename / Delete.
Favorites is a system collection — it can't be renamed or deleted, so its
kebab is hidden entirely rather than showing a menu of disabled entries.

Renaming swaps the card body for an inline input (Enter saves, Escape
cancels) so the user never leaves the grid. Deleting asks for confirmation
first and only removes the folder — the sequences inside stay in the library.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type {
    CollectionAccessRole,
    LibraryCollection,
  } from "#lib/shared/library/domain/models/collection.js";
  import { isSystemCollection } from "#lib/shared/library/domain/models/collection.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { communityCollectionsState } from "../state/community-collections-state.svelte";
  import ContextMenu from "#lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuEntry,
    ContextMenuState,
  } from "#lib/shared/components/context-menu/context-menu-types.js";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import CollectionCardSurface from "./CollectionCardSurface.svelte";
  import CollectionDetailsDialog from "./CollectionDetailsDialog.svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { openShareCollectionSheet } from "#lib/shared/inbox/state/send-sequence-state.svelte.js";

  let {
    collection,
    onOpen,
    ownerName,
    readonly: isReadonly = false,
    onUnfollow,
    onEditRule,
    accessRole,
    selected = false,
    countLabel: countLabelOverride,
    minimalMetadata = false,
  }: {
    collection: LibraryCollection;
    onOpen: () => void;
    /** Community cards credit their creator under the name. */
    ownerName?: string;
    /** Someone else's collection: no kebab, no rename/delete/publish. */
    readonly?: boolean;
    /** Followed collection: the kebab offers Unfollow instead of owner actions. */
    onUnfollow?: () => void;
    /** Smart Collection cards can open the rule editor directly from their menu. */
    onEditRule?: () => void;
    /** Permission shown for a collection another person shared with this user. */
    accessRole?: CollectionAccessRole;
    /** Desktop rail: this card is the collection currently showing in the detail pane. */
    selected?: boolean;
    /** Overrides the default "N sequences" text — e.g. the Art shelf's
     *  "N tunnels" / "N 3D scenes" / "N mandalas". */
    countLabel?: string;
    /** Curated shelves provide their useful context as a group, so card copy
     *  stays focused on the deck name and what a person can open there. */
    minimalMetadata?: boolean;
  } = $props();

  const isSystem = $derived(isSystemCollection(collection));
  const isSmart = $derived(collection.kind === "smart");

  let menuState: ContextMenuState = $state({ open: false });
  let renaming = $state(false);
  let renameValue = $state("");
  let saving = $state(false);
  let deleteConfirmOpen = $state(false);
  let detailsOpen = $state(false);

  const menuItems: ContextMenuEntry[] = $derived.by(() => {
    if (onUnfollow) {
      return [
        {
          id: "unfollow",
          label: t("browse_audit_unfollow"),
          icon: "fa-xmark",
          action: () => {
            menuState = { open: false };
            onUnfollow?.();
          },
        },
      ];
    }
    return ownerMenuItems();
  });

  const ownerMenuItems = (): ContextMenuEntry[] => [
    ...(isSmart && onEditRule
      ? [
          {
            id: "edit-rule",
            label: t("browse_audit_edit_rule"),
            icon: "fa-sliders",
            action() {
              menuState = { open: false };
              onEditRule?.();
            },
          },
        ]
      : []),
    ...(isSmart
      ? []
      : [
          {
            id: "share",
            label: t("browse_audit_share_collection"),
            icon: "fa-user-plus",
            action() {
              menuState = { open: false };
              openShareCollectionSheet(collection);
            },
          },
        ]),
    {
      id: "rename",
      label: t("browse_audit_rename"),
      icon: "fa-pen",
      action() {
        menuState = { open: false };
        renameValue = collection.name;
        renaming = true;
      },
    },
    {
      id: "details",
      label: t("browse_audit_edit_details"),
      icon: "fa-circle-info",
      action() {
        menuState = { open: false };
        detailsOpen = true;
      },
    },
    // Smart collections are private-only in v1 — no publish action.
    ...(isSmart
      ? []
      : [
          {
            id: "visibility",
            label: collection.isPublic
              ? t("browse_audit_make_private")
              : t("browse_audit_make_public"),
            icon: collection.isPublic ? "fa-lock" : "fa-globe",
            async action() {
              menuState = { open: false };
              const ok = await collectionsState.setPublic(
                collection.id,
                !collection.isPublic
              );
              // The Community feed caches for the session; publishing has to show
              // up there the moment the user flips over to look.
              if (ok) communityCollectionsState.invalidate();
            },
          },
        ]),
    { type: "separator" } as ContextMenuEntry,
    {
      id: "delete",
      label: t("browse_audit_delete_collection"),
      icon: "fa-trash",
      danger: true,
      action() {
        menuState = { open: false };
        deleteConfirmOpen = true;
      },
    },
  ];

  function openMenuAt(x: number, y: number) {
    if (isSystem || (isReadonly && !onUnfollow)) return;
    menuState = { open: true, x, y };
  }

  function handleKebab(e: MouseEvent) {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    openMenuAt(rect.left, rect.bottom + 4);
  }

  function handleContextMenu(e: MouseEvent) {
    if (isSystem) return;
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  }

  async function commitRename() {
    if (saving) return;
    const name = renameValue.trim();
    if (!name || name === collection.name) {
      renaming = false;
      return;
    }
    saving = true;
    try {
      const ok = await collectionsState.rename(collection.id, name);
      // A public collection's name is showing in the Community feed too.
      if (ok && collection.isPublic) communityCollectionsState.invalidate();
    } finally {
      saving = false;
      renaming = false;
    }
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      renaming = false;
    }
  }

  async function performDelete() {
    deleteConfirmOpen = false;
    const ok = await collectionsState.remove(collection.id);
    // A deleted public collection would ghost in the cached Community feed.
    if (ok && collection.isPublic) communityCollectionsState.invalidate();
  }
</script>

<CollectionCardSurface
  {collection}
  {ownerName}
  {accessRole}
  readonly={isReadonly}
  {selected}
  countLabel={countLabelOverride}
  {minimalMetadata}
  editing={renaming}
  onOpen={() => {
    getHapticFeedback()?.trigger("selection");
    onOpen();
  }}
  onContextMenu={handleContextMenu}
  onOptions={(!isSystem && !isReadonly) || onUnfollow ? handleKebab : undefined}
>
  {#snippet editor()}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="text"
      class="rename-field"
      aria-label={t("browse_ui_collection_name")}
      bind:value={renameValue}
      onkeydown={handleRenameKeydown}
      onblur={() => void commitRename()}
      maxlength="60"
      autofocus
    />
  {/snippet}
</CollectionCardSurface>

<ContextMenu
  {menuState}
  items={menuItems}
  onClose={() => (menuState = { open: false })}
/>

<CollectionDetailsDialog {collection} bind:open={detailsOpen} />

<ConfirmDialog
  bind:isOpen={deleteConfirmOpen}
  title={t("browse_audit_delete_named_collection", { name: collection.name })}
  message={isSmart
    ? t("browse_audit_delete_smart_message")
    : t("browse_audit_delete_collection_message")}
  confirmText={t("action_delete")}
  cancelText={t("browse_audit_keep")}
  variant="danger"
  onConfirm={performDelete}
  onCancel={() => (deleteConfirmOpen = false)}
/>

<style>
  .rename-field {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid color-mix(in srgb, var(--tile-color) 45%, transparent);
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-family: inherit;
  }

  .rename-field:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--tile-color) 70%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tile-color) 14%, transparent);
  }
</style>
