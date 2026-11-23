<script lang="ts">
  /**
   * Homepage mobile-hierarchy comparison harness.
   *
   * ONE phone-sized iframe, swapped between candidate compositions. An iframe
   * (not a scaled div) because the layout is driven by viewport media queries
   * and svh units — only a real nested viewport makes those fire truthfully.
   *
   * Deliberately one frame at a time: each variant boots a live HomeHero, i.e.
   * a sequence generator plus the animation engine. Four at once wedges the dev
   * server. Flipping variants in a fixed position also reads differences better
   * than scanning across a row.
   */
  type Variant = { id: string; name: string; note: string };
  type Size = { id: string; label: string; w: number; h: number };

  const VARIANTS: [Variant, ...Variant[]] = [
    {
      id: "current",
      name: "Current",
      note: "Six equal tiles. No descriptors, no rank signal, no What is TKA.",
    },
    {
      id: "demo",
      name: "A1 · Demo shrink",
      note: "Demo 40svh → 32svh. Descriptors and the explainer come back. Still six equal tiles.",
    },
    {
      id: "demote",
      name: "A2 · Demote utilities",
      note: "FAQ + Glossary drop to the strip. Four tiles, two rows, descriptors, explainer.",
    },
    {
      id: "promote",
      name: "A3 · Promote Composer",
      note: "FAQ to the strip. Composer takes the full first row. Five tiles, descriptors, explainer.",
    },
  ];

  const SIZES: [Size, ...Size[]] = [
    { id: "tall", label: "390 × 844", w: 390, h: 844 },
    { id: "short", label: "375 × 667", w: 375, h: 667 },
  ];

  let variant = $state<Variant>(VARIANTS[0]);
  let size = $state<Size>(SIZES[0]);
</script>

<svelte:head>
  <title>Homepage mobile hierarchy — variants</title>
</svelte:head>

<div class="harness">
  <header>
    <h1>Homepage phone composition</h1>
    <p class="lede">
      Real components, real viewport media queries. Each frame is one screen —
      nothing below the fold, nothing scrolled.
    </p>
  </header>

  <div class="layout">
    <div class="controls">
      <fieldset>
        <legend>Variant</legend>
        {#each VARIANTS as v (v.id)}
          <button
            type="button"
            class:active={variant.id === v.id}
            onclick={() => (variant = v)}
          >
            <strong>{v.name}</strong>
            <span>{v.note}</span>
          </button>
        {/each}
      </fieldset>

      <fieldset class="sizes">
        <legend>Viewport</legend>
        {#each SIZES as s (s.id)}
          <button
            type="button"
            class:active={size.id === s.id}
            onclick={() => (size = s)}
          >
            <strong>{s.label}</strong>
          </button>
        {/each}
      </fieldset>
    </div>

    <div class="stage">
      <div class="phone" style="--w: {size.w}px; --h: {size.h}px">
        {#key `${variant.id}-${size.id}`}
          <iframe
            src="/test/homepage-mobile-hierarchy/frame?v={variant.id}"
            title="{variant.name} at {size.label}"
            width={size.w}
            height={size.h}
          ></iframe>
        {/key}
      </div>
      <p class="caption">{variant.name} — {size.label}</p>
    </div>
  </div>
</div>

<style>
  .harness {
    min-height: 100vh;
    padding: 2rem clamp(1rem, 3vw, 3rem) 4rem;
    background: oklch(0.14 0.02 265);
    color: oklch(0.94 0.01 270);
    font-family: system-ui, sans-serif;
  }

  header {
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto 2rem;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 2vw + 1rem, 2.4rem);
    font-weight: 600;
  }
  .lede {
    margin: 0.4rem 0 0;
    max-width: 66ch;
    color: oklch(0.72 0.02 270);
  }

  .layout {
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(20rem, 28rem) 1fr;
    gap: clamp(1.5rem, 3vw, 3rem);
    align-items: start;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  legend {
    padding: 0;
    margin-bottom: 0.5rem;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: oklch(0.66 0.02 270);
  }
  fieldset button {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-height: 44px;
    padding: 0.7rem 0.9rem;
    border-radius: 12px;
    border: 1px solid oklch(0.4 0.04 270 / 0.5);
    background: oklch(0.2 0.02 270 / 0.6);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background 0.18s ease;
  }
  fieldset button:hover {
    border-color: oklch(0.6 0.08 285 / 0.7);
  }
  fieldset button.active {
    border-color: oklch(0.72 0.15 285);
    background: oklch(0.3 0.07 285 / 0.5);
  }
  fieldset button strong {
    font-size: 0.98rem;
    font-weight: 650;
  }
  fieldset button span {
    font-size: 0.82rem;
    line-height: 1.35;
    color: oklch(0.7 0.02 270);
  }
  .sizes {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .sizes legend {
    width: 100%;
  }
  .sizes button {
    flex: 1 1 8rem;
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
  }
  .phone {
    width: var(--w);
    height: var(--h);
    max-width: 100%;
    border-radius: 1.75rem;
    overflow: hidden;
    border: 1px solid oklch(0.45 0.04 270 / 0.55);
    box-shadow: 0 22px 60px oklch(0 0 0 / 0.55);
    background: #000;
  }
  .phone iframe {
    display: block;
    border: 0;
  }
  .caption {
    margin: 0;
    font-size: 0.85rem;
    color: oklch(0.66 0.02 270);
  }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .harness {
    border-top: var(--safe-top) solid transparent;
  }
</style>
