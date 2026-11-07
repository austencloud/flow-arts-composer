<!--
  SidebarWordmark: the desktop sidebar's name. The rail reads FAC; expanded, the
  acronym opens into Flow Arts Composer. Austen (2026-11-06): "the word flow
  appears in the top left of the sidebar when it has been contracted, which is
  kind of silly because that's not the program. FAC would be a more suitable
  thing to display."

  The initials stay mounted and never fade. Each tail sits in an inline grid
  column that opens from 0fr to 1fr, the technique and tokens the sidebar
  package's .brand-rest uses, so the name opens on the same clock as the width.
  The face and the gradient clip match the package's .brand, which the `brand`
  snippet replaces. The home link around it carries the accessible name.
-->
<script lang="ts">
  let { expanded }: { expanded: boolean } = $props();

  const words = [
    { initial: "F", tail: "low " },
    { initial: "A", tail: "rts " },
    // The trailing space gives the leaning r room inside the tail's clip, and
    // keeps the expanded name clear of the pin button. A closed tail has no width.
    { initial: "C", tail: "omposer " },
  ];
</script>

<span class="wordmark" class:expanded aria-hidden="true">
  {#each words as word (word.initial)}<span class="initial">{word.initial}</span
    ><span class="tail"><span class="tail-text">{word.tail}</span></span>{/each}
</span>

<style>
  .wordmark {
    display: inline-flex;
    align-items: baseline;
    white-space: nowrap;
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    /* "Flow Arts Composer" must clear the absolutely-placed pin toggle inside
       the 220px expanded sidebar. One size at both ends, so the morph never
       changes font mid-transition. */
    font-size: 0.9rem;
    letter-spacing: 0.01em;
  }

  /* The gradient clip sits on each piece, not on .wordmark. Chromium paints a
     background-clip: text mask from every descendant's glyphs, ignoring their
     overflow and opacity, so a clip on the parent drew the closed tails on top
     of FAC (seen in the rail on 2026-11-06). */
  .initial,
  .tail-text {
    background: linear-gradient(
      135deg,
      var(--theme-text) 0%,
      color-mix(in srgb, var(--theme-accent) 60%, var(--theme-text)) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* An italic capital leans out of its box, and the gradient only paints inside
     the box. The padding gives it room; the margin keeps the spacing. */
  .initial {
    padding-inline: 0.15em;
    margin-inline: -0.15em;
  }

  .tail {
    display: inline-grid;
    grid-template-columns: 0fr;
    transition: grid-template-columns var(--duration-emphasis) var(--ease-out);
  }

  .expanded .tail {
    grid-template-columns: 1fr;
  }

  .tail-text {
    min-width: 0;
    overflow: hidden;
    opacity: 0;
    white-space: pre;
    /* Closing takes the shorter token, so a tail has faded before its column
       narrows through the letters. */
    transition: opacity var(--duration-instant) var(--ease-out);
  }

  .expanded .tail-text {
    opacity: 1;
    transition: opacity var(--duration-normal) var(--ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .tail,
    .tail-text {
      transition: none;
    }
  }
</style>
