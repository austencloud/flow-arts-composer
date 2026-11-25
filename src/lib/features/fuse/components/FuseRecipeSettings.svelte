<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GenerationSettingsOverlay from "#lib/features/create/generate/components/cards/GenerationSettingsOverlay.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import SettingsDrillPanel, {
    type SettingsDrillItem,
  } from "#lib/shared/ui/components/settings-drill/SettingsDrillPanel.svelte";
  import SettingsDrillRow from "#lib/shared/ui/components/settings-drill/SettingsDrillRow.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { MediaQuery } from "svelte/reactivity";
  import { getFuseContext } from "../context/fuse-context";
  import {
    FUSE_RECIPE_GROUPS,
    isFuseRecipeGroup,
    type FuseRecipeGroup,
    type FuseSettingsDestination,
  } from "../domain/fuse-recipe-destination";
  import {
    buildFuseRecipeFacts,
    FUSE_RECIPE_GROUP_LABELS,
  } from "../domain/fuse-recipe-summaries";
  import {
    resolveFuseRecipeForm,
    resolveFuseRecipeTabs,
    type FuseRecipeFormLayout,
  } from "../services/fuse-recipe-form-fit";
  import { fuseRecipePanel } from "../state/fuse-recipe-panel.svelte";
  import FuseRecipeForm from "./FuseRecipeForm.svelte";
  import FuseRelationshipComposer from "./FuseRelationshipComposer.svelte";

  let {
    destination = $bindable(null),
    onClose,
  }: {
    destination?: FuseSettingsDestination;
    onClose: () => void;
  } = $props();

  // Both of this panel's hosts animate the panel themselves: the desktop
  // column opens as a grid track, the compact host slides in as a sheet. So
  // the panel does not also scale itself in on top of that.
  const ENTRANCE = "none";

  const { state: fuseState } = getFuseContext();
  // Each hand has its own settings; the panel shows the hand it was opened
  // from. They feed only that hand's next Regenerate, which is what the title,
  // the note and the button at the foot all say. Linked rebuilds one hand from
  // the other, so only the leading hand has new paths to set up.
  const side = $derived(
    fuseState.mode === "symmetry"
      ? fuseState.previewDriverSide
      : fuseRecipePanel.side
  );
  const settingsTitle = $derived(
    t(
      side === "left"
        ? "fuse_settings_title_left"
        : "fuse_settings_title_right"
    )
  );
  const settingsClose = $derived(
    t(
      side === "left"
        ? "fuse_settings_close_left"
        : "fuse_settings_close_right"
    )
  );
  const regenerateLabel = $derived(
    t(
      side === "left"
        ? "fuse_settings_regenerate_left"
        : "fuse_settings_regenerate_right"
    )
  );
  const recipe = $derived(fuseState.recipeFor(side));
  const facts = $derived(
    buildFuseRecipeFacts({
      requestedLength: recipe.requestedLength,
      generationLevel: recipe.generationLevel,
      maxTurnIntensity: recipe.maxTurnIntensity,
      gridMode: recipe.gridMode,
      constraintPreset: recipe.constraintPreset,
      handPathMode: recipe.handPathMode,
      motionTypeFilter: recipe.motionTypeFilter,
      startLocation: recipe.startLocation,
      startOrientation: recipe.startOrientation,
      traversalDirection: recipe.traversalDirection,
    })
  );
  const drillItems: SettingsDrillItem[] = $derived(
    FUSE_RECIPE_GROUPS.map((group) => ({
      id: group,
      label: FUSE_RECIPE_GROUP_LABELS[group],
      value: "",
    }))
  );
  // The rule editor is never a group in the form (it is opened from the Linked
  // rule row), so it always opens on its own.
  const isRule = $derived(destination === "pairing");
  const regenerateDisabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );

  // Layout law, Tap size: a phone is a touch screen whose short side is under
  // 600px.
  const phoneQuery = new MediaQuery(
    "(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)"
  );
  const phone = $derived(phoneQuery.current);

  // Every setting on one screen where the panel is tall enough. Where it is
  // not, the three groups are tabs, and on a phone boxes that open one at a
  // time.
  let formWidth = $state(0);
  let formHeight = $state(0);
  const wholeForm = $derived(
    resolveFuseRecipeForm({
      width: formWidth,
      height: formHeight,
      groups: FUSE_RECIPE_GROUPS,
      phone,
    })
  );
  const tabs = $derived(
    wholeForm
      ? null
      : resolveFuseRecipeTabs({
          width: formWidth,
          height: formHeight,
          groups: FUSE_RECIPE_GROUPS,
          phone,
        })
  );
  const uid = $props.id();
  const tabOptions = $derived(
    FUSE_RECIPE_GROUPS.map((group) => ({
      value: group,
      label: FUSE_RECIPE_GROUP_LABELS[group],
      id: `${uid}-tab-${group}`,
      controls: `${uid}-panel`,
    }))
  );
  let groupWidth = $state(0);
  let groupHeight = $state(0);
  const DENSEST: FuseRecipeFormLayout = {
    arrangement: "beside",
    hints: false,
    headings: false,
    lengthAbove: false,
    sideBySide: false,
  };
  function groupLayout(group: FuseRecipeGroup): FuseRecipeFormLayout {
    return (
      resolveFuseRecipeForm({
        width: groupWidth,
        height: groupHeight,
        groups: [group],
        phone,
      }) ?? DENSEST
    );
  }

  const openGroup = $derived(
    destination !== null && isFuseRecipeGroup(destination) ? destination : null
  );
  const openTab = $derived(openGroup ?? FUSE_RECIPE_GROUPS[0]);
  function selectGroup(id: string | null): void {
    destination = id !== null && isFuseRecipeGroup(id) ? id : null;
  }

  function regenerate(): void {
    void fuseState.shuffle(side);
  }
