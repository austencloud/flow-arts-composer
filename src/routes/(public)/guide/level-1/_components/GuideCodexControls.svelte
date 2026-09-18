<script lang="ts">
  /**
   * Codex companion controls - rendered inside GuideCompanion when the reader's
   * active page is the Codex (spec: 2026-07-10-guide-codex-rebuild-design.md).
   * The Codex PAGE is the printable artifact (see GuideCodexPage.svelte); every
   * control that used to live in an on-page toolbar moves here. All knobs
   * read/write the shared guide-codex-state.svelte.ts singleton, which the page
   * renders from live.
   *
   * Chrome is the canonical app primitives, configured to match the rest of the
   * app (2026-07-11 redesign): the app-wide PropSelectionSheet drawer for prop
   * choice, text-only FilterChipBase toggles for layers, the PropControlPair
   * Blue/Red card pair for turns, and full-width labeled action chips for the
   * transforms - no bespoke icon rows, no cryptic icon-only segmented control.
   */
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PropControlPair from "$lib/features/create/shared/components/sequence-actions/PropControlPair.svelte";
  import PropTurnsControl from "$lib/features/create/shared/components/sequence-actions/PropTurnsControl.svelte";
  import PropSelectionSheet from "$lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { HandSide, RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { getGuideCodexState } from "../_data/guide-codex-state.svelte";
  import type { GuideCodexVisibility } from "../_data/guide-codex-persistence";

  const codex = getGuideCodexState();

  // Current prop's real button art + name, for the drawer trigger.
  const propInfo = $derived(getPropTypeDisplayInfo(codex.propType));

  let propDrawerOpen = $state(false);

  // Layer toggles - text only. The layer name IS the label; no decorative icon
  // (a flame doesn't explain "Glyph", an "A" doesn't explain "TKA").
  const VISIBILITY_CHIPS: { key: keyof GuideCodexVisibility; label: string }[] = [
    { key: "showGlyph", label: "Glyph" },
    { key: "showGrid", label: "Grid" },
    { key: "showTKA", label: "TKA" },
    { key: "showPlacements", label: "Placements" },
    { key: "showReversals", label: "Reversals" },
    { key: "showNonRadialPoints", label: "Non-Radial" },
  ];

  const TRANSFORMS: { op: "rotate" | "mirror" | "colorswap"; label: string; icon: string }[] = [
    { op: "rotate", label: "Rotate", icon: "fas fa-rotate-right" },
    { op: "mirror", label: "Mirror", icon: "fas fa-left-right" },
    { op: "colorswap", label: "Swap", icon: "fas fa-palette" },
  ];
</script>

<div class="codex-controls">
  <div class="group">
    <span class="group-label">Prop</span>
    <button
      type="button"
      class="prop-trigger"
      onclick={() => (propDrawerOpen = true)}
      aria-haspopup="dialog"
      aria-expanded={propDrawerOpen}
    >
      <img class="prop-art" src={propInfo.image} alt="" aria-hidden="true" />
      <span class="prop-name">{propInfo.label}</span>
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>
  </div>

  <div class="group">
    <span class="group-label">Show</span>
    <div class="chip-row">
      {#each VISIBILITY_CHIPS as chip (chip.key)}
        <FilterChipBase
          mode="toggle"
          size="sm"
          label={chip.label}
          active={codex.visibility[chip.key]}
          onclick={() => codex.toggleVisibility(chip.key)}
        />
      {/each}
    </div>
  </div>

  <div class="group">
    <span class="group-label">Turns</span>
    <PropControlPair compact>
      {#snippet leftContent()}
        <PropTurnsControl
          color="blue"
          turns={codex.leftTurns}
          rotationDirection={RotationDirection.NO_ROTATION}
          showRotation={false}
          compact={true}
          onTurnsChange={(delta) => codex.adjustTurns(HandSide.LEFT, delta)}
          onRotationChange={() => {}}
        />
      {/snippet}
      {#snippet rightContent()}
        <PropTurnsControl
          color="red"
          turns={codex.rightTurns}
          rotationDirection={RotationDirection.NO_ROTATION}
          showRotation={false}
          compact={true}
          onTurnsChange={(delta) => codex.adjustTurns(HandSide.RIGHT, delta)}
          onRotationChange={() => {}}
        />
      {/snippet}
    </PropControlPair>
  </div>

  <div class="group">
    <div class="group-label-row">
      <span class="group-label">Transform</span>
      {#if codex.hasTransform}
        <FilterChipBase
          mode="action"
          size="sm"
          label="Reset"
          icon="fas fa-rotate-left"
          onclick={() => codex.resetTransform()}
        />
      {/if}
    </div>
    <div class="transform-row">
      {#each TRANSFORMS as tr (tr.op)}
        <FilterChipBase
          mode="action"
          label={tr.label}
          icon={tr.icon}
          onclick={() => codex.applyTransform(tr.op)}
        />
      {/each}
    </div>
  </div>
</div>

<PropSelectionSheet
  bind:isOpen={propDrawerOpen}
  selectedPropType={codex.propType}
  title="Choose a prop"
  onSelect={(pt: PropType) => codex.setPropType(pt)}
/>

<style>
  .codex-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-bottom: 0.65rem;
    margin-bottom: 0.15rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .group-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .group-label {
    font-size: var(--font-size-compact, 11px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  /* Prop trigger - a full-width settings row (art + name + chevron) that opens
     the app-wide PropSelectionSheet drawer, matching Create / Arena. */
  .prop-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background var(--duration-fast, 150ms) ease, border-color var(--duration-fast, 150ms) ease;
  }
  @media (hover: hover) and (pointer: fine) {
    .prop-trigger:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    }
  }
  .prop-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .prop-art {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .prop-name {
    flex: 1;
    text-align: left;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }
  .prop-trigger .fa-chevron-down {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Transform actions - three equal chips filling the row (no left-dumped
     icon buttons). */
  .transform-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .transform-row :global(.filter-chip) {
    width: 100%;
    justify-content: center;
  }
</style>
