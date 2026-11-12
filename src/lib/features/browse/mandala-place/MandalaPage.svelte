<!--
  MandalaPage: one mandala and every sequence that draws it.

  A fixed frame: the head row (back to the wall, then Simpler and Busier along
  the climb), the hero, and the list. Only the list pans. On desktop and the
  Fold's inner screen the hero sits beside the list; on a phone it sits above.

  The hero is the family's representative in the text colour. Choosing a row
  redraws it as that sequence's own mandala in its hand colours, through the
  shared Crossfade; with a mouse, moving onto a row previews it without
  choosing. A pointer resting where the list appears does not: previews arm
  only once the pointer has moved after the page opened, so the neutral
  picture is always seen first.

  Searching narrows the list to the matching rows and the heading says how
  many of the mandala's sequences match. On wide screens Simpler and Busier
  sit under the picture they change, and the picture and list are centred as
  one pair. Under the hero one slot of fixed height holds the hint line or,
  once a row is chosen, the "Open sequence" button, so nothing moves.

  Spec: docs/superpowers/specs/2026-11-11-mandala-wall-design.md.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import DifficultyBadge from "#lib/shared/components/DifficultyBadge.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import type { MandalaClimbFamily } from "#lib/shared/browse/services/mandala-climb.svelte.js";
  import type { MandalaGroup } from "#lib/shared/browse/services/mandala-index.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { tryGetBrowseQueryContext } from "#lib/shared/browse/state/browse-query-state.svelte.js";
  import { mandalaRows } from "./mandala-rows";
  import { familySequences, searchMatches } from "./mandala-search";

  interface Props {
    /** Null while families are built: placeholders hold the page's shape. */
    family: MandalaClimbFamily | null;
    /** The neighbours along the climb; null at an end. */
    simpler: MandalaClimbFamily | null;
    busier: MandalaClimbFamily | null;
    sequenceId: string | null;
    onBack: () => void;
    onStep: (family: MandalaClimbFamily) => void;
    onChoose: (sequenceId: string | null) => void;
    onOpen: (sequence: SequenceData) => void;
    /** True once families are final for the complete pool. Until then the
     *  list keeps its placeholders, so its count and rows never change after
     *  they first show; the hero still draws as soon as it has paths. */
    settled?: boolean;
  }

  let {
    family,
    simpler,
    busier,
    sequenceId,
    onBack,
    onStep,
    onChoose,
    onOpen,
    settled = true,
  }: Props = $props();

  /** The list shows rows only once the family is final. */
  const listReady = $derived(family !== null && settled);

  /** Placeholder rows while the family is built. */
  const PLACEHOLDER_ROWS = 6;
  /** The hero is drawn at one size and scaled by its box. */
  const HERO_PX = 320;

  // The words in Browse's one search bar, matched the way the grid matches them.
  const browseQuery = tryGetBrowseQueryContext();
  const allRows = $derived(family ? mandalaRows(familySequences(family)) : []);
  const matches = $derived(
    family ? searchMatches(familySequences(family), browseQuery?.search ?? "") : null
  );
  /** The rows on show: every one, or the ones the search finds. */
  const rows = $derived(
    matches ? allRows.filter((row) => matches.has(row.sequence.id)) : allRows
  );
  // The chosen row keeps the picture and Open even when a search hides it.
  const chosen = $derived(
    sequenceId ? (allRows.find((row) => row.sequence.id === sequenceId) ?? null) : null
  );
  let previewId = $state<string | null>(null);
  // A preview from a row that is gone (stepping along the climb) is dropped.
  const shownId = $derived(
    previewId && rows.some((row) => row.sequence.id === previewId)
      ? previewId
      : (chosen?.sequence.id ?? null)
  );

  function groupOf(id: string | null): MandalaGroup | null {
    if (!family || !id) return null;
    return (
      family.members.find((member) => member.sequences.some((s) => s.id === id)) ?? null
    );
  }

  /** What the hero draws: a sequence's own mandala, or the family's. */
  const hero = $derived.by(() => {
    if (!family) return null;
    const group = groupOf(shownId);
    return group
      ? { key: `seq:${shownId}`, group, tone: "hands" as const }
      : { key: `family:${family.id}`, group: family.representative, tone: "ink" as const };
  });

  const countLine = $derived(
    matches
      ? rows.length === 0
        ? t("browse_mandala_no_match")
        : t("browse_mandala_match_count", { shown: rows.length, total: allRows.length })
      : allRows.length === 1
        ? t("browse_mandala_draw_one")
        : t("browse_mandala_draw_many", { count: allRows.length })
  );

  function choose(id: string): void {
    onChoose(id === sequenceId ? null : id);
  }

  // Previews arm on the first real move of the mouse after the page opens.
  // A browser re-sends hover to a pointer that rests while the list appears
  // under it, so the first position seen is only the start; the pointer has
  // to travel a few pixels from it.
  const ARM_DISTANCE_PX = 3;
  let armed = false;
  let restAt: { x: number; y: number } | null = null;
  function watchPointer(event: PointerEvent): void {
    if (armed || event.pointerType !== "mouse") return;
    if (!restAt) {
      restAt = { x: event.clientX, y: event.clientY };
      return;
    }
    armed =
      Math.hypot(event.clientX - restAt.x, event.clientY - restAt.y) >= ARM_DISTANCE_PX;
  }

  function preview(event: PointerEvent, id: string | null): void {
    if (event.pointerType !== "mouse") return;
    watchPointer(event);
    if (!armed) return;
    if (previewId !== id) previewId = id;
  }
