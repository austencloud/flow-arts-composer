<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type { TnDElement } from "$lib/features/choreo-card/domain/tnd-element";
  import type { PropRelationship } from "../domain/prop-relationship";
  import {
    MODE_SHORT_WORDS,
    type VtgMode,
  } from "../services/shape-matrix-realizations";
  import RelationshipChoiceChip from "./RelationshipChoiceChip.svelte";

  /**
   * Everything this bridge reads, and nothing else.
   *
   * A drill realization satisfies it structurally, so that call site is
   * unchanged. The narrowing is what lets the Theory surface show the same
   * hands-to-props reading: a spin ratio has no realized sequence, and asking
   * for one would have forced a second copy of this component rather than a
   * second caller of it.
   */
  export interface RelationshipBridgeEntry {
    mode: VtgMode;
    /** The prop relationship's own mode, when the props are in one. */
    propMode: VtgMode | null;
    element: TnDElement;
    propRelationship: PropRelationship;
  }

  interface PropResultDescription {
    key: string;
    label: string;
    detail: string;
    color: string;
    icon: string | null;
    mode: VtgMode | null;
  }

  let {
    realizations,
    selectedMode,
    selectedPropMode,
    activePropMode,
    disabled = false,
    building = false,
    ontarget,
  }: {
    realizations: RelationshipBridgeEntry[];
    selectedMode: VtgMode | null;
    selectedPropMode: VtgMode | null;
    activePropMode: VtgMode | null;
    disabled?: boolean;
    building?: boolean;
    ontarget: (mode: VtgMode) => void;
  } = $props();

  function elementName(raw: string): string {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function describe(
    realization: RelationshipBridgeEntry
  ): PropResultDescription {
    const relationship = realization.propRelationship;
    if (relationship.kind === "full") {
      return {
        key: relationship.element.familyId,
        label: elementName(relationship.element.element),
        detail: relationship.element.name,
        color: relationship.element.accentColor,
        icon: relationship.element.iconPath,
        mode: realization.propMode,
      };
    }
    if (relationship.kind === "direction-only") {
      return {
        key: `direction-${relationship.direction}`,
        label: "Not available",
        detail: "Mixed prop rates",
        color: "var(--theme-text-dim, rgb(255 255 255 / 0.62))",
        icon: null,
        mode: null,
      };
    }
    return {
      key: "float",
      label: "Float",
      detail: "No prop rotation",
      color: "color-mix(in srgb, var(--theme-text, #fff) 72%, transparent)",
      icon: null,
      mode: null,
    };
  }

  const selectedHand = $derived.by(() => {
    if (!selectedMode) return null;
    return (
      realizations.find((realization) => realization.mode === selectedMode)
        ?.element ?? null
    );
  });
  const choices = $derived.by<PropResultDescription[]>(() => {
    if (!selectedMode) return [];
    return realizations
      .filter((realization) => realization.mode === selectedMode)
      .map(describe);
  });
  const selectedChoice = $derived(
    choices.find(
      (choice) => choice.mode === (selectedPropMode ?? activePropMode)
    ) ??
      choices[0] ??
      null
  );
  const resultKey = $derived(
    disabled
      ? "empty"
      : choices.length > 1
        ? `choices:${selectedMode}`
        : (selectedChoice?.key ?? (building ? "building" : "unavailable"))
  );
</script>

<!-- One shared bridge replaces the former prop-result row and stage footer. -->
<div
  class="relationship-bridge"
  role="group"
  aria-label="Selected hand relationship and resulting prop relationship"
>
  <div
    class="bridge-side hand-side"
    style:--bridge-accent={selectedHand?.accentColor}
  >
    <span class="bridge-role">Hands</span>
    {#if selectedHand}
      <img src={selectedHand.iconPath} alt="" />
      <span class="bridge-copy">
        <strong>{elementName(selectedHand.element)}</strong>
        <small>{selectedHand.name}</small>
      </span>
    {:else}
      <span class="bridge-dot" aria-hidden="true"></span>
      <span class="bridge-copy">
        <strong>Pick a cell</strong>
        <small>Hand relationship</small>
      </span>
    {/if}
  </div>

  <i class="fas fa-arrow-right bridge-arrow" aria-hidden="true"></i>
  <span class="sr-only">produces</span>

  <div class="prop-result">
    <!-- Content-sized with an eased height, NOT `fill`. The branching variant
         is a label over two chips and is materially taller than the one-line
         result; filling a 3.5rem parent made its layers absolute and spilled
         them over the animation below. -->
    <Crossfade key={resultKey} animateHeight duration={DURATION.fast}>
      {#if disabled}
        <div class="bridge-side prop-side pending-result">
          <span class="bridge-role">Props</span>
          <span class="bridge-dot" aria-hidden="true"></span>
          <span class="bridge-copy">
            <strong>Result</strong>
            <small>Pick a cell</small>
          </span>
        </div>
      {:else if choices.length > 1}
        <div class="branching-result">
          <span class="branch-label">Props · choose phase</span>
          <div class="result-choices" aria-label="Exact prop phase choices">
            {#each choices as choice (choice.key)}
              {#if choice.mode}
                <RelationshipChoiceChip
                  accent={choice.color}
                  icon={choice.icon}
                  timing={MODE_SHORT_WORDS[choice.mode].timing}
                  direction={MODE_SHORT_WORDS[choice.mode].direction}
                  active={selectedChoice?.key === choice.key}
                  disabled={building}
                  ariaLabel={`Props: ${choice.detail} ${choice.label}`}
                  onpick={() => ontarget(choice.mode!)}
                />
              {/if}
            {/each}
          </div>
        </div>
      {:else if selectedChoice}
        <output
          class="bridge-side prop-side"
          style="--bridge-accent: {selectedChoice.color}"
          aria-label={`Props: ${selectedChoice.detail} ${selectedChoice.label}`}
        >
          <span class="bridge-role">Props</span>
          {#if selectedChoice.icon}
            <img src={selectedChoice.icon} alt="" />
          {:else}
            <span class="bridge-dot" aria-hidden="true"></span>
          {/if}
          <span class="bridge-copy">
            <strong>{selectedChoice.label}</strong>
            <small>{selectedChoice.detail}</small>
          </span>
        </output>
      {:else}
        <div class="bridge-side prop-side pending-result" aria-live="polite">
          <span class="bridge-role">Props</span>
          <span class="bridge-dot" aria-hidden="true"></span>
          <span class="bridge-copy">
            <strong>{building ? "Finding result…" : "Unavailable"}</strong>
            <small>Exact relationship</small>
          </span>
        </div>
      {/if}
    </Crossfade>
  </div>
</div>

<style>
  .relationship-bridge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: stretch;
    gap: 0.55rem;
    min-width: 0;
  }

  .bridge-side {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    min-width: 0;
    min-height: 3.5rem;
    padding: 0.4rem 0.7rem;
    border: 1px solid
      color-mix(
        in srgb,
        var(--bridge-accent, var(--theme-text)) 36%,
        transparent
      );
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--bridge-accent, var(--theme-text)) 8%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .bridge-side img {
    width: 1.55rem;
    height: 1.55rem;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .bridge-role,
  .branch-label {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .bridge-copy {
    display: grid;
    min-width: 0;
    line-height: 1.08;
    text-align: left;
  }

  .bridge-copy strong,
  .bridge-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bridge-copy strong {
    color: color-mix(
      in srgb,
      var(--bridge-accent, var(--theme-text)) 80%,
      white
    );
    font-size: var(--font-size-min, 0.875rem);
  }

  .bridge-copy small {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .bridge-dot {
    width: 0.8rem;
    height: 0.8rem;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--bridge-accent, var(--theme-text-dim, #999));
  }

  .bridge-arrow {
    align-self: center;
    color: var(--theme-accent, #f4b54c);
    font-size: 0.85rem;
  }

  .prop-result {
    display: grid;
    align-content: start;
    min-width: 0;
    min-height: 3.5rem;
  }

  .branching-result {
    display: grid;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
  }

  .branch-label {
    text-align: center;
  }

  .result-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
    width: 100%;
  }

  .result-choices :global(.relationship-choice) {
    min-height: 3.5rem;
    padding-block: 0.3rem;
  }

  .pending-result {
    --bridge-accent: var(--theme-text-dim, #999);
  }

  @container shape-matrix-drill (max-width: 30rem) {
    .relationship-bridge {
      grid-template-columns: minmax(0, 0.92fr) auto minmax(0, 1.08fr);
      gap: 0.3rem;
    }

    .bridge-side {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.35rem;
      padding-inline: 0.45rem;
    }

    .bridge-role {
      grid-column: 1 / -1;
      line-height: 1;
    }

    .bridge-copy small {
      display: none;
    }

    .result-choices {
      gap: 0.3rem;
    }

    .result-choices :global(.relationship-choice) {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding-inline: 0.25rem;
    }
  }

  @container shape-matrix-drill (min-width: 42rem) and (max-height: 24rem) {
    .bridge-side {
      min-height: 3.1rem;
      gap: 0.35rem;
      padding-inline: 0.45rem;
      padding-block: 0.25rem;
    }

    .prop-result,
    .result-choices :global(.relationship-choice) {
      min-height: 3.1rem;
    }

    /* A short, wide drill puts the bridge in a narrow column, where the glyph
       beside the text left the code about eighteen pixels and rendered it as
       "S...". Stacking gives the code and the element name the chip's whole
       width. */
    .result-choices :global(.relationship-choice) {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      padding-inline: 0.25rem;
    }

    /* The drill is wide, so the chip spells the relationship out by default.
       These two do not have the drill's width; they have a column of it. */
    .result-choices :global(.relationship-choice .code-wide) {
      display: none;
    }

    .result-choices :global(.relationship-choice .code-compact) {
      display: inline;
    }

    .bridge-copy small,
    .branch-label {
      display: none;
    }

    .bridge-role {
      font-size: 0;
    }

    .hand-side .bridge-role::after,
    .prop-side .bridge-role::after {
      font-size: var(--font-size-compact, 0.75rem);
    }

    .hand-side .bridge-role::after {
      content: "H";
    }

    .prop-side .bridge-role::after {
      content: "P";
    }
  }
</style>
