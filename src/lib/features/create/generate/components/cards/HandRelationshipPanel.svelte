<!--
HandRelationshipPanel.svelte - the Hand Relationship drill screen.

Five relationship rows (a radiogroup with roving focus, the same pattern as
PropBuildPicker) and two toggle rows beneath them. Each relationship row
carries its VTG timing and direction and the element glyph that pair reads
as, because the four relationships ARE the four timing and direction
quadrants (hand-relationship.ts, HAND_RELATIONSHIP_TND). Top-aligned: the
rows read as one list under the header, and the leftover pane height belongs
to the drill panel, not to gaps between them.
-->
<script lang="ts">
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { getElementImagePath } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    ELEMENT_ROW_LABELS,
    HAND_RELATIONSHIPS,
    HAND_RELATIONSHIP_HINTS,
    HAND_RELATIONSHIP_INVERTED_HINT,
    HAND_RELATIONSHIP_LABELS,
    HAND_RELATIONSHIP_TND,
    MATCH_HAND_TURNS_HINT,
    MATCH_HAND_TURNS_LABEL,
    MATCH_HAND_TURNS_LEVEL_HINT,
    TND_ROW_LABELS,
    handRelationshipElement,
    type HandRelationship,
  } from "$lib/shared/create/domain/hand-relationship";

  let {
    relationship,
    inverted,
    matchTurns = false,
    turnsAvailable = true,
    haptic = null,
    onRelationshipChange,
    onInvertedChange,
    onMatchTurnsChange = null,
  }: {
    relationship: HandRelationship;
    inverted: boolean;
    matchTurns?: boolean;
    /** False at level 1, where every turn is zero and matching is moot. */
    turnsAvailable?: boolean;
    haptic?: HapticFeedback | null;
    onRelationshipChange: (v: HandRelationship) => void;
    onInvertedChange: (v: boolean) => void;
    onMatchTurnsChange?: ((v: boolean) => void) | null;
  } = $props();

  const rows = HAND_RELATIONSHIPS.map((value) => {
    const element = handRelationshipElement(value);
    return {
      value,
      label: HAND_RELATIONSHIP_LABELS[value],
      hint: HAND_RELATIONSHIP_HINTS[value],
      tag: value === "free" ? null : TND_ROW_LABELS[HAND_RELATIONSHIP_TND[value]],
      elementLabel: element ? ELEMENT_ROW_LABELS[element] : null,
      image: element ? getElementImagePath(element) : null,
    };
  });

  function choose(value: HandRelationship) {
    haptic?.trigger("selection");
    onRelationshipChange(value);
  }

  // Arrow keys move the selection and the focus together, as a radiogroup
  // should. Mirrors PropBuildPicker's moveSelection.
  function moveSelection(event: KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = (index + 1) % rows.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index - 1 + rows.length) % rows.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = rows.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    choose(rows[next]!.value);
    const group = (event.currentTarget as HTMLElement).closest(
      '[role="radiogroup"]'
    );
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  function handleInverted() {
    haptic?.trigger("selection");
    onInvertedChange(!inverted);
  }

  function handleMatchTurns() {
    haptic?.trigger("selection");
    onMatchTurnsChange?.(!matchTurns);
  }
</script>

<div class="relationship-panel">
  <div class="rows" role="radiogroup" aria-label="Hand relationship">
    {#each rows as row, index (row.value)}
      <button
        type="button"
        class="row"
        class:selected={relationship === row.value}
        role="radio"
        aria-checked={relationship === row.value}
        tabindex={relationship === row.value ? 0 : -1}
        onclick={() => choose(row.value)}
        onkeydown={(event) => moveSelection(event, index)}
      >
        <span class="glyph" aria-hidden="true">
          {#if row.image}
            <img src={row.image} alt="" draggable="false" />
          {:else}
            <span class="glyph-free"></span>
          {/if}
        </span>
        <span class="text">
          <span class="title-line">
            <span class="title">{row.label}</span>
            {#if row.tag}
              <span class="tag"
                >{row.tag}<span class="tag-element"
                  >&nbsp;· {row.elementLabel}</span
                ></span
              >
            {/if}
          </span>
          <span class="hint">{row.hint}</span>
        </span>
        <span class="check" aria-hidden="true"></span>
      </button>
    {/each}
  </div>

  <div class="toggles">
    <div class="toggle-row">
      <FilterChipBase
        label="Inverted"
        mode="toggle"
        emphasis="solid"
        active={inverted}
        disabled={relationship === "free"}
        onclick={handleInverted}
      />
      <span class="toggle-hint">{HAND_RELATIONSHIP_INVERTED_HINT}</span>
    </div>
    {#if onMatchTurnsChange}
      <div class="toggle-row">
        <FilterChipBase
          label={MATCH_HAND_TURNS_LABEL}
          mode="toggle"
          emphasis="solid"
          active={matchTurns}
          disabled={!turnsAvailable}
          onclick={handleMatchTurns}
        />
        <span class="toggle-hint"
          >{turnsAvailable
            ? MATCH_HAND_TURNS_HINT
            : MATCH_HAND_TURNS_LEVEL_HINT}</span
        >
      </div>
    {/if}
  </div>
</div>

<style>
  .relationship-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    min-width: 0;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Same surface as the drill rows above this screen, so the list reads as a
     continuation of the settings it came from, with the accent stroke doing
     the "selected" work instead of a filled pill. */
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.75rem;
    color: white;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-normal, 200ms) ease,
      border-color var(--duration-normal, 200ms) ease;
  }

  .row:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .row.selected {
    border-color: var(--customize-accent, var(--theme-accent, #8b6cff));
    background: color-mix(
      in srgb,
      var(--customize-accent, var(--theme-accent, #8b6cff)) 14%,
      transparent
    );
  }

  .row:focus-visible {
    outline: 2px solid var(--customize-accent, var(--theme-accent, #8b6cff));
    outline-offset: 2px;
  }

  .glyph {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .glyph img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  /* Free has no element. An empty ring keeps the titles aligned and says
     "nothing imposed" without inventing a seventh glyph. */
  .glyph-free {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px dashed rgba(255, 255, 255, 0.3);
  }

  .text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .title-line {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 10px;
  }

  .title {
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
  }

  .tag {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--customize-accent, var(--theme-accent, #8b6cff));
    white-space: nowrap;
  }

  .tag-element {
    color: rgba(255, 255, 255, 0.55);
    font-weight: 500;
  }

  .hint {
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Radio dot. Filled when selected; the border alone otherwise. */
  .check {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    transition: border-color var(--duration-normal, 200ms) ease;
  }

  .row.selected .check {
    border-width: 5px;
    border-color: var(--customize-accent, var(--theme-accent, #8b6cff));
  }

  .toggles {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 4px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .toggle-hint {
    flex: 1 1 200px;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.6);
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .check {
      transition: none;
    }
  }
</style>
