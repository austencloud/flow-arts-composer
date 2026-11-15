<!--
  FuseLinkedRuleRow — the Linked rule as one summary row on a phone.

  The open rule panel (FuseLinkedRulePanel) is too tall for a phone workspace:
  with it under the header the page scrolled and pushed the result below the
  fold. On the compact workspace the rule drills down instead (see
  .claude/rules/no-page-scroll.md): this row states the current rule and opens
  the existing rule editor, FuseRelationshipComposer behind the recipe panel's
  `pairing` destination, as its own screen.

  Composes PanelButton; the wording is the recipe summary's pairing text plus
  the Invert and Rewind operation names when they are on.
-->
<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import { buildFuseRecipeSummaries } from "../domain/fuse-recipe-summaries";

  let {
    onOpen,
  }: {
    onOpen: () => void;
  } = $props();

  const { state: fuseState } = getFuseContext();

  const disabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const pairing = $derived(
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
    }).pairing
  );
  const summary = $derived(
    [
      pairing,
      fuseState.rule.invert ? "Invert" : null,
      fuseState.rule.rewind ? "Rewind" : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );
</script>

<div class="linked-rule-row">
  <PanelButton
    variant="secondary"
    fullWidth={true}
    {disabled}
    ariaLabel="Change rule: {summary}"
    onclick={onOpen}
  >
    <span class="rule-summary">{summary}</span>
    <i class="fas fa-chevron-right rule-chevron" aria-hidden="true"></i>
  </PanelButton>
</div>

<style>
  /* One 36px line (layout law, Tap size). The summary is clipped to the line,
     so no rule can change the row's height or move the stage below it. */
  .linked-rule-row :global(.panel-btn) {
    justify-content: space-between;
    gap: 8px;
    height: var(--alt-touch-target, 36px);
    min-height: var(--alt-touch-target, 36px);
    padding: 0 12px;
  }

  .rule-summary {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rule-chevron {
    flex: 0 0 auto;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }
</style>
