<!--
  Mandala Palette Comparison — facelift aesthetic checkpoint.
  Renders the same 3 real mandala glyphs (via the shared SequenceMandala
  component — same calculateMandalaGeometry + renderMandalaSVG pipeline the
  app uses) across 9 palette candidates, one per art-direction card, so the
  direction can be picked by eye against real output, not swatches.
  Data: static/data/mandala-glyphs.json (built by scripts/build-mandala-glyphs.cjs).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import type { MandalaPalette } from "#lib/shared/mandala/domain/mandala-types.js";

  interface Glyph {
    shapeKey: string;
    word: string;
    count: number;
    steps: unknown[];
  }
  interface GlyphFile {
    version: number;
    total: number;
    glyphs: Glyph[];
  }

  interface Candidate {
    name: string;
    desc: string;
    bg: string;
    palette?: MandalaPalette;
  }

  function withFills(
    leftStroke,
    rightStroke,
    purpleStroke: string,
    fillAlpha: number,
  ): MandalaPalette {
    return {
      leftStroke,
      leftFill: withAlpha(leftStroke, fillAlpha),
      rightStroke,
      rightFill: withAlpha(rightStroke, fillAlpha),
      purpleStroke,
      purpleFill: withAlpha(purpleStroke, 0.2),
    };
  }

  function withAlpha(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const CANDIDATES: Candidate[] = [
    {
      name: "Current (control)",
      desc: "Today's default: prop colors on black.",
      bg: "#000000",
      palette: undefined,
    },
    {
      name: "Ink & Parchment",
      desc: "Sumi ink and vermilion seal on warm paper. Print-native.",
      bg: "#f4ecdc",
      palette: withFills("#1e2749", "#b33a2e", "#5c3a54", 0.12),
    },
    {
      name: "Gold Leaf",
      desc: "Illuminated-manuscript metallics on near-black.",
      bg: "#16161c",
      palette: withFills("#d4af37", "#b8722c", "#e8c96a", 0.15),
    },
    {
      name: "Risograph",
      desc: "Two-ink riso print. Overlap reads as overprint.",
      bg: "#faf6ee",
      palette: withFills("#0053a0", "#ff6a4d", "#7a3f8c", 0.18),
    },
    {
      name: "Cyanotype",
      desc: "Blueprint sun-print. Line as light.",
      bg: "#123a6b",
      palette: withFills("#e8f1ff", "#9fc5ff", "#cfe0ff", 0.1),
    },
    {
      name: "Aurora Silk",
      desc: "Tonight's neon, desaturated to gallery grade.",
      bg: "#0b0e14",
      palette: withFills("#7fd8d8", "#d8a0c8", "#b0ace0", 0.15),
    },
    {
      name: "Terracotta",
      desc: "Mediterranean tile: teal and burnt sienna on sand.",
      bg: "#e8d9c3",
      palette: withFills("#1f6f6b", "#a34a2a", "#6b4a52", 0.14),
    },
    {
      name: "Bioluminescence",
      desc: "Deep-ocean glow on abyssal blue-black.",
      bg: "#04101c",
      palette: withFills("#35e0c8", "#e05a9a", "#8a7ae8", 0.18),
    },
    {
      name: "Botanical",
      desc: "Sage and rosewood on linen. Quiet, botanical-plate.",
      bg: "#f2f0e6",
      palette: withFills("#5a7050", "#a05656", "#6e5a70", 0.12),
    },
  ];

  let data = $state<GlyphFile | null>(null);
  let status = $state("loading glyph census…");
  let samples = $state<Glyph[]>([]);

  onMount(async () => {
    const res = await fetch("/data/mandala-glyphs.json");
    if (!res.ok) {
      status = `glyph census missing (run scripts/build-mandala-glyphs.cjs) — ${res.status}`;
      return;
    }
    data = (await res.json()) as GlyphFile;
    status = "";

    // Pick 3 glyphs of varied visual complexity — sort by step count and
    // spread across simple / medium / dense, preferring recognizable words.
    const withWord = data.glyphs.filter((g) => g.word && g.word.trim().length > 0);
    const pool = withWord.length >= 3 ? withWord : data.glyphs;
    const sorted = [...pool].sort((a, b) => a.steps.length - b.steps.length);
    if (sorted.length >= 3) {
      const simple = sorted[0]!;
      const dense = sorted[sorted.length - 1]!;
      const mediumIdx = Math.floor(sorted.length / 2);
      const medium = sorted[mediumIdx]!;
      samples = [simple, medium, dense];
    } else {
      samples = sorted;
    }
  });
</script>

<main class="palettes">
  <header>
    <h1>Mandala Palette Comparison</h1>
    {#if data}
      <p class="lede">
        {samples.map((g) => g.word).join(" · ")} rendered across 9 candidate
        art directions. Real geometry, real overlap — pick by eye.
      </p>
    {:else}
      <p class="lede">{status}</p>
    {/if}
  </header>

  {#if samples.length > 0}
    <section class="candidates">
      {#each CANDIDATES as c (c.name)}
        <div class="candidate">
          <div class="candidate-label">
            <h2>{c.name}</h2>
            <p>{c.desc}</p>
          </div>
          <div class="swatch" style="background: {c.bg};">
            {#each samples as g (g.shapeKey)}
              <div class="glyph-cell">
                <SequenceMandala
                  sequence={{ steps: g.steps }}
                  size={240}
                  show="both"
                  style="stroke"
                  palette={c.palette}
                />
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}
</main>

<style>
  .palettes {
    padding: 1.5rem;
    color: #e8e8f0;
    background: #141418;
    min-height: 100vh;
  }
  header {
    margin-bottom: 2rem;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.6rem;
  }
  .lede {
    max-width: 70ch;
    opacity: 0.85;
    line-height: 1.5;
  }

  .candidates {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .candidate {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .candidate-label h2 {
    margin: 0 0 0.2rem;
    font-size: 1.15rem;
  }
  .candidate-label p {
    margin: 0;
    opacity: 0.65;
    font-size: 0.9rem;
    max-width: 60ch;
  }

  .swatch {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    padding: 2rem;
    border-radius: 16px;
  }

  .glyph-cell {
    width: 240px;
    height: 240px;
    flex: 0 0 auto;
  }
</style>
