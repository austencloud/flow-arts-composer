<!--
  A type's name over its band.

  The same three parts the printed sheet's heading has - the plain leading word
  ("Type 1: ") and the coloured segments that distinguish the type - at a scale
  a screen band can afford. The sheet sets its heading in 1.5rem italic serif,
  which costs about 40px per band; four of those is a row of pictographs. This
  is a 0.9rem line. The facts and the colours are the sheet's; only the size
  differs.

  CENTRED, like the sheet's, and not left-aligned: every band centres its boxes,
  so a heading pinned to the band's left edge sits over empty rail for the types
  whose boxes do not fill the width - which is what made Types 1-3 look labelled
  from outside and Types 4-6 labelled from inside. Centred, the heading is over
  its own content whatever that content's width, so all six read the same.

  The word and its segments are ONE flex item, not three: type.word ends in a
  space ("Type 1: ") and a flex item swallows a trailing space.
-->
<script lang="ts">
  import {
    codexSegmentLabel,
    codexTypeWord,
    type CodexTypeDef,
  } from "../../../guide/codex/_data/codex-groups";

  let { type }: { type: CodexTypeDef } = $props();
</script>

<h3 class="band-head">
  <span class="band-label"
    ><span class="band-word">{codexTypeWord(type)}</span
    >{#each type.segs as seg (seg.t)}<span style:color={seg.c}
        >{codexSegmentLabel(seg)}</span
      >{/each}</span
  >
</h3>

<style>
  .band-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    margin: 0 0 0.3rem;
    font-family: Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .band-label {
    white-space: nowrap;
  }

  .band-word {
    color: var(--theme-text, oklch(0.96 0.01 270));
  }
</style>
