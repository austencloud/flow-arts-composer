<script lang="ts">
  import PropViewingControl from "$lib/shared/browse/components/PropViewingControl.svelte";
  import SavePropDialog from "$lib/shared/library/components/SavePropDialog.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    resolveViewingProps,
    withSavedProps,
  } from "$lib/shared/foundation/services/prop-viewing";
  import type { AppSettings } from "$lib/shared/settings/domain/app-settings";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

  let preferences = $state<AppSettings>({
    gridMode: GridMode.DIAMOND,
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
  });
  let sequence = $state(
    withSavedProps(
      createSequenceData({
        id: "local-prop-review",
        name: "Practice sequence",
      }),
      {
        leftPropType: PropType.BUUGENG,
        rightPropType: PropType.BUUGENG,
        catDogMode: false,
      }
    )
  );
  let collectionPropType = $state<PropType | null>(null);
  const viewing = $derived(
    resolveViewingProps(preferences, sequence, collectionPropType)
  );
  let open = $state(false);
  let saveProps = $state(viewing.config);
  let status = $state("");
</script>

<svelte:head
  ><title>Prop viewing review</title><meta
    name="robots"
    content="noindex,nofollow"
  /></svelte:head
>
<main>
  <h1>Practice sequence</h1>
  <PropViewingControl
    {preferences}
    {sequence}
    {collectionPropType}
    onUpdate={(patch) => {
      preferences = { ...preferences, ...patch };
    }}
  />
  <div class="preview">
    <PropCompositionPreview propType={viewing.config.leftPropType} size={120} />
    <PropCompositionPreview
      propType={viewing.config.rightPropType}
      size={120}
    />
  </div>
  <div class="actions">
    <PanelButton
      onclick={() => {
        collectionPropType = collectionPropType ? null : PropType.FAN;
      }}
    >
      {collectionPropType ? "Leave fan collection" : "Open fan collection"}
    </PanelButton>
    <PanelButton
      onclick={() => {
        saveProps = { ...viewing.config };
        open = true;
      }}>Save to Library</PanelButton
    >
  </div>
  <p role="status">{status}</p>
</main>
{#if open}
  <SavePropDialog
    bind:value={saveProps}
    onCancel={() => {
      open = false;
      status = "Save cancelled";
    }}
    onSave={() => {
      sequence = withSavedProps(sequence, saveProps);
      open = false;
      status = "Saved locally for review";
    }}
  />
{/if}

<style>
  main {
    padding: 20px;
    color: var(--theme-text);
    max-width: 900px;
    margin: auto;
  }
  .preview {
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
