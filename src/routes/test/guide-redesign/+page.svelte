<script lang="ts">
  let activeTheme = $state<'current' | 'glass' | 'bleeding'>('current');

  const themes = [
    { id: 'current' as const, label: 'Current (2012)', desc: 'Playfair Display, white bg, flat borders' },
    { id: 'glass' as const, label: 'Glass Codex', desc: 'Dark glassmorphic, Inter Variable, tonal elevation' },
    { id: 'bleeding' as const, label: 'Bleeding Edge', desc: 'Scroll-driven reveals, anchor popovers, OKLCH' },
  ];
</script>

<svelte:head>
  <title>Guide Redesign Prototype — TKA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,400;1,600;1,700&family=Inter:opsz,wght@14..32,300..800&display=swap" rel="stylesheet" />
</svelte:head>

<!-- Theme switcher bar -->
<div class="switcher-bar">
  <span class="switcher-label">Compare:</span>
  {#each themes as t}
    <button
      class="switcher-btn"
      class:active={activeTheme === t.id}
      onclick={() => activeTheme = t.id}
    >
      <strong>{t.label}</strong>
      <span>{t.desc}</span>
    </button>
  {/each}
</div>

<!-- ═══════════════════════════════════════════════════════════════
     THEME A: Current (2012-era)
     ═══════════════════════════════════════════════════════════════ -->
{#if activeTheme === 'current'}
<div class="theme-current">
  <div class="sidebar-current">
    <nav class="nav-current">
      <div class="nav-title-current">Level 1 Guide</div>
      <div class="chapter-group-current">
        <button type="button" class="chapter-link-current active">1.0 - Placements & Motions</button>
        <ul class="section-list-current">
          <li><button type="button" class="section-link-current active">The Grid</button></li>
          <li><button type="button" class="section-link-current">Hand Placements</button></li>
          <li><button type="button" class="section-link-current">Hand Motions</button></li>
          <li><button type="button" class="section-link-current">Types 1–6</button></li>
          <li><button type="button" class="section-link-current">Staff Placements</button></li>
          <li><button type="button" class="section-link-current">Negative Space</button></li>
        </ul>
      </div>
      <div class="chapter-group-current">
        <button type="button" class="chapter-link-current">1.1 - Letters</button>
      </div>
      <div class="chapter-group-current">
        <button type="button" class="chapter-link-current">1.2 - Words & LOOPs</button>
      </div>
    </nav>
  </div>
  <main class="content-current">
    <h1 class="h1-current">Placements & Motions</h1>

    <section class="section-current">
      <h2 class="h2-current">The Grid</h2>
      <p class="p-current">
        The Kinetic Alphabet is built on a grid system that maps the space around the performer.
        Think of it as a compass rose — four cardinal points (north, south, east, west) define the
        primary positions where your hands can be.
      </p>
      <figure class="diagram-current">
        <img src="/guide/level-1/images/hand-placements/α1.png" alt="Alpha placement 1" />
        <figcaption>Alpha placement — both hands at the same cardinal point</figcaption>
      </figure>
      <p class="p-current">
        Each grid point is a location where one or both hands can rest between motions. The grid gives
        us a shared vocabulary for describing exactly where the staves are at any moment in a sequence.
      </p>
    </section>

    <section class="section-current">
      <h2 class="h2-current">Hand Placements</h2>
      <p class="p-current">
        There are three fundamental hand placement types, named with Greek letters:
        <strong>alpha</strong> (α) — both hands at the same point,
        <strong>beta</strong> (β) — hands at opposite points, and
        <strong>gamma</strong> (Γ) — hands at a right angle.
      </p>
      <div class="grid-row-current">
        <figure class="diagram-current small">
          <img src="/guide/level-1/images/hand-placements/α1.png" alt="Alpha" />
          <figcaption>Alpha (α)</figcaption>
        </figure>
        <figure class="diagram-current small">
          <img src="/guide/level-1/images/hand-placements/β1.png" alt="Beta" />
          <figcaption>Beta (β)</figcaption>
        </figure>
        <figure class="diagram-current small">
          <img src="/guide/level-1/images/hand-placements/Γ1.png" alt="Gamma" />
          <figcaption>Gamma (Γ)</figcaption>
        </figure>
      </div>
    </section>

    <section class="section-current">
      <h2 class="h2-current">Hand Motions</h2>
      <p class="p-current">
        Motions describe how hands travel between positions. The three base motion types are
        <strong>shift</strong> (hand moves to an adjacent grid point),
        <strong>dash</strong> (hand stays in place but changes orientation), and
        <strong>static</strong> (hand doesn't move at all).
      </p>
      <div class="grid-row-current">
        <figure class="diagram-current small">
          <img src="/guide/level-1/images/hand-motions/shift_north.png" alt="Shift north" />
          <figcaption>Shift</figcaption>
        </figure>
        <figure class="diagram-current small">
          <img src="/guide/level-1/images/hand-motions/dash_east.png" alt="Dash east" />
          <figcaption>Dash</figcaption>
        </figure>
        <figure class="diagram-current small">
          <img src="/guide/level-1/images/hand-motions/static_west.png" alt="Static west" />
          <figcaption>Static</figcaption>
        </figure>
      </div>
    </section>
  </main>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     THEME B: Glass Codex
     ═══════════════════════════════════════════════════════════════ -->
{:else if activeTheme === 'glass'}
<div class="theme-glass">
  <div class="sidebar-glass">
    <nav class="nav-glass">
      <div class="nav-title-glass">Level 1 Guide</div>
      <div class="chapter-group-glass">
        <button class="chapter-link-glass active">
          <span class="chapter-number">1.0</span>
          Placements & Motions
          <span class="progress-fill" style="width: 35%"></span>
        </button>
        <ul class="section-list-glass">
          <li><button type="button" class="section-link-glass active">The Grid</button></li>
          <li><button type="button" class="section-link-glass">Hand Placements</button></li>
          <li><button type="button" class="section-link-glass">Hand Motions</button></li>
          <li><button type="button" class="section-link-glass">Types 1–6</button></li>
          <li><button type="button" class="section-link-glass">Staff Placements</button></li>
          <li><button type="button" class="section-link-glass">Negative Space</button></li>
        </ul>
      </div>
      <div class="chapter-group-glass">
        <button class="chapter-link-glass">
          <span class="chapter-number">1.1</span>
          Letters
          <span class="progress-fill" style="width: 0%"></span>
        </button>
      </div>
      <div class="chapter-group-glass">
        <button class="chapter-link-glass">
          <span class="chapter-number">1.2</span>
          Words & LOOPs
          <span class="progress-fill" style="width: 0%"></span>
        </button>
      </div>
    </nav>
  </div>
  <main class="content-glass">
    <!-- Reading progress bar -->
    <div class="reading-progress" aria-hidden="true"></div>

    <h1 class="h1-glass">Placements & Motions</h1>
    <p class="chapter-intro-glass">The spatial language that makes choreography writable.</p>

    <section class="section-glass">
      <h2 class="h2-glass">The Grid</h2>
      <p class="p-glass">
        The Kinetic Alphabet is built on a grid system that maps the space around the performer.
        Think of it as a compass rose — four cardinal points (north, south, east, west) define the
        primary positions where your hands can be.
      </p>
      <figure class="diagram-glass">
        <div class="diagram-frame">
          <img src="/guide/level-1/images/hand-placements/α1.png" alt="Alpha placement 1" />
        </div>
        <figcaption>Alpha placement — both hands at the same cardinal point</figcaption>
      </figure>
      <p class="p-glass">
        Each grid point is a location where one or both hands can rest between motions. The grid gives
        us a shared vocabulary for describing exactly where the staves are at any moment in a sequence.
      </p>
    </section>

    <section class="section-glass">
      <h2 class="h2-glass">Hand Placements</h2>
      <p class="p-glass">
        There are three fundamental hand placement types, named with Greek letters:
        <strong>alpha</strong> (α) — both hands at the same point,
        <strong>beta</strong> (β) — hands at opposite points, and
        <strong>gamma</strong> (Γ) — hands at a right angle.
      </p>
      <div class="picto-row-glass">
        <figure class="picto-card-glass">
          <div class="picto-frame">
            <img src="/guide/level-1/images/hand-placements/α1.png" alt="Alpha" />
          </div>
          <figcaption>Alpha (α)</figcaption>
        </figure>
        <figure class="picto-card-glass">
          <div class="picto-frame">
            <img src="/guide/level-1/images/hand-placements/β1.png" alt="Beta" />
          </div>
          <figcaption>Beta (β)</figcaption>
        </figure>
        <figure class="picto-card-glass">
          <div class="picto-frame">
            <img src="/guide/level-1/images/hand-placements/Γ1.png" alt="Gamma" />
          </div>
          <figcaption>Gamma (Γ)</figcaption>
        </figure>
      </div>
    </section>

    <section class="section-glass">
      <h2 class="h2-glass">Hand Motions</h2>
      <p class="p-glass">
        Motions describe how hands travel between positions. The three base motion types are
        <strong>shift</strong> (hand moves to an adjacent grid point),
        <strong>dash</strong> (hand stays in place but changes orientation), and
        <strong>static</strong> (hand doesn't move at all).
      </p>
      <div class="picto-row-glass">
        <figure class="picto-card-glass">
          <div class="picto-frame">
            <img src="/guide/level-1/images/hand-motions/shift_north.png" alt="Shift north" />
          </div>
          <figcaption>Shift</figcaption>
        </figure>
        <figure class="picto-card-glass">
          <div class="picto-frame">
            <img src="/guide/level-1/images/hand-motions/dash_east.png" alt="Dash east" />
          </div>
          <figcaption>Dash</figcaption>
        </figure>
        <figure class="picto-card-glass">
          <div class="picto-frame">
            <img src="/guide/level-1/images/hand-motions/static_west.png" alt="Static west" />
          </div>
          <figcaption>Static</figcaption>
        </figure>
      </div>
    </section>
  </main>
</div>

<!-- ═══════════════════════════════════════════════════════════════
     THEME C: Bleeding Edge — Full-bleed content grid layout
     Prose stays at readable measure. Diagrams + pictographs break
     out to fill available space. Container queries on everything.
     ═══════════════════════════════════════════════════════════════ -->
{:else}
<div class="theme-bleeding">
  <div class="sidebar-bleeding">
    <nav class="nav-bleeding">
      <div class="nav-title-bleeding">
        <span class="nav-icon">&#x25C6;</span>
        Level 1
      </div>
      <div class="chapter-group-bleeding">
        <button class="chapter-link-bleeding active">
          <span class="dot active"></span>
          Placements & Motions
        </button>
        <ul class="section-list-bleeding">
          <li><button type="button" class="section-link-bleeding active">The Grid</button></li>
          <li><button type="button" class="section-link-bleeding">Hand Placements</button></li>
          <li><button type="button" class="section-link-bleeding">Hand Motions</button></li>
          <li><button type="button" class="section-link-bleeding">Types 1–6</button></li>
          <li><button type="button" class="section-link-bleeding">Staff Placements</button></li>
          <li><button type="button" class="section-link-bleeding">Negative Space</button></li>
        </ul>
      </div>
      <div class="chapter-group-bleeding">
        <button class="chapter-link-bleeding">
          <span class="dot"></span>
          Letters
        </button>
      </div>
      <div class="chapter-group-bleeding">
        <button class="chapter-link-bleeding">
          <span class="dot"></span>
          Words & LOOPs
        </button>
      </div>
    </nav>
  </div>

  <!-- Full-bleed content grid: prose | breakout | full -->
  <main class="content-bleeding">
    <div class="reading-progress-bleeding" aria-hidden="true"></div>

    <div class="hero-bleeding full">
      <span class="chapter-badge">Chapter 1.0</span>
      <h1 class="h1-bleeding">Placements &<br/>Motions</h1>
      <p class="hero-sub">The spatial language that makes choreography writable.</p>
    </div>

    <section class="section-bleeding reveal">
      <div class="prose">
        <h2 class="h2-bleeding">The Grid</h2>
        <p class="p-bleeding">
          The Kinetic Alphabet is built on a grid system that maps the space around the performer.
          Think of it as a compass rose — four
          <span class="term">cardinal points<span class="term-tip">North, south, east, west — the four primary grid positions.</span></span>
          define the primary positions where your hands can be.
        </p>
      </div>
      <figure class="diagram-bleeding breakout">
        <div class="diagram-frame-bleeding">
          <img src="/guide/level-1/images/hand-placements/α1.png" alt="Alpha placement 1" />
        </div>
        <figcaption>
          <span class="caption-label">Alpha placement</span>
          <span class="caption-desc">Both hands at the same cardinal point</span>
        </figcaption>
      </figure>
      <div class="prose">
        <p class="p-bleeding">
          Each grid point is a location where one or both hands can rest between motions. The grid gives
          us a shared vocabulary for describing exactly where the staves are at any moment in a sequence.
        </p>
      </div>
    </section>

    <section class="section-bleeding reveal">
      <div class="prose">
        <h2 class="h2-bleeding">Hand Placements</h2>
        <p class="p-bleeding">
          Three fundamental placement types, named with Greek letters:
          <span class="term">alpha<span class="term-tip">α — Both hands at the same grid point.</span></span> (α),
          <span class="term">beta<span class="term-tip">β — Hands at opposite grid points (180° apart).</span></span> (β), and
          <span class="term">gamma<span class="term-tip">Γ — Hands at a right angle (90° apart).</span></span> (Γ).
        </p>
      </div>
      <div class="picto-row-bleeding full">
        <figure class="picto-card-bleeding">
          <div class="picto-frame-bleeding">
            <img src="/guide/level-1/images/hand-placements/α1.png" alt="Alpha" />
          </div>
          <figcaption>Alpha (α)</figcaption>
        </figure>
        <figure class="picto-card-bleeding">
          <div class="picto-frame-bleeding">
            <img src="/guide/level-1/images/hand-placements/β1.png" alt="Beta" />
          </div>
          <figcaption>Beta (β)</figcaption>
        </figure>
        <figure class="picto-card-bleeding">
          <div class="picto-frame-bleeding">
            <img src="/guide/level-1/images/hand-placements/Γ1.png" alt="Gamma" />
          </div>
          <figcaption>Gamma (Γ)</figcaption>
        </figure>
      </div>
    </section>

    <section class="section-bleeding reveal">
      <div class="prose">
        <h2 class="h2-bleeding">Hand Motions</h2>
        <p class="p-bleeding">
          Motions describe how hands travel between positions:
          <span class="term">shift<span class="term-tip">Hand moves to an adjacent grid point.</span></span>,
          <span class="term">dash<span class="term-tip">Hand moves in a straight line to the opposite grid point.</span></span>, and
          <span class="term">static<span class="term-tip">Hand doesn't move at all.</span></span>.
        </p>
      </div>
      <div class="picto-row-bleeding full">
        <figure class="picto-card-bleeding">
          <div class="picto-frame-bleeding">
            <img src="/guide/level-1/images/hand-motions/shift_north.png" alt="Shift north" />
          </div>
          <figcaption>Shift</figcaption>
        </figure>
        <figure class="picto-card-bleeding">
          <div class="picto-frame-bleeding">
            <img src="/guide/level-1/images/hand-motions/dash_east.png" alt="Dash east" />
          </div>
          <figcaption>Dash</figcaption>
        </figure>
        <figure class="picto-card-bleeding">
          <div class="picto-frame-bleeding">
            <img src="/guide/level-1/images/hand-motions/static_west.png" alt="Static west" />
          </div>
          <figcaption>Static</figcaption>
        </figure>
      </div>
    </section>

    <!-- Full-width grid comparison — uses ALL available space -->
    <section class="section-bleeding reveal">
      <div class="prose">
        <h2 class="h2-bleeding">Placement Comparison</h2>
        <p class="p-bleeding">
          All three placement types at a glance. On wider screens this grid expands to fill the viewport.
          On narrower screens it reflows to fewer columns — no wasted space at any breakpoint.
        </p>
      </div>
      <div class="placement-grid full">
        <div class="placement-group">
          <h3 class="placement-group-title">Alpha (α)</h3>
          <div class="placement-group-cards">
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/α1.png" alt="α1" /></div><figcaption>α1</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/α3.png" alt="α3" /></div><figcaption>α3</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/α5.png" alt="α5" /></div><figcaption>α5</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/α7.png" alt="α7" /></div><figcaption>α7</figcaption></figure>
          </div>
        </div>
        <div class="placement-group">
          <h3 class="placement-group-title">Beta (β)</h3>
          <div class="placement-group-cards">
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/β1.png" alt="β1" /></div><figcaption>β1</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/β3.png" alt="β3" /></div><figcaption>β3</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/β5.png" alt="β5" /></div><figcaption>β5</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/β7.png" alt="β7" /></div><figcaption>β7</figcaption></figure>
          </div>
        </div>
        <div class="placement-group">
          <h3 class="placement-group-title">Gamma (Γ)</h3>
          <div class="placement-group-cards">
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/Γ1.png" alt="Γ1" /></div><figcaption>Γ1</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/Γ3.png" alt="Γ3" /></div><figcaption>Γ3</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/Γ5.png" alt="Γ5" /></div><figcaption>Γ5</figcaption></figure>
            <figure class="picto-card-bleeding"><div class="picto-frame-bleeding"><img src="/guide/level-1/images/hand-placements/Γ7.png" alt="Γ7" /></div><figcaption>Γ7</figcaption></figure>
          </div>
        </div>
      </div>
    </section>
  </main>
</div>
{/if}

<style>
  /* ══════════════════════════════════════════
     SWITCHER BAR
     ══════════════════════════════════════════ */
  .switcher-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(10, 10, 10, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .switcher-label {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.8rem;
    margin-right: 4px;
  }
  .switcher-btn {
    display: flex;
    flex-direction: column;
    padding: 6px 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 150ms ease;
    font-size: 0.75rem;
    text-align: left;
    min-height: 44px;
  }
  .switcher-btn strong {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.9);
  }
  .switcher-btn.active {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
  }
  .switcher-btn.active strong {
    color: #c7d2fe;
  }
  .switcher-btn:hover:not(.active) {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }

  /* ══════════════════════════════════════════
     THEME A: CURRENT (2012)
     ══════════════════════════════════════════ */
  .theme-current {
    display: flex;
    min-height: 100vh;
    background: #fafafa;
    color: #1a1a1a;
    padding-top: 64px;
  }
  .sidebar-current {
    position: fixed;
    top: 64px;
    left: 0;
    width: 260px;
    height: calc(100vh - 64px);
    overflow-y: auto;
    background: #fff;
    border-right: 1px solid #e5e5e5;
    padding: 1.5rem 1rem;
  }
  .content-current {
    margin-left: 260px;
    max-width: 860px;
    padding: 3rem 2rem 6rem;
  }
  .h1-current {
    font-family: 'Playfair Display', Georgia, serif;
    font-style: italic;
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 1rem;
    color: #1a1a1a;
  }
  .h2-current {
    font-family: 'Playfair Display', Georgia, serif;
    font-style: italic;
    font-size: 1.75rem;
    font-weight: 600;
    margin: 3rem 0 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e5e5;
    color: #1a1a1a;
  }
  .p-current {
    font-size: 1.05rem;
    line-height: 1.7;
    margin: 0 0 1rem;
    color: #333;
  }
  .section-current {
    margin-bottom: 4rem;
  }
  .diagram-current {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 1.5rem 0;
  }
  .diagram-current img {
    max-width: 280px;
    height: auto;
    border-radius: 4px;
  }
  .diagram-current.small img {
    max-width: 160px;
  }
  .diagram-current figcaption {
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
    text-align: center;
    font-style: italic;
  }
  .grid-row-current {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    flex-wrap: wrap;
    margin: 1.5rem 0;
  }
  /* Nav */
  .nav-title-current {
    font-weight: 700;
    font-size: 1rem;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
    color: #1a1a1a;
  }
  .chapter-group-current { margin-bottom: 1rem; }
  .chapter-link-current {
    display: block;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0.4rem 0;
    color: #333;
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
  }
  .chapter-link-current.active { color: #4ea7e8; }
  .section-list-current {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .section-link-current {
    display: block;
    font-size: 0.8rem;
    padding: 0.3rem 0 0.3rem 1rem;
    color: #666;
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
  }
  .section-link-current.active { color: #4ea7e8; font-weight: 600; }

  /* ══════════════════════════════════════════
     THEME B: GLASS CODEX
     ══════════════════════════════════════════ */
  .theme-glass {
    display: flex;
    min-height: 100vh;
    background: #0c0c14;
    color: #e0e0e8;
    padding-top: 64px;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .sidebar-glass {
    position: fixed;
    top: 64px;
    left: 0;
    width: 260px;
    height: calc(100vh - 64px);
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.03);
    border-right: 1px solid rgba(99, 102, 241, 0.12);
    backdrop-filter: blur(20px);
    padding: 1.5rem 0.75rem;
  }
  .content-glass {
    margin-left: 260px;
    max-width: 760px;
    padding: 3rem 2.5rem 6rem;
    position: relative;
  }
  .reading-progress {
    position: fixed;
    top: 64px;
    left: 260px;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #6366f1, #a78bfa);
    transform-origin: left;
    transform: scaleX(0.35);
    z-index: 100;
    border-radius: 0 2px 2px 0;
  }
  .h1-glass {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 2.8rem;
    font-weight: 700;
    font-variation-settings: 'opsz' 32;
    letter-spacing: -0.03em;
    margin: 0 0 0.25rem;
    color: #f0f0f8;
    line-height: 1.1;
  }
  .chapter-intro-glass {
    font-size: 1.15rem;
    color: rgba(255, 255, 255, 0.45);
    margin: 0 0 3rem;
    font-weight: 300;
  }
  .h2-glass {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 650;
    font-variation-settings: 'opsz' 24;
    letter-spacing: -0.02em;
    margin: 0 0 1rem;
    color: #e8e8f0;
  }
  .p-glass {
    font-size: 1.05rem;
    font-variation-settings: 'opsz' 16;
    line-height: 1.7;
    margin: 0 0 1.25rem;
    color: rgba(255, 255, 255, 0.72);
    font-weight: 370;
  }
  .p-glass strong {
    color: #c7d2fe;
    font-weight: 600;
  }
  .section-glass {
    margin-bottom: 4rem;
    padding: 2rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(99, 102, 241, 0.08);
    border-radius: 16px;
    backdrop-filter: blur(8px);
  }
  .diagram-glass {
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .diagram-frame {
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
  }
  .diagram-frame img {
    max-width: 260px;
    height: auto;
    border-radius: 4px;
  }
  .diagram-glass figcaption {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 0.75rem;
    text-align: center;
  }
  .picto-row-glass {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
    margin: 1.5rem 0;
  }
  .picto-card-glass {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .picto-frame {
    width: 150px;
    height: 150px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(99, 102, 241, 0.1);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .picto-frame:hover {
    border-color: rgba(99, 102, 241, 0.25);
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.08);
  }
  .picto-frame img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .picto-card-glass figcaption {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 500;
  }
  /* Glass nav */
  .nav-title-glass {
    font-weight: 700;
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-variation-settings: 'opsz' 14;
  }
  .chapter-group-glass { margin-bottom: 0.5rem; }
  .chapter-link-glass {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-weight: 550;
    font-size: 0.85rem;
    padding: 0.6rem 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    overflow: clip;
    text-align: left;
    transition: all 150ms ease;
  }
  .chapter-link-glass:hover {
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.8);
  }
  .chapter-link-glass.active {
    color: #c7d2fe;
    background: rgba(99, 102, 241, 0.08);
  }
  .chapter-number {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(99, 102, 241, 0.6);
    min-width: 24px;
  }
  .progress-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: linear-gradient(90deg, #6366f1, #a78bfa);
    border-radius: 1px;
    transition: width 300ms ease;
  }
  .section-list-glass {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0.5rem;
  }
  .section-link-glass {
    display: block;
    font-size: 0.8rem;
    padding: 0.35rem 0.75rem 0.35rem 2.5rem;
    color: rgba(255, 255, 255, 0.4);
    text-decoration: none;
    border-radius: 6px;
    transition: all 100ms ease;
    font-weight: 400;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
  }
  .section-link-glass:hover {
    color: rgba(255, 255, 255, 0.65);
    background: rgba(255, 255, 255, 0.03);
  }
  .section-link-glass.active {
    color: #a5b4fc;
    font-weight: 550;
    background: rgba(99, 102, 241, 0.06);
  }

  /* ══════════════════════════════════════════
     THEME C: BLEEDING EDGE — Full-bleed grid
     ══════════════════════════════════════════ */
  .theme-bleeding {
    display: flex;
    min-height: 100vh;
    background: oklch(0.13 0.015 270);
    color: oklch(0.90 0.01 270);
    padding-top: 64px;
    font-family: 'Inter', system-ui, sans-serif;
  }

  /* Sidebar — compact, glass */
  .sidebar-bleeding {
    position: fixed;
    top: 64px;
    left: 0;
    width: 220px;
    height: calc(100vh - 64px);
    overflow-y: auto;
    overflow-x: clip;
    background: oklch(0.15 0.02 270 / 0.6);
    border-right: 1px solid oklch(0.30 0.04 270 / 0.3);
    backdrop-filter: blur(24px);
    padding: 1.5rem 0.75rem;
  }

  /*
   * Full-bleed content grid.
   * Three named columns: [full-start] ... [prose-start] 65ch [prose-end] ... [full-end]
   * Prose children land in the center 65ch column.
   * .breakout children span wider. .full children span edge-to-edge.
   */
  .content-bleeding {
    margin-left: 220px;
    display: grid;
    grid-template-columns:
      [full-start] minmax(1.5rem, 1fr)
      [breakout-start] minmax(0, 6rem)
      [prose-start] min(65ch, 100%)
      [prose-end] minmax(0, 6rem)
      [breakout-end] minmax(1.5rem, 1fr)
      [full-end];
    padding-bottom: 6rem;
    position: relative;
  }

  /* Default: children go in prose column */
  .content-bleeding > * {
    grid-column: prose;
  }
  /* Breakout: wider than prose, not edge-to-edge */
  .content-bleeding :global(.breakout),
  .breakout {
    grid-column: breakout;
  }
  /* Full: edge-to-edge of content area */
  .content-bleeding :global(.full),
  .full {
    grid-column: full;
  }

  /* Sections span full then manage their own children */
  .section-bleeding {
    grid-column: full;
    display: grid;
    grid-template-columns: subgrid;
    margin-bottom: 2rem;
    padding: 2rem 0;
    background: oklch(0.16 0.018 270 / 0.4);
    border: 1px solid oklch(0.30 0.04 270 / 0.1);
    border-radius: 20px;
    backdrop-filter: blur(12px);
    box-shadow:
      0 8px 32px oklch(0.05 0.02 270 / 0.25),
      inset 0 1px 0 oklch(0.40 0.04 270 / 0.06);
  }

  /* Prose blocks within sections */
  .section-bleeding > .prose {
    grid-column: prose;
    padding: 0 2rem;
  }
  .section-bleeding > .breakout {
    grid-column: breakout;
  }
  .section-bleeding > .full {
    grid-column: full;
    padding: 0 1.5rem;
  }

  /* Reading progress */
  .reading-progress-bleeding {
    grid-column: full;
    position: fixed;
    top: 64px;
    left: 220px;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, oklch(0.65 0.22 270), oklch(0.70 0.18 300));
    transform-origin: left;
    transform: scaleX(0.35);
    z-index: 100;
  }

  /* Hero */
  .hero-bleeding {
    grid-column: full;
    padding: 4rem 0 3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .chapter-badge {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: oklch(0.70 0.18 270);
    padding: 4px 12px;
    border: 1px solid oklch(0.45 0.15 270 / 0.3);
    border-radius: 100px;
    margin-bottom: 1rem;
  }
  .h1-bleeding {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: clamp(2.4rem, 1.8rem + 2vw, 4.2rem);
    font-weight: 750;
    font-variation-settings: 'opsz' 32;
    letter-spacing: -0.04em;
    line-height: 1.05;
    color: oklch(0.95 0.01 270);
    margin: 0 0 0.75rem;
  }
  .hero-sub {
    font-size: clamp(1rem, 0.8rem + 0.6vw, 1.3rem);
    color: oklch(0.55 0.02 270);
    font-weight: 350;
    margin: 0;
  }

  /* Typography */
  .h2-bleeding {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: clamp(1.3rem, 1rem + 0.8vw, 1.75rem);
    font-weight: 650;
    font-variation-settings: 'opsz' 24;
    letter-spacing: -0.015em;
    margin: 0 0 1rem;
    color: oklch(0.88 0.02 270);
  }
  .p-bleeding {
    font-size: clamp(0.95rem, 0.9rem + 0.2vw, 1.1rem);
    font-variation-settings: 'opsz' 16;
    line-height: 1.72;
    margin: 0 0 1.25rem;
    color: oklch(0.72 0.01 270);
    font-weight: 370;
  }
  /* Scroll-driven section reveals */
  @supports (animation-timeline: view()) {
    .section-bleeding.reveal {
      animation: reveal-up linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 30%;
    }
    @keyframes reveal-up {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }
  }

  /* Glossary term hover hints */
  .term {
    position: relative;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-decoration-color: oklch(0.50 0.12 270);
    text-underline-offset: 3px;
    cursor: help;
    color: oklch(0.80 0.10 270);
  }
  .term-tip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 14px;
    background: oklch(0.22 0.03 270 / 0.95);
    border: 1px solid oklch(0.35 0.06 270 / 0.4);
    border-radius: 10px;
    backdrop-filter: blur(16px);
    font-size: 0.82rem;
    color: oklch(0.85 0.01 270);
    max-width: 300px;
    white-space: normal;
    box-shadow: 0 8px 24px oklch(0.05 0.01 270 / 0.4);
    z-index: 50;
    font-weight: 400;
    text-decoration: none;
    line-height: 1.4;
  }
  .term:hover .term-tip,
  .term:focus .term-tip {
    display: block;
  }

  /* Diagrams — breakout width */
  .diagram-bleeding {
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .diagram-frame-bleeding {
    padding: 1.5rem;
    background: oklch(0.14 0.015 270 / 0.6);
    border: 1px solid oklch(0.30 0.04 270 / 0.12);
    border-radius: 16px;
    box-shadow: inset 0 1px 0 oklch(0.35 0.03 270 / 0.1);
  }
  .diagram-frame-bleeding img {
    max-width: 320px;
    width: 100%;
    height: auto;
    border-radius: 6px;
  }
  .diagram-bleeding figcaption {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin-top: 0.75rem;
  }
  .caption-label {
    font-size: 0.85rem;
    font-weight: 550;
    color: oklch(0.75 0.06 270);
  }
  .caption-desc {
    font-size: 0.78rem;
    color: oklch(0.50 0.02 270);
  }

  /* Pictograph row — full width, auto-fill grid */
  .picto-row-bleeding {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
    justify-items: center;
  }

  /* Pictograph cards — container query responsive */
  .picto-card-bleeding {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }
  .picto-frame-bleeding {
    width: 100%;
    aspect-ratio: 1;
    max-width: 200px;
    padding: 12px;
    background: oklch(0.14 0.015 270 / 0.5);
    border: 1px solid oklch(0.30 0.04 270 / 0.15);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .picto-frame-bleeding:hover {
    border-color: oklch(0.50 0.15 270 / 0.35);
    box-shadow: 0 0 24px oklch(0.45 0.15 270 / 0.1);
  }
  .picto-frame-bleeding img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .picto-card-bleeding figcaption {
    font-size: 0.8rem;
    color: oklch(0.55 0.04 270);
    font-weight: 500;
  }

  /* Placement comparison grid — full width showcase */
  .placement-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin: 1rem 0;
  }
  .placement-group {
    background: oklch(0.15 0.015 270 / 0.5);
    border: 1px solid oklch(0.28 0.03 270 / 0.15);
    border-radius: 16px;
    padding: 1.25rem;
  }
  .placement-group-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: oklch(0.75 0.08 270);
    margin: 0 0 1rem;
    text-align: center;
    letter-spacing: 0.02em;
  }
  .placement-group-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.75rem;
    justify-items: center;
  }
  .placement-group-cards .picto-frame-bleeding {
    max-width: 140px;
  }

  /* Nav */
  .nav-title-bleeding {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 0.95rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1.5rem;
    color: oklch(0.70 0.10 270);
  }
  .nav-icon {
    font-size: 0.7rem;
    color: oklch(0.65 0.18 270);
  }
  .chapter-group-bleeding { margin-bottom: 0.5rem; }
  .chapter-link-bleeding {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    font-weight: 500;
    font-size: 0.85rem;
    padding: 0.55rem 0.75rem;
    color: oklch(0.55 0.02 270);
    background: none;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: all 150ms ease;
  }
  .chapter-link-bleeding:hover {
    background: oklch(0.20 0.02 270 / 0.4);
    color: oklch(0.75 0.04 270);
  }
  .chapter-link-bleeding.active {
    color: oklch(0.85 0.06 270);
    background: oklch(0.22 0.03 270 / 0.4);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: oklch(0.35 0.03 270);
    flex-shrink: 0;
    transition: all 200ms ease;
  }
  .dot.active {
    background: oklch(0.65 0.18 270);
    box-shadow: 0 0 8px oklch(0.60 0.18 270 / 0.5);
  }
  .section-list-bleeding {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0.5rem;
  }
  .section-link-bleeding {
    display: block;
    font-size: 0.78rem;
    padding: 0.35rem 0.75rem 0.35rem 2.25rem;
    color: oklch(0.45 0.02 270);
    text-decoration: none;
    border-radius: 8px;
    transition: all 100ms ease;
    font-weight: 400;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
  }
  .section-link-bleeding:hover {
    color: oklch(0.65 0.04 270);
    background: oklch(0.20 0.02 270 / 0.3);
  }
  .section-link-bleeding.active {
    color: oklch(0.78 0.10 270);
    font-weight: 550;
    background: oklch(0.25 0.04 270 / 0.3);
    position: relative;
  }
  .section-link-bleeding.active::before {
    content: '';
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 14px;
    background: oklch(0.65 0.18 270);
    border-radius: 2px;
  }
</style>
