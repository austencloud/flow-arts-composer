<script lang="ts">
  /**
   * The notation, live. These columns are the formula a,b(h(±x±y±z)h'){Class}a',b'
   * with the variables spelled out as headings, using the simplified hand
   * substitution the written guide uses throughout.
   */
  import type { QftIncrement } from "#lib/shared/notation/qft/qft-model.js";

  interface Props {
    increments: QftIncrement[];
    activeStep: number;
    /**
     * Show only the step currently on screen, as a labelled strip.
     *
     * Eight rows of seven numbers are not readable on a 375px screen, and
     * forcing them there costs the animation the room it needs. On a small
     * screen the animation is the subject and the notation is its caption; on a
     * large one the whole table is legible at once, and the sweep down the
     * columns is itself worth seeing.
     */
    compact?: boolean;
  }

  let { increments, activeStep, compact = false }: Props = $props();

  const cell = (v: number | "n") => (v === "n" ? "n" : String(v));
</script>

{#if compact}
  <!--
    The notation as written, not as a spreadsheet.

    Seven labelled key/value pairs is the formula taken apart and its terms
    named one at a time, which is more reading than the whole line costs and
    still only shows one step. Written out — `a,b ( h / r / h' ) a',b'`, the
    published form — all eight fit a phone, so you get the sweep down the
    cycle instead of a caption for the frame on screen.
  -->
  <div class="script">
    <p class="legend" aria-hidden="true">
      prop,dir <span class="paren">(</span> hand / radius / hand
      <span class="paren">)</span> prop,dir
    </p>
    <ol class="lines">
      {#each increments as row, i (i)}
        <li class:active={i === activeStep}>
          <span class="idx">{i + 1}</span>
          <span class="line">
            <span class="term">{row.propDepart}</span><span class="punct"
              >,</span
            ><span class="term" class:unresolved={row.propDirDepart === "n"}
              >{cell(row.propDirDepart)}</span
            >
            <span class="punct">(</span>
            <span class="term">{row.handDepart}</span>
            <span class="punct">/</span>
            <span class="term dim">{row.radius}</span>
            <span class="punct">/</span>
            <span class="term">{row.handArrive}</span>
            <span class="punct">)</span>
            <span class="term">{row.propArrive}</span><span class="punct"
              >,</span
            ><span class="term" class:unresolved={row.propDirArrive === "n"}
              >{cell(row.propDirArrive)}</span
            >
          </span>
        </li>
      {/each}
    </ol>
  </div>
{:else}
<div class="wrap">
  <table>
    <caption class="sr-only">
      QfT notation rows for the current pattern, one row per eighth of a hand revolution
    </caption>
    <colgroup><col class="c-step" /></colgroup>
    <colgroup class="g-depart"><col /><col /><col /></colgroup>
    <colgroup class="g-radius"><col /></colgroup>
    <colgroup class="g-arrive"><col /><col /><col /></colgroup>
    <thead>
      <!--
        Two header rows because the seven columns are not seven peers: they are
        a departure, a radius, and an arrival. Reading them as one flat run of
        digits is what made this look like a spreadsheet.
      -->
      <tr class="groups">
        <td></td>
        <th scope="colgroup" colspan="3">Depart</th>
        <th scope="col">Radius</th>
        <th scope="colgroup" colspan="3">Arrive</th>
      </tr>
      <tr class="fields">
        <td><span class="sr-only">Step</span></td>
        <th scope="col">Prop</th>
        <th scope="col">Dir</th>
        <th scope="col">Hand</th>
        <th scope="col"><span class="sr-only">Radius</span></th>
        <th scope="col">Hand</th>
        <th scope="col">Dir</th>
        <th scope="col">Prop</th>
      </tr>
    </thead>
    <tbody>
      {#each increments as row, i (i)}
        <tr class:active={i === activeStep}>
          <th scope="row" class="step">{i + 1}</th>
          <td>{row.propDepart}</td>
          <td class:unresolved={row.propDirDepart === "n"}>{cell(row.propDirDepart)}</td>
          <td>{row.handDepart}</td>
          <td class="radius">{row.radius}</td>
          <td>{row.handArrive}</td>
          <td class:unresolved={row.propDirArrive === "n"}>{cell(row.propDirArrive)}</td>
          <td>{row.propArrive}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
{/if}

<style>
  /*
   * A real panel, not a tint.
   *
   * At 24% black over an animated starfield the notation read as a ghost — the
   * aurora bands showed straight through the inactive rows and the whole thing
   * looked like a placeholder. It is the subject of the page; it gets a surface,
   * a hairline and a shadow, and the background goes behind it rather than
   * through it.
   */
  .script,
  .wrap {
    border-radius: 0.85rem;
    border: 1px solid rgb(255 255 255 / 0.11);
    background: rgb(9 11 26 / 0.82);
    backdrop-filter: blur(14px);
    box-shadow:
      0 1px 0 rgb(255 255 255 / 0.05) inset,
      0 18px 40px rgb(0 0 0 / 0.35);
  }

  .script {
    padding: 0.6rem 0.75rem 0.7rem;
  }

  /* The formula, once. Not a label per value — the shape of the line, so the
     eight lines under it read without any of them being annotated. */
  .legend {
    margin: 0 0 0.4rem;
    /* Centred with the block it labels, rather than indented to line up with a
       left-pinned first column that no longer exists. */
    text-align: center;
    font-size: 0.66rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.38));
  }

  /*
   * Centred in its column, and each line only as wide as the line.
   *
   * Stretched to the full track, the eight lines sat hard left with the rest of
   * the panel empty beside them — the same dead space in one column that the
   * missing second column caused in a wide one. A block of notation centred in
   * its panel is a block of notation; the same block pinned left with 140px of
   * nothing to its right is a layout that ran out.
   */
  .lines {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    justify-items: center;
    gap: 0.06rem;
  }

  /*
   * The lines spread sideways into however many columns the panel they sit in
   * can actually hold — a function of the panel's width and nothing else.
   *
   * Gated on `max-height` this only fired on squashed windows, so a 500px-wide
   * phone in portrait ran eight 200px lines down the left of a 500px panel with
   * half the panel empty beside them. A column of lines does not become a
   * better column of lines because the window is tall.
   *
   * A container query, not a media query, because that panel is a different
   * width in every mode — a 416px reading column in the guide, a ~700px one in
   * the instrument. Keyed to the viewport this went three-up in both and clipped
   * the third column off the narrow one. Column counts are pinned per step
   * rather than auto-fit: with eight items, seven columns would strand the
   * eighth on a row of its own (.claude/rules/4k-native-layout.md).
   */
  /*
   * The steps: a line is about 10rem of tabular digits plus its 1.9rem index,
   * so each threshold is (columns × 12rem) + gaps + the panel's own padding,
   * rounded up. Sized off the CONTENT rather than off a round number, because
   * `white-space: nowrap` means a column an inch too narrow does not wrap — it
   * runs out the side of the panel.
   */
  @container notation (min-width: 24rem) {
    .lines {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(4, auto);
      grid-auto-flow: column;
      column-gap: clamp(1rem, 3vw, 2.5rem);
    }
  }

  @container notation (min-width: 34rem) {
    .lines {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(3, auto);
    }
  }

  /* Four before eight ever splits 5/3: two rows of four is the only other split
     of eight that leaves no short column. Needs 4 lines plus 3 gaps of real
     width, which is why it waits this long. */
  @container notation (min-width: 46rem) {
    .lines {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, auto);
    }
  }

  /* Every millimetre of panel chrome is a millimetre the lines do not get in a
     short pane. The lines themselves keep their size. */
  @media (max-height: 50rem) {
    .script {
      padding: 0.35rem 0.5rem 0.4rem;
    }

    .legend {
      margin-bottom: 0.25rem;
      font-size: 0.62rem;
    }
  }

  /* Tight on purpose: all eight lines have to be in the tray at once, or this is
     back to being a caption for the frame on screen. */
  .lines li {
    display: grid;
    grid-template-columns: 1.9rem auto;
    align-items: baseline;
    line-height: 1.35;
    /* Reserved so the active marker cannot shift the line when it appears. */
    border-left: 2px solid transparent;
    opacity: 0.52;
    transition: opacity 220ms ease;
  }

  .lines li.active {
    opacity: 1;
    border-left-color: var(--theme-accent, #8b5cf6);
  }

  .idx {
    padding-left: 0.5rem;
    font-size: 0.72rem;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.45));
    font-variant-numeric: tabular-nums;
  }

  .line {
    font-size: 1rem;
    /* Tabular so a 1 and an 8 are the same width: the eight lines have to stack
       into columns you can read straight down (.claude/rules/no-layout-shift.md). */
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /*
   * A shade smaller on the narrowest phones.
   *
   * At full size the eight lines plus their key come to 237px, and the dock's
   * tray caps at 227 — so the eighth line, the one that closes the cycle, was
   * cut in half. Nine per cent off the type buys the whole cycle back and comes
   * out of the panel, not out of the drawing above it.
   */
  @media (max-width: 26rem) {
    .line {
      font-size: 0.92rem;
    }

    .lines li {
      line-height: 1.3;
    }
  }

  .term {
    font-weight: 600;
    color: var(--semantic-text-primary, rgb(255 255 255 / 0.92));
  }

  .lines li.active .term {
    font-weight: 700;
  }

  .term.dim {
    font-weight: 500;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.6));
  }

  .term.unresolved {
    color: var(--semantic-warning, #fbbf24);
    font-style: italic;
  }

  .punct,
  .legend .paren {
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.35));
    font-weight: 400;
  }

  @media (prefers-reduced-motion: reduce) {
    .lines li {
      transition: none;
    }
  }

  .wrap {
    /*
     * Never the thing that shrinks. As a flex child in a squeezed column this
     * would otherwise collapse into a two-row sliver behind a scrollbar, which
     * is the one element on the page that must stay whole — it is the notation.
     */
    flex: none;
    overflow-x: auto;
  }

  table {
    width: 100%;
    /*
     * Fixed, so the active row can change weight without any column resizing
     * under it. With auto layout a bolder 8 is a wider 8, and the whole table
     * would breathe once a second.
     */
    table-layout: fixed;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .c-step {
    width: 2.6rem;
  }

  /* The three groups read as three things. Rules, not boxes — boxes would make
     it more of a spreadsheet, not less. */
  .g-radius,
  .g-arrive {
    border-left: 1px solid var(--semantic-border-subtle, rgb(255 255 255 / 0.14));
  }

  .groups th {
    padding: 0.65rem 0.4rem 0.15rem;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.42));
  }

  .fields th {
    padding: 0 0.4rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.15;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.62));
    white-space: nowrap;
  }

  thead {
    border-bottom: 1px solid var(--semantic-border-subtle, rgb(255 255 255 / 0.12));
  }

  tbody td,
  .step {
    padding: 0.5rem 0.4rem;
    text-align: center;
    font-size: 1.05rem;
    font-weight: 500;
    color: var(--semantic-text-primary, rgb(255 255 255 / 0.9));
  }

  /*
   * One row is the step on screen; the other seven are the context it sits in.
   * Everything recedes except the row the stage is currently drawing.
   */
  /* 0.52, not 0.38: the un-lit rows are CONTEXT, not decoration — you read the
     column down them — and at 0.38 on a dark panel they were barely there. */
  tbody tr {
    opacity: 0.52;
    transition: opacity 220ms ease;
  }

  tbody tr.active {
    opacity: 1;
  }

  .step {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.45));
    /* Reserved so the accent marker cannot move the digits when it appears. */
    border-left: 2px solid transparent;
  }

  tr.active .step {
    border-left-color: var(--theme-accent, #8b5cf6);
    color: var(--semantic-text-primary, rgb(255 255 255 / 0.9));
  }

  tr.active td {
    font-weight: 700;
  }

  /*
   * Past the 1680 seam the drawing beside this grows with the viewport and the
   * table does not — its height is eight rows of ramped type, which lands it at
   * about a third of the drawing's and reads as a small card parked next to a
   * big one. Row height is the one dimension there is room to spend, and spent
   * here it is air inside the panel rather than air around it
   * (.claude/rules/4k-native-layout.md, "use the vertical too").
   */
  /*
   * The height arm matters as much as the width one. Keyed on width alone this
   * fired at 1920x1080 — a wide screen with an ordinary amount of height — and
   * the eight taller rows pushed the instrument's column 42px past its pane.
   * 75rem is where there is genuinely height to spend.
   */
  @media (min-width: 105rem) and (min-height: 75rem) {
    tbody td,
    .step {
      padding-block: 0.85rem;
    }

    .groups th {
      padding-top: 1rem;
    }

    .fields th {
      padding-bottom: 0.85rem;
    }
  }

  td.radius {
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.62));
    font-size: 0.92rem;
  }

  td.unresolved {
    color: var(--semantic-warning, #fbbf24);
    font-style: italic;
  }

  @media (prefers-reduced-motion: reduce) {
    tbody tr {
      transition: none;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
