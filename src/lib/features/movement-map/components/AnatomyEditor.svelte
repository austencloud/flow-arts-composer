<!--
  The editor for one instant.

  It renders itself from the vocabulary rather than hardcoding fields, so a term
  added to `anatomy-vocabulary.ts` appears here with no change to this file.

  Every dimension is "at most one value, and clicking the chosen value clears
  it". That is a toggle row, not a segmented control - a segmented control has
  nowhere to put its indicator when nothing is chosen, which is the routing rule
  in `.claude/rules/chip-primitives.md`. Nothing being chosen is the common case
  here: an observer records what is notable and leaves the rest genuinely blank.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    BODY_DIMENSIONS,
    HAND_DIMENSIONS,
    type AnatomyDimension,
  } from "../domain/anatomy-vocabulary";
  import { getMovementMapContext } from "../context/movement-map-context";

  const { state: movementMap } = getMovementMapContext();

  type Scope = "left" | "right" | "body";
  let scope = $state<Scope>("left");

  const dimensionsFor = (value: Scope): readonly AnatomyDimension[] =>
    value === "body" ? BODY_DIMENSIONS : HAND_DIMENSIONS;

  const countFor = (value: Scope): number =>
    Object.keys(movementMap.draft[value]).length;

  const scopeOptions = $derived([
    {
      value: "left" as Scope,
      label: "Left hand",
      shortLabel: "Left",
      count: countFor("left") || null,
      tone: "blue" as const,
    },
    {
      value: "right" as Scope,
      label: "Right hand",
      shortLabel: "Right",
      count: countFor("right") || null,
      tone: "red" as const,
    },
    {
      value: "body" as Scope,
      label: "Body",
      count: countFor("body") || null,
    },
  ]);

  const activeDimensions = $derived(dimensionsFor(scope));

  function toggle(dimensionId: string, valueId: string): void {
    const current = movementMap.draft[scope][dimensionId];
    movementMap.setReading(scope, dimensionId, current === valueId ? null : valueId);
  }
</script>

<div class="editor">
  <SegmentedControl
    options={scopeOptions}
    value={scope}
    onchange={(next: Scope) => (scope = next)}
    size="sm"
    density="tight"
    ariaLabel="What this observation describes"
  />

  <div class="dimensions" role="group" aria-label="Anatomy readings">
    {#each activeDimensions as dimension (dimension.id)}
      {@const selected = movementMap.draft[scope][dimension.id]}
      <section class="dimension">
        <div class="dimension-head">
          <h4 id={`dim-${scope}-${dimension.id}`}>{dimension.label}</h4>
          <p>{dimension.help}</p>
        </div>
        <div
          class="values"
          role="group"
          aria-labelledby={`dim-${scope}-${dimension.id}`}
        >
          {#each dimension.values as value (value.id)}
            <FilterChipBase
              label={value.label}
              ariaLabel={value.help
                ? `${value.label}. ${value.help}`
                : value.label}
              active={selected === value.id}
              mode="toggle"
              size="sm"
              emphasis="solid"
              chipColor={scope === "left"
                ? "var(--semantic-blue, #3b82f6)"
                : scope === "right"
                  ? "var(--semantic-red, #ef4444)"
                  : undefined}
              onclick={() => toggle(dimension.id, value.id)}
            />
          {/each}
        </div>
      </section>
    {/each}

    <section class="dimension notes">
      <div class="dimension-head">
        <h4 id="dim-notes">In your words</h4>
        <p>
          Anything the list above cannot say. Phrases that keep recurring here
          are what the vocabulary is missing.
        </p>
      </div>
      <textarea
        id="movement-notes"
        aria-labelledby="dim-notes"
        rows="3"
        placeholder="The thumb end passes behind the head as the elbow drops&hellip;"
        value={movementMap.draft.notes}
        oninput={(event) =>
          movementMap.setNotes((event.currentTarget as HTMLTextAreaElement).value)}
      ></textarea>
    </section>
  </div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    flex: 1;
  }

  .dimensions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    min-height: 0;
    flex: 1;
    padding-right: 0.25rem;
  }

  .dimension {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .dimension-head h4 {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    color: var(--theme-text, #fff);
  }

  .dimension-head p {
    margin: 0.15rem 0 0;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .values {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .notes textarea {
    width: 100%;
    resize: vertical;
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  .notes textarea:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 1px;
  }

  /* On a short window the rail scrolls as one column (see AnnotateView), so
     this must not also try to own a scroll region - nesting the two is what
     squeezed the palette down to a few unusable pixels. */
  @media (max-height: 34rem), (max-width: 56.25rem) {
    .dimensions {
      overflow: visible;
      flex: none;
    }
  }
</style>
