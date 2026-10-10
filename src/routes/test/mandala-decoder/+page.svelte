<!--
  Mandala Decoder — visual glyph census.
  Renders every distinct mandala glyph in the catalog as a real mini-mandala via
  the shared SequenceMandala component (same calculate() + renderMandalaSVG the
  app uses, purple overlap and all). Each glyph is one representative sequence;
  the count is how many catalog pathways collapse to that exact shape.
  Data: static/data/mandala-glyphs.json (built by scripts/build-mandala-glyphs.cjs).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";

  interface Glyph {
    shapeKey: string;
    word: string;
    count: number;
    decks: number;
    orbitKey: string;
    orbitGlyphs: number;
    steps: unknown[];
  }
  interface GlyphFile {
    version: number;
    total: number;
    glyphs: Glyph[];
  }

  let data = $state<GlyphFile | null>(null);
  let status = $state("loading glyph census…");
  let selected = $state<Glyph | null>(null);

  const totalPathways = $derived(
    data ? data.glyphs.reduce((n, g) => n + g.count, 0) : 0,
  );
  // Orbit siblings of the selected glyph (same orbit, different shape).
  const twins = $derived(
    data && selected
      ? data.glyphs.filter(
          (g) => g.orbitKey === selected!.orbitKey && g.shapeKey !== selected!.shapeKey,
        )
      : [],
  );

  onMount(async () => {
    const res = await fetch("/data/mandala-glyphs.json");
    if (!res.ok) {
      status = `glyph census missing (run scripts/build-mandala-glyphs.cjs) — ${res.status}`;
      return;
    }
    data = (await res.json()) as GlyphFile;
    status = "";
  });

  const fmt = (n: number) => n.toLocaleString("en-US");
</script>

<main class="census">
  <header>
    <h1>Mandala Glyph Census</h1>
    {#if data}
      <p class="lede">
        <strong>{fmt(totalPathways)}</strong> catalog sequences collapse to
        <strong>{data.total}</strong> distinct visual glyphs.
        The alien alphabet, sorted by how many pathways draw each symbol.
      </p>
    {:else}
      <p class="lede">{status}</p>
    {/if}
  </header>

  {#if data}
    <section class="grid">
      {#each data.glyphs as g (g.shapeKey)}
        <button
          class="card"
          class:active={selected?.shapeKey === g.shapeKey}
          onclick={() => (selected = g)}
        >
          <div class="art">
            <SequenceMandala
              sequence={{ steps: g.steps }}
              size={150}
              darkMode={true}
              show="both"
              style="stroke"
            />
          </div>
          <div class="meta">
            <span class="word">{g.word}</span>
            <span class="count">{fmt(g.count)} pathways</span>
            {#if g.orbitGlyphs > 1}
              <span class="twin">⟳ {g.orbitGlyphs}-glyph orbit</span>
            {/if}
          </div>
        </button>
      {/each}
    </section>

    {#if selected}
      <aside class="detail">
        <h2>{selected.word}</h2>
        <div class="detail-art">
          <SequenceMandala
            sequence={{ steps: selected.steps }}
            size={300}
            darkMode={true}
            show="both"
            style="stroke"
            animate={true}
          />
        </div>
        <p class="detail-stats">
          <strong>{fmt(selected.count)}</strong> sequences trace this exact glyph,
          across {selected.decks} deck{selected.decks === 1 ? "" : "s"}.
        </p>
        {#if twins.length}
          <h3>Rotation / mirror twins — {twins.length}</h3>
          <div class="twin-row">
            {#each twins as t (t.shapeKey)}
              <div class="twin-cell">
                <SequenceMandala
                  sequence={{ steps: t.steps }}
                  size={90}
                  darkMode={true}
                  show="both"
                  style="stroke"
                />
                <span class="count">{fmt(t.count)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </aside>
    {/if}
  {/if}
</main>

<style>
  .census {
    padding: 1.5rem;
    color: var(--text-primary, #e8e8f0);
    background: var(--surface-0, #0a0a14);
    min-height: 100vh;
  }
  header { margin-bottom: 1.5rem; }
  h1 { margin: 0 0 0.5rem; font-size: 1.6rem; }
  .lede { max-width: 60ch; opacity: 0.85; line-height: 1.5; }
  .lede strong { font-variant-numeric: tabular-nums; color: var(--accent, #8ab4ff); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 1rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-1, #12121f);
    border: 1px solid var(--border, #23233a);
    border-radius: 12px;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
  }
  .card:hover { transform: translateY(-2px); border-color: var(--accent, #8ab4ff); }
  .card.active { border-color: var(--accent, #8ab4ff); box-shadow: 0 0 0 1px var(--accent, #8ab4ff); }
  .art { width: 150px; height: 150px; }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    text-align: center;
  }
  .word { font-weight: 600; font-size: 0.85rem; }
  .count { font-size: 0.75rem; opacity: 0.7; font-variant-numeric: tabular-nums; }
  .twin { font-size: 0.68rem; opacity: 0.55; font-variant-numeric: tabular-nums; }

  .detail {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--surface-1, #12121f);
    border: 1px solid var(--border, #23233a);
    border-radius: 16px;
  }
  .detail h2 { margin: 0 0 1rem; }
  .detail-art { width: 300px; height: 300px; margin: 0 auto; }
  .detail-stats { text-align: center; margin: 1rem 0; }
  .detail-stats strong { font-variant-numeric: tabular-nums; color: var(--accent, #8ab4ff); }
  .twin-row { display: flex; flex-wrap: wrap; gap: 1rem; }
  .twin-cell { display: flex; flex-direction: column; align-items: center; }
  .twin-cell { width: 90px; }
  .twin-cell .count { font-size: 0.7rem; }
</style>
