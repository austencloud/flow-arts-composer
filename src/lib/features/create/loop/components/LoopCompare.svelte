<!-- LoopCompare - the same steps as every kind of LOOP: each name beside the row
     it adds, so the rows can be compared down the column. A kind these steps
     can't make yet keeps its place and says what it needs. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import { COMPARED_GAP, comparedRow } from "../domain/loop-card-layout";
  import { loopFamily, loopFamilyIcon } from "../domain/loop-families";
  import { familyNameKey } from "../domain/loop-words";
  import LoopCardCell from "./LoopCardCell.svelte";

  const { state: loop } = getLoopBuilderContext();

  const longest = $derived(
    Math.max(1, ...loop.compared.map(({ made }) => made?.partLength ?? 1))
  );

  let width = $state(0);
  let rowHeight = $state(0);
  const fit = $derived(comparedRow({ width, height: rowHeight }, longest));
</script>

<section class="compare" aria-label={t("create_loop_compare_title")}>
  <div class="rows">
    {#each loop.compared as entry, index (entry.family)}
      {@const { family, made } = entry}
      {@const info = loopFamily(family)}
      <button
        type="button"
        class="row"
        style:--loop-ink={info.ink}
        onclick={() => loop.showLoop(entry)}
      >
        <span class="name">
          <i
            class="fas {loopFamilyIcon(family, made?.variant ?? null)}"
            aria-hidden="true"
          ></i>
          <b>{t(familyNameKey(family))}</b>
        </span>
        {#snippet cells()}
          {#if !made}
            <span class="needs">{t("create_loop_compare_needs")}</span>
          {:else if fit.size > 0}
            <span
              class="cells"
              style:grid-template-columns="repeat({fit.columns}, {fit.size}px)"
              style:gap="{COMPARED_GAP}px"
            >
              {#each made.sequence.steps.slice(made.partLength, made.partLength * 2) as step (step.id)}
                <span class="cell" style:height="{fit.size}px">
                  <LoopCardCell data={step} />
                </span>
              {/each}
            </span>
          {/if}
        {/snippet}
        {#if index === 0}
          <span
            class="measure"
            bind:clientWidth={width}
            bind:clientHeight={rowHeight}
          >
            {@render cells()}
          </span>
        {:else}
          <span class="measure">{@render cells()}</span>
        {/if}
      </button>
    {/each}
  </div>
</section>

<style>
  .compare {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .rows {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(6.25rem, max-content) minmax(0, 1fr);
    grid-auto-rows: minmax(0, 9rem);
    align-content: center;
    column-gap: 0.75rem;
    box-sizing: border-box;
    width: min(100%, max(34rem, 60cqh));
    min-height: 0;
    margin-inline: auto;
    padding: 0 0.75rem;
  }

  .row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    min-width: 0;
    min-height: 0;
    padding: 0.5rem 0;
    border: 0;
    border-top: 1px solid var(--theme-stroke);
    border-radius: 0;
    background: none;
    color: var(--theme-text);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .row:first-child {
    border-top-color: transparent;
  }

  .name {
    display: grid;
    grid-template-columns: 1.25rem auto;
    align-items: center;
    gap: 0 0.375rem;
  }

  .name i {
    color: var(--loop-ink);
    text-align: center;
  }

  .name b {
    font-size: var(--font-size-base, 16px);
    font-weight: 650;
    white-space: nowrap;
  }

  .measure {
    display: flex;
    align-items: center;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .needs {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }

  /* Steps read left to right in every language, Arabic included. */
  .cells {
    display: grid;
    direction: ltr;
  }

  .cell {
    display: block;
  }

  .row:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .row:hover {
      background: var(--theme-card-bg);
    }
  }
</style>
