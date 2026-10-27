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
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";
  import Sentences from "../_components/Sentences.svelte";
  import { sentences } from "../_components/sentences";
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
  import { SHAPE_MATRIX_LEVELS } from "#lib/shared/shape-matrix/app/shape-matrix-levels.js";
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
  // Languages that close the sentence after the link end it with bare punctuation.
  const spaced = (text: string) => (/^[.,;:!?]/.test(text) ? text : ` ${text}`);
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
    if (petals % 2 === 1)
      return tDynamic(
        atBottom ? "guide_ratios_petal_down" : "guide_ratios_petal_up"
      );
    if (petals % 4 === 2)
      return tDynamic(
        atBottom ? "guide_ratios_vertical" : "guide_ratios_horizontal"
      );
    if (petals === 4)
      return tDynamic(atBottom ? "guide_ratios_diamond" : "guide_ratios_box");
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
  const ladder = $derived(
    matrixTurnsForLevel(4).map((turns: TurnValue) => ({
      turns,
      ratio: ratioLabel(turns),
      level: levelForTurnValue(turns),
      turnLabel:
        turns === "fl" ? tDynamic("guide_ratios_float_name") : String(turns),
      turnWords:
        turns === "fl"
          ? tDynamic("guide_ratios_float_name")
          : turnWords(turns as number),
      family: turns === 0 || turns === 1 || turns === 2,
      starts: turns === "fl" ? null : cardStarts(turns as number),
    }))
  );

  /* The ladder groups by level, because that is the order a reader meets
     these turn values in: each level opens a set of new ratios on top of the
     ones below it. Names and blurbs come from the level table the matrix
     selector reads, so the page and the selector cannot disagree. */
  const levelGroups = $derived(
    SHAPE_MATRIX_LEVELS.map((level) => {
      const rows = ladder.filter((row) => row.level === level);
      /* Whole turns and quarter turns each carry one note card after their
       ratios: how a turn adds petals, and the two hand cycle arithmetic. */
      const noted = level === WHOLE_TURN_LEVEL || level === QUARTER_TURN_LEVEL;
      const cells = rows.length + (noted ? 1 : 0);
      return {
        level,
        name: tDynamic(`guide_ratios_level_${level}_name`),
        blurb: tDynamic(`guide_ratios_level_${level}_blurb`),
        rows,
        cells,
      };
    }).filter((group) => group.level !== BASE_LEVEL && group.rows.length > 0)
  );

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
  const BASE_NAMES = {
    in: "guide_ratios_isolation",
    out: "guide_ratios_extension",
  } as const;
  const baseLevel = $derived({
    name: tDynamic("guide_ratios_level_1_name"),
    blurb: tDynamic("guide_ratios_level_1_blurb"),
  });
  const baseRatio = ratioLabel(0);
  const baseCards = $derived(
    (["in", "out"] as const).map((ori) => ({
      ori,
      label: tDynamic(
        ori === "in" ? "guide_ratios_starts_in" : "guide_ratios_starts_out"
      ),
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
    }))
  );

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
    return tDynamic(
      size === 1 ? "guide_ratios_one_turn" : "guide_ratios_many_turns",
      { count: `${sign}${size}` }
    );
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
            names?.out ??
            (twoCycles
              ? tDynamic("guide_ratios_same_path")
              : petalWord(far.petals)),
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
    endsLevel(0, tDynamic("guide_ratios_ends_summary_1"), {
      in: tDynamic("guide_ratios_isolation"),
      out: tDynamic("guide_ratios_extension"),
      both: tDynamic("guide_ratios_point_in_circle"),
    }),
    endsLevel(1, tDynamic("guide_ratios_ends_summary_2")),
    endsLevel(0.5, tDynamic("guide_ratios_ends_summary_3")),
    endsLevel(0.25, tDynamic("guide_ratios_ends_summary_4")),
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
    return tDynamic(
      style === "pro" ? "guide_ratios_prospin" : "guide_ratios_antispin"
    );
  }

  function petalWord(petals: number): string {
    if (petals === 0) return tDynamic("guide_ratios_no_petals");
    return tDynamic(
      petals === 1 ? "guide_ratios_one_petal" : "guide_ratios_many_petals",
      { count: petals }
    );
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

  // The origins line continues after its inline link; its first sentence
  // closes the link's sentence, the rest set their own lines.
  const originsAfter = $derived(
    sentences(
      tDynamic("guide_ratios_origins_after", {
        name: ORIGINAL_SHAPE_MATRIX_NAME,
      })
    )
  );

  // One screen at a time (2026-10-24 fit pass). The reference reads in the
  // order it always did, a screen per idea: the two counts, reading a
  // ratio, the ladder level by level, the swap, the original twelve, one
  // end or two, then the 144 pairings. A phone keeps each screen to a few
  // sentences and shows one tray at a time.
  type RatioView = { label: string; parts: string[]; duo?: boolean };
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const small = $derived(tier === "small");
  const levelLabel = (level: number) =>
    tDynamic("guide_ratios_level_heading", {
      level,
      name: tDynamic(`guide_ratios_level_${level}_name`),
    });
  const views = $derived.by((): RatioView[] => {
    const reading = tDynamic("guide_ratios_reading");
    const ladderTitle = tDynamic("guide_ratios_ladder");
    const swap = tDynamic("guide_ratios_swap_title");
    const twelve = tDynamic("guide_ratios_twelve_title");
    const ends = tDynamic("guide_ratios_one_or_two");
    const pairings = tDynamic("guide_ratios_pairings_title");
    if (tier === "small") {
      return [
        { label: "Two counts", parts: ["intro:0-2"] },
        { label: "Turns", parts: ["intro:2-"] },
        { label: "Three ratios", parts: ["origins"] },
        { label: reading, parts: ["h:reading", "terms"] },
        { label: "Converting", parts: ["formula"] },
        { label: "Petals", parts: ["petals"] },
        { label: tDynamic("guide_ratios_float_name"), parts: ["float"] },
        { label: tDynamic("guide_ratios_example_caption"), parts: ["worked"] },
        { label: "Common names", parts: ["names"] },
        { label: ladderTitle, parts: ["h:ladder", "ladderIntro"] },
        { label: "Four flowers", parts: ["ladderOri:0-2"] },
        { label: "How a flower sits", parts: ["ladderOri:2-3"] },
        { label: "Quarter turn flowers", parts: ["ladderOri:3-"] },
        { label: levelLabel(1), parts: ["tinted", "base"] },
        // Two cards a screen: a phone draws each card's flowers large
        // enough to read.
        ...levelGroups.flatMap((group) =>
          Array.from({ length: Math.ceil(group.cells / 2) }, (_, k) => ({
            label:
              k === 0
                ? levelLabel(group.level)
                : `${levelLabel(group.level)} (${k + 1})`,
            parts: [`level-${group.level}:${k * 2}-${k * 2 + 2}`],
          }))
        ),
        { label: swap, parts: ["h:swap", "swapIntro"] },
        { label: "Laps", parts: ["swapLaps"] },
        { label: "Watch: 1:2 and 2:1", parts: ["swapMotion"] },
        { label: "Counting petals", parts: ["swapFormula"] },
        { label: "Quarter turns lap twice", parts: ["swapQuarter"] },
        { label: twelve, parts: ["h:twelve", "twelveIntro:0-2"] },
        { label: "In or out", parts: ["twelveIntro:2-"] },
        { label: "1:1 prospin", parts: ["twelveExample"] },
        ...families.map((family, i) => ({
          label: tDynamic("guide_ratios_family", { ratio: family.ratio }),
          parts: [`family-${i}`],
        })),
        { label: ends, parts: ["h:ends", "endsIntro"] },
        { label: "A staff draws both", parts: ["endsOpposite"] },
        { label: "Ends at Level 1", parts: ["endsL1"] },
        { label: "Ends past Level 1", parts: ["endsL4:0-2"] },
        { label: "Ends at Level 4", parts: ["endsL4:2-"] },
        // A phone shows one ends card at a time: its words don't shrink.
        ...endsLevels.flatMap((tray) =>
          tray.cases.map((_, k) => ({
            label:
              k === 0
                ? `Both ends: Level ${tray.level}`
                : `Both ends: Level ${tray.level} (${k + 1})`,
            parts: [`ends-${tray.level}:${k}`],
          }))
        ),
        { label: pairings, parts: ["h:pairings", "pairingsIntro"] },
        { label: "Opening a cell", parts: ["pairingsChoose"] },
        { label: tDynamic("guide_ratios_cell"), parts: ["anatomy"] },
        { label: "The matrix", parts: ["scrollHint", "matrix"] },
        { label: tDynamic("guide_ratios_beyond_title"), parts: ["beyond"] },
        { label: tDynamic("guide_ratios_sources"), parts: ["sources"] },
      ];
    }
    const medium = tier === "medium";
    return [
      { label: "Two counts", parts: ["intro", "origins"] },
      ...(medium
        ? [
            {
              label: reading,
              parts: ["h:reading", "terms", "formula", "worked"],
              duo: true,
            },
            { label: "Petals", parts: ["petals", "float"] },
          ]
        : [
            {
              label: reading,
              parts: [
                "h:reading",
                "terms",
                "formula",
                "petals",
                "float",
                "worked",
              ],
              duo: true,
            },
          ]),
      { label: "Common names", parts: ["names"] },
      { label: ladderTitle, parts: ["h:ladder", "ladderIntro", "ladderOri"] },
      { label: levelLabel(1), parts: ["tinted", "base"] },
      ...(medium
        ? [
            { label: levelLabel(2), parts: ["level-2"] },
            { label: levelLabel(3), parts: ["level-3"] },
          ]
        : [{ label: "Levels 2 and 3", parts: ["level-2", "level-3"] }]),
      { label: levelLabel(4), parts: ["level-4"] },
      ...(medium
        ? [
            {
              label: swap,
              parts: ["h:swap", "swapIntro", "swapLaps", "swapMotion"],
              duo: true,
            },
            { label: "Counting petals", parts: ["swapFormula", "swapQuarter"] },
          ]
        : [
            {
              label: swap,
              parts: [
                "h:swap",
                "swapIntro",
                "swapLaps",
                "swapFormula",
                "swapQuarter",
                "swapMotion",
              ],
              duo: true,
            },
          ]),
      { label: twelve, parts: ["h:twelve", "twelveIntro", "twelveExample"] },
      { label: "Three families", parts: ["families"] },
      { label: ends, parts: ["h:ends", "endsIntro", "endsOpposite"] },
      { label: "Ends level by level", parts: ["endsL1", "endsL4"] },
      { label: "Both ends: Levels 1 and 2", parts: ["ends-1", "ends-2"] },
      { label: "Both ends: Levels 3 and 4", parts: ["ends-3", "ends-4"] },
      {
        label: pairings,
        parts: ["h:pairings", "pairingsIntro", "pairingsChoose", "anatomy"],
        duo: true,
      },
      { label: "The matrix", parts: ["matrix"] },
      {
        label: tDynamic("guide_ratios_beyond_title"),
        parts: ["beyond", "sources"],
      },
    ];
  });

  /** The one ends card a part names ("ends-2:1" is Level 2's second), or
   * undefined for the whole tray. */
  function shownEndsCase(
    visuals: string[],
    tray: EndsLevel
  ): number | undefined {
    const part = visuals.find((p) => partName(p) === `ends-${tray.level}`);
    const k = part?.split(":")[1];
    return k === undefined ? undefined : Number(k);
  }
  const VISUAL = /^(worked|base|level-|swapMotion|famil|ends-|anatomy|matrix)/;
  const isText = (part: string) => !VISUAL.test(part);
  /** A text part's sentence slice: "intro:2-" is the intro from its third
   * sentence on. */
  function slice(text: string, part: string): string {
    const range = part.split(":")[1];
    if (!range) return text;
    const [a, b] = range.split("-");
    return sentences(text)
      .slice(Number(a), b ? Number(b) : undefined)
      .join(" ");
  }
  const partName = (part: string) => part.split(":")[0]!;
  /** Rows of a level part: "level-4:4-" is Level 4 from its fifth card. */
  function levelPart(part: string) {
    const level = Number(partName(part).slice("level-".length));
    const group = levelGroups.find((g) => g.level === level);
    const range = part.split(":")[1];
    const [a, b] = range ? range.split("-").map(Number) : [0, undefined];
    const from = a ?? 0;
    const rows = group ? group.rows.slice(from, b || undefined) : [];
    return {
      group,
      rows,
      head: from === 0,
      // The note card sits after the last row: shown by the slice that
      // reaches past it.
      aside:
        !group || !b || (from <= group.rows.length && b > group.rows.length),
    };
  }
  // The petals and swap paragraphs point at "One end or two": its screen.
  const endsHref = $derived(
    `?screen=${views.findIndex((v) => v.parts.includes("h:ends")) + 1}`
  );
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
  <main
    class="ratios guide-page-route"
    class:small
    style="--tracks: {MATRIX_TRACKS}"
  >
    <GuideScreens
      title={tDynamic("guide_ratios_title")}
      labels={views.map((v) => v.label)}
      prevPage={{
        href: localHref("/guide/level-2"),
        title: tDynamic("guide_hub_level2_title"),
      }}
      nextPage={{
        href: localHref("/guide/motion-paths"),
        title: tDynamic("guide_hub_motion_paths_title"),
      }}
      hubHref={localHref("/guide")}
    >
      {#snippet screen(n)}
        {@const view = views[n]!}
        {@const texts = view.parts.filter(isText)}
        {@const visuals = view.parts.filter((p) => !isText(p))}
        {@const levels = visuals.filter((p) => p.startsWith("level-"))}
        {@const trays = endsLevels.filter((tray) =>
          visuals.some((p) => partName(p) === `ends-${tray.level}`)
        )}
        {@const shownFamilies = families.filter(
          (_, i) =>
            visuals.includes("families") || visuals.includes(`family-${i}`)
        )}
        <div
          class="screen"
          class:duo={view.duo && texts.length && visuals.length}
        >
          {#if texts.length}
            <div class="copy">
              {#if n === 0 && loadError}
                <p class="notice error" role="alert">
                  {tDynamic("guide_ratios_load_error")}
                  <span class="notice-detail">{loadError}</span>
                </p>
              {/if}
              {#each texts as part (part)}
                {@render textPart(part)}
              {/each}
            </div>
          {/if}

          {#if visuals.length}
            <div class="visuals">
              {#if visuals.includes("worked")}
                {@render worked()}
              {/if}
              {#if visuals.includes("base")}
                {@render baseTray()}
              {/if}
              {#if levels.length}
                <div class="board" class:pair={levels.length > 1 && !small}>
                  {#each levels as part (part)}
                    {@render levelTray(part)}
                  {/each}
                </div>
              {/if}
              {#if visuals.includes("swapMotion")}
                <div class="swap-motion">
                  <RatioSwapMotion panels={swapPanels} />
                </div>
              {/if}
              {#if shownFamilies.length}
                <div class="family-band">
                  <div
                    class="family-list"
                    class:solo={shownFamilies.length === 1}
                  >
                    {#each shownFamilies as family (family.turns)}
                      {@render familyCard(family)}
                    {/each}
                  </div>
                </div>
              {/if}
              {#if trays.length}
                <div class="board" class:pair={trays.length > 1 && !small}>
                  {#each trays as tray (tray.level)}
                    {@render endsTray(tray, shownEndsCase(visuals, tray))}
                  {/each}
                </div>
              {/if}
              {#if visuals.includes("anatomy")}
                {@render anatomy()}
              {/if}
              {#if visuals.includes("matrix")}
                {@render matrix()}
              {/if}
            </div>
          {/if}
        </div>
      {/snippet}
    </GuideScreens>
  </main>
</GuideShell>

{#snippet textPart(part: string)}
  {@const name = partName(part)}
  {#if name === "intro"}
    <p><Sentences text={slice(tDynamic("guide_ratios_intro"), part)} /></p>
  {:else if name === "origins"}
    <!-- The Spin Science link sits mid-sentence: the sentence it closes
         takes the link and the first sentence of the text after it. -->
    <p>
      <Sentences text={tDynamic("guide_ratios_origins_before")}
        >{#snippet tail()}{" "}<LinkChip
            size="inline"
            href={SPIN_SCIENCE_URL}
            newTabLabel={tDynamic("guide_ratios_new_tab")}
            >Spin Science</LinkChip
          >{originsAfter[0]}{/snippet}</Sentences
      >{" "}<Sentences text={originsAfter.slice(1).join(" ")} />
    </p>
  {:else if name === "h"}
    {@const key = part.split(":")[1]}
    {#if key === "reading"}
      <h2>{tDynamic("guide_ratios_reading")}</h2>
    {:else if key === "ladder"}
      <h2>{tDynamic("guide_ratios_ladder")}</h2>
    {:else if key === "swap"}
      <h2>{tDynamic("guide_ratios_swap_title")}</h2>
    {:else if key === "twelve"}
      <h2>{tDynamic("guide_ratios_twelve_title")}</h2>
    {:else if key === "ends"}
      <h2 id="ends-heading">{tDynamic("guide_ratios_one_or_two")}</h2>
    {:else if key === "pairings"}
      <h2>{tDynamic("guide_ratios_pairings_title")}</h2>
    {/if}
  {:else if name === "terms"}
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
  {:else if name === "formula"}
    <p>
      {tDynamic("guide_ratios_formula_before")}
      <code>P / H = 2 × turns + 1</code>{tDynamic(
        "guide_ratios_formula_between"
      )}
      <code>turns = (P / H − 1) / 2</code>.
    </p>
  {:else if name === "petals"}
    <p>
      {tDynamic("guide_ratios_petals_before")}
      <code>|P − H|</code>{tDynamic("guide_ratios_petals_between")}
      <code>P + H</code>{tDynamic("guide_ratios_petals_after")}
      <LinkChip size="inline" href={endsHref}
        >{tDynamic("guide_ratios_one_or_two")}</LinkChip
      >{tDynamic("guide_ratios_petals_end")}
    </p>
  {:else if name === "float"}
    <p>{tDynamic("guide_ratios_float")}</p>
  {:else if name === "names"}
    <h2>Common names</h2>
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
      {tDynamic("guide_ratios_names_note")}
      <LinkChip size="inline" href={localHref("/guide/level-1/staff-motions")}
        >{tDynamic("verified_level1_staff_motions_274")}</LinkChip
      >{spaced(tDynamic("guide_ratios_names_note_end"))}
    </p>
  {:else if name === "ladderIntro"}
    <p>{tDynamic("guide_ratios_ladder_intro")}</p>
  {:else if name === "ladderOri"}
    <p>{slice(tDynamic("guide_ratios_ladder_orientation"), part)}</p>
  {:else if name === "tinted"}
    <p class="note">{tDynamic("guide_ratios_tinted_cards")}</p>
  {:else if name === "swapIntro"}
    <p>{tDynamic("guide_ratios_swap_intro")}</p>
  {:else if name === "swapLaps"}
    <p>{tDynamic("guide_ratios_swap_laps")}</p>
  {:else if name === "swapFormula"}
    <p>
      {tDynamic("guide_ratios_swap_formula_before")}
      <code>|P − H|</code>{tDynamic("guide_ratios_swap_formula_between")}
      <code>P + H</code>{tDynamic("guide_ratios_swap_formula_after")}
    </p>
  {:else if name === "swapQuarter"}
    <p>
      {tDynamic("guide_ratios_swap_quarter_before")}
      <LinkChip size="inline" href={endsHref}
        >{tDynamic("guide_ratios_one_or_two")}</LinkChip
      >{tDynamic("guide_ratios_swap_quarter_after")}
    </p>
  {:else if name === "twelveIntro"}
    <p>{slice(tDynamic("guide_ratios_twelve_intro"), part)}</p>
  {:else if name === "twelveExample"}
    <p>{tDynamic("guide_ratios_twelve_example")}</p>
  {:else if name === "endsIntro"}
    <p>{tDynamic("guide_ratios_ends_intro")}</p>
  {:else if name === "endsOpposite"}
    <p>{tDynamic("guide_ratios_ends_opposite")}</p>
  {:else if name === "endsL1"}
    <p>{tDynamic("guide_ratios_ends_level1")}</p>
  {:else if name === "endsL4"}
    <p>
      {slice(
        `${tDynamic("guide_ratios_ends_level4_before")}${SHAPE_ENGINE_SHORT_NAME}${tDynamic("guide_ratios_ends_level4_after")}`,
        part
      )}
    </p>
  {:else if name === "pairingsIntro"}
    <p>{tDynamic("guide_ratios_pairings_intro")}</p>
  {:else if name === "pairingsChoose"}
    <p>
      {tDynamic(
        "guide_ratios_pairings_choose_before"
      )}{SHAPE_ENGINE_SHORT_NAME}{tDynamic(
        "guide_ratios_pairings_choose_after"
      )}
    </p>
  {:else if name === "scrollHint"}
    <p class="note">{tDynamic("guide_ratios_pairings_scroll")}</p>
  {:else if name === "beyond"}
    <h2>{tDynamic("guide_ratios_beyond_title")}</h2>
    <p>{tDynamic("guide_ratios_beyond_body")}</p>
  {:else if name === "sources"}
    <h2>{tDynamic("guide_ratios_sources")}</h2>
    <ul class="source-list">
      <li>
        <LinkChip
          href={ORIGINAL_SHAPE_MATRIX_URL}
          newTabLabel={tDynamic("guide_ratios_new_tab")}
          >{tDynamic("guide_ratios_source_label", {
            author: "Lorq Nichols",
            name: ORIGINAL_SHAPE_MATRIX_NAME,
          })}</LinkChip
        >
      </li>
      <li>
        <LinkChip href="/shape-engine">{SHAPE_ENGINE_SHORT_NAME}</LinkChip>
      </li>
    </ul>
    <p class="note">
      {tDynamic(
        "guide_ratios_attribution_before"
      )}{SHAPE_ENGINE_SHORT_NAME}{tDynamic(
        "guide_ratios_attribution_middle"
      )}{KINETIC_SHAPE_ENGINE_AUTHOR}{tDynamic(
        "guide_ratios_attribution_after"
      )}
    </p>
  {/if}
{/snippet}

{#snippet worked()}
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
    <p class="worked-note">{tDynamic("guide_ratios_example_note")}</p>
  </figure>
{/snippet}

{#snippet baseTray()}
  <section
    class="level-group base-tray"
    aria-labelledby="level-{BASE_LEVEL}-heading"
    style="--level-tint: {levelTint(BASE_LEVEL)}"
  >
    <header class="level-head">
      <DifficultyBadge level={BASE_LEVEL} size="2rem" />
      <span class="level-title">
        <span id="level-{BASE_LEVEL}-heading" class="level-name">
          {tDynamic("guide_ratios_level_heading", {
            level: BASE_LEVEL,
            name: baseLevel.name,
          })}
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
                <span class="card-style">{styleWord(item.flower.style)}</span>
                <span class="card-petals">{item.meta}</span>
              </div>
            {/each}
          </div>
        </li>
      {/each}
    </ol>
  </section>
{/snippet}

{#snippet levelTray(part: string)}
  {@const { group, rows, head, aside } = levelPart(part)}
  {#if group}
    <section
      class="level-group"
      aria-labelledby={head ? `level-${group.level}-heading` : undefined}
      aria-label={head
        ? undefined
        : tDynamic("guide_ratios_level_heading", {
            level: group.level,
            name: group.name,
          })}
      style="--level-tint: {levelTint(group.level)}"
    >
      {#if head}
        <header class="level-head">
          <DifficultyBadge level={group.level} size="2rem" />
          <span class="level-title">
            <span id={`level-${group.level}-heading`} class="level-name">
              {tDynamic("guide_ratios_level_heading", {
                level: group.level,
                name: group.name,
              })}
            </span>
            <span class="level-blurb">{group.blurb}</span>
          </span>
        </header>
      {/if}

      <ol class="ratio-cards" role="list">
        {#each rows as row (row.turnLabel)}
          <li class="ratio-card" class:family-card={row.family}>
            <p class="card-head">
              <span class="card-ratio">{row.ratio}</span>
              <span class="card-turns">{row.turnWords}</span>
            </p>
            {#if row.starts}
              {@const paired = row.starts.length > 1}
              <div class="card-grid">
                <span class="card-style"
                  >{tDynamic("guide_ratios_prospin")}</span
                >
                <span class="card-style"
                  >{tDynamic("guide_ratios_antispin")}</span
                >
                {#each row.starts as start (start.ori)}
                  {#each start.flowers as flower (flowerKey(flower))}
                    {@const facing = (
                      paired ? flowerFacing(flower) : quarterTurnFacing()
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
                  <span class="card-petals">{petalWord(flower.petals)}</span>
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
                          alt={tDynamic("guide_ratios_float_alt", {
                            ratio: row.ratio,
                            direction: tDynamic(
                              FLOAT_FACING[flower.ori] ?? "guide_ratios_up"
                            ),
                          })}
                        />
                      </span>
                      <span class="card-facing" aria-hidden="true"
                        >{tDynamic(
                          FLOAT_FACING[flower.ori] ?? "guide_ratios_up"
                        )}</span
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
        {#if aside && group.level === WHOLE_TURN_LEVEL}
          <li class="ladder-aside">
            {tDynamic("guide_ratios_whole_turn_note")}
          </li>
        {/if}
        {#if aside && group.level === QUARTER_TURN_LEVEL}
          <li class="ladder-aside">
            {tDynamic("guide_ratios_quarter_turn_note")}
          </li>
        {/if}
      </ol>
    </section>
  {/if}
{/snippet}

{#snippet familyCard(family: (typeof families)[number])}
  <section
    class="family"
    aria-label={tDynamic("guide_ratios_family", { ratio: family.ratio })}
  >
    <header class="family-head">
      <span class="family-ratio">{family.ratio}</span>
      <span class="family-turns"
        >{tDynamic("guide_ratios_family_turns", {
          turns: turnWords(family.turns),
          level: family.level,
        })}</span
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
            {tDynamic("guide_ratios_flower_start", {
              petals: petalWord(flower.petals),
              direction: tDynamic(
                flower.ori === "in" ? "guide_ratios_in" : "guide_ratios_out"
              ),
            })}
          </span>
        </li>
      {/each}
    </ol>
  </section>
{/snippet}

{#snippet endsTray(tray: EndsLevel, only?: number)}
  <section
    class="ends-level"
    aria-labelledby={`ends-level-${tray.level}`}
    style="--level-tint: {levelTint(tray.level)}"
  >
    <header class="ends-level-head">
      <DifficultyBadge level={tray.level} size="1.6rem" />
      <span id={`ends-level-${tray.level}`} class="level-name"
        >{tDynamic("guide_ratios_level_heading", {
          level: tray.level,
          name: tray.name,
        })}</span
      >
    </header>
    <ul class="ends-cards" role="list">
      {#each tray.cases as item, k (`${item.ratio}-${item.style}`)}
        {#if only === undefined || only === k}
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
        {/if}
      {/each}
    </ul>
    {#if only === undefined || only === tray.cases.length - 1}
      <p class="ends-summary">{tray.summary}</p>
    {/if}
  </section>
{/snippet}

{#snippet anatomy()}
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
        <span class="anatomy-label"
          >{tDynamic("guide_ratios_column_right")}</span
        >
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
{/snippet}

{#snippet matrix()}
  <div class="matrix-stage">
    {#if loadError}
      <p class="load-status error">
        {tDynamic("guide_ratios_drawings_unavailable")}
      </p>
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
{/snippet}

<style>
  .ratios {
    --rule: var(--theme-stroke, oklch(0.4 0.04 270 / 0.22));
    --ink: var(--theme-text, oklch(0.94 0.01 270));
    --ink-dim: var(--theme-text-dim, oklch(0.72 0.01 270));
    --ink-faint: oklch(0.6 0.02 270);
    --surface: var(--theme-card-bg, oklch(0.17 0.018 270 / 0.5));
    --accent: var(--theme-accent, oklch(0.74 0.11 265));
    --touch: var(--min-touch-target, 44px);
    --copy: 40rem;
    --gutter: clamp(1.25rem, 3vw, 3rem);
    --tracks: 13;
    --stage-max: calc(var(--tracks) * 88px + 6px);
    inline-size: 100%;
    min-inline-size: 0;
    color: var(--ink);
  }

  /* One screen: its words, then its figure; a duo screen sets them side by
     side once the window is wide enough. Figures read the screen's scale
     (--fit), so the fit box can grow or shrink them to fill the window. */
  .screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(1rem, 2.5vh, 2rem);
    inline-size: 100%;
    max-inline-size: calc(1600px * max(var(--fit, 1), 1));
    margin-inline: auto;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    inline-size: 100%;
    max-inline-size: var(--copy);
    text-align: center;
  }

  .visuals {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    inline-size: 100%;
    min-inline-size: 0;
  }

  @media (min-width: 62rem) {
    .screen.duo {
      display: grid;
      grid-template-columns: minmax(0, var(--copy)) minmax(0, 1fr);
      align-items: center;
      gap: var(--gutter);
    }

    .screen.duo .copy {
      text-align: left;
      --sentence-display: inline;
    }
  }

  .ratios h2 {
    margin: 0;
  }

  .ratios p {
    margin: 0;
    line-height: 1.6;
  }

  .note {
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
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

  .notice {
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

  .terms {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }

  .terms > div {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    align-items: baseline;
  }

  .screen.duo .terms > div {
    justify-content: flex-start;
  }

  .terms dt {
    color: var(--ink);
    font-weight: 640;
  }

  .terms dd {
    margin: 0;
    color: var(--ink-dim);
  }

  /* Reserved square for every still: the engine loads async and the box
     never changes size, so nothing moves when the artwork arrives. The
     flowers are painted to their box, so they grow with the screen's scale
     rather than being zoomed. */
  .still {
    display: block;
    inline-size: calc(3rem * var(--fit, 1));
    aspect-ratio: 1;
    flex: none;
  }

  .still-md {
    inline-size: calc(5rem * var(--fit, 1));
  }

  .still-lg {
    inline-size: calc(7rem * var(--fit, 1));
  }

  .worked {
    margin: 0;
    padding: 1.25rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--surface);
    text-align: center;
  }

  .worked figcaption {
    margin-bottom: 1rem;
    color: var(--ink);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    font-weight: 640;
  }

  .worked-shapes {
    display: flex;
    justify-content: center;
    gap: calc(1.5rem * var(--fit, 1));
  }

  .worked-shape {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }

  .worked-note {
    margin-top: 1rem;
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
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

  /* A level's tray, tinted with its badge colour. */
  .level-group,
  .ends-level {
    border: 1px solid color-mix(in srgb, var(--level-tint) 30%, transparent);
    border-radius: 18px;
    background: color-mix(in srgb, var(--level-tint) 7%, transparent);
  }

  .level-group {
    display: grid;
    align-content: start;
    gap: 0.6rem;
    padding: 0.6rem;
    inline-size: 100%;
    min-inline-size: 0;
  }

  .base-tray {
    inline-size: auto;
    max-inline-size: 100%;
  }

  /* One or two trays: two sit side by side on a wide window. */
  .board {
    display: grid;
    gap: 1rem;
    inline-size: 100%;
    justify-items: center;
  }

  .board.pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

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

  /* A level's cards fill the tray in as many columns as their flowers
     allow at the screen's scale. */
  .ratio-cards,
  .base-cards {
    --card-still: calc(3.5rem * var(--fit, 1));
    display: grid;
    grid-template-columns: repeat(
      auto-fill,
      minmax(min(100%, calc(var(--card-still) * 2 + 2rem)), 1fr)
    );
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .base-cards {
    --card-still: calc(5rem * var(--fit, 1));
    grid-template-columns: repeat(2, minmax(0, auto));
    justify-content: center;
  }

  .ratio-card {
    display: grid;
    align-content: start;
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
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem 0.5rem;
  }

  .ratios .card-head {
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

  .card-flower {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.1rem;
    min-inline-size: 0;
    text-align: center;
  }

  .card-flower .still,
  .card-grid .still,
  .float-start .still {
    inline-size: var(--card-still);
  }

  /* A card's flowers as a table: styles across the top, one row per start
     with each flower's facing under it, and petal counts along the foot. */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-items: center;
    align-items: center;
    gap: 0.3rem 0.5rem;
    min-inline-size: 0;
    text-align: center;
  }

  .card-facing {
    color: var(--ink-faint);
    font-size: 0.64rem;
    font-weight: 640;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

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

  .float-start .still {
    inline-size: calc(var(--card-still) * 0.7);
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
    display: grid;
    align-content: center;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--rule);
    border-radius: 14px;
    color: var(--ink-dim);
    font-size: var(--font-size-compact, 0.78rem);
    line-height: 1.45;
  }

  .swap-motion {
    inline-size: min(100%, calc(48rem * var(--fit, 1)));
  }

  /* The original twelve: three family cards, side by side when the band
     holds them, each with its four shapes. */
  .family-band {
    container-type: inline-size;
    inline-size: 100%;
  }

  .family-list {
    display: grid;
    gap: clamp(1rem, 2vw, 1.75rem);
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
  }

  .family {
    inline-size: 100%;
    max-inline-size: calc(30rem * var(--fit, 1));
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

  @container (min-width: 48rem) {
    .family-list:not(.solo) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* One end or two. Each card is a sum: the in start plus the out start is
     what a staff draws with both ends. */
  .ends-level {
    container: ends-level / inline-size;
    display: grid;
    align-content: start;
    gap: 0.75rem;
    inline-size: 100%;
    max-inline-size: calc(52rem * var(--fit, 1));
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

  @container ends-level (min-width: 26rem) {
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
  }

  .ratios .ends-head {
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

  /* Frames with room between them for the operators. Each operator sits in
     the still it leads into, centred on the gap before it. */
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
    inline-size: min(100%, calc(16rem * var(--fit, 1)));
    margin-inline: auto;
  }

  .ends-both {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
  }

  .ends-frame:nth-child(2) .sum-op {
    top: -0.9rem;
    left: 50%;
  }

  /* A phone sets the sum in one row, in + out = both, so a tray's two
     cards share its screen. */
  .ratios.small .ends-sum {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr);
    inline-size: min(100%, calc(22rem * var(--fit, 1)));
  }

  .ratios.small .ends-both {
    grid-column: 3;
    grid-row: 1;
  }

  .ratios.small .ends-frame:nth-child(2) .sum-op {
    top: 50%;
    left: calc(var(--op-gap) / -2);
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
    padding-inline: 0.25rem;
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
  }

  /* Reading a cell: the row's flower plus the column's flower is the tile. */
  .anatomy {
    inline-size: min(100%, calc(26rem * var(--fit, 1)));
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

  /* The 144 pairings. ShapeMatrixGrid is container sized, so its stage owns
     a square that grows with the screen's scale up to the grid's largest
     tile. On a phone the grid is wider than the square and slides sideways
     inside it under its sticky headers. */
  .matrix-stage {
    position: relative;
    inline-size: min(100%, calc(var(--stage-max) * var(--fit, 1) * 0.6));
    aspect-ratio: 1;
    border: 1px solid var(--rule);
    border-radius: 14px;
    overflow: hidden;
  }

  .load-status {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--ink-faint);
  }

  .ratios .load-status {
    margin: 0;
  }

  .load-status.error {
    color: var(--semantic-error, oklch(0.7 0.16 25));
  }

  .source-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .source-list li {
    margin: 0;
  }
</style>
