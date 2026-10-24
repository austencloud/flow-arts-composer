<!--
  One type on the Codex's Home screen: a pressable box in the type's two
  band colours (the ring and wash BoardAtlas gives a band), its name, and
  its first three letters drawn as glyphs. The whole box opens the type.
-->
<script lang="ts">
  import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
  import type { LetterType } from "#lib/shared/foundation/domain/models/letter-type.js";
  import CodexLetterGlyph from "../../atlas/_components/codex-boards/CodexLetterGlyph.svelte";
  import type { CodexTypeBand } from "../../atlas/_components/codex-boards/codex-letters";
  import {
    codexSegmentLabel,
    codexTypeLabel,
    codexTypeWord,
  } from "../_data/codex-groups";

  let {
    band,
    onOpen,
  }: {
    band: CodexTypeBand;
    onOpen: (type: number) => void;
  } = $props();

  const colors = $derived(
    LETTER_TYPE_COLORS[`Type${band.type.n}` as LetterType]
  );
  const label = $derived(codexTypeLabel(band.type));
  const letters = $derived(
    band.boxes.flatMap((tagged) => tagged.box.cells).slice(0, 3)
  );
</script>

<button
  type="button"
  class="type-tile"
  aria-label={label}
  data-codex-type={band.type.n}
  style:--band-primary={colors[0]}
  style:--band-secondary={colors[1]}
  onclick={() => onOpen(band.type.n)}
>
  <span class="name" aria-hidden="true">
    <span class="word">{codexTypeWord(band.type).replace(/:\s*$/, "")}</span>
    <span class="segs"
      >{#each band.type.segs as seg (seg.t)}<span style:color={seg.c}
          >{codexSegmentLabel(seg)}</span
        >{/each}</span
    >
  </span>
  <span class="letters" aria-hidden="true">
    {#each letters as cell (cell.id)}
      <CodexLetterGlyph letter={cell.label} />
    {/each}
  </span>
  <span class="foot" aria-hidden="true">
    {band.cells} letters
    <i class="fa-solid fa-chevron-right"></i>
  </span>
</button>

<style>
  .type-tile {
    position: relative;
    container-type: size;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    justify-items: center;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px;
    box-sizing: border-box;
    border: 2px solid transparent;
    border-radius: 14px;
    color: var(--theme-text);
    font: inherit;
    text-align: center;
    cursor: pointer;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--band-primary) 10%, transparent),
      color-mix(in srgb, var(--band-secondary) 10%, transparent)
    );
    transition:
      background var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  /* The band's ring: one thin line from the type's first colour into its
     second (BoardAtlas .band::before). */
  .type-tile::before {
    content: "";
    position: absolute;
    inset: -2px;
    padding: 1.5px;
    border-radius: inherit;
    background: linear-gradient(
      135deg,
      var(--band-primary),
      var(--band-secondary)
    );
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
    opacity: 0.7;
    pointer-events: none;
  }

  .type-tile:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--band-primary) 18%, transparent),
      color-mix(in srgb, var(--band-secondary) 18%, transparent)
    );
  }

  .type-tile:active {
    transform: scale(0.98);
  }

  .type-tile:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* The type's number over its coloured name, as the band heading reads,
     on two lines so a narrow tile never cuts it short. */
  .name {
    display: grid;
    justify-items: center;
    max-width: 100%;
    font-family: Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
    font-size: clamp(0.875rem, 10cqi, 1.25rem);
    line-height: 1.15;
  }

  .word,
  .segs {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .segs {
    filter: brightness(1.35);
  }

  /* Three glyphs in a row, each about a third of the tile's height, and
     never wider together than the tile. */
  .letters {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6cqi;
    --letter-glyph-h: min(30cqb, 18cqi);
    --codex-glyph-filter: invert(1) brightness(0.92);
  }

  .foot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.75rem);
  }

  @media (prefers-reduced-motion: reduce) {
    .type-tile {
      transition: none;
    }
  }
</style>
