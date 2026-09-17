<script lang="ts">
  import GenerationSettingsOverlay from "$lib/features/create/generate/components/cards/GenerationSettingsOverlay.svelte";
  import SettingsDrillPanel, {
    type SettingsDrillItem,
  } from "$lib/shared/ui/components/settings-drill/SettingsDrillPanel.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import {
    isFuseRecipeDestination,
    type FuseSettingsDestination,
  } from "../domain/fuse-recipe-destination";
  import { buildFuseRecipeSummaries } from "../domain/fuse-recipe-summaries";
  import FuseRecipeSettingContent from "./FuseRecipeSettingContent.svelte";

  let {
    destination = $bindable(null),
    singleDestination = false,
    onClose,
  }: {
    destination?: FuseSettingsDestination;
    /**
     * The recipe rail is showing, so this panel is here for the one setting it
     * was opened on. Listing the other five would restate the cards above it —
     * and a Back button leading to that list is the same redundancy one press
     * away.
     */
    singleDestination?: boolean;
    onClose: () => void;
  } = $props();

  // Titles for the solo panel, which is only ever reached by pressing one of the
  // rail's cards. They name the card that opened them — `pairing` reads "Rule"
  // because the Rule card is its only door there, and a panel that renames
  // itself on the way in makes the press feel like it went somewhere else.
  const DESTINATION_LABELS: Record<string, string> = {
    length: "Length",
    level: "Level",
    grid: "Grid",
    style: "Style",
    starting: "Starting conditions",
    pairing: "Rule",
  };

  // Both of this panel's hosts animate the panel themselves — the desktop
  // column opens as a grid track, the compact host slides in as a sheet — so
  // the panel does not also scale itself in on top of that.
  const ENTRANCE = "none";

  const { state: fuseState } = getFuseContext();
  const summaries = $derived(
    buildFuseRecipeSummaries({
      requestedLength: fuseState.requestedLength,
      generationLevel: fuseState.generationLevel,
      maxTurnIntensity: fuseState.maxTurnIntensity,
      gridMode: fuseState.gridMode,
      constraintPreset: fuseState.constraintPreset,
      handPathMode: fuseState.handPathMode,
      motionTypeFilter: fuseState.motionTypeFilter,
      startLocation: fuseState.startLocation,
      startOrientation: fuseState.startOrientation,
      traversalDirection: fuseState.traversalDirection,
      mode: fuseState.mode,
      driverSide: fuseState.driverSide,
      rule: fuseState.rule,
    })
  );
  // Pairing is listed only when there is a pairing: separate paths have no rule,
  // and the header switch is what links them. Listing it anyway is how the
  // recipe used to open on an editor with nothing in it.
  const drillItems = $derived<SettingsDrillItem[]>([
    { id: "length", label: "Length", value: summaries.length },
    { id: "level", label: "Level", value: summaries.level },
    { id: "grid", label: "Grid", value: summaries.grid },
    { id: "style", label: "Style", value: summaries.style },
    { id: "starting", label: "Starting conditions", value: summaries.starting },
    ...(fuseState.mode === "symmetry"
      ? [{ id: "pairing", label: "Pairing", value: summaries.pairing }]
      : []),
  ]);
  const solo = $derived(
    singleDestination &&
      destination !== null &&
      isFuseRecipeDestination(destination)
  );

  function selectDestination(id: string | null): void {
    destination = id !== null && isFuseRecipeDestination(id) ? id : null;
  }
</script>

<!-- The six focused recipe editors, identical whether they arrive as a drawer
     over the workspace or as the workspace's own left column. -->
{#if solo && destination}
  <GenerationSettingsOverlay
    title={DESTINATION_LABELS[destination] ?? "Fuse recipe"}
    titleId="fuse-settings-title"
    closeLabel="Close {DESTINATION_LABELS[destination] ??
      'Fuse recipe'} settings"
    entrance={ENTRANCE}
    {onClose}
  >
    {#snippet children()}
      <!-- The same body the drill panel gives a detail: the pane's one
           scroller, with a form that owns its footer (`.drill-grow`) taking the
           remaining height so Cancel / Use this relationship land on the floor
           rather than a third of the way down an otherwise empty panel. -->
      <div class="solo-body themed-scrollbar">
        <FuseRecipeSettingContent
          {destination}
          presentation="drawer"
          onCancel={onClose}
          onApply={onClose}
        />
      </div>
    {/snippet}
  </GenerationSettingsOverlay>
{:else}
  <GenerationSettingsOverlay
    title="Fuse recipe"
    titleId="fuse-settings-title"
    closeLabel="Close Fuse recipe settings"
    entrance={ENTRANCE}
    {onClose}
  >
    {#snippet children()}
      <SettingsDrillPanel
        items={drillItems}
        bind:selected={destination}
        onSelect={selectDestination}
      >
        {#snippet detail(id)}
          {#if isFuseRecipeDestination(id)}
            <FuseRecipeSettingContent
              destination={id}
              presentation="drawer"
              onCancel={() => (destination = null)}
              onApply={onClose}
            />
          {/if}
        {/snippet}
      </SettingsDrillPanel>
    {/snippet}
  </GenerationSettingsOverlay>
{/if}

<style>
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
