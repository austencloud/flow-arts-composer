<script lang="ts">
  import PresetPanel from "./PresetPanel.svelte";

  const PRESETS = [
    {
      cls: "sel-preset-ring",
      name: "Crisp Ring",
      desc: "Clean 2px accent ring, tight radius. Minimal and confident — Linear / Vercel energy.",
    },
    {
      cls: "sel-preset-halo",
      name: "Soft Halo",
      desc: "No hard edge — a soft accent bloom that lifts the sequence off the sheet. Airy, premium.",
    },
    {
      cls: "sel-preset-fill",
      name: "Bold Fill",
      desc: "Accent ring plus an accent-tinted wash. Unmistakable which sequence is chosen.",
    },
    {
      cls: "sel-preset-lift",
      name: "Lift & Glow",
      desc: "Scales up with a drop shadow and accent underglow. Tactile, like it pops toward you.",
    },
  ];
</script>

<div class="page">
  <header class="masthead">
    <h1>Sequence selection</h1>
    <p>
      Four selection looks on the real pictograph renderer. Hover each strip and grid,
      click to select. Each panel holds its own state so you can see all four selected
      at once. Tell me your favorite — I bake it in and wire it into the guide + choreo.
    </p>
  </header>

  <div class="gallery">
    {#each PRESETS as p (p.cls)}
      <PresetPanel presetClass={p.cls} name={p.name} desc={p.desc} />
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 48px 32px 80px;
    color: #1a1a22;
    background:
      radial-gradient(1100px 520px at 78% -8%, rgba(99, 102, 241, 0.1), transparent 60%),
      radial-gradient(900px 500px at 8% 4%, rgba(139, 92, 246, 0.07), transparent 55%),
      #eef0f4;
    font-family:
      ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .masthead {
    max-width: 760px;
    margin: 0 auto 40px;
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 44px);
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(180deg, #1a1a22, #55556a);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .masthead p {
    margin: 14px auto 0;
    max-width: 620px;
    font-size: 15px;
    line-height: 1.6;
    color: #5a5a68;
  }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
    gap: 26px;
    max-width: 1240px;
    margin: 0 auto;
  }
  @media (max-width: 520px) {
    .gallery {
      grid-template-columns: 1fr;
    }
    .page {
      padding: 32px 16px 64px;
    }
  }

  /* ── Shared structural bits the primitive needs (no base selection.css here so the
     presets below are the ONLY visuals) ──────────────────────────────────────── */
  :global(.tka-seq-cell) {
    position: relative;
  }
  :global(.tka-seq-hit) {
    position: absolute;
    inset: 0;
    z-index: 5;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  :global(.tka-seq-hit:focus-visible) {
    outline: 2px solid var(--theme-accent-strong, #4f46e5);
    outline-offset: 3px;
  }
  :global(.sel-preset-ring .tka-seq-cell),
  :global(.sel-preset-halo .tka-seq-cell),
  :global(.sel-preset-fill .tka-seq-cell),
  :global(.sel-preset-lift .tka-seq-cell) {
    transition:
      box-shadow 0.16s ease,
      outline-color 0.16s ease,
      transform 0.16s ease;
  }

  /* ── 1 · Crisp Ring ─────────────────────────────────────────────────────────── */
  :global(.sel-preset-ring .tka-seq-cell.is-hovered) {
    z-index: 4;
    border-radius: 8px;
    outline: 2px solid color-mix(in srgb, var(--theme-accent, #6366f1) 45%, transparent);
    outline-offset: 2px;
  }
  :global(.sel-preset-ring .tka-seq-cell.is-selected) {
    z-index: 10;
    border-radius: 8px;
    box-shadow: 0 0 0 2px var(--theme-accent, #6366f1);
  }
  :global(.sel-preset-ring .tka-seq-cell.is-selected::after) {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 8%, transparent);
  }

  /* ── 2 · Soft Halo ──────────────────────────────────────────────────────────── */
  :global(.sel-preset-halo .tka-seq-cell.is-hovered) {
    z-index: 4;
    border-radius: 12px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--theme-accent, #6366f1) 22%, transparent);
  }
  :global(.sel-preset-halo .tka-seq-cell.is-selected) {
    z-index: 10;
    border-radius: 12px;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--theme-accent, #6366f1) 55%, transparent),
      0 10px 28px color-mix(in srgb, var(--theme-accent, #6366f1) 38%, transparent);
  }
  :global(.sel-preset-halo .tka-seq-cell.is-selected::after) {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 6%, transparent);
  }

  /* ── 3 · Bold Fill ──────────────────────────────────────────────────────────── */
  :global(.sel-preset-fill .tka-seq-cell.is-hovered) {
    z-index: 4;
    border-radius: 6px;
    outline: 1.5px solid color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent);
  }
  :global(.sel-preset-fill .tka-seq-cell.is-hovered::after) {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
  }
  :global(.sel-preset-fill .tka-seq-cell.is-selected) {
    z-index: 10;
    border-radius: 6px;
    box-shadow: 0 0 0 2px var(--theme-accent, #6366f1);
  }
  :global(.sel-preset-fill .tka-seq-cell.is-selected::after) {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 18%, transparent);
  }

  /* ── 4 · Lift & Glow ────────────────────────────────────────────────────────── */
  :global(.sel-preset-lift .tka-seq-cell.is-hovered) {
    z-index: 4;
    border-radius: 8px;
    transform: translateY(-1px);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.18),
      0 0 0 1.5px color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
  }
  :global(.sel-preset-lift .tka-seq-cell.is-selected) {
    z-index: 10;
    border-radius: 8px;
    transform: scale(1.03);
    box-shadow:
      0 0 0 2px var(--theme-accent, #6366f1),
      0 6px 18px rgba(0, 0, 0, 0.22);
  }
  :global(.sel-preset-lift .tka-seq-cell.is-selected::after) {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 6%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.sel-preset-lift .tka-seq-cell.is-selected) {
      transform: none;
    }
  }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
