<!--
  Atlas - the codex organised by type, without the printed page's geometry.

  The sheet's two-column letter-paper grid is what forces six tall rows and a
  scroll. Drop the paper but keep the thing the paper was carrying: each type is
  its own band, named, with its boxes flowing across the whole width. Types 1-3
  hold 8 or more letters and earn a full-width band each. Type 1 keeps A-L and
  M-V in separate flows so responsive packing cannot merge the alpha/beta and
  gamma placement lands. Types 4, 5 and 6 hold three apiece, so a full-width row
  for each would be three rows spent on nine cells - they share one row instead,
  each still named.
-->
<script lang="ts">
  import CodexFlow from "./CodexFlow.svelte";
  import CodexBandHead from "./CodexBandHead.svelte";
  import {
    MAJOR_TYPE_BANDS,
    MINOR_TYPE_BANDS,
    type CodexTypeBand,
    type TaggedBox,
  } from "./codex-letters";

  let { onSelect }: { onSelect: (id: string) => void } = $props();

  interface AtlasFlow {
    boxes: TaggedBox[];
    flowHeader?: string;
  }

  function placementLandFlows(band: CodexTypeBand): AtlasFlow[] {
    if (band.type.n !== 1) return [{ boxes: band.boxes }];
    const gammaLand = band.boxes.slice(4);
    return [
      { boxes: band.boxes.slice(0, 4) },
      { boxes: gammaLand, flowHeader: gammaLand[0]?.box.header },
    ];
  }
</script>

<div class="board-atlas">
  <div class="bands">
    {#each MAJOR_TYPE_BANDS as band (band.type.n)}
      <section
        class="band"
        class:paired-letters={band.type.n === 2 || band.type.n === 3}
        aria-label={band.type.word.replace(/:\s*$/, "")}
      >
        <CodexBandHead type={band.type} />
        {#each placementLandFlows(band) as flow, index (`${band.type.n}-${index}`)}
          <CodexFlow
            boxes={flow.boxes}
            flowHeader={flow.flowHeader}
            {onSelect}
          />
        {/each}
      </section>
    {/each}

    <!-- The short types, three across. Each keeps its own heading, so the row
         reads as three bands sharing a line, not as one mixed band. -->
    <div class="minor-row">
      {#each MINOR_TYPE_BANDS as band (band.type.n)}
        <section
          class="band minor"
          aria-label={band.type.word.replace(/:\s*$/, "")}
        >
          <CodexBandHead type={band.type} />
          <CodexFlow boxes={band.boxes} {onSelect} />
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .board-atlas {
    container-type: inline-size;
  }

  .bands {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    --abox-gap: 0.4rem;
    --codex-flow-justify: center;
    --settings-codex-row-caption-gap: 0.75rem;
    --codex-flow-row-gap: var(--settings-codex-row-caption-gap);

    /* Five rows of cells at desktop: Type 1 uses one row for A-L and one for
       M-V, Types 2 and 3 are one each, and the short types share one.
       Whichever binds first - twelve cells across the band, or those five rows'
       share of the screen left under the page chrome. The subtrahend is the
       measured chrome plus the four band headings and the type rules; it is why
       this board lands inside the fold from the top of the page instead of
       needing a scroll. */
    --band-rows: 5;
    --codex-picto-size: min(
      calc((100cqi - 3rem) / 12),
      calc((100dvh - var(--codex-atlas-chrome, 28.5rem)) / var(--band-rows))
    );
  }

  .band {
    min-width: 0;
  }

  /* A wrapped row begins with its placement transition, not with another
     pictograph. Give that caption a deliberate break from the rule above it so
     it reads as the next row's header. Type 1 uses two flows to preserve its
     placement lands, so it needs the same break between those flows. */
  .band > :global(.flow + .flow) {
    margin-top: var(--settings-codex-row-caption-gap);
  }

  .minor-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 0.75rem 2.5rem;
  }

  /* At a true 4K CSS viewport the public shell stops at 2600px, which makes a
     twelve-letter visual reference occupy barely two thirds of the canvas.
     The Atlas is an artifact workspace rather than a reading column, so it may
     use the wider canvas while the page heading and prose stay in the shell. */
  @media (min-width: 3000px) {
    .board-atlas {
      --settings-codex-atlas-wide: min(88vw, 3400px);
      width: var(--settings-codex-atlas-wide);
      margin-inline: calc((100% - var(--settings-codex-atlas-wide)) / 2);
    }
  }

  /* Below desktop the board scrolls, so the height term comes off entirely and
     the divisor is the only thing that changes. Twelve across on a phone is a
     row of 25px thumbnails. */
  @container (max-width: 69.999rem) {
    .bands {
      --codex-picto-size: calc((100cqi - 3rem) / 8);
    }
  }
  @container (max-width: 47.999rem) {
    .bands {
      --codex-picto-size: calc((100cqi - 2rem) / 6);
    }
    .minor-row {
      gap: 0.75rem 1.5rem;
    }
  }
  /* Types 2 and 3 are four two-letter transition groups. At the six-column
     tier, generic packing strands the final Greek pair. Two groups per row
     keeps the Latin letters together, then the Greek letters together. */
  @container (min-width: 30rem) and (max-width: 47.999rem) {
    .band.paired-letters {
      width: calc(4 * var(--codex-picto-size) + var(--abox-gap));
      align-self: center;
    }
  }
  @container (max-width: 29.999rem) {
    .bands {
      --codex-picto-size: calc((100cqi - 1.2rem) / 4);
    }
  }
</style>
