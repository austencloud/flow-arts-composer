<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    getSettings,
    updateSettings,
  } from "#lib/shared/application/state/app-state.svelte.js";
  import { resolveViewingProps } from "#lib/shared/foundation/services/prop-viewing.js";
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
  import { captureActivePropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import PropPairField from "#lib/shared/pictograph/prop/components/PropPairField.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  let {
    sequence = null,
    collectionPropType = null,
    preferences,
    presentation = "default",
    onUpdate = updateSettings,
  }: {
    presentation?: "default" | "toolbar" | "none";
    preferences?: import("#lib/shared/settings/domain/app-settings.js").AppSettings;
    onUpdate?: (
      patch: Partial<
        import("#lib/shared/settings/domain/app-settings.js").AppSettings
      >
    ) => void | Promise<void>;
    sequence?: SequenceData | null;
    collectionPropType?: PropType | null;
  } = $props();
  let open = $state(false);
  const settings = $derived(preferences ?? getSettings());
  const resolved = $derived(
    resolveViewingProps(settings, sequence, collectionPropType)
  );
  const label = $derived.by(() => {
    const { leftPropType, rightPropType } = resolved.config;
    const left = localizedPropName(leftPropType);
    return leftPropType === rightPropType
      ? left
      : `${left} / ${localizedPropName(rightPropType)}`;
  });
  const sourceLabel = $derived(
    resolved.source === "Collection"
      ? t("browse_audit_collection")
      : resolved.source === "Saved with sequence"
        ? t("browse_audit_saved_with_sequence")
        : t("browse_audit_my_props")
  );
  const mixedGallery = $derived(
    settings.propViewingMode === "as-saved" && !sequence && !collectionPropType
  );
  let ownProps = $state(captureActivePropConfig(getSettings()));
  const titleId = $props.id();

  export function show(): void {
    ownProps = captureActivePropConfig(settings);
    open = true;
  }
</script>

{#if presentation !== "none"}
  <div class="viewing-control" class:toolbar={presentation === "toolbar"}>
    <PanelButton
      variant="secondary"
      onclick={show}
      ariaLabel={t("browse_audit_viewing_props_value", {
        props: mixedGallery
          ? t("browse_audit_as_saved")
          : `${label}, ${sourceLabel}`,
      })}
      ariaExpanded={open}
    >
      <span class="prop-label"
        >{presentation === "default"
          ? t("browse_audit_viewing_prefix")
          : ""}{mixedGallery ? t("browse_audit_as_saved") : label}</span
      >
      {#if !mixedGallery && presentation === "default"}<span class="source"
          >· {sourceLabel}</span
        >{/if}
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </PanelButton>
  </div>
{/if}
<BaseModal bind:open size="fit" labelledBy={titleId}>
  {#snippet header()}<h2 id={titleId}>
      {t("browse_audit_viewing_props")}
    </h2>{/snippet}
  <div class="choices">
    {#if !mixedGallery}
      <p class="current-props">
        {label}<span class="source"> · {sourceLabel}</span>
      </p>
    {/if}
    <SegmentedControl
      options={[
        { value: "my-props", label: t("browse_audit_my_props") },
        { value: "as-saved", label: t("browse_audit_as_saved") },
      ]}
      value={settings.propViewingMode ?? "my-props"}
      onchange={(mode) => void onUpdate({ propViewingMode: mode })}
      semantics="radiogroup"
      ariaLabel={t("browse_audit_viewing_props")}
    />
    <p>
      {settings.propViewingMode === "as-saved"
        ? t("browse_audit_as_saved_help")
        : t("browse_audit_my_props_help")}
    </p>
    <PropPairField
      bind:value={ownProps}
      label={t("browse_audit_my_props")}
      showColors
    />
  </div>
  {#snippet footer()}
    <div class="actions">
      <PanelButton
        onclick={() => {
          void onUpdate({ ...ownProps });
          open = false;
        }}>{t("train_filter_done")}</PanelButton
      >
    </div>
  {/snippet}
</BaseModal>

<style>
  .viewing-control {
    padding: 6px 12px;
    flex: 0 0 auto;
  }
  .viewing-control.toolbar {
    padding: 0;
    width: 132px;
  }
  .toolbar :global(.panel-btn) {
    box-sizing: border-box;
    width: 100%;
    height: var(--min-touch-target, 44px);
    padding: 0 12px;
    justify-content: space-between;
  }
  .toolbar .prop-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .current-props {
    color: var(--theme-text);
    overflow-wrap: anywhere;
  }
  .source,
  p {
    color: var(--theme-text-dim);
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 0 20px;
  }
  p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    padding: 20px;
  }
  h2 {
    padding: 20px;
    margin: 0;
    font-size: var(--font-size-lg, 18px);
  }
</style>
