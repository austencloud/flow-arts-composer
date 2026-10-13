<!--
  How much of Level 1 is described, and what to go after next.

  The gap list is the working end of this panel. Without it the effort drifts
  toward re-describing whatever the last video happened to contain; with it, the
  next session can pick a movement nobody has looked at and go shoot footage
  that contains it.
-->
<script lang="ts">
  import { describeSignature } from "../domain/movement-annotation";
  import { getMovementMapContext } from "../context/movement-map-context";

  const { state: movementMap } = getMovementMapContext();

  const GAPS_SHOWN = 12;
  /** A common movement appears in twenty-odd letters, and listing them all
   *  buries the movement name the tile exists to show. Enough to recognise
   *  where to find it is enough. */
  const LETTERS_SHOWN = 6;

  function letterHint(letters: readonly string[]): string {
    if (letters.length <= LETTERS_SHOWN) return letters.join(" ");
    const shown = letters.slice(0, LETTERS_SHOWN).join(" ");
    return `${shown} +${letters.length - LETTERS_SHOWN}`;
  }

  const percent = $derived(
    movementMap.coverage ? Math.round(movementMap.coverage.fraction * 100) : 0
  );
</script>

<div class="coverage">
  {#if movementMap.spaceLoading}
    <p class="status" role="status">Working out the size of Level 1&hellip;</p>
  {:else if !movementMap.coverage}
    <p class="status" role="status">Level 1 movements have not loaded.</p>
  {:else}
    {@const report = movementMap.coverage}
    <section class="overall">
      <div class="headline">
        <h3>Level 1 mapped</h3>
        <strong>{percent}<span class="unit">%</span></strong>
      </div>

      <div
        class="meter"
        role="progressbar"
        aria-valuenow={report.mapped}
        aria-valuemin={0}
        aria-valuemax={report.total}
        aria-label="Level 1 movements fully described"
      >
        <div class="meter-fill" style:width={`${percent}%`}></div>
      </div>

      <dl class="tallies">
        <div>
          <dt>Mapped</dt>
          <dd>{report.mapped}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{report.partial}</dd>
        </div>
        <div>
          <dt>Untouched</dt>
          <dd>{report.unseen}</dd>
        </div>
        <div>
          <dt>In Level 1</dt>
          <dd>{report.total}</dd>
        </div>
      </dl>

      <p class="explainer">
        A movement counts as mapped once three of its five phases carry an
        observation. Describing the same instant repeatedly does not advance it.
      </p>

      <p class="explainer">
        Each movement stands for both sides of the body. Describing what one arm
        does describes the other arm doing it transposed, so the pair is one
        thing to map and observations of either side land on it.
      </p>

      {#if report.outsideSpace > 0}
        <p class="warning" role="status">
          {report.outsideSpace} observations describe movements outside Level 1. They
          are stored but do not count toward this total.
        </p>
      {/if}
    </section>

    {#if movementMap.sequenceCoverage && movementMap.sequenceCoverage.total > 0}
      {@const own = movementMap.sequenceCoverage}
      <section class="this-video">
        <h3>This sequence</h3>
        <p>
          Exercises <strong>{own.total}</strong> of Level 1's movements.
          <strong>{own.mapped}</strong> mapped, <strong>{own.partial}</strong>
          started, <strong>{own.unseen}</strong> untouched.
        </p>
      </section>
    {/if}

    <section class="gaps">
      <h3>Not yet mapped</h3>
      {#if report.gaps.length === 0}
        <p class="done">
          Every Level 1 movement is described. Level 2 is next.
        </p>
      {:else}
        <ul>
          {#each report.gaps.slice(0, GAPS_SHOWN) as gap (gap.movement.key)}
            <li class:started={gap.status === "partial"}>
              <span class="gap-name">
                {describeSignature(gap.movement.signature)}
              </span>
              <span class="gap-meta">
                <span class="letters" title={gap.movement.letters.join(" ")}>
                  {letterHint(gap.movement.letters)}
                </span>
                <span class="phases">
                  {gap.anchors.size}/3 phases
                </span>
              </span>
            </li>
          {/each}
        </ul>
        {#if report.gaps.length > GAPS_SHOWN}
          <p class="more">
            and {report.gaps.length - GAPS_SHOWN} more
          </p>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<style>
  .coverage {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-height: 0;
    overflow-y: auto;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    color: var(--theme-text, #fff);
  }

  .status {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .overall {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .headline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .headline strong {
    font-size: 1.75rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-accent, #6366f1);
    line-height: 1;
  }

  .unit {
    font-size: 1rem;
    font-weight: 600;
    margin-left: 0.1em;
  }

  .meter {
    height: 0.5rem;
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  .meter-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--theme-accent, #6366f1);
    transition: width var(--duration-normal) var(--ease-standard);
  }

  .tallies {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0;
  }

  .tallies div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.4rem 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .tallies dt {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .tallies dd {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #fff);
  }

  .explainer,
  .more,
  .this-video p {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.45;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .this-video {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .this-video strong {
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .warning {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.45;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid var(--semantic-warning, #f59e0b);
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 12%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .gaps {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .gaps ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .gaps li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.4rem 0.55rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  /* A started movement is tinted across the whole tile rather than marked with
     an edge stripe, per .claude/rules/no-left-edge-accent-bar.md. */
  .gaps li.started {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .gap-name {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: var(--theme-text, #fff);
    word-break: break-word;
  }

  .gap-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .letters {
    letter-spacing: 0.06em;
  }

  .phases {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .done {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--semantic-success, #22c55e);
  }

  @media (prefers-reduced-motion: reduce) {
    .meter-fill {
      transition: none;
    }
  }
</style>
