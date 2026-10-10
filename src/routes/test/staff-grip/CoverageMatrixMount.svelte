<!--
  Where a character x prop x sequence sweep renders.

  Until a matrix is handed in, this states its own contract rather than
  pretending to be empty: an unwired mount that looks like a bug gets deleted
  by the next person through. See `coverage-matrix-contract.ts` for the three
  wiring steps.
-->
<script lang="ts">
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";

  import {
    coverageCellHref,
    findCoverageCell,
    type CoverageMatrix,
    type CoverageStatus,
  } from "./coverage-matrix-contract";
  import { labCharacterName, labPropLabel } from "./lab-catalog";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  interface Props {
    matrix: CoverageMatrix | null;
  }

  let { matrix }: Props = $props();

  const STATUS_ICON: Record<CoverageStatus, string> = {
    pass: "fa-check",
    warn: "fa-triangle-exclamation",
    fail: "fa-xmark",
    pending: "fa-ellipsis",
  };
</script>

<div class="matrix" data-matrix-state={matrix ? "wired" : "awaiting-engine"}>
  {#if matrix}
    <p class="caption">
      {matrix.characterIds.length} bodies × {matrix.props.length} props on
      <b>{matrix.sequenceId}</b>. Open any cell to inspect it here.
    </p>
    <div class="scroller">
      <table>
        <thead>
          <tr>
            <th scope="col">Body</th>
            {#each matrix.props as prop (prop)}
              <th scope="col">{labPropLabel(prop as PropType)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each matrix.characterIds as characterId (characterId)}
            <tr>
              <th scope="row">{labCharacterName(characterId)}</th>
              {#each matrix.props as prop (prop)}
                {@const cell = findCoverageCell(matrix, characterId, prop)}
                <td>
                  {#if cell}
                    <a
                      class="cell"
                      data-status={cell.status}
                      href={coverageCellHref(cell)}
                      title={cell.note ?? cell.status}
                    >
                      <i
                        class="fas {STATUS_ICON[cell.status]}"
                        aria-hidden="true"
                      ></i>
                      <span class="visually-hidden">
                        {labCharacterName(characterId)} holding {labPropLabel(
                          prop as PropType
                        )}: {cell.status}
                      </span>
                    </a>
                  {:else}
                    <span class="cell is-absent" aria-label="not swept">–</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <!--
      The app's own empty state, not a dashed developer box. It states the
      same contract: the sweep engine stays out of this route on purpose, and
      wiring it is the three steps in `coverage-matrix-contract.ts`.
    -->
    <PanelState
      type="info"
      icon="fa-table-cells"
      title="Coverage matrix"
      message="No sweep is loaded. Adapt a sweep result to the plain-data shape in coverage-matrix-contract.ts, hand it to this page as coverageMatrix, and every cell becomes a link back into this lab already set to that body, prop and frame."
      compact
    />
  {/if}
</div>

<style>
  .matrix {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .caption {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  /* A wide table scrolls inside its own box; the page never scrolls sideways. */
  .scroller {
    overflow-x: auto;
    min-width: 0;
  }

  table {
    border-collapse: collapse;
    font-size: var(--font-size-sm, 0.875rem);
  }

  th,
  td {
    padding: 0.3rem 0.45rem;
    text-align: left;
    white-space: nowrap;
  }

  thead th {
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    border-bottom: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
  }

  tbody th {
    font-weight: 500;
    color: var(--theme-text, #fff);
  }

  .cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 8px;
    border: var(--glass-border, 1px solid rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    text-decoration: none;
  }

  .cell[data-status="pass"] {
    background: color-mix(in srgb, var(--semantic-success) 24%, transparent);
  }

  .cell[data-status="warn"] {
    background: color-mix(in srgb, var(--semantic-warning) 26%, transparent);
  }

  .cell[data-status="fail"] {
    background: color-mix(in srgb, var(--semantic-error) 30%, transparent);
  }

  .cell[data-status="pending"],
  .cell.is-absent {
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .cell:focus-visible {
    outline: 2px solid var(--theme-accent, #7a73da);
    outline-offset: 2px;
  }





  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
</style>
