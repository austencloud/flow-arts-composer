<script lang="ts">
  /**
   * Parity / render-lab hub. Hardcoded index — add an entry to register a test.
   * Each entry carries an accent, a glyph, a one-line purpose, and tag chips that
   * say at a glance what kind of harness it is.
   */
  type Entry = {
    href: string;
    title: string;
    desc: string;
    accent: string;
    glyph: "film" | "cards" | "cpu";
    tags: string[];
  };

  const tests: Entry[] = [
    {
      href: "/test/trail-export-parity",
      title: "Trail Export Parity",
      desc: "Live render → real MP4 export → decode. Proves the exported video's trails match the on-screen animator.",
      accent: "#6366f1",
      glyph: "film",
      tags: ["image diff", "2 gates", "video"],
    },
    {
      href: "/test/card-back-parity",
      title: "Card Front Parity",
      desc: "Card fronts rendered through the worker pool and main thread, pixel-diffed across a sequence matrix.",
      accent: "#14b8a6",
      glyph: "cards",
      tags: ["image diff", "1 gate", "front"],
    },
    {
      href: "/test/guide-proof",
      title: "Guide Proof",
      desc: "Level 1 guide PDF: old v0.5 vs current, page by page. Synced scroll + page-offset nudge + overlay opacity. Human proofing, not an automated gate.",
      accent: "#a78bfa",
      glyph: "cpu",
      tags: ["human proof", "old vs new", "pdf"],
    },
  ];
</script>

<svelte:head><title>Parity Tests</title></svelte:head>

<div class="page">
  <div class="shell">
  <header class="hero">
    <div class="eyebrow">render lab</div>
    <h1>Parity Tests</h1>
    <p class="lede">
      Image-vs-image render harnesses. Each runs two sources, pixel-diffs corresponding
      frames, and reports a PASS/FAIL verdict — plus the worker/cold-deck performance lab.
    </p>
  </header>

  <div class="grid">
    {#each tests as t (t.href)}
      <a class="card" href={t.href} style:--accent={t.accent}>
        <div class="glow"></div>
        <div class="top">
          <span class="icon" aria-hidden="true">
            {#if t.glyph === "film"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
              </svg>
            {:else if t.glyph === "cards"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="4" y="3" width="11" height="15" rx="2" /><path d="M9 21h9a2 2 0 0 0 2-2V8" />
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 1v3M14 1v3M10 20v3M14 20v3M1 10h3M1 14h3M20 10h3M20 14h3" />
              </svg>
            {/if}
          </span>
          <span class="chev" aria-hidden="true">→</span>
        </div>
        <h2>{t.title}</h2>
        <p class="desc">{t.desc}</p>
        <div class="tags">
          {#each t.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
        </div>
      </a>
    {/each}
  </div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 56px clamp(20px, 6vw, 80px) 80px;
    background:
      radial-gradient(1200px 600px at 50% -10%, rgba(99, 102, 241, 0.12), transparent 60%),
      radial-gradient(1000px 500px at 100% 0%, rgba(20, 184, 166, 0.08), transparent 55%),
      linear-gradient(180deg, #0a0a12, #0c0c15);
    color: #eaeaf2;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .shell {
    width: 100%;
    max-width: 1040px;
  }
  .hero {
    text-align: center;
    max-width: 680px;
    margin: 0 auto 40px;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 11px;
    font-weight: 700;
    color: #6b6b8a;
    margin-bottom: 10px;
  }
  h1 {
    margin: 0 0 12px;
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(180deg, #fff, #b6b6cc);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .lede {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: #9494ad;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 18px;
    max-width: 1100px;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 22px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.025);
    text-decoration: none;
    color: inherit;
    overflow: hidden;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
  }
  .card:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    background: rgba(255, 255, 255, 0.045);
  }
  .glow {
    position: absolute;
    inset: -40% 40% auto -40%;
    height: 160px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 40%, transparent), transparent);
    opacity: 0;
    transition: opacity 0.18s ease;
    pointer-events: none;
  }
  .card:hover .glow {
    opacity: 0.5;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .icon svg {
    width: 22px;
    height: 22px;
  }
  .chev {
    font-size: 18px;
    color: #55556e;
    transition:
      transform 0.18s ease,
      color 0.18s ease;
  }
  .card:hover .chev {
    color: var(--accent);
    transform: translateX(3px);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 650;
    color: #fff;
  }
  .desc {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.55;
    color: #8c8ca6;
    flex: 1;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    color: color-mix(in srgb, var(--accent) 80%, #fff 20%);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  }
</style>