</script>

<!-- The drawer and the column hold the same panel. -->
{#if isRule}
  <GenerationSettingsOverlay
    title={t("fuse_rule_name")}
    titleId="fuse-settings-title"
    closeLabel={t("fuse_settings_rule_close")}
    entrance={ENTRANCE}
    {onClose}
  >
    {#snippet children()}
      <!-- The pane's one scroller, with a form that owns its footer
           (`.drill-grow`) taking the remaining height so Cancel / Use this
           relationship land on the floor rather than a third of the way down
           an otherwise empty panel. -->
      <div class="solo-body themed-scrollbar">
        <FuseRelationshipComposer onCancel={onClose} onApply={onClose} />
      </div>
    {/snippet}
  </GenerationSettingsOverlay>
{:else}
  <GenerationSettingsOverlay
    title={settingsTitle}
    titleId="fuse-settings-title"
    closeLabel={settingsClose}
    entrance={ENTRANCE}
    {onClose}
  >
    {#snippet children()}
      <p class="for-new-paths">
        {t("fuse_settings_for_new_paths")}
      </p>
      <div
        class="form-area"
        bind:clientWidth={formWidth}
        bind:clientHeight={formHeight}
      >
        {#if formHeight > 0 && wholeForm}
          <FuseRecipeForm {recipe} layout={wholeForm} {phone} />
        {:else if formHeight > 0 && tabs}
          <SegmentedControl
            options={tabOptions}
            value={openTab}
            onchange={selectGroup}
            semantics="tabs"
            color="accent"
            ariaLabel={settingsTitle}
          />
          <div
            class="tab-panel"
            id="{uid}-panel"
            role="tabpanel"
            aria-labelledby="{uid}-tab-{openTab}"
          >
            <Crossfade key={openTab} duration={DURATION.fast} fill>
              <FuseRecipeForm
                {recipe}
                layout={tabs[openTab] ?? DENSEST}
                groups={[openTab]}
                {phone}
              />
            </Crossfade>
          </div>
        {:else if formHeight > 0}
          <SettingsDrillPanel
            items={drillItems}
            bind:selected={() => openGroup, selectGroup}
            compact={phone}
          >
            {#snippet listContent()}
              <div class="drill-fill group-boxes">
                {#each FUSE_RECIPE_GROUPS as group (group)}
                  <SettingsDrillRow
                    label={FUSE_RECIPE_GROUP_LABELS[group]}
                    facts={facts[group]}
                    onclick={() => selectGroup(group)}
                  />
                {/each}
              </div>
            {/snippet}
            {#snippet detail(id)}
              {#if isFuseRecipeGroup(id)}
                <div
                  class="drill-fill"
                  bind:clientWidth={groupWidth}
                  bind:clientHeight={groupHeight}
                >
                  <FuseRecipeForm
                    {recipe}
                    layout={groupLayout(id)}
                    groups={[id]}
                    {phone}
                  />
                </div>
              {/if}
            {/snippet}
          </SettingsDrillPanel>
        {/if}
      </div>
      <div class="regenerate-foot">
        <PanelButton
          variant="primary"
          fullWidth={true}
          accentColor={side === "left"
            ? "color-mix(in srgb, var(--prop-blue, #2196f3) 46%, var(--theme-card-bg, #161821))"
            : "color-mix(in srgb, var(--prop-red, #f44336) 46%, var(--theme-card-bg, #161821))"}
          disabled={regenerateDisabled}
          onclick={regenerate}
        >
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          {regenerateLabel}
        </PanelButton>
      </div>
    {/snippet}
  </GenerationSettingsOverlay>
{/if}

<style>
  .for-new-paths {
    flex: 0 0 auto;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    line-height: 20px;
  }

  /* A sideways phone: the title already says the settings are for new paths,
     and the rows need the line. */
  @media (max-height: 480px) {
    .for-new-paths {
      display: none;
    }
  }

  .form-area {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    margin-block: 4px;
  }

  .tab-panel {
    flex: 1 1 0;
    min-height: 0;
    margin-top: 8px;
  }

  /* The three boxes share the height, so a short list leaves no empty half. */
  .group-boxes {
    container: fuse-group-boxes / size;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-boxes > :global(.drill-row) {
    flex: 1 1 0;
  }

  .regenerate-foot {
    flex: 0 0 auto;
  }

  .regenerate-foot :global(.panel-btn) {
    min-height: var(--min-touch-target, 48px);
  }

  .solo-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.625rem;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .solo-body > :global(*) {
    flex: 0 0 auto;
  }

  .solo-body > :global(.drill-grow) {
    flex: 1 0 auto;
    max-width: 100%;
  }
</style>
