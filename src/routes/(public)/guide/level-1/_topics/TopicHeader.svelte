<!--
  The header every Guide topic page opens with: kicker, title, one-line
  lede, on the page's centered axis. The title and lede speak in the book's
  voice, the calligraphic --guide-script and the italic --guide-display
  serif, at the sizes the reflow pages' hero uses (Austen chose this as the
  Guide's official header, 2026-10-11). Topic pages share this component so
  their headers stay identical.
-->
<script lang="ts">
  let {
    kicker,
    title,
    lede,
  }: { kicker: string; title: string; lede: string } = $props();
</script>

<header class="topic-head">
  <p class="kicker">{kicker}</p>
  <h1>{title}</h1>
  <p class="lede">{lede}</p>
</header>

<style>
  .topic-head {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    max-width: 46rem;
    margin: 0 auto;
    text-align: center;
  }
  /* Class-qualified so the guide's global .guide-content type rules stay out. */
  .topic-head .kicker {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
  }
  .topic-head h1 {
    grid-column: auto;
    margin: 0;
    padding: 0;
    text-align: center;
    color: var(--ink, #1a1a1a);
    font-family: var(--guide-script, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(3rem, 6cqw, 4.4rem);
    font-weight: var(--guide-script-weight, 700);
    line-height: 0.95;
    letter-spacing: 0;
    text-wrap: balance;
  }
  .topic-head .lede {
    margin: 0;
    color: var(--ink-dim, #555);
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 2.6vw, 1.4rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.4;
    text-wrap: balance;
  }
</style>
