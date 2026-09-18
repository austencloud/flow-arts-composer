<script lang="ts">
  /**
   * /guide/ratios is a reference page, not a landing page. Every flower on it
   * is painted by the Shape Engine's own guide painter through
   * ShapeMatrixMandalaArt, and every number in the ladder table is derived from
   * the same domain functions the engine uses (ratioLabel, flowerPetals,
   * levelForTurnValue). Nothing here is a hand-written copy of engine data, so
   * the page cannot drift away from the app it documents.
   *
   * The axes come from the pure domain builder rather than the loaded engine
   * data, so every flower slot exists at first paint and the engine only fills
   * ink into boxes that already hold their size. The page keeps one painter for
   * all of its stills, the fixed blue and red guide inks, because the prose
   * names those colours; a reader's saved hand colours belong to the engine.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import ShapeMatrixGrid from "$lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ShapeMatrixMandalaArt from "$lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import {
    CLUB_ARTWORK_PAINTER,
    headerArtworkSrc,
  } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
  import { matrixFiltersForSize } from "$lib/shared/shape-matrix/domain/matrix-size-preset";
  import {
    buildFloatAxis,
    buildShapeMatrixAxis,
    flowerKey,
    flowerLabel,
    flowerPetals,
    ratioLabel,
    type Flower,
    type FlowerStyle,
    type RotatingFlower,
    type ShapePathStyle,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { matrixTurnsForLevel } from "$lib/shared/shape-matrix/domain/matrix-turn-band";
  import {
    levelForTurnValue,
    levelForTurns,
    turnValueToKey,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";
  import {
    KINETIC_SHAPE_ENGINE_AUTHOR,
    ORIGINAL_SHAPE_MATRIX_NAME,
    ORIGINAL_SHAPE_MATRIX_URL,
    SHAPE_ENGINE_SHORT_NAME,
    SPIN_SCIENCE_URL,
  } from "$lib/shared/shape-matrix/app/shape-engine-identity";

  /** The engine's own 144 band: three ratios, both styles, both starts, diamond. */
  const ORIGINAL_AXIS_FILTER = matrixFiltersForSize("large").left;
  const FAMILY_TURNS = [0, 1, 2] as const;

  /** The twelve original shapes, in the engine's own axis order. */
  const originalAxis = applyFilter(
    buildShapeMatrixAxis(),
    ORIGINAL_AXIS_FILTER,
    false
  );
  /** Tracks the matrix draws: one header plus one per shape on each axis. */
  const MATRIX_TRACKS = originalAxis.length + 1;

  function rotating(turns: number, style: FlowerStyle): RotatingFlower {
    return {
      style,
      turns,
      ori: "in",
      grid: "diamond",
      petals: flowerPetals({ style, turns }),
    };
  }

  const floatFlower = buildFloatAxis()[0]!;

  /** One row per turn value the Kinetic Alphabet can carry, Float included. */
  const ladder = matrixTurnsForLevel(4).map((turns: TurnValue) => ({
    turns,
    ratio: ratioLabel(turns),
    level: levelForTurnValue(turns),
    turnLabel: turns === "fl" ? "Float" : String(turns),
    family: turns === 0 || turns === 1 || turns === 2,
    pro: turns === "fl" ? null : rotating(turns as number, "pro"),
    anti: turns === "fl" ? null : rotating(turns as number, "anti"),
  }));

  const example = { pro: rotating(1, "pro"), anti: rotating(1, "anti") };

  const families = FAMILY_TURNS.map((turns) => ({
    turns,
    ratio: ratioLabel(turns),
    level: levelForTurns(turns, turns),
    shapes: originalAxis.filter((flower) => flower.turns === turns),
  }));

  function styleWord(style: ShapePathStyle): string {
    if (style === "float") return "Float";
    return style === "pro" ? "Prospin" : "Antispin";
  }

  function petalWord(petals: number): string {
    if (petals === 0) return "no petals";
    return `${petals} petal${petals === 1 ? "" : "s"}`;
  }

  /** A band opens at the level the ladder names for it, so the two agree. */
  function bandHref(turns: number): string {
    const key = turnValueToKey(turns);
    const params = new URLSearchParams({
      level: String(levelForTurns(turns, turns)),
      leftTurn: key,
      rightTurn: key,
      axis: "both",
      labels: "ratios",
      prop: "staff",
    });
    return `/shape-engine?${params}`;
  }

  function pairHref(left: Flower, right: Flower): string {
    const params = new URLSearchParams({
      level: String(levelForTurns(left.turns, right.turns)),
      leftTurn: turnValueToKey(left.turns),
      rightTurn: turnValueToKey(right.turns),
      left: flowerKey(left),
      right: flowerKey(right),
      axis: "both",
      labels: "ratios",
      prop: "staff",
    });
    return `/shape-engine?${params}`;
  }

  let data = $state<ShapeMatrixData | null>(null);
  let loadError = $state("");

  /** Blue hand ink, the same painter the matrix rows use. */
  function paintFlower(flower: Flower) {
    return (sizePx: number) =>
      data
        ? headerArtworkSrc(data, flower, "left", sizePx, CLUB_ARTWORK_PAINTER)
        : "";
  }

  onMount(async () => {
    try {
      data = await loadShapeMatrix();
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
    }
  });
