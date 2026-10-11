<script lang="ts">
  import { TND_ELEMENTS } from "#lib/features/choreo-card/domain/tnd-element.js";
  import type { PreparedPictographData } from "#lib/shared/pictograph/option/prepared-pictograph-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { DoubleFloatOptionRow } from "../services/double-float-option-groups";
  import OptionCard from "./OptionCard.svelte";

  interface Props {
    rows: readonly DoubleFloatOptionRow<PictographData>[];
    previewSize: number;
    continuationIndex?: number | null;
    onSelect: (option: PictographData, originalIndex: number) => void;
  }

  const {
    rows,
    previewSize,
    continuationIndex = null,
    onSelect,
  }: Props = $props();

  function elementFor(row: DoubleFloatOptionRow<PictographData>) {
    return TND_ELEMENTS.find(
      (element) => element.element === row.elementalType
    );
  }

  function elementName(raw: string): string {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function columnsFor(optionCount: number): number {
    return optionCount <= 4 ? optionCount : Math.ceil(optionCount / 2);
  }

  function reversalState(option: PictographData): {
    leftReversal: boolean;
    rightReversal: boolean;
  } {
    const pictograph = option as PictographData & {
      leftReversal?: boolean;
      rightReversal?: boolean;
    };
    return {
      leftReversal: pictograph.leftReversal ?? false,
      rightReversal: pictograph.rightReversal ?? false,
    };
  }
</script>

<div class="double-float-shell" data-testid="double-float-option-rows">
  <div class="double-float-rows">
    {#each rows as row (row.mode)}
      {@const element = elementFor(row)}
      {#if element}
        <section
          class="float-mode"
          style:--element-accent={element.accentColor}
          aria-label="{elementName(
            element.element
          )} {row.mode} float hand paths"
        >
          <h3 class="float-mode-title">
            <img
              src={element.iconPath}
              alt=""
              width="28"
              height="28"
              draggable="false"
            />
            <span>{row.mode}</span>
          </h3>

          <div
            class="float-path-grid"
            style:--float-mode-columns={columnsFor(row.options.length)}
          >
            {#each row.options as pathOption (pathOption.id)}
              {@const reversals = reversalState(pathOption.option)}
              <div class="float-path-slot">
                <OptionCard
                  pictograph={pathOption.option as PreparedPictographData}
                  size={previewSize}
                  leftReversal={reversals.leftReversal}
                  rightReversal={reversals.rightReversal}
                  isContinuation={continuationIndex ===
                    pathOption.originalIndex}
                  onSelect={() =>
                    onSelect(pathOption.option, pathOption.originalIndex)}
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>
</div>

<style>
  .double-float-shell {
    container-type: inline-size;
    width: 100%;
    min-width: 0;
  }

  .double-float-rows {
    display: flex;
    align-items: start;
    justify-content: center;
    gap: clamp(0.75rem, 2cqw, 1.5rem);
    width: 100%;
    min-width: 0;
  }

  .float-mode {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    width: fit-content;
    min-width: 0;
  }

  .float-mode-title {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 2rem;
    margin: 0;
    color: color-mix(in srgb, var(--element-accent) 82%, white);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.06em;
    line-height: 1;
  }

  .float-mode-title img {
    width: 1.75rem;
    height: 1.75rem;
    object-fit: contain;
    filter: drop-shadow(
      0 0 0.4rem color-mix(in srgb, var(--element-accent) 45%, transparent)
    );
  }

  .float-path-grid {
    display: grid;
    grid-template-columns: repeat(var(--float-mode-columns), max-content);
    align-items: start;
    justify-content: center;
    gap: 0.5rem;
    width: fit-content;
  }

  .float-path-slot {
    width: fit-content;
    height: fit-content;
  }

  @container (max-width: 700px) {
    .double-float-rows {
      display: grid;
      gap: 0.65rem;
    }
  }

  @container (max-height: 650px) {
    .float-mode {
      gap: 0.2rem;
    }
  }
</style>