</script>

<svelte:window onpointermove={watchPointer} />

{#snippet step(which: "simpler" | "busier")}
  {@const target = which === "simpler" ? simpler : busier}
  {@const label = t(which === "simpler" ? "browse_mandala_simpler" : "browse_mandala_busier")}
  {@const icon = which === "simpler" ? "fa-chevron-left" : "fa-chevron-right"}
  {#if target}
    <button
      class="place-box step-{which}"
      type="button"
      onclick={() => onStep(target)}
    >
      {#if which === "simpler"}<i class="fas {icon}" aria-hidden="true"></i>{/if}
      <span>{label}</span>
      {#if which === "busier"}<i class="fas {icon}" aria-hidden="true"></i>{/if}
    </button>
  {:else}
    <!-- The end with nowhere to go keeps its room, so the other box stays put. -->
    <span class="step-ghost step-{which}" aria-hidden="true">
      {#if which === "simpler"}<i class="fas {icon}"></i>{/if}
      <span>{label}</span>
      {#if which === "busier"}<i class="fas {icon}"></i>{/if}
    </span>
  {/if}
{/snippet}

<div class="mandala-page">
  <header class="page-head">
    <button class="place-box back" type="button" onclick={onBack}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span>{t("browse_mandala_all")}</span>
    </button>
    <!-- Phones and the Fold: the steps along the climb sit in the head row. -->
    <div class="steps head-steps">
      {@render step("simpler")}
      {@render step("busier")}
    </div>
  </header>

  <div class="page-body">
    <section class="hero-side">
      <div class="hero-area">
        <div class="hero-square">
          {#if hero}
            <Crossfade key={hero.key} duration={DURATION.normal} fill>
              <span class="hero-still" class:ink={hero.tone === "ink"}>
                <MandalaStill
                  key={hero.group.key}
                  paths={hero.group.paths}
                  size={HERO_PX}
                  tone={hero.tone}
                />
              </span>
            </Crossfade>
          {:else}
            <ShimmerBlock height="100%" borderRadius="0" />
          {/if}
        </div>
      </div>
      <!-- Wide screens: Simpler and Busier flank the slot under the picture
           they change. -->
      <div class="hero-foot">
        <div class="foot-step">{@render step("simpler")}</div>
        <div class="hero-slot">
          <Crossfade key={chosen ? "open" : "hint"} duration={DURATION.fast} fill>
            {#if chosen}
              <PanelButton
                variant="primary"
                fullWidth
                onclick={() => chosen && onOpen(chosen.sequence)}
              >
                {t("browse_mandala_open_sequence")}
              </PanelButton>
            {:else}
              <p class="hint">{t("browse_mandala_pick_row_hint")}</p>
            {/if}
          </Crossfade>
        </div>
        <div class="foot-step">{@render step("busier")}</div>
      </div>
    </section>

    <section class="list-side" aria-busy={!listReady}>
      <h2 class="list-head" tabindex="-1">
        {#if listReady}{countLine}{:else}&nbsp;{/if}
      </h2>
      <div class="list" role="list">
        {#if listReady}
          {#each rows as row (row.sequence.id)}
            <div role="listitem">
              <button
                class="row"
                type="button"
                aria-pressed={row.sequence.id === sequenceId}
                onclick={() => choose(row.sequence.id)}
                onpointerenter={(event) => preview(event, row.sequence.id)}
                onpointermove={(event) => preview(event, row.sequence.id)}
                onpointerleave={(event) => preview(event, null)}
              >
                <DifficultyBadge level={row.level} size="28px" />
                <span class="row-word">{row.word}</span>
                {#if row.version !== null}
                  <span class="row-version">
                    {t("browse_mandala_version", { n: row.version })}
                  </span>
                {/if}
                <span class="row-length">{t("browse_n_steps", { count: row.length })}</span>
              </button>
            </div>
          {/each}
        {:else}
          {#each { length: PLACEHOLDER_ROWS } as _, i (i)}
            <span class="row placeholder" aria-hidden="true">
              <ShimmerBlock height="100%" borderRadius="0" />
            </span>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .mandala-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 0.75rem clamp(0.75rem, 2cqi, 1.5rem) 0.9rem;
    box-sizing: border-box;
    overflow: hidden;
    container-type: size;
    container-name: mandala-page;
  }

  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }
  .steps {
    display: flex;
    gap: 0.5rem;
  }

  .place-box,
  .step-ghost {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 0.9rem;
    border-radius: 12px;
    font-size: var(--font-size-sm);
    font-weight: 700;
    white-space: nowrap;
    box-sizing: border-box;
  }
  .place-box {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .place-box:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .place-box:focus-visible,
  .row:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  /* The end with nowhere to go keeps its room, so the other box stays put. */
  .step-ghost {
    visibility: hidden;
    border: 1px solid transparent;
  }
  .place-box i:dir(rtl),
  .step-ghost i:dir(rtl) {
    transform: scaleX(-1);
  }

  /* Phone: the hero above, the list panning under it. */
  .page-body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.75rem;
    min-height: 0;
  }
  .hero-side {
    display: grid;
    grid-template-rows: auto auto;
    gap: 0.5rem;
    justify-items: center;
    min-height: 0;
  }
  .hero-area {
    width: 100%;
    display: grid;
    place-items: center;
  }
  .hero-square {
    position: relative;
    width: min(100%, 42cqh);
    aspect-ratio: 1;
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }
  .hero-still {
    position: absolute;
    inset: 6%;
    display: block;
  }
  .hero-still.ink {
    color: var(--theme-text, #e8edf6);
  }
  /* Under the hero: the slot, and on wide screens the steps beside it. */
  .hero-foot {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .foot-step {
    display: none;
  }
  .hero-slot {
    position: relative;
    width: min(100%, 26rem);
    height: 48px;
    display: grid;
  }
  .hint {
    margin: 0;
    height: 100%;
    display: grid;
    place-items: center;
    text-align: center;
    font-size: var(--font-size-base);
    line-height: 1.25;
    color: color-mix(in srgb, var(--theme-text, #e8edf6) 80%, transparent);
  }

  .list-side {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.5rem;
    min-height: 0;
  }
  .list-head {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 800;
    color: var(--theme-text, #e8edf6);
  }
  .list-head:focus {
    outline: none;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 0;
    overflow-y: auto; /* scrolls: the sequences of one mandala, a long list in its own area */
    overscroll-behavior: contain;
    padding: 3px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 52px;
    padding: 0.45rem 0.85rem;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    text-align: start;
    font-size: var(--font-size-base);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .row:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .row[aria-pressed="true"] {
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 70%, transparent);
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 22%, transparent);
  }
  .row.placeholder {
    flex: 0 0 52px;
    padding: 0;
    overflow: hidden;
    cursor: default;
  }
  .row-word {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-version,
  .row-length {
    flex: 0 0 auto;
    font-size: var(--font-size-sm);
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }

  /* Desktop and the Fold's inner screen: the hero beside the list. */
  @container mandala-page (min-width: 560px) {
    .page-body {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1.15fr) minmax(16rem, 1fr);
      gap: clamp(1rem, 3cqi, 2.5rem);
    }
    .hero-side {
      grid-template-rows: minmax(0, 1fr) auto;
      container-type: size;
      container-name: hero-side;
    }
    .hero-area {
      height: 100%;
      min-height: 0;
      container-type: size;
    }
    .hero-square {
      width: min(100cqi, 100cqb);
    }
    .list-side {
      max-width: 40rem;
    }
  }

  /* Desktop and wider: Simpler and Busier sit beside the picture they change,
     the slot under it, and the picture and list are centred as one pair so
     no empty band opens on one side. The hero takes the height it is given;
     the list keeps a reading width. */
  @container mandala-page (min-width: 1000px) {
    .page-head,
    .page-body {
      --step-w: 9rem;
      --side-gap: 0.75rem;
      --pair-gap: clamp(1.5rem, 3cqi, 3rem);
      --hero: min(
        calc(100cqh - 2.9rem - 92px),
        calc(100cqi - 2 * var(--step-w) - 2 * var(--side-gap) - var(--pair-gap) - 23rem)
      );
      --pair: calc(var(--hero) + 2 * var(--step-w) + 2 * var(--side-gap))
        minmax(20rem, 44rem);
    }
    .page-head {
      display: grid;
      grid-template-columns: var(--pair);
      justify-content: center;
      column-gap: var(--pair-gap);
    }
    .page-head .back {
      justify-self: start;
    }
    .head-steps {
      display: none;
    }
    .page-body {
      grid-template-columns: var(--pair);
      justify-content: center;
      gap: var(--pair-gap);
    }
    .hero-side {
      grid-template-columns: var(--step-w) minmax(0, 1fr) var(--step-w);
      grid-template-rows: minmax(0, 1fr) auto;
      column-gap: var(--side-gap);
      row-gap: 0.5rem;
    }
    .hero-area {
      grid-column: 2;
      grid-row: 1;
    }
    .hero-foot {
      display: contents;
    }
    .foot-step {
      display: flex;
      grid-row: 1;
      align-self: center;
    }
    .foot-step:first-child {
      grid-column: 1;
      justify-content: flex-end;
    }
    .foot-step:last-child {
      grid-column: 3;
      justify-content: flex-start;
    }
    .foot-step .place-box,
    .foot-step .step-ghost {
      max-width: 100%;
    }
    .hero-slot {
      grid-column: 2;
      grid-row: 2;
      justify-self: center;
    }
    .list-side {
      max-width: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .place-box,
    .row {
      transition: none;
    }
  }
</style>