</script>

<GuideSeo
  title="Spin ratios and Kinetic Alphabet turns · The Kinetic Alphabet Guide"
  description="Reference table for VTG spin ratios written hands to props, the Kinetic Alphabet turn value each one names, the petals it draws, and the 1:1, 1:3, and 1:5 families behind the 144 Shape Matrix."
  path="/guide/ratios"
  partOf={{ name: "The Kinetic Alphabet Guide", path: "/guide" }}
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Ratios", path: "/guide/ratios" },
  ]}
  datePublished="2026-09-04"
/>

<GuideShell>
  <article class="ratios guide-page-route" style="--tracks: {MATRIX_TRACKS}">
    <div class="opening">
      <header class="page-head">
        <h1>Spin ratios</h1>
        <p>
          A spin ratio counts one pattern twice: how many circles the hand
          travels, and how many rotations the prop makes over the same span. It
          is written hands first, so <strong>1:3</strong> is one hand circle to three
          prop rotations. The Kinetic Alphabet counts the same motion as turns, where
          one turn is 180 degrees of prop rotation on top of the base rotation the
          motion already carries.
        </p>
        <p>
          Lorq Nichols, who publishes as <a
            class="external"
            href={SPIN_SCIENCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            >Spin Science<span class="sr-only"> (opens in a new tab)</span></a
          >, built the {ORIGINAL_SHAPE_MATRIX_NAME} from three of these ratios: 1:1,
          1:3, and 1:5. The {SHAPE_ENGINE_SHORT_NAME} generates the same pairings
          and carries the construction through the rest of the turn ladder.
        </p>
        {#if loadError}
          <p class="notice error" role="alert">
            The flower drawings could not be built, so the shapes on this page
            are blank. Reload to try again.
            <span class="notice-detail">{loadError}</span>
          </p>
        {/if}
      </header>

      <section class="reading" aria-labelledby="reading-heading">
        <div class="reading-copy">
          <h2 id="reading-heading">Reading a ratio</h2>

          <dl class="terms">
            <div>
              <dt>Hand cycles, H</dt>
              <dd>Complete circles the hand travels.</dd>
            </div>
            <div>
              <dt>Prop rotations, P</dt>
              <dd>Complete rotations the prop makes over those circles.</dd>
            </div>
          </dl>

          <p>
            For a moving hand the two systems convert directly. Prop rotations
            per hand cycle are <code>P / H = 2 × turns + 1</code>, and the same
            relation read backwards is <code>turns = (P / H − 1) / 2</code>.
          </p>
          <p>
            The reduced ratio also fixes the petal count. A prospin flower draws
            <code>|P − H|</code> petals and an antispin flower draws
            <code>P + H</code>. Both counts follow one tracked prop end. A two
            ended prop such as a staff traces the mirrored figure as well, so
            the drawing shows twice as many petals as the count.
          </p>
          <p>
            Float sits outside the arithmetic. The prop makes no rotation of its
            own while the hand circles, which is the ratio 1:0, and the Kinetic
            Alphabet names it Float instead of a number.
          </p>
        </div>

        <figure class="worked">
          <figcaption>1:3, one turn</figcaption>
          <div class="worked-shapes">
            {#each [example.pro, example.anti] as flower (flowerKey(flower))}
              <div class="worked-shape">
                <span class="still still-lg">
                  <ShapeMatrixMandalaArt
                    paint={paintFlower(flower)}
                    artKey={flowerKey(flower)}
                    alt={flowerLabel(flower)}
                  />
                </span>
                <span class="shape-name">{styleWord(flower.style)}</span>
                <span class="shape-meta">{petalWord(flower.petals)}</span>
              </div>
            {/each}
          </div>
          <p class="worked-note">
            P is 3 and H is 1, so prospin draws 2 petals and antispin draws 4.
          </p>
        </figure>
      </section>
    </div>

    <section class="ladder" aria-labelledby="ladder-heading">
      <div class="ladder-copy">
        <h2 id="ladder-heading">Ratios and turns</h2>
        <p>
          Every turn value the Kinetic Alphabet carries, the ratio that names
          it, and the two flowers one hand draws at that ratio.
        </p>
        <p>
          Level 1 uses 0 turns only. Level 2 adds whole turns. Level 3 adds half
          turns and Float. Level 4 adds quarter turns, including the negative
          quarter the engine shows at 2:1.
        </p>
        <p>
          Half and quarter turns reduce to ratios with two hand cycles. Those
          patterns need two circles of the hand before the prop returns to its
          starting angle.
        </p>
      </div>

      <div class="ladder-table-scroll">
        <table class="ladder-table">
          <caption>
            The turn ladder, Float through three turns. Tinted rows are the
            three ratios of the original matrix.
          </caption>
          <thead>
            <tr>
              <th scope="col">Ratio</th>
              <th scope="col">Turns</th>
              <th scope="col">Level</th>
              <th scope="col">Prospin</th>
              <th scope="col">Antispin</th>
            </tr>
          </thead>
          <tbody>
            {#each ladder as row (row.turnLabel)}
              <tr class:family-row={row.family}>
                <th scope="row" class="ratio-cell">{row.ratio}</th>
                <td class="num">{row.turnLabel}</td>
                <td class="num level">L{row.level}</td>
                {#if row.pro && row.anti}
                  <td class="style">
                    <span class="still">
                      <ShapeMatrixMandalaArt
                        paint={paintFlower(row.pro)}
                        artKey={flowerKey(row.pro)}
                        alt={flowerLabel(row.pro)}
                      />
                    </span>
                    <span class="petals">{petalWord(row.pro.petals)}</span>
                  </td>
                  <td class="style">
                    <span class="still">
                      <ShapeMatrixMandalaArt
                        paint={paintFlower(row.anti)}
                        artKey={flowerKey(row.anti)}
                        alt={flowerLabel(row.anti)}
                      />
                    </span>
                    <span class="petals">{petalWord(row.anti.petals)}</span>
                  </td>
                {:else}
                  <td class="style float" colspan="2">
                    <span class="still">
                      <ShapeMatrixMandalaArt
                        paint={paintFlower(floatFlower)}
                        artKey={flowerKey(floatFlower)}
                        alt={flowerLabel(floatFlower)}
                      />
                    </span>
                    <span class="petals">
                      No spin direction. The prop holds one angle while the hand
                      circles.
                    </span>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="twelve" aria-labelledby="twelve-heading">
      <div class="twelve-copy">
        <h2 id="twelve-heading">The original twelve</h2>
        <p>
          Nichols took four even petaled driving styles from each family, which
          gives twelve shapes for one hand. The {SHAPE_ENGINE_SHORT_NAME} reaches
          the same twelve from its own axis: three ratios, prospin and antispin, and
          the two starting orientations named in and out. A start pointing in puts
          the prop toward the center of the hand path, a start pointing out puts it
          away, and that choice moves where the figure sits.
        </p>
        <p>
          The 1:1 prospin pair shows what the start does most plainly. Starting
          in holds the tracked end of the prop in one place, so it draws a
          point. Starting out carries that end around the whole hand circle.
        </p>
      </div>

      <div class="family-band">
        <div class="family-list">
          {#each families as family (family.turns)}
            <section class="family" aria-label={`${family.ratio} family`}>
              <header class="family-head">
                <span class="family-ratio">{family.ratio}</span>
                <span class="family-turns"
                  >{family.turns} turn{family.turns === 1 ? "" : "s"}, level {family.level}</span
                >
                <a class="family-link" href={bandHref(family.turns)}>
                  Open the {family.ratio} band
                </a>
              </header>
              <ol class="family-shapes">
                {#each family.shapes as flower (flowerKey(flower))}
                  <li>
                    <span class="still still-md">
                      <ShapeMatrixMandalaArt
                        paint={paintFlower(flower)}
                        artKey={flowerKey(flower)}
                        alt={flowerLabel(flower)}
                      />
                    </span>
                    <span class="shape-name">{styleWord(flower.style)}</span>
                    <span class="shape-meta">
                      {petalWord(flower.petals)}, starts {flower.ori}
                    </span>
                  </li>
                {/each}
              </ol>
            </section>
          {/each}
        </div>
      </div>
    </section>

    <section class="pairings" aria-labelledby="pairings-heading">
      <div class="pairings-copy">
        <h2 id="pairings-heading">The 144 pairings</h2>
        <p>
          One left hand shape over one right hand shape makes a cell. Twelve
          shapes on each axis is 144 cells. The grid here is the engine's own
          matrix restricted to the three original ratios, drawn by the same
          painter the {SHAPE_ENGINE_SHORT_NAME} animates. Blue rows are the left hand
          and red columns are the right hand, so a cell shows both paths at once.
        </p>
        <p>
          Choosing a cell opens that pairing in the engine. With a keyboard, the
          arrow keys move between cells.
        </p>
        <p class="scroll-hint">
          The grid is wider than this screen. Slide it sideways to reach every
          column.
        </p>
      </div>

      <div class="matrix-stage">
        {#if loadError}
          <p class="load-status error">Drawings unavailable</p>
        {:else if !data}
          <p class="load-status">Building flowers</p>
        {:else}
          <ShapeMatrixGrid
            {data}
            rowAxis={originalAxis}
            colAxis={originalAxis}
            maxCellPx={88}
            painter={CLUB_ARTWORK_PAINTER}
            pressable={false}
            onselect={({ left, right }) => goto(pairHref(left, right))}
          />
        {/if}
      </div>
    </section>

    <div class="closing">
      <section class="beyond" aria-labelledby="beyond-heading">
        <h2 id="beyond-heading">Past the original twelve</h2>
        <p>
          The engine keeps the row and column pairing and widens the axes.
          Levels 3 and 4 add the half turn, quarter turn, and Float rows from
          the table above, and each axis picks its band on its own, so the two
          hands do not have to sit in the same family. The Theory Matrix sets
          the level system aside and pairs any two whole number ratios up to 15
          on each side.
        </p>
      </section>

      <section class="sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources</h2>
        <ul class="source-list">
          <li>
            <a
              class="external"
              href={ORIGINAL_SHAPE_MATRIX_URL}
              target="_blank"
              rel="noopener noreferrer"
              >Lorq Nichols, {ORIGINAL_SHAPE_MATRIX_NAME}, on Spin Science<span
                class="sr-only"
              >
                (opens in a new tab)</span
              ></a
            >
          </li>
          <li>
            <a href="/history#archive-record-vtg"
              >The Vulcan Tech Gospel record</a
            >
          </li>
          <li>
            <a href="/history#archive-record-lorq">The Lorq Nichols record</a>
          </li>
          <li><a href="/shape-engine">{SHAPE_ENGINE_SHORT_NAME}</a></li>
        </ul>
        <p class="attribution">
          The {SHAPE_ENGINE_SHORT_NAME} was built independently by {KINETIC_SHAPE_ENGINE_AUTHOR}.
          It does not reproduce Nichols' original diagram and is not an official
          Spin Science release.
        </p>
      </section>
    </div>
  </article>
</GuideShell>

<style>
  .ratios {
    --rule: var(--theme-stroke, oklch(0.4 0.04 270 / 0.22));
    --ink: var(--theme-text, oklch(0.94 0.01 270));
    --ink-dim: var(--theme-text-dim, oklch(0.72 0.01 270));
    --ink-faint: oklch(0.6 0.02 270);
    --surface: var(--theme-card-bg, oklch(0.17 0.018 270 / 0.5));
    --accent: var(--theme-accent, oklch(0.74 0.11 265));
    --touch: var(--min-touch-target, 44px);
    /* The wide composition is two tracks: prose at a fixed measure, visuals
       in whatever is left. The article caps at the width where the matrix
       reaches its largest tile beside that measure, and centres, so extra
       width becomes symmetric margin instead of gaps inside the page. */
    --copy: 36rem;
    --gutter: clamp(1.5rem, 3vw, 3rem);
    --section-gap: clamp(2.75rem, 5vw, 4.5rem);
    --pad: clamp(1rem, 3vw, 3rem);
    --tracks: 13;
    --stage-max: calc(var(--tracks) * 72px + 6px);
    --stage-min: calc(var(--tracks) * 44px + 6px);
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: calc(
      var(--copy) + var(--gutter) + var(--stage-max) + 2 * var(--pad)
    );
    margin-inline: auto;
    display: grid;
    gap: var(--section-gap);
    padding: clamp(1.5rem, 3vw, 3rem) var(--pad) clamp(4rem, 7vw, 7rem);
  }

  /* On a 4K class screen the guide band is fixed at its widest, so the grid
     spends the extra room on larger tiles rather than a wider prose column. */
  @media (min-width: 137.5rem) {
    .ratios {
      --stage-max: calc(var(--tracks) * 88px + 6px);
    }
  }

  .opening {
    display: grid;
    gap: var(--section-gap);
  }

  /* Below the tablet breakpoint the guide grid keeps this route in its prose
     column, which already carries a 1rem gutter on each side. A second gutter
     here would cost a phone 32px of a 343px column. */
  @media (max-width: 768px) {
    .ratios {
      padding-inline: 0;
    }
  }

  .ratios h1 {
    grid-column: auto;
    margin: 0 0 1rem;
    padding: 0;
    font-family: "Inter", system-ui, sans-serif;
    font-size: clamp(2.1rem, 1.6rem + 1.6vw, 3.2rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.05;
    text-align: left;
  }

  .ratios h2 {
    margin: 0 0 0.85rem;
  }

  .ratios p {
    max-inline-size: var(--measure-prose, 72ch);
  }

  .ratios code {
    padding: 0.1em 0.35em;
    border-radius: 5px;
    background: var(--surface);
    color: var(--ink);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.92em;
    white-space: nowrap;
  }

  .ratios a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }

  .ratios a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 3px;
  }

  /* Links that leave the site say so: a small arrow for sighted readers and
     a hidden phrase for screen readers. */
  .ratios a.external::after {
    content: "\2197";
    display: inline-block;
    margin-left: 0.2em;
    font-size: 0.8em;
    text-decoration: none;
  }

  .page-head p:last-child {
    margin-bottom: 0;
  }

  .notice {
    margin: 1.25rem 0 0;
    padding: 0.85rem 1rem;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    font-size: var(--font-size-min, 0.875rem);
  }

  .notice.error {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, oklch(0.7 0.16 25)) 45%,
      transparent
    );
  }

  .notice-detail {
    display: block;
    margin-top: 0.35rem;
    color: var(--ink-faint);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: var(--font-size-compact, 0.78rem);
    overflow-wrap: anywhere;
  }

  /* Two column sections: prose keeps a reading measure, the visual takes the
     rest of the band, so a wide screen gains content instead of stretch. */
  .reading,
  .ladder,
  .twelve,
  .pairings {
    display: grid;
    gap: var(--gutter);
    padding-top: clamp(1.75rem, 3vw, 2.75rem);
    border-top: 1px solid var(--rule);
  }

  @media (min-width: 62rem) {
    .reading {
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.72fr);
      align-items: start;
    }

    /* The ladder carries the page's densest information, so it takes the
       larger share of the band. */
    .ladder {
      grid-template-columns: minmax(17rem, 0.5fr) minmax(0, 1fr);
      align-items: start;
    }
  }

  .terms {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 1.25rem;
  }

  .terms > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }

  .terms dt {
    color: var(--ink);
    font-weight: 640;
  }

  .terms dd {
    margin: 0;
    color: var(--ink-dim);
  }

  .worked {
    margin: 0;
    padding: 1.25rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
  }

  .worked figcaption {
    margin-bottom: 1rem;
    color: var(--ink);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    font-weight: 640;
  }

  /* Two shapes side by side down to a 320px phone: 7rem tracks fit a 270px
     card, where 8rem tracks missed by a few pixels and stacked. */
  .worked-shapes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 1rem;
  }

  .worked-shape {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }

  .worked-note {
    margin: 1rem 0 0;
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
  }

  /* Reserved square for every still: the engine loads async and the box never
     changes size, so nothing moves when the artwork arrives. */
  .still {
    display: block;
    inline-size: 3rem;
    aspect-ratio: 1;
    flex: none;
  }

  .still-md {
    inline-size: clamp(4rem, 9vw, 5.5rem);
  }

  .still-lg {
    inline-size: clamp(5rem, 12vw, 7rem);
  }

  .shape-name {
    color: var(--ink);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 620;
  }

  .shape-meta {
    color: var(--ink-faint);
    font-size: var(--font-size-compact, 0.78rem);
    text-align: center;
  }

  /* The ladder. The table hugs its content and caps at a reading width, so on
     a wide band the flowers grow instead of the gaps between them. */
  .ladder-table-scroll {
    inline-size: 100%;
    max-inline-size: 60rem;
    overflow-x: auto;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
  }

  .ladder-table {
    --still-size: clamp(3rem, 2.25rem + 1vw, 3.75rem);
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .ladder-table caption {
    caption-side: bottom;
    padding: 0.75rem 0.9rem 0.85rem;
    color: var(--ink-faint);
    font-size: var(--font-size-compact, 0.78rem);
    text-align: left;
  }

  .ladder-table th,
  .ladder-table td {
    padding: 0.35rem 0.8rem;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    vertical-align: middle;
  }

  .ladder-table thead th {
    padding-block: 0.6rem;
    color: var(--ink-faint);
    font-size: var(--font-size-compact, 0.78rem);
    font-weight: 640;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ladder-table tbody tr.family-row {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
  }

  /* The three label columns shrink to their words; the two style columns
     split whatever is left, evenly. */
  .ratio-cell,
  .ladder-table .num {
    width: 1%;
    white-space: nowrap;
  }

  .ratio-cell {
    color: var(--ink);
    font-size: 1.05rem;
    font-weight: 660;
  }

  .ladder-table .num {
    color: var(--ink-dim);
  }

  .ladder-table .level {
    color: var(--ink-faint);
  }

  /* Flower and its count read as one unit: the still first, the words beside
     it, the pair anchored to the column's left edge. */
  .ladder-table .style {
    padding-block: 0.3rem;
  }

  .ladder-table .style .still {
    display: inline-block;
    inline-size: var(--still-size);
    margin-right: 0.7rem;
    vertical-align: middle;
  }

  .ladder-table .petals {
    display: inline-block;
    color: var(--ink);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    vertical-align: middle;
    white-space: nowrap;
  }

  .ladder-table .float .petals {
    max-inline-size: 22rem;
    color: var(--ink-faint);
    font-weight: 400;
    white-space: normal;
  }

  /* At phone widths the count sits under its flower so five columns fit in
     the reading column without a sideways scroll. */
  @media (max-width: 30rem) {
    .ladder-table th,
    .ladder-table td {
      padding: 0.3rem 0.35rem;
    }

    .ladder-table {
      --still-size: 2.25rem;
    }

    .ladder-table .style .still {
      display: block;
      margin: 0 auto 0.15rem;
    }

    .ladder-table .petals {
      display: block;
      font-size: 0.72rem;
      font-weight: 500;
      text-align: center;
    }

    .ladder-table .float .still {
      display: inline-block;
      margin: 0 0.6rem 0 0;
    }

    .ladder-table .float .petals {
      display: inline-block;
      text-align: left;
    }

    .ratio-cell {
      font-size: 0.95rem;
    }
  }

  /* The original twelve. Three families is a fixed count, so the tiers are
     chosen, not fitted: one column of squares on a phone, one column of wide
     bands with four shapes across on a tablet, three squares side by side on
     a desktop. No tier strands a lone card on its own row. The band, not the
     list, is the container because a container query answers for an
     ancestor, never for the element it styles; on a wide screen the band is
     the column beside the prose, so the tiers follow that column. */
  .family-band {
    container-type: inline-size;
  }

  .family-list {
    display: grid;
    gap: clamp(1rem, 2vw, 1.75rem);
    grid-template-columns: minmax(0, 1fr);
  }

  .family {
    padding: 1.1rem 1.25rem 1.35rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
  }

  .family-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.9rem;
    padding-bottom: 0.9rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--rule);
  }

  .family-ratio {
    color: var(--ink);
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    font-weight: 680;
    letter-spacing: -0.02em;
  }

  .family-turns {
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
  }

  /* A full touch target without growing the header row: the hit area is
     padded and the padding is pulled back out of the flow. */
  .family-link {
    margin-left: auto;
    padding-block: calc((var(--touch) - 1.4em) / 2);
    margin-block: calc((var(--touch) - 1.4em) / -2);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
    white-space: nowrap;
  }

  .family-shapes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .family-shapes li {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    margin: 0;
  }

  @container (min-width: 36rem) {
    .family-shapes {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 56rem) {
    .family-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .family-shapes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* The 144 pairings. ShapeMatrixGrid is container sized, so its stage owns
     an explicit box: a square that grows with the band up to the grid's
     largest tile, and never shrinks below the grid at its 44px touch floor.
     On a desktop the whole matrix is therefore always in view and the wheel
     scrolls the page. On a phone the square can't be that wide; the height
     still holds every row and the grid slides sideways under its sticky
     headers. */
  .pairings {
    container-type: inline-size;
  }

  .pairings-copy p:last-of-type {
    margin-bottom: 0;
  }

  /* The matrix sits beside its prose only once the band can hold the whole
     grid at its largest tile next to a reading column. Below that it drops
     under the prose at full width, where it never has to scroll. */
  @media (min-width: 96rem) {
    .pairings {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      align-items: start;
    }
  }

  /* The hint is a narrow-screen affordance; it only shows where the grid
     really is wider than its stage. */
  .scroll-hint {
    display: none;
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
  }

  .matrix-stage {
    position: relative;
    inline-size: min(100%, var(--stage-max));
    aspect-ratio: 1;
    min-block-size: var(--stage-min);
    border: 1px solid var(--rule);
    border-radius: 14px;
    overflow: hidden;
  }

  @container (max-width: 36rem) {
    .scroll-hint {
      display: block;
    }

    /* The right edge fades into the stage so the cut-off column reads as
       "more this way" rather than a broken grid. It sits above the grid's
       sticky headers and lets pointer events through. */
    .matrix-stage::after {
      content: "";
      position: absolute;
      inset: 0 0 0 auto;
      width: 2.5rem;
      z-index: 6;
      pointer-events: none;
      background: linear-gradient(
        to right,
        transparent,
        var(--theme-panel-bg, oklch(0.15 0.018 270))
      );
    }
  }

  .load-status {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    color: var(--ink-faint);
  }

  .load-status.error {
    color: var(--semantic-error, oklch(0.7 0.16 25));
  }

  .closing {
    display: grid;
    gap: var(--section-gap);
  }

  .beyond,
  .sources {
    padding-top: clamp(1.75rem, 3vw, 2.75rem);
    border-top: 1px solid var(--rule);
  }

  .source-list {
    display: grid;
    gap: 0.55rem;
    margin: 0 0 1.5rem;
    padding: 0;
    list-style: none;
  }

  .source-list li {
    margin: 0;
  }

  .source-list a {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch);
  }

  .attribution {
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
  }

  /* Wide: the worked example becomes the opening panel. It stands beside the
     heading and the reading notes together, its two flowers stacked and
     drawn large, so the top of the page is one composition instead of a
     heading with an empty right half. The reading section's own box goes
     away here so its copy and figure can sit in the opening grid. */
  @media (min-width: 96rem) {
    .opening {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: var(--gutter);
      align-items: start;
    }

    .reading {
      display: contents;
    }

    .page-head {
      grid-column: 1;
      grid-row: 1;
    }

    .reading-copy {
      grid-column: 1;
      grid-row: 2;
    }

    .worked {
      grid-column: 2;
      grid-row: 1 / 3;
      align-self: stretch;
      container-type: inline-size;
      display: grid;
      align-content: center;
      padding: clamp(1.5rem, 2vw, 3rem);
    }

    .worked-shapes {
      grid-template-columns: minmax(0, 1fr);
      gap: 2rem;
    }

    /* The panel's height is set by the prose beside it, which the fixed
       measure keeps near constant across the tier, so the flowers grow with
       the panel's width up to the size that fills that height. */
    .still-lg {
      inline-size: min(45cqw, 17rem);
    }

    .worked figcaption {
      font-size: 1.25rem;
      text-align: center;
    }

    .worked-note {
      max-inline-size: 44ch;
      margin-inline: auto;
      text-align: center;
    }

    .ladder,
    .twelve {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      align-items: start;
    }

    .ladder-table-scroll {
      max-inline-size: none;
    }

    .ladder-table .float .petals {
      max-inline-size: 40rem;
    }

    /* The table and the matrix run taller than their prose. Pinning the
       prose under the site header keeps it beside the rows it describes
       instead of leaving a blank column once they scroll away. */
    .ladder-copy,
    .pairings-copy {
      position: sticky;
      top: calc(64px + 1.5rem);
    }

    /* The two closing sections share one band under one rule, so the page
       ends on the same two tracks it opened with. */
    .closing {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      column-gap: var(--gutter);
      align-items: start;
      padding-top: clamp(1.75rem, 3vw, 2.75rem);
      border-top: 1px solid var(--rule);
    }

    .beyond,
    .sources {
      padding-top: 0;
      border-top: 0;
    }
  }
</style>
