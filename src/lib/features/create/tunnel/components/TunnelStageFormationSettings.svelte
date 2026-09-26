<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { flip } from "svelte/animate";
  import { growFade, flipDuration } from "$lib/shared/transitions/motion";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TunnelPresetBrowser from "$lib/shared/sequence-viewer/components/art-settings/TunnelPresetBrowser.svelte";
  import {
    FOLD_OPTIONS,
    imageCount,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { describeTunnelStageArm } from "$lib/shared/sequence-viewer/tunnel/tunnel-stage";
  import type { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import type { TunnelCreatorState } from "../state/tunnel-creator-state.svelte";

  let {
    creator,
    controller,
    dense,
  }: {
    creator: TunnelCreatorState;
    controller: TunnelViewController;
    dense: boolean;
  } = $props();

  const activePerformerSlots = $derived(
    creator.performerSlots.filter(
      (slot, index) =>
        slot.performer !== null &&
        !(index === 1 && creator.partnerIsFormationCopy)
    )
  );
  const performerOptions = $derived(
    activePerformerSlots.map((slot, index) => ({
      value: slot.id,
      label: slot.label,
      shortLabel: `P${index + 1}`,
      ariaLabel: slot.label,
    }))
  );
  const addTargetId = $derived(
    activePerformerSlots.some((slot) => slot.id === creator.selectedPerformerId)
      ? creator.selectedPerformerId
      : (activePerformerSlots[0]?.id ?? null)
  );
  const addTargetLabel = $derived(
    activePerformerSlots.find((slot) => slot.id === addTargetId)?.label ??
      "performer"
  );
  const foldOptions = $derived(
    FOLD_OPTIONS.map((fold) => ({
      value: String(fold),
      label: `${fold}`,
      ariaLabel: `${fold} position${fold === 1 ? "" : "s"} before reflections`,
      disabled:
        imageCount({ ...controller.config, fold }) <
        creator.renderedInstanceCount,
    }))
  );
  const mirrorCanToggle = $derived(
    imageCount({ ...controller.config, mirror: !controller.mirror }) >=
      creator.renderedInstanceCount
  );
  const flipCanToggle = $derived(
    imageCount({ ...controller.config, flip: !controller.flip }) >=
      creator.renderedInstanceCount
  );
</script>

<div class:dense class="stage-formation">
  <div class="stage-summary">
    <div>
      <strong>{creator.renderedInstanceCount} on stage</strong>
      <span>
        {controller.formationSlotCount} available {controller.formationSlotCount ===
        1
          ? "position"
          : "positions"}
      </span>
    </div>
    <span class="summary-rule"
      >{t("create_ui_every_authored_performer_stays_represented")}</span
    >
  </div>

  <TunnelPresetBrowser
    {controller}
    {dense}
    minimumInstances={creator.renderedInstanceCount}
    showCustomCard={false}
    showCustomizeButton={false}
    presetLabel="Choose a stage arrangement"
    selectionMode="config"
    formationOnly={true}
    showUserPresets={false}
  />

  <section class="frame-controls" aria-labelledby="position-frame-heading">
    <div class="section-heading">
      <strong id="position-frame-heading"
        >{t("create_ui_position_frame")}</strong
      >
      <span>{t("create_ui_capacity_not_performer_count")}</span>
    </div>
    <div class="frame-row">
      <span class="row-label">Positions</span>
      <div class="frame-segments">
        <SegmentedControl
          options={foldOptions}
          value={String(controller.fold)}
          onchange={(value) => controller.setFold(Number(value))}
          color="accent"
          size="sm"
          semantics="radiogroup"
          ariaLabel="Stage position frame"
        />
      </div>
    </div>
    <div class="reflection-row">
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        size="sm"
        label="Mirror positions"
        icon="fas fa-arrows-left-right"
        active={controller.mirror}
        disabled={!mirrorCanToggle}
        onclick={() => controller.setMirror(!controller.mirror)}
      />
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        size="sm"
        label="Flip positions"
        icon="fas fa-arrows-up-down"
        active={controller.flip}
        disabled={!flipCanToggle}
        onclick={() => controller.setFlip(!controller.flip)}
      />
    </div>
  </section>

  <section class="appearance-section" aria-labelledby="appearances-heading">
    <div class="section-heading">
      <strong id="appearances-heading"
        >{t("create_ui_stage_appearances")}</strong
      >
      <span>{t("create_ui_who_occupies_each_visible_position")}</span>
    </div>

    <div class="appearance-list">
      {#each creator.stageInstances as instance, index (instance.id)}
        <div
          class="appearance-row"
          animate:flip={{ duration: flipDuration() }}
          in:growFade
          out:growFade
        >
          <div class="appearance-identity">
            <strong>Stage {index + 1}</strong>
            <span
              >{describeTunnelStageArm(controller.config, instance.arm)}</span
            >
          </div>
          <div class="assignment-control">
            <SegmentedControl
              options={performerOptions}
              value={instance.performerId}
              onchange={(performerId) =>
                creator.setStageInstancePerformer(instance.id, performerId)}
              color="accent"
              size="sm"
              density="tight"
              semantics="radiogroup"
              ariaLabel={`Performer assigned to stage ${index + 1}`}
            />
          </div>
          <button
            class="remove-appearance"
            type="button"
            disabled={!creator.canRemoveStageInstance(instance.id)}
            aria-label={`Remove stage ${index + 1}`}
            title={creator.canRemoveStageInstance(instance.id)
              ? `Remove stage ${index + 1}`
              : "An authored performer must remain on stage"}
            onclick={() => creator.removeStageInstance(instance.id)}
          >
            <i class="fas fa-minus" aria-hidden="true"></i>
          </button>
        </div>
      {/each}
    </div>

    <PanelButton
      variant="secondary"
      fullWidth
      disabled={!creator.canAddStageInstance || !addTargetId}
      ariaLabel={`Add another stage appearance for ${addTargetLabel}`}
      onclick={() => {
        if (addTargetId) creator.addStageInstance(addTargetId);
      }}
    >
      <i class="fas fa-person-circle-plus" aria-hidden="true"></i>
      Add {addTargetLabel} appearance
    </PanelButton>
    {#if !creator.canAddStageInstance}
      <p class="capacity-hint">
        Choose an arrangement with more positions to add another appearance.
      </p>
    {/if}
  </section>
</div>

<style>
  .stage-formation {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }

  .stage-summary,
  .frame-controls,
  .appearance-section {
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-md, 14px);
    background: color-mix(in srgb, var(--theme-card-bg) 74%, transparent);
  }

  .stage-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
  }

  .stage-summary > div,
  .appearance-identity,
  .section-heading {
    display: grid;
    gap: 2px;
  }

  .stage-summary strong,
  .section-heading strong,
  .appearance-identity strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
  }

  .stage-summary span,
  .section-heading span,
  .appearance-identity span,
  .capacity-hint {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .summary-rule {
    max-width: 12rem;
    text-align: right;
  }

  .frame-controls,
  .appearance-section {
    display: grid;
    gap: 10px;
    padding: 12px;
  }

  .frame-row,
  .reflection-row,
  .appearance-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-label {
    flex: 0 0 58px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .frame-segments,
  .assignment-control {
    flex: 1;
    min-width: 0;
  }

  .reflection-row {
    flex-wrap: wrap;
  }

  .appearance-list {
    display: grid;
    gap: 6px;
  }

  .appearance-row {
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 6px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-sm, 10px);
    background: var(--theme-surface-2, rgb(255 255 255 / 0.025));
  }

  .appearance-identity {
    flex: 0 0 104px;
    min-width: 0;
  }

  .appearance-identity span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove-appearance {
    display: inline-grid;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-sm, 10px);
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .remove-appearance:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .remove-appearance:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .remove-appearance:disabled {
    opacity: 0.28;
    cursor: not-allowed;
  }

  .capacity-hint {
    margin: -3px 2px 0;
    text-align: center;
  }

  .stage-formation.dense {
    gap: 8px;
    padding: 2px 2px 6px;
  }

  .dense .stage-summary,
  .dense .frame-controls,
  .dense .appearance-section {
    padding: 8px;
  }

  .dense .summary-rule,
  .dense .appearance-identity span {
    display: none;
  }

  @media (max-width: 460px) {
    .stage-summary {
      align-items: flex-start;
    }

    .summary-rule {
      max-width: 9rem;
    }

    .appearance-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .appearance-identity {
      grid-column: 1;
      flex-basis: auto;
    }

    .assignment-control {
      grid-column: 1;
    }

    .remove-appearance {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
  }
</style>
