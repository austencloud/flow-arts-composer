<!--
SmartCollectionSaveDialog.svelte

Names and saves the CURRENT engine's active filters as a Smart Collection.
Given a live BrowseEngine, it snapshots {source, filters, sort} via
buildFilterSpecFromEngine on save. Reused by every browse host that offers a
"Save as Smart Collection" action (gallery = community pool, All library =
my-library pool).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
  import { buildFilterSpecFromEngine } from "#lib/shared/browse/services/smart-filter-spec.js";
  import { suggestSmartCollectionName } from "#lib/shared/browse/services/smart-collection-name.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
  import SmartCollectionSaveForm from "./SmartCollectionSaveForm.svelte";

  let {
    engine,
    show = $bindable(false),
  }: {
    engine: BrowseEngine;
    show?: boolean;
  } = $props();

  let name = $state("");
  let usingSuggestion = $state(true);
  let saving = $state(false);
  let wasOpen = false;

  const spec = $derived.by(() => buildFilterSpecFromEngine(engine));
  const suggestedName = $derived(
    suggestSmartCollectionName(
      spec,
      collectionsState.collections.map((collection) => collection.name)
    )
  );
  const modalOpen = $derived(show && !!authState.user);

  $effect(() => {
    if (show && !wasOpen) {
      name = "";
      usingSuggestion = true;
      saving = false;
    }
    wasOpen = show;

    // Creating a Smart Collection writes to the account library. Route a
    // signed-out attempt to the app's canonical account prompt instead of
    // leaving an inert save dialog on screen.
    if (show && authState.initialized && !authState.user) {
      show = false;
      authDrawerState.show("signup", "module:library");
    }
  });

  async function save() {
    const trimmed = name.trim() || suggestedName;
    if (saving || spec.filters.length === 0) return;
    saving = true;
    try {
      const created = await collectionsState.createSmart(
        trimmed,
        spec,
        engine.resultCount
      );
      if (created) {
        toast.success(`Smart Collection "${created.name}" saved.`);
        show = false;
      }
    } finally {
      saving = false;
    }
  }
</script>

<BaseModal
  open={modalOpen}
  size="fit"
  animation="pop"
  labelledBy="save-smart-collection-title"
  class="save-smart-modal"
  onclose={() => (show = false)}
>
  {#snippet header()}
    <ModalHeader
      id="save-smart-collection-title"
      title={t("library_ui_save_smart_collection")}
      subtitle={t(
        "library_ui_the_name_follows_the_filters_until_you_change_it"
      )}
      icon="fa-wand-magic-sparkles"
      iconColor="var(--theme-accent, #8b6cff)"
      onClose={() => (show = false)}
    />
  {/snippet}

  <SmartCollectionSaveForm
    {spec}
    matchCount={engine.resultCount}
    bind:name
    {suggestedName}
    bind:usingSuggestion
    {saving}
    autofocus
    onSave={() => void save()}
  />
</BaseModal>

<style>
  :global(dialog.base-modal.save-smart-modal[data-size="fit"]) {
    width: min(600px, calc(100vw - 32px));
  }

  @media (max-width: 520px) {
    :global(dialog.base-modal.save-smart-modal[data-size="fit"]) {
      width: calc(100vw - 20px);
      max-height: calc(100dvh - 20px);
    }
  }
</style>
