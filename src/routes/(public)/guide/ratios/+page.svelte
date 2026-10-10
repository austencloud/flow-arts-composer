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
  import ShapeMatrixGrid from "#lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte";
  import ShapeMatrixMandalaArt from "#lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import DifficultyBadge from "#lib/shared/components/DifficultyBadge.svelte";
  import RatioSwapMotion, {
    type RatioSwapPanel,
  } from "./_components/RatioSwapMotion.svelte";
  import { DIFFICULTY_LEVELS } from "#lib/shared/config/difficulty-styles.js";
  import {
    CLUB_ARTWORK_PAINTER,
    cellArtworkSrc,
    headerArtworkSrc,
  } from "#lib/shared/shape-matrix/services/shape-matrix-artwork.js";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
  import { applyFilter } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
  import { matrixFiltersForSize } from "#lib/shared/shape-matrix/domain/matrix-size-preset.js";
  import {
    buildFloatAxis,
    buildShapeMatrixAxis,
    flowerKey,
    flowerPetals,
    ratioLabel,
    type Flower,
    type FlowerStyle,
    type RotatingFlower,
    type RotatingFlowerOri,
    type ShapePathStyle,
  } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import { matrixTurnsForLevel } from "#lib/shared/shape-matrix/domain/matrix-turn-band.js";
  import {
    SHAPE_MATRIX_LEVELS,
  } from "#lib/shared/shape-matrix/app/shape-matrix-levels.js";
  import {
    levelForTurnValue,
    levelForTurns,
    turnValueToKey,
    type TurnLevel,
    type TurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";
  import {
    KINETIC_SHAPE_ENGINE_AUTHOR,
    ORIGINAL_SHAPE_MATRIX_NAME,
    ORIGINAL_SHAPE_MATRIX_URL,
    SHAPE_ENGINE_SHORT_NAME,
    SPIN_SCIENCE_URL,
  } from "#lib/shared/shape-matrix/app/shape-engine-identity.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  /** The engine's own 144 band: three ratios, both styles, both starts, diamond. */
  const ORIGINAL_AXIS_FILTER = matrixFiltersForSize("large").left;
  const FAMILY_TURNS = [0, 1, 2] as const;
  const BASE_LEVEL = 1;
  const WHOLE_TURN_LEVEL = 2;
  const QUARTER_TURN_LEVEL = 4;

  /** The twelve original shapes, in the engine's own axis order. */
  const originalAxis = applyFilter(
    buildShapeMatrixAxis(),
    ORIGINAL_AXIS_FILTER,
    false
  );
  /** Tracks the matrix draws: one header plus one per shape on each axis. */
  const MATRIX_TRACKS = originalAxis.length + 1;

  function rotating(
    turns: number,
    style: FlowerStyle,
    ori: RotatingFlowerOri = "in"
  ): RotatingFlower {
    return {
      style,
      turns,
      ori,
      grid: "diamond",
      petals: flowerPetals({ style, turns }),
    };
  }

  /**
   * Float's four starts. The prop holds the angle it starts at, so the
   * circle it draws sits off the hand's circle toward that side: up from a
   * start pointing in, down from out, left from clock, right from counter.
   */
  const floatFlowers = buildFloatAxis();
  const FLOAT_FACING: Record<string, string> = {
    in: "guide_ratios_up",
    out: "guide_ratios_down",
    clock: "guide_ratios_left",
    counter: "guide_ratios_right",
  };

  /**
   * How a flower sits, in the words spinners use for it: a petal up or down,
   * two or six petals vertical or horizontal, four petals in diamond or box.
   * Through Level 3 the hand closes one circle from the bottom of its path.
   * Prospin started in and antispin started out put a petal at that bottom,
   * the downbeat VTG counts from, and the other two starts turn the flower
   * half a petal. Checked against every Level 1 to 3 path the Shape Engine
   * draws. Eight petals have no common name, so they read upright or tilted.
   */
  function flowerFacing(flower: RotatingFlower): string {
    const atBottom = (flower.style === "pro") === (flower.ori === "in");
    const petals = flower.petals;
    if (petals % 2 === 1) return tDynamic(atBottom ? "guide_ratios_petal_down" : "guide_ratios_petal_up");
    if (petals % 4 === 2) return tDynamic(atBottom ? "guide_ratios_vertical" : "guide_ratios_horizontal");
    if (petals === 4) return tDynamic(atBottom ? "guide_ratios_diamond" : "guide_ratios_box");
    return tDynamic(atBottom ? "guide_ratios_upright" : "guide_ratios_tilted");
  }

  /**
   * Level 4's quarter turns do not follow the Level 1 to 3 rule above, where
   * facing splits on style and start. Sampling every engine path for the
   * point farthest from the hand center found a petal tip sitting at (0, +r)
   * for all fourteen quarter-turn flowers this page shows: both styles across
   * all seven quarter-turn ratios, -0.25 through 2.75. A petal always points
   * straight down, so the caption does not depend on the flower at all.
   */
  function quarterTurnFacing(): string {
    return tDynamic("guide_ratios_petal_down");
  }

  /**
   * The starts a card shows. A ratio that closes in one hand circle draws a
   * different flower from each start, so its card shows in and out. Quarter
   * turns take two circles, and there the out start retraces the in start's
   * path, so one start covers both.
   */
  function cardStarts(turns: number) {
    const oris: RotatingFlowerOri[] = Number.isInteger(turns * 2)
      ? ["in", "out"]
      : ["in"];
    return oris.map((ori) => ({
      ori,
      flowers: [rotating(turns, "pro", ori), rotating(turns, "anti", ori)],
    }));
  }

  /** One row per turn value the Kinetic Alphabet can carry, Float included. */
  const ladder = $derived(matrixTurnsForLevel(4).map((turns: TurnValue) => ({
    turns,
    ratio: ratioLabel(turns),
    level: levelForTurnValue(turns),
    turnLabel: turns === "fl" ? tDynamic("guide_ratios_float_name") : String(turns),
    turnWords: turns === "fl" ? tDynamic("guide_ratios_float_name") : turnWords(turns as number),
    family: turns === 0 || turns === 1 || turns === 2,
    starts: turns === "fl" ? null : cardStarts(turns as number),
  })));

  /* The ladder groups by level, because that is the order a reader meets
     these turn values in: each level opens a set of new ratios on top of the
     ones below it. Names and blurbs come from the level table the matrix
     selector reads, so the page and the selector cannot disagree. */
  const levelGroups = $derived(SHAPE_MATRIX_LEVELS.map((level) => {
    const rows = ladder.filter((row) => row.level === level);
    /* Whole turns and quarter turns each carry one note card after their
       ratios: how a turn adds petals, and the two hand cycle arithmetic. */
    const noted = level === WHOLE_TURN_LEVEL || level === QUARTER_TURN_LEVEL;
    const cells = rows.length + (noted ? 1 : 0);
    return { level, name: tDynamic(`guide_ratios_level_${level}_name`), blurb: tDynamic(`guide_ratios_level_${level}_blurb`), rows, cells };
  }).filter((group) => group.level !== BASE_LEVEL && group.rows.length > 0));

  /**
   * What spinners call the flowers that have a common name. Every name
   * describes one end of the prop, the drawing the ladder cards show. A
   * staff's second end doubles the flower (see One end or two), so a
   * two-ended picture would outgrow the name. The ratio is derived from the
   * turn value, so a name cannot point at a ratio the ladder doesn't draw.
   */
  const COMMON_NAMES: readonly {
    name: string;
    turns: number;
    style: FlowerStyle;
  }[] = [
    { name: "Cat-eye", turns: 0, style: "anti" },
    { name: "Triquetra", turns: 0.5, style: "anti" },
    { name: "4-petal antispin flower", turns: 1, style: "anti" },
    { name: "3-petal inspin flower", turns: 1.5, style: "pro" },
  ];

  /**
   * Level 1 shows both starts. At 1:1 starting in and starting out draw four
   * different base motions, the four shapes the original matrix gives this
   * ratio, so collapsing them to the in start would hide half of Level 1.
   */
  const BASE_NAMES = { in: "guide_ratios_isolation", out: "guide_ratios_extension" } as const;
  const baseLevel = $derived({ name: tDynamic("guide_ratios_level_1_name"), blurb: tDynamic("guide_ratios_level_1_blurb") });
  const baseRatio = ratioLabel(0);
  const baseCards = $derived((["in", "out"] as const).map((ori) => ({
    ori,
    label: tDynamic(ori === "in" ? "guide_ratios_starts_in" : "guide_ratios_starts_out"),
    flowers: (["pro", "anti"] as const).map((style) => {
      const flower = rotating(0, style, ori);
      return {
        flower,
        meta:
          style === "pro"
            ? tDynamic(BASE_NAMES[ori])
            : `${petalWord(flower.petals)}, ${flowerFacing(flower).toLowerCase()}`,
      };
    }),
  })));

  /**
   * The board is a grid of equal cards, two, four, or eight across. Each
   * level spans as many tracks as it has cards, up to the full row, plus one
   * row for its heading. Levels 2 to 4 hold 4, 4, and 8 cards, notes
   * included, so they tile every width with no cell left over.
   */
  function boardSpan(cells: number, columns: number): string {
    const span = Math.min(cells, columns);
    const rows = 1 + Math.ceil(cells / span);
    return `--span-${columns}: ${span}; --rows-${columns}: ${rows}`;
  }

  /**
   * A level's tray takes its tint from the middle of that level's badge
   * gradient, so the trays read as the same sky blue, silver, gold, and
   * purple the badges carry.
   */
  function levelTint(level: number): string {
    const stops = DIFFICULTY_LEVELS[level]?.stops ?? [];
    return stops[Math.floor(stops.length / 2)]?.color ?? "transparent";
  }

  function turnWords(turns: number): string {
    const size = Math.abs(turns);
    const sign = turns < 0 ? "−" : "";
    return tDynamic(size === 1 ? "guide_ratios_one_turn" : "guide_ratios_many_turns", { count: `${sign}${size}` });
  }

  const example = { pro: rotating(1, "pro"), anti: rotating(1, "anti") };

  /**
   * One end against two. A staff's far end is its near end point-reflected
   * through the hand, which is the near end started the other way, so a
   * staff draws the in and out starts at once. At one hand cycle that is two
   * different figures laid together. At two hand cycles the out start is the
   * in start entered one circle later, the same curve, so the staff draws
   * exactly what one end draws. The Matrix's quarter turn "out" slot holds a
   * sideways start for that reason (flowerStartOrientation), so the 2:3 case
   * repeats its in figure here rather than borrowing that slot.
   */
  interface EndsFrame {
    flowers: RotatingFlower[];
    label: string;
    meta: string;
  }

  interface EndsCase {
    ratio: string;
    style: FlowerStyle;
    frames: [EndsFrame, EndsFrame, EndsFrame];
  }

  interface EndsLevel {
    level: TurnLevel;
    name: string;
    cases: [EndsCase, EndsCase];
    summary: string;
  }

  function endsCase(
    turns: number,
    style: FlowerStyle,
    names: { in: string; out: string; both: string } | null = null
  ): EndsCase {
    const near = rotating(turns, style, "in");
    /* Quarter turns, and only quarter turns, reduce to two hand cycles. */
    const twoCycles = !Number.isInteger(turns * 2);
    const far = twoCycles ? near : rotating(turns, style, "out");
    const both = twoCycles ? near.petals : near.petals * 2;
    return {
      ratio: ratioLabel(turns),
      style,
      frames: [
        {
          flowers: [near],
          label: tDynamic("guide_ratios_starts_in"),
          meta: names?.in ?? petalWord(near.petals),
        },
        {
          flowers: [far],
          label: tDynamic("guide_ratios_starts_out"),
          meta:
            names?.out ?? (twoCycles ? tDynamic("guide_ratios_same_path") : petalWord(far.petals)),
        },
        {
          flowers: twoCycles ? [near] : [near, far],
          label: tDynamic("guide_ratios_both_ends"),
          meta: names?.both ?? petalWord(both),
        },
      ],
    };
  }

  /** One ratio per level, prospin beside antispin, the ladder's own pairs. */
  function endsLevel(
    turns: number,
    summary: string,
    proNames: Parameters<typeof endsCase>[2] = null
  ): EndsLevel {
    const level = levelForTurns(turns, turns);
    return {
      level,
      name: tDynamic(`guide_ratios_level_${level}_name`),
      cases: [endsCase(turns, "pro", proNames), endsCase(turns, "anti")],
      summary,
    };
  }

  const endsLevels: EndsLevel[] = $derived([
    endsLevel(
      0,
      tDynamic("guide_ratios_ends_summary_1"),
      { in: tDynamic("guide_ratios_isolation"), out: tDynamic("guide_ratios_extension"), both: tDynamic("guide_ratios_point_in_circle") }
    ),
    endsLevel(1, tDynamic("guide_ratios_ends_summary_2")),
    endsLevel(
      0.5,
      tDynamic("guide_ratios_ends_summary_3")
    ),
    endsLevel(
      0.25,
      tDynamic("guide_ratios_ends_summary_4")
    ),
  ]);

  /**
   * 1:2 and 2:1 share their petal counts because the counts use the two
   * numbers together. Set moving side by side, the hand's count shows: the
   * engine's hand circle (radius 80) is wider than the staff tip's reach
   * (67.4), so the drawing winds around the center once per hand circle,
   * measured at every turn value from -0.25 to 3.
   */
  const swapPanels: RatioSwapPanel[] = [
    { turns: 0.5, hand: 1, prop: 2 },
    { turns: -0.25, hand: 2, prop: 1 },
  ].map(({ turns, hand, prop }) => {
    const level = levelForTurnValue(turns);
    return {
      ratio: ratioLabel(turns),
      level,
      hand,
      prop,
      tint: levelTint(level),
    };
  });

  /** The pairing the matrix's reading figure takes apart. */
  const anatomyLeft = rotating(1, "pro");
  const anatomyRight = rotating(2, "anti");

  const families = FAMILY_TURNS.map((turns) => ({
    turns,
    ratio: ratioLabel(turns),
    level: levelForTurns(turns, turns),
    shapes: originalAxis.filter((flower) => flower.turns === turns),
  }));

  function styleWord(style: ShapePathStyle): string {
    if (style === "float") return tDynamic("guide_ratios_float_name");
    return tDynamic(style === "pro" ? "guide_ratios_prospin" : "guide_ratios_antispin");
  }

  function petalWord(petals: number): string {
    if (petals === 0) return tDynamic("guide_ratios_no_petals");
    return tDynamic(petals === 1 ? "guide_ratios_one_petal" : "guide_ratios_many_petals", { count: petals });
  }

  function flowerAlt(flower: Flower): string {
    return tDynamic("guide_ratios_flower_alt", {
      style: styleWord(flower.style),
      petals: petalWord(flower.petals),
    });
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

  /** A hand's own ink: blue rows are the left hand, red columns the right. */
  function paintHand(flower: Flower, hand: "left" | "right") {
    return (sizePx: number) =>
      data
        ? headerArtworkSrc(data, flower, hand, sizePx, CLUB_ARTWORK_PAINTER)
        : "";
  }

  function paintCell(left: Flower, right: Flower) {
    return (sizePx: number) =>
      data
        ? cellArtworkSrc(data, left, right, sizePx, CLUB_ARTWORK_PAINTER)
        : "";
  }

  /**
   * Several one-end paths drawn as one still: both ends of a staff. Every
   * still shares the painter's standard extent, so laying the paths together
   * keeps each at the size it has alone.
   */
  function paintTogether(flowers: RotatingFlower[]) {
    if (flowers.length === 1) return paintFlower(flowers[0]!);
    return (sizePx: number) => {
      if (!data) return "";
      const parts = flowers.map((flower) => data!.left.get(flowerKey(flower)));
      if (parts.some((part) => !part)) return "";
      const merged = {
        left: parts.flatMap((part) => part!.left),
        right: parts.flatMap((part) => part!.right),
        purple: parts.flatMap((part) => part!.purple),
      };
      return CLUB_ARTWORK_PAINTER.header(
        merged,
        "left",
        Math.round(sizePx),
        data.clubTipDx
      );
    };
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
  title={tDynamic("guide_ratios_seo_title")}
  description={tDynamic("guide_ratios_seo_description")}
  path="/guide/ratios"
  partOf={{ name: tDynamic("guide_paths_part_of"), path: "/guide" }}
  breadcrumbs={[
    { name: tDynamic("guide_paths_home"), path: "/" },
    { name: tDynamic("guide_paths_part_of"), path: "/guide" },
    { name: tDynamic("guide_ratios_title"), path: "/guide/ratios" },
  ]}
  datePublished="2026-09-04"
/>

<GuideShell>
  <article class="ratios guide-page-route" style="--tracks: {MATRIX_TRACKS}">
    <div class="opening">
      <header class="page-head">
        <h1>{tDynamic("guide_ratios_title")}</h1>
        <p>{tDynamic("guide_ratios_intro")}</p>
        <p>
          {tDynamic("guide_ratios_origins_before")}
          <LinkChip size="inline" href={SPIN_SCIENCE_URL} newTabLabel={tDynamic("guide_ratios_new_tab")}
            >Spin Science</LinkChip
          >{tDynamic("guide_ratios_origins_after", { name: ORIGINAL_SHAPE_MATRIX_NAME })}
        </p>
        {#if loadError}
          <p class="notice error" role="alert">
            {tDynamic("guide_ratios_load_error")}
            <span class="notice-detail">{loadError}</span>
          </p>
        {/if}
      </header>

      <section class="reading" aria-labelledby="reading-heading">
        <div class="reading-copy">
          <h2 id="reading-heading">{tDynamic("guide_ratios_reading")}</h2>

          <dl class="terms">
            <div>
              <dt>{tDynamic("guide_ratios_hand_cycles")}</dt>
              <dd>{tDynamic("guide_ratios_hand_cycles_definition")}</dd>
            </div>
            <div>
              <dt>{tDynamic("guide_ratios_prop_rotations")}</dt>
              <dd>{tDynamic("guide_ratios_prop_rotations_definition")}</dd>
            </div>
          </dl>

          <p>
            {tDynamic("guide_ratios_formula_before")}
            <code>P / H = 2 × turns + 1</code>{tDynamic("guide_ratios_formula_between")}
            <code>turns = (P / H − 1) / 2</code>.
          </p>
          <p>
            {tDynamic("guide_ratios_petals_before")}
            <code>|P − H|</code>{tDynamic("guide_ratios_petals_between")}
            <code>P + H</code>{tDynamic("guide_ratios_petals_after")}
            <LinkChip size="inline" href="#ends-heading">{tDynamic("guide_ratios_one_or_two")}</LinkChip>{tDynamic("guide_ratios_petals_end")}
          </p>
          <p>
            {tDynamic("guide_ratios_float")}
          </p>

          <h3>Common names</h3>
          <dl class="terms">
            {#each COMMON_NAMES as entry (entry.name)}
              <div>
                <dt>{entry.name}</dt>
                <dd>
                  {ratioLabel(entry.turns)}
                  {styleWord(entry.style).toLowerCase()}
                </dd>
              </div>
            {/each}
          </dl>
          <p>
            Each name describes the shape one end of the prop draws. Inspin is
            another name for prospin;
            <LinkChip size="inline" href="/guide/prospin-and-inspin">Prospin and Inspin</LinkChip>
            compares the two.
          </p>
        </div>

        <figure class="worked">
          <figcaption>{tDynamic("guide_ratios_example_caption")}</figcaption>
          <div class="worked-shapes">
            {#each [example.pro, example.anti] as flower (flowerKey(flower))}
              <div class="worked-shape">
                <span class="still still-lg">
                  <ShapeMatrixMandalaArt
                    paint={paintFlower(flower)}
                    artKey={flowerKey(flower)}
                    alt={flowerAlt(flower)}
                  />
                </span>
                <span class="shape-name">{styleWord(flower.style)}</span>
                <span class="shape-meta">{petalWord(flower.petals)}</span>
              </div>
            {/each}
          </div>
          <p class="worked-note">
            {tDynamic("guide_ratios_example_note")}
          </p>
        </figure>
      </section>
    </div>

    <section class="ladder" aria-labelledby="ladder-heading">
      <div class="ladder-copy">
        <h2 id="ladder-heading">{tDynamic("guide_ratios_ladder")}</h2>
        <p>{tDynamic("guide_ratios_ladder_intro")}</p>
        <p>{tDynamic("guide_ratios_ladder_orientation")}</p>
        <p class="ladder-note">
          {tDynamic("guide_ratios_tinted_cards")}
        </p>
      </div>

      <section
        class="level-group base-tray"
        aria-labelledby="level-{BASE_LEVEL}-heading"
        style="--level-tint: {levelTint(BASE_LEVEL)}"
      >
        <header class="level-head">
          <DifficultyBadge level={BASE_LEVEL} size="2rem" />
          <span class="level-title">
            <span id="level-{BASE_LEVEL}-heading" class="level-name">
              {tDynamic("guide_ratios_level_heading", { level: BASE_LEVEL, name: baseLevel.name })}
            </span>
            <span class="level-blurb">{baseLevel.blurb}</span>
          </span>
        </header>
        <ol class="base-cards" role="list">
          {#each baseCards as card (card.ori)}
            <li class="ratio-card family-card base-card">
              <p class="card-head">
                <span class="card-ratio">{baseRatio}</span>
                <span class="card-turns">{card.label}</span>
              </p>
              <div class="card-flowers">
                {#each card.flowers as item (flowerKey(item.flower))}
                  <div class="card-flower">
                    <span class="still">
                      <ShapeMatrixMandalaArt
                        paint={paintFlower(item.flower)}
                        artKey={flowerKey(item.flower)}
                        alt={`${baseRatio} ${styleWord(item.flower.style).toLowerCase()}, ${card.label.toLowerCase()}: ${item.meta.toLowerCase()}`}
                      />
                    </span>
                    <span class="card-style"
                      >{styleWord(item.flower.style)}</span
                    >
                    <span class="card-petals">{item.meta}</span>
                  </div>
                {/each}
              </div>
            </li>
          {/each}
        </ol>
      </section>

      <!-- One grid of equal cards. The levels span the tracks their cards
           need, so the board is a solid rectangle at every width instead of
           four stacks of different heights. -->
      <div class="ladder-board">
        <div class="ladder-grid">
          {#each levelGroups as group (group.level)}
            <section
              class="level-group"
              aria-labelledby={`level-${group.level}-heading`}
              style="{boardSpan(group.cells, 2)}; {boardSpan(
                group.cells,
                4
              )}; {boardSpan(group.cells, 8)}; --level-tint: {levelTint(
                group.level
              )}"
            >
              <header class="level-head">
                <DifficultyBadge level={group.level} size="2rem" />
                <span class="level-title">
                  <span id={`level-${group.level}-heading`} class="level-name">
                    {tDynamic("guide_ratios_level_heading", { level: group.level, name: group.name })}
                  </span>
                  <span class="level-blurb">{group.blurb}</span>
                </span>
              </header>

              <ol class="ratio-cards" role="list">
                {#each group.rows as row (row.turnLabel)}
                  <li class="ratio-card" class:family-card={row.family}>
                    <p class="card-head">
                      <span class="card-ratio">{row.ratio}</span>
                      <span class="card-turns">{row.turnWords}</span>
                    </p>
                    {#if row.starts}
                      {@const paired = row.starts.length > 1}
                      <div class="card-grid">
                        <span class="card-style">{tDynamic("guide_ratios_prospin")}</span>
                        <span class="card-style">{tDynamic("guide_ratios_antispin")}</span>
                        {#each row.starts as start (start.ori)}
                          {#each start.flowers as flower (flowerKey(flower))}
                            {@const facing = (
                              paired
                                ? flowerFacing(flower)
                                : quarterTurnFacing()
                            ).toLowerCase()}
                            <span class="still">
                              <ShapeMatrixMandalaArt
                                paint={paintFlower(flower)}
                                artKey={flowerKey(flower)}
                                alt={`${row.ratio} ${styleWord(flower.style).toLowerCase()}, ${facing}: ${petalWord(flower.petals).toLowerCase()}`}
                              />
                            </span>
                          {/each}
                          {#each start.flowers as flower (flowerKey(flower))}
                            <span class="card-facing" aria-hidden="true"
                              >{paired
                                ? flowerFacing(flower)
                                : quarterTurnFacing()}</span
                            >
                          {/each}
                        {/each}
                        {#each row.starts[0]?.flowers ?? [] as flower (flowerKey(flower))}
                          <span class="card-petals"
                            >{petalWord(flower.petals)}</span
                          >
                        {/each}
                      </div>
                    {:else}
                      <div class="card-float">
                        <div class="float-grid">
                          {#each floatFlowers as flower (flowerKey(flower))}
                            <div class="float-start">
                              <span class="still">
                                <ShapeMatrixMandalaArt
                                  paint={paintFlower(flower)}
                                  artKey={flowerKey(flower)}
                                  alt={tDynamic("guide_ratios_float_alt", { ratio: row.ratio, direction: tDynamic(FLOAT_FACING[flower.ori] ?? "guide_ratios_up") })}
                                />
                              </span>
                              <span class="card-facing" aria-hidden="true"
                                >{tDynamic(FLOAT_FACING[flower.ori] ?? "guide_ratios_up")}</span
                              >
                            </div>
                          {/each}
                        </div>
                        <span class="float-words">
                          {tDynamic("guide_ratios_float_caption")}
                        </span>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ol>

              {#if group.level === WHOLE_TURN_LEVEL}
                <p class="ladder-aside">
                  {tDynamic("guide_ratios_whole_turn_note")}
                </p>
              {/if}

              {#if group.level === QUARTER_TURN_LEVEL}
                <p class="ladder-aside">
                  {tDynamic("guide_ratios_quarter_turn_note")}
                </p>
              {/if}
            </section>
          {/each}
        </div>
      </div>

      <section class="swap" aria-labelledby="swap-heading">
        <div class="swap-copy">
          <h3 id="swap-heading">{tDynamic("guide_ratios_swap_title")}</h3>
          <p>{tDynamic("guide_ratios_swap_intro")}</p>
          <p>{tDynamic("guide_ratios_swap_laps")}</p>
          <p>
            {tDynamic("guide_ratios_swap_formula_before")}
            <code>|P − H|</code>{tDynamic("guide_ratios_swap_formula_between")}
            <code>P + H</code>{tDynamic("guide_ratios_swap_formula_after")}
          </p>
          <p>
            {tDynamic("guide_ratios_swap_quarter_before")}
            <LinkChip size="inline" href="#ends-heading">{tDynamic("guide_ratios_one_or_two")}</LinkChip>{tDynamic("guide_ratios_swap_quarter_after")}
          </p>
        </div>

        <RatioSwapMotion panels={swapPanels} />
      </section>
    </section>

    <section class="twelve" aria-labelledby="twelve-heading">
      <div class="twelve-copy">
        <h2 id="twelve-heading">{tDynamic("guide_ratios_twelve_title")}</h2>
        <p>{tDynamic("guide_ratios_twelve_intro")}</p>
        <p>{tDynamic("guide_ratios_twelve_example")}</p>
      </div>

      <div class="family-band">
        <div class="family-list">
          {#each families as family (family.turns)}
            <section class="family" aria-label={tDynamic("guide_ratios_family", { ratio: family.ratio })}>
              <header class="family-head">
                <span class="family-ratio">{family.ratio}</span>
                <span class="family-turns"
                  >{tDynamic("guide_ratios_family_turns", { turns: turnWords(family.turns), level: family.level })}</span
                >
                <LinkChip class="family-link" href={bandHref(family.turns)}>
                  {tDynamic("guide_ratios_open_band", { ratio: family.ratio })}
                </LinkChip>
              </header>
              <ol class="family-shapes">
                {#each family.shapes as flower (flowerKey(flower))}
                  <li>
                    <span class="still still-md">
                      <ShapeMatrixMandalaArt
                        paint={paintFlower(flower)}
                        artKey={flowerKey(flower)}
                        alt={flowerAlt(flower)}
                      />
                    </span>
                    <span class="shape-name">{styleWord(flower.style)}</span>
                    <span class="shape-meta">
                      {tDynamic("guide_ratios_flower_start", { petals: petalWord(flower.petals), direction: tDynamic(flower.ori === "in" ? "guide_ratios_in" : "guide_ratios_out") })}
                    </span>
                  </li>
                {/each}
              </ol>
            </section>
          {/each}
        </div>
      </div>
    </section>

    <section class="ends" aria-labelledby="ends-heading">
      <div class="ends-copy">
        <h2 id="ends-heading">{tDynamic("guide_ratios_one_or_two")}</h2>
        <p>{tDynamic("guide_ratios_ends_intro")}</p>
        <p>{tDynamic("guide_ratios_ends_opposite")}</p>
        <p>{tDynamic("guide_ratios_ends_level1")}</p>
        <p>
          {tDynamic("guide_ratios_ends_level4_before")}{SHAPE_ENGINE_SHORT_NAME}{tDynamic("guide_ratios_ends_level4_after")}
        </p>
      </div>

      <div class="ends-board">
        {#each endsLevels as tray (tray.level)}
          <section
            class="ends-level"
            aria-labelledby={`ends-level-${tray.level}`}
            style="--level-tint: {levelTint(tray.level)}"
          >
            <header class="ends-level-head">
              <DifficultyBadge level={tray.level} size="1.6rem" />
              <span id={`ends-level-${tray.level}`} class="level-name"
                >{tDynamic("guide_ratios_level_heading", { level: tray.level, name: tray.name })}</span
              >
            </header>
            <ul class="ends-cards" role="list">
              {#each tray.cases as item (`${item.ratio}-${item.style}`)}
                <li class="ends-card">
                  <p class="ends-head">
                    <span class="ends-ratio">{item.ratio}</span>
                    <span class="ends-style">{styleWord(item.style)}</span>
                  </p>
                  <div class="ends-sum">
                    {#each item.frames as frame, index (frame.label)}
                      <div class="ends-frame" class:ends-both={index === 2}>
                        <span class="still">
                          {#if index > 0}
                            <span class="sum-op" aria-hidden="true"
                              >{index === 1 ? "+" : "="}</span
                            >
                          {/if}
                          <ShapeMatrixMandalaArt
                            paint={paintTogether(frame.flowers)}
                            artKey={`ends-${frame.flowers.map((flower) => flowerKey(flower)).join("+")}`}
                            alt={`${item.ratio} ${styleWord(item.style).toLowerCase()}, ${frame.label.toLowerCase()}: ${frame.meta.toLowerCase()}`}
                          />
                        </span>
                        <span class="ends-label">{frame.label}</span>
                        <span class="ends-meta">{frame.meta}</span>
                      </div>
                    {/each}
                  </div>
                </li>
              {/each}
            </ul>
            <p class="ends-summary">{tray.summary}</p>
          </section>
        {/each}
      </div>
    </section>

    <section class="pairings" aria-labelledby="pairings-heading">
      <div class="pairings-copy">
        <h2 id="pairings-heading">{tDynamic("guide_ratios_pairings_title")}</h2>
        <p>{tDynamic("guide_ratios_pairings_intro")}</p>
        <p>
          {tDynamic("guide_ratios_pairings_choose_before")}{SHAPE_ENGINE_SHORT_NAME}{tDynamic("guide_ratios_pairings_choose_after")}
        </p>
        <p class="scroll-hint">
          {tDynamic("guide_ratios_pairings_scroll")}
        </p>
      </div>

      <figure class="anatomy">
        <div class="anatomy-sum">
          <div class="anatomy-part">
            <span class="still">
              <ShapeMatrixMandalaArt
                paint={paintHand(anatomyLeft, "left")}
                artKey={`anatomy-left-${flowerKey(anatomyLeft)}`}
                alt={tDynamic("guide_ratios_anatomy_left_alt")}
              />
            </span>
            <span class="anatomy-label">{tDynamic("guide_ratios_row_left")}</span>
          </div>
          <div class="anatomy-part">
            <span class="still">
              <span class="sum-op" aria-hidden="true">+</span>
              <ShapeMatrixMandalaArt
                paint={paintHand(anatomyRight, "right")}
                artKey={`anatomy-right-${flowerKey(anatomyRight)}`}
                alt={tDynamic("guide_ratios_anatomy_right_alt")}
              />
            </span>
            <span class="anatomy-label">{tDynamic("guide_ratios_column_right")}</span>
          </div>
          <div class="anatomy-part anatomy-cell">
            <span class="still">
              <span class="sum-op" aria-hidden="true">=</span>
              <ShapeMatrixMandalaArt
                paint={paintCell(anatomyLeft, anatomyRight)}
                artKey={`anatomy-cell-${flowerKey(anatomyLeft)}-${flowerKey(anatomyRight)}`}
                alt={tDynamic("guide_ratios_anatomy_cell_alt")}
              />
            </span>
            <span class="anatomy-label">{tDynamic("guide_ratios_cell")}</span>
          </div>
        </div>
        <figcaption>
          {tDynamic("guide_ratios_pairing_caption")}
          <LinkChip class="pairing-link" href={pairHref(anatomyLeft, anatomyRight)}
            >{tDynamic("guide_ratios_open_pairing")}</LinkChip
          >
        </figcaption>
      </figure>

      <div class="matrix-stage">
        {#if loadError}
          <p class="load-status error">{tDynamic("guide_ratios_drawings_unavailable")}</p>
        {:else if !data}
          <p class="load-status">{tDynamic("guide_ratios_building_flowers")}</p>
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

      <section class="beyond" aria-labelledby="beyond-heading">
        <h3 id="beyond-heading">{tDynamic("guide_ratios_beyond_title")}</h3>
        <p>{tDynamic("guide_ratios_beyond_body")}</p>
      </section>
    </section>

    <section class="sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">{tDynamic("guide_ratios_sources")}</h2>
      <ul class="source-list">
        <li>
          <LinkChip href={ORIGINAL_SHAPE_MATRIX_URL} newTabLabel={tDynamic("guide_ratios_new_tab")}
            >{tDynamic("guide_ratios_source_label", { author: "Lorq Nichols", name: ORIGINAL_SHAPE_MATRIX_NAME })}</LinkChip
          >
        </li>
        <li>
          <LinkChip href="/history#archive-record-vtg">{tDynamic("guide_ratios_vtg_record")}</LinkChip>
        </li>
        <li>
          <LinkChip href="/history#archive-record-lorq">{tDynamic("guide_ratios_lorq_record")}</LinkChip>
        </li>
        <li><LinkChip href="/shape-engine">{SHAPE_ENGINE_SHORT_NAME}</LinkChip></li>
      </ul>
      <p class="attribution">
        {tDynamic("guide_ratios_attribution_before")}{SHAPE_ENGINE_SHORT_NAME}{tDynamic("guide_ratios_attribution_middle")}{KINETIC_SHAPE_ENGINE_AUTHOR}{tDynamic("guide_ratios_attribution_after")}
      </p>
    </section>
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

  .ratios code {
    padding: 0.1em 0.35em;
    border-radius: 5px;
    background: var(--surface);
    color: var(--ink);
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.92em;
    white-space: nowrap;
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
  .ends,
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

  .ladder-copy p:last-child {
    margin-bottom: 0;
  }

  .ladder-note {
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
  }

  /* A level's tray. Each level on the page sits in its own tray, tinted with
     its badge colour, so the levels read apart even where they share a row. */
  .level-group,
  .ends-level {
    border: 1px solid color-mix(in srgb, var(--level-tint) 30%, transparent);
    border-radius: 18px;
    background: color-mix(in srgb, var(--level-tint) 7%, transparent);
  }

  /* Level 1 sits apart from the board with its two cards, one per start.
     Once its tray holds them side by side they take the board's wide card
     layout; on a phone they are the same row cards as the rest. */
  .base-tray {
    container: base-tray / inline-size;
    align-self: start;
  }

  .base-cards {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @container base-tray (min-width: 30rem) {
    .base-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* Doubled class: the board's card rules come later in the file. */
    .base-card.ratio-card {
      --card-still: 9rem;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      gap: 0.6rem;
      padding: 0.75rem;
    }

    .base-card.ratio-card .card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.2rem 0.5rem;
    }
  }

  /* The board, not the grid, is the container, because a container query
     answers for an ancestor. Below the first tier each level is a heading
     over a list of wide cards, one per row. */
  .ladder-board {
    container: ladder-board / inline-size;
  }

  .ladder-grid {
    display: grid;
    gap: 1rem;
  }

  .level-group {
    display: grid;
    gap: 0.6rem;
    padding: 0.6rem;
  }

  /* The badge is the same numeral the cards carry, so a level reads the same
     here as it does on a deck. The rule under it runs the width of the
     level's own cards, which is what marks where one level ends and the next
     begins on a shared row. */
  .level-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid
      color-mix(in srgb, var(--level-tint) 26%, transparent);
  }

  .level-title {
    display: grid;
    gap: 0.1rem;
    min-inline-size: 0;
  }

  .level-name {
    color: var(--ink);
    font-size: 1.02rem;
    font-weight: 660;
    line-height: 1.2;
  }

  .level-blurb {
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.3;
  }

  .ratio-cards {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Narrow card: the ratio and its turns on the left, the two flowers side
     by side on the right, each with its style and count under it. */
  .ratio-card {
    --card-still: 3.25rem;
    display: grid;
    grid-template-columns: 4.75rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
    font-variant-numeric: tabular-nums;
  }

  .ratio-card.family-card {
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
  }

  .card-head {
    display: grid;
    gap: 0.1rem;
    margin: 0;
  }

  .card-ratio {
    color: var(--ink);
    font-size: 1.1rem;
    font-weight: 660;
    line-height: 1.2;
  }

  .card-turns {
    color: var(--ink-dim);
    font-size: var(--font-size-compact, 0.78rem);
    white-space: nowrap;
  }

  .card-flowers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  /* One fixed track: a label wider than its half must not widen the track,
     or the still, sized to the track, grows on that side only. */
  .card-flower {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    align-content: start;
    gap: 0.1rem;
    min-inline-size: 0;
    text-align: center;
  }

  /* The still fills its half of the card up to the tier's size, so the two
     flowers stay equal and never push the card wider. */
  .card-flower .still {
    inline-size: min(100%, var(--card-still));
    margin-bottom: 0.2rem;
  }

  /* A card's flowers as a table: styles across the top, one row per start
     with each flower's facing under it, and petal counts along the foot,
     since a ratio's two starts share them. */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-items: center;
    align-items: center;
    gap: 0.3rem 0.5rem;
    min-inline-size: 0;
    text-align: center;
  }

  .card-grid .still,
  .float-start .still {
    inline-size: min(100%, var(--card-still));
  }

  .card-facing {
    color: var(--ink-faint);
    font-size: 0.64rem;
    font-weight: 640;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Float's four starts in two by two, each labelled under its circle. */
  .card-float {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    min-inline-size: 0;
    text-align: center;
  }

  .float-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.3rem 0.5rem;
    inline-size: 100%;
  }

  .float-start {
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    min-inline-size: 0;
  }

  .card-style {
    color: var(--ink-faint);
    font-size: 0.7rem;
    font-weight: 640;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .card-petals {
    color: var(--ink);
    font-size: var(--font-size-compact, 0.78rem);
    font-weight: 600;
  }

  .float-words {
    max-inline-size: 16rem;
    color: var(--ink-dim);
    font-size: var(--font-size-compact, 0.78rem);
    line-height: 1.35;
  }

  .ladder-aside {
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    color: var(--ink-dim);
    font-size: var(--font-size-compact, 0.78rem);
    line-height: 1.45;
  }

  /* Two across on a tablet, then four, then eight. Every level spans its own
     tracks on a shared grid and borrows the grid's rows through subgrid, so
     the headings on one row sit on one line and every card on a row is the
     same height.

     A tray's padding and its tighter gap come out of the tracks at its
     edges, so its end cards run a little narrower than its middle ones. The
     flowers take one size from the board's width instead of filling their
     card, sized for an end card, so every flower on the board matches:
     half of a track, less the tray padding, the gap difference, the card
     padding, and the gap between the two flowers. */
  @container ladder-board (min-width: 34rem) {
    /* Trays sit further apart than the cards inside them, which a subgrid's
       own gap allows. */
    .ladder-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.9rem;
    }

    .level-group {
      grid-column: span var(--span-2);
      grid-row: span var(--rows-2);
      grid-template-columns: subgrid;
      grid-template-rows: subgrid;
      gap: 0.5rem;
    }

    .level-head {
      grid-column: 1 / -1;
      align-self: end;
    }

    .ratio-cards {
      display: contents;
    }

    /* Wide card: ratio and turns across the top, the flowers under them. */
    .ratio-card {
      --card-still: min(7.5rem, calc((100cqi - 0.9rem) / 4 - 1.5rem));
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto 1fr;
      align-items: start;
      gap: 0.6rem;
      padding: 0.75rem;
    }

    .card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.2rem 0.5rem;
    }

    .ladder-aside {
      display: grid;
      align-content: center;
    }
  }

  /* Four across: Levels 2 and 3 fill a row each and Level 4 fills two. */
  @container ladder-board (min-width: 52rem) {
    .ladder-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .level-group {
      grid-column: span var(--span-4);
      grid-row: span var(--rows-4);
    }

    .ratio-card {
      --card-still: min(7.5rem, calc((100cqi - 2.7rem) / 8 - 1.5rem));
    }
  }

  /* Eight across: Levels 2 and 3 share the first row and Level 4 fills the
     second. */
  @container ladder-board (min-width: 96rem) {
    .ladder-grid {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }

    .level-group {
      grid-column: span var(--span-8);
      grid-row: span var(--rows-8);
    }

    .ratio-card {
      --card-still: min(7.5rem, calc((100cqi - 6.3rem) / 16 - 1.5rem));
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

  /* The band's pill sits at the header's end; the header wraps it under
     the ratio when the card is too narrow for both. */
  .family-head :global(.family-link) {
    margin-left: auto;
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

  /* One end or two. Each card is a sum: the in start plus the out start is
     what a staff draws with both ends. */
  .ends-copy p:last-child {
    margin-bottom: 0;
  }

  /* Four trays, one per level, each holding that level's prospin and
     antispin. Two trays across once each can hold its pair side by side. */
  .ends {
    container: ends / inline-size;
  }

  .ends-board {
    display: grid;
    gap: 1rem;
  }

  @container ends (min-width: 74rem) {
    .ends-board {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .ends-level {
    container: ends-level / inline-size;
    display: grid;
    align-content: start;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .ends-level-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.1rem 0.25rem 0.6rem;
    border-bottom: 1px solid
      color-mix(in srgb, var(--level-tint) 26%, transparent);
  }

  .ends-cards {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @container ends-level (min-width: 30rem) {
    .ends-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .ends-card {
    display: grid;
    align-content: start;
    gap: 0.75rem;
    margin: 0;
    padding: 0.9rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
  }

  .ends-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }

  .ends-ratio {
    color: var(--ink);
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
    font-weight: 660;
  }

  .ends-style {
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
  }

  /* Three frames with room between them for the operators. Each operator
     sits in the still it leads into, centred on the gap before it, so it
     lines up with the drawings rather than with the words under them. */
  .ends-sum,
  .anatomy-sum {
    --op-gap: 1.5rem;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: var(--op-gap);
  }

  /* An end card leads with its answer: the two starts stack small in the
     narrow track and what the staff draws takes the wide one. */
  .ends-sum {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    row-gap: 1.75rem;
    max-inline-size: 27rem;
    margin-inline: auto;
    inline-size: 100%;
  }

  .ends-both {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
  }

  /* The plus sits in the gap under the first start's words. */
  .ends-frame:nth-child(2) .sum-op {
    top: -0.9rem;
    left: 50%;
  }

  .ends-frame,
  .anatomy-part {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.1rem;
    min-inline-size: 0;
    text-align: center;
  }

  .ends-frame .still,
  .anatomy-part .still {
    position: relative;
    inline-size: 100%;
    margin-bottom: 0.35rem;
  }

  .sum-op {
    position: absolute;
    top: 50%;
    left: calc(var(--op-gap) / -2);
    z-index: 1;
    color: var(--ink-faint);
    font-size: 1.25rem;
    line-height: 1;
    transform: translate(-50%, -50%);
  }

  .ends-label,
  .anatomy-label {
    color: var(--ink);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 620;
  }

  .ends-meta {
    color: var(--ink-faint);
    font-size: var(--font-size-compact, 0.78rem);
  }

  .ends-summary {
    margin: 0;
    padding-inline: 0.25rem;
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  /* Reading a cell: the row's flower plus the column's flower is the tile. */
  .anatomy {
    margin: 0;
    padding: 1rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
  }

  .anatomy figcaption {
    margin-top: 0.85rem;
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  .anatomy figcaption :global(.pairing-link) {
    display: flex;
    inline-size: fit-content;
    margin-top: 0.75rem;
  }

  /* Same petals, different laps: 1:2 and 2:1 moving side by side, each in
     its own level's tray. */
  .swap {
    display: grid;
    gap: 1.25rem;
    padding-top: 0.5rem;
  }

  .reading-copy h3,
  .swap-copy h3,
  .beyond h3 {
    margin: 0 0 0.6rem;
    color: var(--ink);
    font-size: 1.1rem;
    font-weight: 660;
  }

  .swap-copy p:last-child {
    margin-bottom: 0;
  }

  .beyond p {
    margin: 0;
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

  /* Stacked, the cell figure keeps to a reading width so its flowers stay
     the size of the ladder's rather than growing across the band. */
  .anatomy {
    max-inline-size: 40rem;
  }

  /* Once the band is wide enough, the cell figure stands beside the prose
     and the matrix runs full width under both. */
  @media (min-width: 80rem) and (max-width: 119.99rem) {
    .pairings {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      grid-template-areas:
        "copy anatomy"
        "stage stage"
        "beyond beyond";
      column-gap: var(--gutter);
    }

    .pairings-copy {
      grid-area: copy;
    }

    .anatomy {
      grid-area: anatomy;
      align-self: center;
    }

    .matrix-stage {
      grid-area: stage;
    }

    .beyond {
      grid-area: beyond;
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

  .sources {
    padding-top: clamp(1.75rem, 3vw, 2.75rem);
    border-top: 1px solid var(--rule);
  }

  /* The sources are a row of pills that wraps, so no width leaves them in a
     narrow column beside empty space. */
  .source-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0 0 1.5rem;
    padding: 0;
    list-style: none;
  }

  .source-list li {
    margin: 0;
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
      margin-inline: auto;
      text-align: center;
    }

    .twelve {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      align-items: start;
    }
  }

  /* On a wide band the end cards' prose runs in two columns across the top,
     and the four trays sit two by two under it, so neither leaves a strip of
     empty band beside the other. */
  @media (min-width: 80rem) {
    .ends-copy {
      columns: 2;
      column-gap: var(--gutter);
    }

    .ends-copy h2 {
      column-span: all;
    }
  }

  @media (min-width: 96rem) {
    /* Level 1's tray takes the band beside the ladder's prose. */
    .ladder {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      column-gap: var(--gutter);
    }

    .ladder-board,
    .swap {
      grid-column: 1 / -1;
    }

    .swap {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      column-gap: var(--gutter);
      align-items: center;
    }
  }

  /* The matrix sits beside its prose only once the band
     holds a reading column and the whole grid at its 72px tiles, which the
     guide's sidebar allows from about a 1920px screen. */
  @media (min-width: 120rem) {
    .pairings {
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      column-gap: var(--gutter);
    }

    /* The matrix runs taller than its prose, so the column beside it
       carries the rest of the section: how to read one cell, then where the
       pairing goes past the twelve. Spare height gathers around the cell
       figure and the last paragraph ends level with the grid's foot. */
    .pairings {
      grid-template-areas:
        "copy stage"
        "anatomy stage"
        "beyond stage";
      grid-template-rows: auto 1fr auto;
    }

    .pairings-copy {
      grid-area: copy;
    }

    .anatomy {
      grid-area: anatomy;
      align-self: center;
      max-inline-size: none;
    }

    .matrix-stage {
      grid-area: stage;
    }

    .beyond {
      grid-area: beyond;
      align-self: end;
    }
  }

  /* With 88px tiles the matrix stands 1150px tall. The two hand flowers
     stack in a narrow track and the cell they make takes the wide one, so
     the cell reads larger and the column beside the matrix reaches its
     foot. */
  @media (min-width: 137.5rem) {
    .anatomy-sum {
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      row-gap: 2rem;
    }

    .anatomy-cell {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
    }

    /* The plus sits in the gap under the first flower's label. */
    .anatomy-part:nth-child(2) .sum-op {
      top: -1rem;
      left: 50%;
    }
  }
</style>
