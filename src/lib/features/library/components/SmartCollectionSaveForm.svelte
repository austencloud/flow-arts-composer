<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { suggestSmartCollectionName } from "$lib/shared/browse/services/smart-collection-name";
  import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
  import SmartCollectionNameField from "./SmartCollectionNameField.svelte";
  import SmartCollectionRuleSummary from "./SmartCollectionRuleSummary.svelte";

  interface Props {
    spec: SmartFilterSpec;
    matchCount?: number | null;
    name?: string;
    suggestedName?: string;
    usingSuggestion?: boolean;
    saving?: boolean;
    autofocus?: boolean;
    inputId?: string;
    onSave: () => void;
  }

  let {
    spec,
    matchCount = null,
    name = $bindable(""),
    suggestedName,
    usingSuggestion = $bindable(name.trim().length === 0),
    saving = false,
    autofocus = false,
    inputId = "smart-collection-name",
    onSave,
  }: Props = $props();

  const resolvedSuggestedName = $derived(
    suggestedName ?? suggestSmartCollectionName(spec)
  );
</script>

<form
  data-save-shortcut-scope
  class="save-form"
  onsubmit={(event) => {
    event.preventDefault();
    onSave();
  }}
>
  <SmartCollectionRuleSummary {spec} {matchCount} draft />

  <SmartCollectionNameField
    {inputId}
    suggestedName={resolvedSuggestedName}
    bind:name
    bind:usingSuggestion
    {autofocus}
    onEnter={() => {
      if (!saving && spec.filters.length > 0) onSave();
    }}
  />

  <p class="save-note">
    {t("browse_audit_new_matches_join")}
  </p>

  <PanelButton
    type="submit"
    variant="primary"
    fullWidth
    saveShortcut
    disabled={saving || spec.filters.length === 0}
  >
    <i
      class={`fas ${saving ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"}`}
      aria-hidden="true"
    ></i>
    {saving
      ? t("browse_audit_saving_collection")
      : t("library_ui_save_smart_collection")}
  </PanelButton>
</form>

<style>
  .save-form {
    display: flex;
    width: min(560px, 100%);
    flex-direction: column;
    gap: 12px;
    padding: clamp(16px, 4cqi, 24px);
  }

  .save-note {
    margin: -2px 0 2px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.45;
  }
</style>
