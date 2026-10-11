<!--
  The header every Guide topic page opens with: kicker, title, one-line
  lede, on the page's centered axis. The Grid set these sizes (2026-10-10);
  topic pages share this component so their headers stay identical.
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
    font-size: clamp(2.4rem, 5cqw, 3.6rem);
    font-weight: 750;
    line-height: 1.02;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }
  .topic-head .lede {
    margin: 0;
    color: var(--ink, #1a1a1a);
    font-size: clamp(1.05rem, 1.6cqw, 1.25rem);
    font-weight: 400;
    line-height: 1.55;
    text-wrap: balance;
  }
</style>
