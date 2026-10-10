<script lang="ts">
  import { onMount } from "svelte";
  import {
    applyMotionColorToSvg,
    SELECTIVE_COLOR_PROP_TYPES,
  } from "#lib/shared/utils/svg-color-utils.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  type Variant = { id: string; label: string; note: string; file: string };

  const variants: Variant[] = [
    {
      id: "current",
      label: "Current (flat)",
      note: "Today's asset — flat single-color double-S. Reference.",
      file: "/images/props/buugeng.svg",
    },
    {
      id: "lune",
      label: "Lune",
      note: "Offset ribbon: thin pointed tips, fat belly. The elegant classic crescent, with a glossy rounded sheen.",
      file: "/images/props/variants/buugeng-lune.svg",
    },
    {
      id: "talon",
      label: "Talon",
      note: "Thinner overall, very sharp tips — a claw silhouette. Razor evolution of the lune.",
      file: "/images/props/variants/buugeng-talon.svg",
    },
    {
      id: "spike",
      label: "Spike",
      note: "Smooth concave edge, fine sawtooth teeth on the convex edge of both lobes. Saw-blade S.",
      file: "/images/props/variants/buugeng-spike.svg",
    },
    {
      id: "fang",
      label: "Fang",
      note: "A few big triangular teeth on the convex edge. Dramatic, aggressive sickle.",
      file: "/images/props/variants/buugeng-fang.svg",
    },
    {
      id: "perf",
      label: "Perforated (matched to reference)",
      note: "Modeled on your real props: slender elongated crescents, sharp curled tips, slim solid grip neck, and a graduated row of holes per lobe (small at tips/neck, largest at the belly — sized to local thickness). Aspect ~2.16 vs measured 2.18.",
      file: "/images/props/variants/buugeng-perf.svg",
    },
  ];

  // Buugeng is a single-color prop (not in the selective list) — whole body recolors.
  const selective = (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(
    "buugeng"
  );

  type Rendered = { raw: string; left: string; right: string };
  let rendered = $state<Record<string, Rendered>>({});
  let darkBg = $state(true);

  function colorize(raw: string, color: HandSide): string {
    return applyMotionColorToSvg(raw, color, {
      makeClassNamesUnique: true,
      themeMode: "dark",
      selectiveColorMode: selective,
    });
  }

  onMount(async () => {
    for (const v of variants) {
      const raw = await (await fetch(v.file)).text();
      rendered[v.id] = {
        raw,
        left: colorize(raw, HandSide.LEFT),
        right: colorize(raw, HandSide.RIGHT),
      };
    }
  });
</script>

<div class="page" class:light={!darkBg}>
  <header>
    <h1>Buugeng variants</h1>
    <p>
      Each row rendered through the real <code>applyMotionColorToSvg</code>
      pipeline (selective mode = {String(selective)}). Left / Right show the
      recolored body; the sheen / spine / glow overlays are preserved across
      recolor (url() gradients + white strokes survive).
    </p>
    <button onclick={() => (darkBg = !darkBg)}>
      Toggle background: {darkBg ? "dark" : "light"}
    </button>
  </header>

  {#each variants as v (v.id)}
    {@const r = rendered[v.id]}
    <section>
      <div class="meta">
        <h2>{v.label}</h2>
        <p>{v.note}</p>
        <code>{v.file}</code>
      </div>
      {#if r}
        <div class="swatches">
          <figure>
            <div class="stage">
              {@html r.raw}
            </div>
            <figcaption>raw</figcaption>
          </figure>
          <figure>
            <div class="stage">
              {@html r.left}
            </div>
            <figcaption>left prop</figcaption>
          </figure>
          <figure>
            <div class="stage">
              {@html r.right}
            </div>
            <figcaption>right prop</figcaption>
          </figure>
        </div>
      {:else}
        <p class="loading">loading…</p>
      {/if}
    </section>
  {/each}
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 2rem;
    background: #15171c;
    color: #e8e8ea;
    font-family: system-ui, sans-serif;
  }
  .page.light {
    background: #e9eaee;
    color: #1a1a1c;
  }
  header {
    max-width: 70ch;
    margin-bottom: 2rem;
  }
  h1 {
    margin: 0 0 0.5rem;
  }
  header p {
    opacity: 0.8;
    line-height: 1.5;
  }
  button {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  section {
    border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    padding: 1.5rem 0;
  }
  .meta h2 {
    margin: 0 0 0.25rem;
  }
  .meta p {
    margin: 0 0 0.25rem;
    opacity: 0.75;
  }
  .meta code {
    font-size: 0.78rem;
    opacity: 0.6;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  figure {
    margin: 0;
  }
  .stage {
    border-radius: 12px;
    padding: 1.25rem;
    background: color-mix(in srgb, currentColor 6%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Render the prop SVGs at a readable size. */
  .stage :global(svg) {
    width: 100%;
    height: auto;
    max-height: 120px;
  }
  figcaption {
    text-align: center;
    font-size: 0.8rem;
    opacity: 0.7;
    margin-top: 0.4rem;
  }
  .loading {
    opacity: 0.6;
  }
</style>
