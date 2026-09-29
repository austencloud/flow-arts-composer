<!--
  Half-motion notation — drawn mark A/B comparison

  Companion to docs/superpowers/specs/2026-07-16-half-notation-canon-design.md
  section 3 (the one open decision: how the "/" half-motion token is drawn on
  the turn number glyph). Self-contained — no feature-module imports.

  Renders the REAL turn number assets (static/images/numbers/*.svg) with the
  same alpha-extract recolor filter technique TurnsColumn.svelte uses
  (src/lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte), plus a
  programmatic cut-stroke overlay for two candidate treatments:

    A — cut through the number (A1 fixed-angle, A2 corner-to-corner)
    B — standalone mark beside the number (mimics a future dedicated asset)

  Treatment B won (ratified 2026-07-16). The final "Live component" section
  at the bottom breaks the "self-contained, no feature-module imports" rule
  above on purpose — it renders the REAL TurnsColumn.svelte (not a mock) with
  the shipped static/images/numbers/half.svg asset, so this page still proves
  the production component after the decision, not just the mockups that led
  to it.
-->
<script lang="ts">
  import TurnsColumn from "$lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";

  // Same swatch as TurnsColumn.svelte's STATIC_COLORS.light — the values
  // Austen actually looks at on a light background.
  const BLUE = "#3D44B8";
  const RED = "#DC2626";

  // Widths sourced from getTurnNumberWidth() in
  // src/lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser.ts — copied
  // here rather than imported, per the "inline everything" scope for this
  // throwaway comparison page.
  const NUMBERS = [
    { value: "0.5", width: 80 },
    { value: "1", width: 30 },
    { value: "1.5", width: 80 },
    { value: "2", width: 30 },
    { value: "2.5", width: 83.67 },
    { value: "3", width: 30 },
    { value: "float", width: 42.4 },
  ];

  const NUM_H = 45; // constant viewBox height across all number assets

  // Stroke weight: 1.svg's main leg is drawn `h9.81` inside a 30-wide/45-tall
  // viewBox — roughly 22% of the glyph height. A cut mark that thick would
  // fight the numeral's own weight instead of reading as an overlay, so this
  // uses ~10% of the glyph height (4.5 units) — a clearly thinner accent that
  // still has round-cap presence at this render scale.
  const STROKE_WIDTH = 4.5;

  // ~25 degrees off vertical, per the "/" token this mark stands in for.
  const ANGLE = (25 * Math.PI) / 180;
  const SIN = Math.sin(ANGLE);
  const COS = Math.cos(ANGLE);

  const A1_LENGTH = NUM_H * 1.15; // ~115% of the 45-unit height
  const MARK_GAP = 8; // units after the number's own width, for Treatment B
  const MARK_LENGTH = NUM_H * 0.6; // ~60% of number height, for Treatment B

  interface Line {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  /** A1 — fixed-angle cut, centered on the number's own width box. */
  function computeA1(width: number): Line {
    const cx = width / 2;
    const cy = NUM_H / 2;
    const dx = A1_LENGTH * SIN;
    const dy = A1_LENGTH * COS;
    return { x1: cx - dx / 2, y1: cy + dy / 2, x2: cx + dx / 2, y2: cy - dy / 2 };
  }

  /** A2 — literal corner-to-corner of the number's actual width box. */
  function computeA2(width: number): Line {
    return { x1: 0, y1: NUM_H, x2: width, y2: 0 };
  }

  /** B — standalone mark placed MARK_GAP units after the number's width. */
  function computeB(width: number): Line & { totalWidth: number } {
    const dx = MARK_LENGTH * SIN;
    const dy = MARK_LENGTH * COS;
    const cx = width + MARK_GAP + dx / 2;
    const cy = NUM_H / 2;
    return {
      x1: cx - dx / 2,
      y1: cy + dy / 2,
      x2: cx + dx / 2,
      y2: cy - dy / 2,
      totalWidth: width + MARK_GAP + dx,
    };
  }

  type Treatment = "A1" | "A2" | "B";

  function cellViewWidth(width: number, treatment: Treatment): number {
    return treatment === "B" ? computeB(width).totalWidth : width;
  }

  const RENDER_H = 90; // px — 2x the native 45-unit height, for legibility

  // In-situ mock glyph (letter B + turns column) — geometry ported from
  // calculateTurnPositions() in turn-position-calculator.ts, using the real
  // static/images/letters_trimmed/Type1/B.svg viewBox (28.04 -0.02 63.83
  // 100.06 -> width 63.83, height 100.06).
  const LETTER_W = 63.83;
  const LETTER_H = 100.06;
  const PADDING_X = 15;
  const PADDING_Y = 5;
  const BASE_X = LETTER_W + PADDING_X;
  const TOP_Y = -PADDING_Y;
  const BOTTOM_Y = LETTER_H - NUM_H + PADDING_Y;
  const COLUMN_WIDTH = 80; // max(getTurnNumberWidth("1.5"), getTurnNumberWidth("2"))
</script>

<svelte:head>
  <title>Half-notation drawn mark A/B</title>
</svelte:head>

{#snippet numberCell(num: (typeof NUMBERS)[number], treatment: Treatment, color: "blue" | "red", panelId: string)}
  {@const hex = color === "blue" ? BLUE : RED}
  {@const filterId = `f-${panelId}-${color}-${num.value.replace(".", "_")}-${treatment}`}
  {@const viewW = cellViewWidth(num.width, treatment)}
  {@const a1 = computeA1(num.width)}
  {@const a2 = computeA2(num.width)}
  {@const b = computeB(num.width)}
  <div class="num-cell">
    <svg
      viewBox="0 0 {viewW} {NUM_H}"
      height={RENDER_H}
      width={(viewW / NUM_H) * RENDER_H}
    >
      <defs>
        <filter id={filterId} color-interpolation-filters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="alpha-only"
          />
          <feFlood flood-color={hex} result="flood" />
          <feComposite in="flood" in2="alpha-only" operator="in" />
        </filter>
      </defs>
      <image
        href="/images/numbers/{num.value}.svg"
        width={num.width}
        height={NUM_H}
        filter="url(#{filterId})"
      />
      {#if treatment === "A1"}
        <line x1={a1.x1} y1={a1.y1} x2={a1.x2} y2={a1.y2} stroke={hex} stroke-width={STROKE_WIDTH} stroke-linecap="round" />
      {:else if treatment === "A2"}
        <line x1={a2.x1} y1={a2.y1} x2={a2.x2} y2={a2.y2} stroke={hex} stroke-width={STROKE_WIDTH} stroke-linecap="round" />
      {:else}
        <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={hex} stroke-width={STROKE_WIDTH} stroke-linecap="round" />
      {/if}
    </svg>
    <div class="num-label">{num.value}</div>
  </div>
{/snippet}

{#snippet colorRow(treatment: Treatment, color: "blue" | "red", panelId: string)}
  <div class="row">
    {#each NUMBERS as num (num.value)}
      {@render numberCell(num, treatment, color, panelId)}
    {/each}
  </div>
{/snippet}

{#snippet treatmentPanels(treatment: Treatment, idPrefix: string)}
  <div class="panels">
    <div class="panel panel-light">
      <div class="panel-label">white bg</div>
      {@render colorRow(treatment, "blue", `${idPrefix}-light-b`)}
      {@render colorRow(treatment, "red", `${idPrefix}-light-r`)}
    </div>
    <div class="panel panel-dark">
      <div class="panel-label">near-black bg (#111)</div>
      {@render colorRow(treatment, "blue", `${idPrefix}-dark-b`)}
      {@render colorRow(treatment, "red", `${idPrefix}-dark-r`)}
    </div>
  </div>
{/snippet}

{#snippet glyphContent(treatment: "A1" | "B", panelId: string)}
  {@const topFilterBlue = `g-${panelId}-top`}
  {@const bottomFilterRed = `g-${panelId}-bottom`}
  {@const a1 = computeA1(COLUMN_WIDTH)}
  {@const b = computeB(COLUMN_WIDTH)}
  <defs>
    <filter id={topFilterBlue} color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0"
        result="alpha-only"
      />
      <feFlood flood-color={BLUE} result="flood" />
      <feComposite in="flood" in2="alpha-only" operator="in" />
    </filter>
    <filter id={bottomFilterRed} color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0"
        result="alpha-only"
      />
      <feFlood flood-color={RED} result="flood" />
      <feComposite in="flood" in2="alpha-only" operator="in" />
    </filter>
  </defs>
  <image href="/images/letters_trimmed/Type1/B.svg" x="0" y="0" width={LETTER_W} height={LETTER_H} />
  <!-- top number: 1.5, halved (treatment applied) -->
  <g transform="translate({BASE_X}, {TOP_Y})">
    <image
      href="/images/numbers/1.5.svg"
      width={COLUMN_WIDTH}
      height={NUM_H}
      filter="url(#{topFilterBlue})"
      preserveAspectRatio="xMidYMin meet"
    />
    {#if treatment === "A1"}
      <line x1={a1.x1} y1={a1.y1} x2={a1.x2} y2={a1.y2} stroke={BLUE} stroke-width={STROKE_WIDTH} stroke-linecap="round" />
    {:else}
      <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={BLUE} stroke-width={STROKE_WIDTH} stroke-linecap="round" />
    {/if}
  </g>
  <!-- bottom number: 2, unhalved (no mark) -->
  <g transform="translate({BASE_X}, {BOTTOM_Y})">
    <image
      href="/images/numbers/2.svg"
      width={COLUMN_WIDTH}
      height={NUM_H}
      filter="url(#{bottomFilterRed})"
      preserveAspectRatio="xMidYMin meet"
    />
  </g>
{/snippet}

{#snippet glyphPreview(treatment: "A1" | "B", panelId: string, letterPx: number)}
  {@const contentWidth = treatment === "B" ? computeB(COLUMN_WIDTH).totalWidth : COLUMN_WIDTH}
  {@const pad = 10}
  {@const vbMinX = -pad}
  {@const vbMinY = Math.min(TOP_Y, 0) - pad}
  {@const vbW = BASE_X + contentWidth + pad * 2}
  {@const vbMaxY = BOTTOM_Y + NUM_H}
  {@const vbH = vbMaxY - vbMinY + pad}
  {@const scale = letterPx / LETTER_H}
  <svg viewBox="{vbMinX} {vbMinY} {vbW} {vbH}" height={vbH * scale} width={vbW * scale}>
    {@render glyphContent(treatment, panelId)}
  </svg>
{/snippet}

<div class="page">
  <header>
    <h1>Half-notation drawn mark — A/B</h1>
    <p class="intro">
      Pick the canonical drawn mark for halved motions — spec:
      <LinkChip size="inline" wrap href="/docs/superpowers/specs/2026-07-16-half-notation-canon-design.md">2026-07-16-half-notation-canon-design.md</LinkChip>
    </p>
  </header>

  <section>
    <h2>A1 — fixed-angle cut</h2>
    <p class="note">Same ~25&deg; stroke, length ~115% of the 45-unit height, centered on each number's own width box regardless of that number's width.</p>
    {@render treatmentPanels("A1", "a1")}
  </section>

  <section>
    <h2>A2 — corner-to-corner cut</h2>
    <p class="note">Stroke runs literally from the bottom-left to the top-right corner of each number's actual width box — angle varies with the number's width.</p>
    {@render treatmentPanels("A2", "a2")}
  </section>

  <section>
    <h2>B — mark beside the number</h2>
    <p class="note">A separate rounded-cap stroke, ~60% of number height, placed 8 units after the number's width — stands in for a future dedicated asset next to the number, float-style.</p>
    {@render treatmentPanels("B", "b")}
  </section>

  <section>
    <h2>In-situ preview — mock glyph corner</h2>
    <p class="note">Letter B (Type1) with a turns column: top &quot;1.5&quot; halved (mark applied), bottom &quot;2&quot; unhalved. Realistic proportions per calculateTurnPositions() — letter ~70px tall, and 2.5&times; zoomed.</p>

    <div class="glyph-grid">
      <div class="glyph-block">
        <h3>A1 applied</h3>
        <div class="panels">
          <div class="panel panel-light">
            <div class="panel-label">white bg &middot; 70px letter</div>
            {@render glyphPreview("A1", "gp-a1-light-small", 70)}
          </div>
          <div class="panel panel-dark">
            <div class="panel-label">near-black bg &middot; 70px letter</div>
            {@render glyphPreview("A1", "gp-a1-dark-small", 70)}
          </div>
        </div>
        <div class="panels">
          <div class="panel panel-light">
            <div class="panel-label">white bg &middot; 2.5&times; zoom</div>
            {@render glyphPreview("A1", "gp-a1-light-zoom", 175)}
          </div>
          <div class="panel panel-dark">
            <div class="panel-label">near-black bg &middot; 2.5&times; zoom</div>
            {@render glyphPreview("A1", "gp-a1-dark-zoom", 175)}
          </div>
        </div>
      </div>

      <div class="glyph-block">
        <h3>B applied</h3>
        <div class="panels">
          <div class="panel panel-light">
            <div class="panel-label">white bg &middot; 70px letter</div>
            {@render glyphPreview("B", "gp-b-light-small", 70)}
          </div>
          <div class="panel panel-dark">
            <div class="panel-label">near-black bg &middot; 70px letter</div>
            {@render glyphPreview("B", "gp-b-dark-small", 70)}
          </div>
        </div>
        <div class="panels">
          <div class="panel panel-light">
            <div class="panel-label">white bg &middot; 2.5&times; zoom</div>
            {@render glyphPreview("B", "gp-b-light-zoom", 175)}
          </div>
          <div class="panel panel-dark">
            <div class="panel-label">near-black bg &middot; 2.5&times; zoom</div>
            {@render glyphPreview("B", "gp-b-dark-zoom", 175)}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>Live component — TurnsColumn.svelte</h2>
    <p class="note">
      Treatment B, ratified 2026-07-16 - not a mock. This renders the
      production
      <code>src/lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte</code>
      standalone, fed by the real parser (<code>turn-tuple-parser.ts</code>)
      and the shipped <code>static/images/numbers/half.svg</code> asset. Left
      pair: "(1.5/, 2)" — top halved, bottom plain. Right pair: "(0/, 0)" — a
      halved 0-turn motion shows the mark alone (shouldDisplayTurn still hides
      bare "0"; the halved flag is what keeps the slot visible).
    </p>
    <div class="panels">
      <div class="panel panel-light">
        <div class="panel-label">white bg &middot; (1.5/, 2), letter B</div>
        <svg viewBox="0 0 160 140" width="320" height="280">
          <TurnsColumn
            turnsTuple="(1.5/, 2)"
            letter="B"
            letterDimensions={{ width: 63.83, height: 100.06 }}
            standalone={true}
            visible={true}
            instantAppear={true}
            x={20}
            y={20}
            darkMode={false}
          />
        </svg>
      </div>
      <div class="panel panel-dark">
        <div class="panel-label">near-black bg &middot; (1.5/, 2), letter B</div>
        <svg viewBox="0 0 160 140" width="320" height="280">
          <TurnsColumn
            turnsTuple="(1.5/, 2)"
            letter="B"
            letterDimensions={{ width: 63.83, height: 100.06 }}
            standalone={true}
            visible={true}
            instantAppear={true}
            x={20}
            y={20}
            darkMode={true}
          />
        </svg>
      </div>
    </div>
    <div class="panels">
      <div class="panel panel-light">
        <div class="panel-label">
          white bg &middot; (0/, 0), letter B — halved 0-turn, mark alone
        </div>
        <svg viewBox="0 0 160 140" width="320" height="280">
          <TurnsColumn
            turnsTuple="(0/, 0)"
            letter="B"
            letterDimensions={{ width: 63.83, height: 100.06 }}
            standalone={true}
            visible={true}
            instantAppear={true}
            x={20}
            y={20}
            darkMode={false}
          />
        </svg>
      </div>
      <div class="panel panel-dark">
        <div class="panel-label">
          near-black bg &middot; (0/, 0), letter B — halved 0-turn, mark alone
        </div>
        <svg viewBox="0 0 160 140" width="320" height="280">
          <TurnsColumn
            turnsTuple="(0/, 0)"
            letter="B"
            letterDimensions={{ width: 63.83, height: 100.06 }}
            standalone={true}
            visible={true}
            instantAppear={true}
            x={20}
            y={20}
            darkMode={true}
          />
        </svg>
      </div>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 32px 24px 96px;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1a1a1a;
  }

  header {
    margin-bottom: 40px;
  }

  h1 {
    font-size: 28px;
    margin: 0 0 8px;
  }

  .intro {
    font-size: 15px;
    color: #555;
    margin: 0;
  }

  .intro {
    --theme-accent: #3d44b8;
    --theme-text: #222;
  }

  section {
    margin-bottom: 56px;
  }

  h2 {
    font-size: 20px;
    margin: 0 0 6px;
    border-bottom: 2px solid #ddd;
    padding-bottom: 8px;
  }

  h3 {
    font-size: 16px;
    margin: 0 0 12px;
  }

  .note {
    font-size: 14px;
    color: #666;
    margin: 8px 0 20px;
    max-width: 900px;
  }

  .panels {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .panel {
    flex: 1 1 480px;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .panel-light {
    background: #ffffff;
    border: 1px solid #ddd;
  }

  .panel-dark {
    background: #111111;
    border: 1px solid #333;
  }

  .panel-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #999;
  }

  .row {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .num-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .num-cell svg {
    display: block;
  }

  .num-label {
    font-size: 11px;
    color: #888;
    font-variant-numeric: tabular-nums;
  }

  .glyph-grid {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .glyph-block .panels svg {
    display: block;
  }
</style>
