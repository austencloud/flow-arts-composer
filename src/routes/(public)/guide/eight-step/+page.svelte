<!--
  /guide/eight-step: the eight hand paths behind Gage DeMello's CAPs, still a
  draft.

  Production prerenders the "being written" note (noindex), and the page is
  off the Guide hub, the Guide contents and the sitemap until Austen approves
  it. A local dev server shows the page below.
-->
<script lang="ts">
  /**
   * Gage DeMello's 72 CAPs reduced to their eight hand paths, shown before
   * they are told.
   * Three tiles open the page: the left hand alone (it caps, two beats on
   * and one back), both hands in the middle with the only step counter, and
   * the right hand alone (it keeps circling). Then one
   * player with a prop, beside the prop picker and a spin picker per hand:
   * the nine pairings of the chart, named by motion and turns. Picking poi
   * flags the pairings poi can't spin. Then the paths in VTG's terms, a row
   * per timing (split, together, quarter) and a box per direction (same,
   * opposite). Each box steps through its spins with "Show another example",
   * as Zan's Diamond does; a quarter box also swaps which hand leads. These
   * are hand paths, so the strips show no letters.
   * The record lives in #lib/shared/guide-topics/caps-topic.ts.
   */
  import { onMount } from "svelte";
  import { dev } from "$app/env";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";
  import Sentences from "../_components/Sentences.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import HandTile from "./_components/HandTile.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PropChoiceRow from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographRender } from "../level-1/_data/guide-content-blocks";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
    TrailMode,
    type TrailSettings,
  } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import {
    CAP_DIRECTIONS,
    CAP_HAND_PATHS,
    CAP_TIMINGS,
    capMode,
    capOnPath,
    capPathRhythm,
    capPoiProblem,
    capPropRelationship,
    capStrip,
    type Cap,
    type CapDirection,
    type CapHandPath,
    type CapHandSpin,
    type CapTiming,
  } from "#lib/shared/guide-topics/caps-topic.js";
  import { TND_TO_ELEMENTAL } from "#lib/shared/pictograph/shared/domain/utils/tnd-calculator.js";
  import {
    getElementImagePath,
    type ElementalType,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { elementalDisplayLabel } from "#lib/shared/pictograph/shared/components/elemental-display-label.js";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { PropRelationship } from "#lib/shared/shape-matrix/domain/prop-relationship.js";
  import TurnNotationControls from "#lib/shared/shape-matrix/app/components/TurnNotationControls.svelte";
  import type { MatrixLabelMode } from "#lib/shared/shape-matrix/domain/matrix-turn-band.js";
  import { ratioLabel } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import { localizedMatrixTurnSpokenLabel } from "#lib/shared/shape-matrix/domain/shape-matrix-display.js";
  import {
    turnValuesForLevel,
    type TurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";

  // The bare hands draw their path as they travel: the left hand closes the
  // ring once in twelve beats, the right in four. The drawing stays until the
  // loop restarts.
  const HAND_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.HAND,
  };
  // With a prop, each tip draws its pattern, which is where the spins differ.
  const TIP_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.RIGHT_END,
  };

  // Page state only: each visit opens on staff, both hands antispin.
  let propType = $state<PropType>(PropType.STAFF);
  // Eight, so the tiles fill whole rows of eight, four or two.
  const PROP_CHOICES: readonly PropType[] = [
    PropType.STAFF,
    PropType.POI,
    PropType.CLUB,
    PropType.BUUGENG,
    PropType.FAN,
    PropType.MINIHOOP,
    PropType.BIGHOOP,
    PropType.TRIAD,
  ];
  // Each hand spins pro or anti at one turn value, any up to Level 4.
  type Motion = CapHandSpin["motion"];
  let leftMotion = $state<Motion>("anti");
  let rightMotion = $state<Motion>("anti");
  let leftTurn = $state<TurnValue>(1);
  let rightTurn = $state<TurnValue>(1);
  // The turns of the left hand's beat back; null plays the chart's value.
  let leftBack = $state<TurnValue | null>(null);
  // Gage's chart doubles back with no turns after anti and one after pro,
  // which keeps the prop turning the same way.
  const chartBack = (motion: Motion): TurnValue => (motion === "anti" ? 0 : 1);
  let labelMode = $state<MatrixLabelMode>("turns");
  const TURN_VALUES = turnValuesForLevel(4);
  const leftSpin = $derived<CapHandSpin>({
    motion: leftMotion,
    turns: leftTurn,
    back: leftBack ?? chartBack(leftMotion),
  });
  const rightSpin = $derived<CapHandSpin>({
    motion: rightMotion,
    turns: rightTurn,
  });

  // Hand paths carry no letters; each cell shows the app's step label and
  // the hands' element, which changes on the left hand's beat back.
  const PROP_RENDER: PictographRender = $derived({
    propType,
    showTKA: false,
    showStepNumbers: true,
    showElemental: true,
  });

  const MOTION_LABEL: Record<Motion, Parameters<typeof t>[0]> = {
    anti: "guide_eightstep_motion_anti",
    pro: "guide_eightstep_motion_pro",
  };
  // The left hand switches motion on its beat back, so one word can't name
  // it: its label reads forward, then back.
  const BACK_LABEL: Record<Motion, Parameters<typeof t>[0]> = {
    anti: "guide_eightstep_motion_anti_back",
    pro: "guide_eightstep_motion_pro_back",
  };
  const BACK_SPOKEN: Record<Motion, Parameters<typeof t>[0]> = {
    anti: "guide_eightstep_motion_anti_back_spoken",
    pro: "guide_eightstep_motion_pro_back_spoken",
  };
  const motionName = (motion: Motion, side: "left" | "right") =>
    t(side === "left" ? BACK_LABEL[motion] : MOTION_LABEL[motion]);
  const motionOptions = (side: "left" | "right") =>
    (["anti", "pro"] as const).map((motion) => ({
      value: motion,
      label: motionName(motion, side),
      ariaLabel: side === "left" ? t(BACK_SPOKEN[motion]) : undefined,
      tone: side === "left" ? ("blue" as const) : ("red" as const),
    }));
  // Named as the turn picker names its values: turns, or VTG ratios.
  const runLabel = (motion: Motion, turns: TurnValue) =>
    turns === "fl"
      ? t("shape_engine_float")
      : t("guide_eightstep_spin_label", {
          motion: t(MOTION_LABEL[motion]),
          value:
            labelMode === "ratios"
              ? ratioLabel(turns)
              : localizedMatrixTurnSpokenLabel(turns, "turns"),
        });
  const FLIP: Record<Motion, Motion> = { anti: "pro", pro: "anti" };
  // The left hand names both runs with their turns: on, then back.
  const spinLabel = (spin: CapHandSpin, side: "left" | "right") =>
    side === "right"
      ? runLabel(spin.motion, spin.turns)
      : t("guide_eightstep_spin_label_back", {
          on: runLabel(spin.motion, spin.turns),
          back: runLabel(
            FLIP[spin.motion],
            spin.back ?? chartBack(spin.motion)
          ),
        });

  // The CAP id names the sequence, so the player reloads on every new pick
  // even where two pairings spell the same word.
  const showcase = (cap: Cap) => {
    const items = capStrip(cap);
    return {
      items,
      sequence: stripToSequence(items, { word: cap.word, name: cap.id }),
    };
  };

  const firstPath = CAP_HAND_PATHS[0]!;
  const hands = showcase(firstPath.caps[0]!).sequence;
  // The spin player can walk any of the eight paths. The row counts them 1
  // to 8, the chart's own order, and each tile carries its timing word
  // (PATH_OPTIONS, below); the caption names the picked path's setup and
  // shows its rhythm once.
  let pathColumn = $state(1);
  const spinPath = $derived(CAP_HAND_PATHS[pathColumn - 1]!);
  const spinCap = $derived(capOnPath(spinPath, leftSpin, rightSpin));
  const spinExample = $derived(showcase(spinCap));

  // The spin player shows both element glyphs where the app always puts
  // them: the hands' at the bottom right, changing with the path's rhythm,
  // and the props' at the top right, which follows beat by beat too. The
  // props' opening beats name the CAP.
  const sharedVisibility = getAnimationVisibilityManager();
  const spinVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  spinVisibility.replaceAll({
    ...sharedVisibility.snapshot(),
    elementalGlyph: true,
    propElementalGlyph: true,
  });
  spinVisibility.setMotionPolicySource(sharedVisibility);

  // The props' opening timing and direction name the CAP alongside its path.
  const PROP_TIMING: Record<
    NonNullable<PropRelationship["timing"]>,
    Parameters<typeof t>[0]
  > = {
    split: "guide_eightstep_props_timing_split",
    tog: "guide_eightstep_props_timing_together",
    quarter: "guide_eightstep_props_timing_quarter",
  };
  const PROP_DIRECTION: Record<
    NonNullable<PropRelationship["direction"]>,
    Parameters<typeof t>[0]
  > = {
    same: "guide_eightstep_props_direction_same",
    opp: "guide_eightstep_props_direction_opposite",
  };
  const propReading = $derived.by(() => {
    const props = capPropRelationship(spinCap);
    if (props.kind === "full") {
      const element = props.element.element as ElementalType;
      return {
        element,
        text: t("guide_eightstep_props_full", {
          element: elementalDisplayLabel(element),
          timing: t(PROP_TIMING[props.timing]),
          direction: t(PROP_DIRECTION[props.direction]),
        }),
      };
    }
    if (props.kind === "direction-only") {
      return {
        element: null,
        text: t("guide_eightstep_props_drift", {
          direction: t(PROP_DIRECTION[props.direction]),
        }),
      };
    }
    return null;
  });
  const poiProblem = (cap: Cap) =>
    propType === PropType.POI ? capPoiProblem(cap) : null;

  // A quarter box holds two paths; this tells them apart. Split and
  // together boxes hold one path each and need no name for it.
  const QUARTER_PATH: Record<number, Parameters<typeof t>[0]> = {
    5: "guide_eightstep_path_ahead_title",
    6: "guide_eightstep_path_behind_title",
    7: "guide_eightstep_path_swap_title",
    8: "guide_eightstep_path_apart_title",
  };

  const TIMING_COPY: Record<
    CapTiming,
    { title: Parameters<typeof t>[0]; body: Parameters<typeof t>[0] }
  > = {
    split: {
      title: "guide_eightstep_timing_split_title",
      body: "guide_eightstep_timing_split_body",
    },
    together: {
      title: "guide_eightstep_timing_together_title",
      body: "guide_eightstep_timing_together_body",
    },
    quarter: {
      title: "guide_eightstep_timing_quarter_title",
      body: "guide_eightstep_timing_quarter_body",
    },
  };
  const DIRECTION_TITLE: Record<CapDirection, Parameters<typeof t>[0]> = {
    same: "guide_eightstep_direction_same",
    opposite: "guide_eightstep_direction_opposite",
  };

  // The path row: the eight numbers in the chart's order, 1 to 8. Split and
  // together paths are not neighbours in that order, so each tile names its
  // timing under the number instead of sitting in a group.
  const PATH_OPTIONS = $derived(
    CAP_HAND_PATHS.map((path) => ({
      value: String(path.column),
      label: String(path.column),
      ariaLabel: `${t("guide_eightstep_path_option", { n: path.column })}, ${t(TIMING_COPY[path.timing].title)}`,
    }))
  );
  const PATH_TIMING_WORD = $derived(
    Object.fromEntries(
      CAP_HAND_PATHS.map((path) => [
        String(path.column),
        t(TIMING_COPY[path.timing].title),
      ])
    ) as Record<string, string>
  );
  // The caption names the picked path's setup: where the hands start and
  // which way they set off, and for a quarter path which hand leads or
  // which change comes first.
  const PATH_TIMING: Record<CapTiming, Parameters<typeof t>[0]> = {
    split: "guide_eightstep_props_timing_split",
    together: "guide_eightstep_props_timing_together",
    quarter: "guide_eightstep_props_timing_quarter",
  };
  const PATH_DIRECTION: Record<CapDirection, Parameters<typeof t>[0]> = {
    same: "guide_eightstep_props_direction_same",
    opposite: "guide_eightstep_props_direction_opposite",
  };
  const QUARTER_CLAUSE: Record<number, Parameters<typeof t>[0]> = {
    5: "guide_eightstep_path_ahead_clause",
    6: "guide_eightstep_path_behind_clause",
    7: "guide_eightstep_path_swap_clause",
    8: "guide_eightstep_path_apart_clause",
  };
  const pathReading = $derived.by(() => {
    const setup = {
      n: spinPath.column,
      timing: t(PATH_TIMING[spinPath.timing]),
      direction: t(PATH_DIRECTION[spinPath.direction]),
    };
    const variant = QUARTER_CLAUSE[spinPath.column];
    return variant
      ? t("guide_eightstep_path_setup_quarter", {
          ...setup,
          variant: t(variant),
        })
      : t("guide_eightstep_path_setup", setup);
  });

  // A box opens on the picked motions, then steps through the others at the
  // same turns; in a quarter box each pairing shows both of its paths.
  const MOTION_PAIRS: readonly [Motion, Motion][] = [
    ["anti", "anti"],
    ["anti", "pro"],
    ["pro", "anti"],
    ["pro", "pro"],
  ];
  const pairsFromPick = $derived([
    [leftMotion, rightMotion] as const,
    ...MOTION_PAIRS.filter(([l, r]) => l !== leftMotion || r !== rightMotion),
  ]);
  const exampleProse = (
    path: CapHandPath,
    cap: Cap,
    left: CapHandSpin,
    right: CapHandSpin
  ) => {
    const spins = {
      left: spinLabel(left, "left"),
      right: spinLabel(right, "right"),
    };
    const variant = QUARTER_PATH[path.column];
    const line = variant
      ? t("guide_eightstep_example_variant", { variant: t(variant), ...spins })
      : t("guide_eightstep_example", spins);
    return poiProblem(cap) ? `${line} ${t("guide_eightstep_not_poi")}` : line;
  };

  // A row per timing, a box per direction; each box's examples cycle with
  // "Show another example".
  const rows = $derived(
    CAP_TIMINGS.map((timing) => ({
      timing,
      ...TIMING_COPY[timing],
      boxes: CAP_DIRECTIONS.map((direction) => {
        const paths = CAP_HAND_PATHS.filter(
          (p) => p.timing === timing && p.direction === direction
        );
        const entries = pairsFromPick.flatMap(([lm, rm]) => {
          const left = {
            motion: lm,
            turns: leftTurn,
            back:
              lm === leftMotion ? (leftBack ?? chartBack(lm)) : chartBack(lm),
          };
          const right = { motion: rm, turns: rightTurn };
          return paths.map((path) => ({
            path,
            left,
            right,
            cap: capOnPath(path, left, right),
          }));
        });
        return {
          direction,
          title: DIRECTION_TITLE[direction],
          element: TND_TO_ELEMENTAL[capMode(timing, direction)],
          first: showcase(entries[0]!.cap),
          pool: entries.map(({ path, cap, left, right }) => ({
            word: cap.id,
            loopLabel: "",
            proseHtml: exampleProse(path, cap, left, right),
            items: capStrip(cap),
          })),
        };
      }),
    }))
  );

  // One screen at a time (2026-10-24 fit pass). The hands open, then the
  // spin player, then a screen per timing. A large window keeps the pickers
  // beside the player, with the reading on the screen before; smaller ones
  // give the pickers their own screens and show one box of a timing row at
  // a time.
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const views = $derived.by(() => {
    const small = tier === "small";
    const out: { label: string; parts: string[] }[] = [];
    const hands = t("guide_eightstep_hands_title");
    const spins = t("guide_eightstep_spins_title");
    if (small) {
      out.push({ label: hands, parts: ["lede", "hands"] });
      out.push({ label: spins, parts: ["spinsText"] });
      out.push({
        label: `Watch: ${t("guide_eightstep_title")}`,
        parts: ["spin"],
      });
      out.push({ label: t("guide_eightstep_path"), parts: ["pickPath"] });
      out.push({ label: t("guide_eightstep_prop"), parts: ["pickProp"] });
      out.push({ label: t("guide_eightstep_motion"), parts: ["pickSpin"] });
    } else if (tier === "medium") {
      out.push({ label: hands, parts: ["lede", "hands"] });
      out.push({ label: spins, parts: ["spinsText"] });
      out.push({
        label: `Watch: ${t("guide_eightstep_title")}`,
        parts: ["spin"],
      });
      out.push({
        label: `${t("guide_eightstep_path")}, ${t("guide_eightstep_prop")}`,
        parts: ["pickPath", "pickProp"],
      });
      out.push({ label: t("guide_eightstep_motion"), parts: ["pickSpin"] });
    } else {
      out.push({ label: hands, parts: ["lede", "hands"] });
      out.push({ label: spins, parts: ["spinsText"] });
      out.push({
        label: `Watch: ${t("guide_eightstep_title")}`,
        parts: ["spin", "pickers"],
      });
    }
    out.push({
      label: t("guide_eightstep_paths_title"),
      parts: ["pathsIntro"],
    });
    for (const timing of CAP_TIMINGS) {
      const title = t(TIMING_COPY[timing].title);
      if (tier !== "large") {
        // A phone reads the timing's words on their own screen first.
        if (small) out.push({ label: title, parts: [`head-${timing}`] });
        CAP_DIRECTIONS.forEach((direction, k) =>
          out.push({
            label: `${title}: ${t(DIRECTION_TITLE[direction])}`,
            parts: [
              ...(k === 0 && !small ? [`head-${timing}`] : []),
              `box-${timing}-${direction}`,
            ],
          })
        );
      } else {
        out.push({
          label: title,
          parts: [
            `head-${timing}`,
            ...CAP_DIRECTIONS.map((d) => `box-${timing}-${d}`),
          ],
        });
      }
    }
    out.push({ label: t("guide_caps_link_caps"), parts: ["credit"] });
    return out;
  });
  const has = (n: number, part: string) => views[n]?.parts.includes(part);

  // Pictographs follow the site theme, as the Level 1 pages do.
  let picTheme = $state<"light" | "dark">("dark");
  onMount(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const attr = root.getAttribute("data-theme");
      picTheme = (attr ? attr === "dark" : mq.matches) ? "dark" : "light";
    };
    resolve();
    mq.addEventListener("change", resolve);
    const observer = new MutationObserver(resolve);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      mq.removeEventListener("change", resolve);
      observer.disconnect();
    };
  });
</script>

<svelte:head>
  {#if !dev}
    <title>Being written · The Kinetic Alphabet Guide</title>
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

{#if !dev}
  <UnderConstruction
    title="Being written"
    eyebrow="The Guide"
    icon="fa-pen-nib"
    note="This page is still being written. The rest of the Guide is here."
    destinations={[
      { label: "The Guide", href: "/guide", icon: "fa-book-open" },
    ]}
  />
{:else}
  <GuideSeo
    title={t("guide_eightstep_seo_title")}
    description={t("guide_eightstep_seo_description")}
    path="/guide/eight-step"
    datePublished="2026-10-15"
    partOf={{ name: t("guide_eightstep_part_of"), path: "/guide" }}
    breadcrumbs={[
      { name: "Home", path: "/" },
      { name: "Guide", path: "/guide" },
      { name: t("guide_eightstep_title"), path: "/guide/eight-step" },
    ]}
  />

  <GuideShell>
    <main class="eight-step guide-page-route">
      <GuideScreens
        title={t("guide_eightstep_title")}
        labels={views.map((v) => v.label)}
        hubHref={localHref("/guide")}
      >
        {#snippet screen(n)}
          <div class="screen">
            {#if has(n, "lede")}
              <p class="lede">
                {t("guide_eightstep_lede", { name: "Gage DeMello" })}
              </p>
            {/if}

            {#if has(n, "hands")}
              <section class="hands" aria-labelledby="hands-heading-{n}">
                <h2 id="hands-heading-{n}">
                  {t("guide_eightstep_hands_title")}
                </h2>
                <div class="hand-tiles">
                  <HandTile
                    sequence={hands}
                    hand="left"
                    caption={t("guide_eightstep_hand_left")}
                    trail={HAND_TRAIL}
                  />
                  <HandTile
                    sequence={hands}
                    hand="both"
                    caption={t("guide_eightstep_hand_both")}
                    trail={HAND_TRAIL}
                    stepNumbers
                  />
                  <HandTile
                    sequence={hands}
                    hand="right"
                    caption={t("guide_eightstep_hand_right")}
                    trail={HAND_TRAIL}
                  />
                </div>
              </section>
            {/if}

            {#if has(n, "spinsText") && !has(n, "spin")}
              <section class="reading">
                <h2>{t("guide_eightstep_spins_title")}</h2>
                <p><Sentences text={t("guide_eightstep_spins_body")} /></p>
                {@render prospinChip()}
              </section>
            {/if}

            <!-- A large window composes the spin section around its player:
                 the hand-path row runs the full width, then the player sits
                 beside only the controls that change it. Smaller windows show
                 the player alone, its strip beside it, and give each picker
                 its own screen. -->
            {#if has(n, "spin")}
              <div class="spin-demo" class:composed={has(n, "pickers")}>
                {#if has(n, "pickers")}
                  <div class="pickers path-row">{@render pathPicker()}</div>
                {/if}
                <SequenceShowcase
                  sequence={spinExample.sequence}
                  items={spinExample.items}
                  trail={TIP_TRAIL}
                  render={PROP_RENDER}
                  canvasLetter={false}
                  visibility={spinVisibility}
                  loop
                  stripBeside
                  {picTheme}
                >
                  {#snippet text()}
                    {#if has(n, "pickers")}
                      <div class="pickers">
                        {@render propPicker()}
                        {@render spinPicker()}
                      </div>
                    {/if}
                    {@render spinReading()}
                  {/snippet}
                </SequenceShowcase>
              </div>
            {/if}

            {#if has(n, "pickPath") || has(n, "pickProp") || has(n, "pickSpin")}
              <div class="pickers standalone">
                {#if has(n, "pickPath")}{@render pathPicker()}{/if}
                {#if has(n, "pickProp")}{@render propPicker()}{/if}
                {#if has(n, "pickSpin")}{@render spinPicker()}{/if}
                {@render spinReading()}
              </div>
            {/if}

            {#if has(n, "pathsIntro")}
              <section class="paths-intro">
                <h2>{t("guide_eightstep_paths_title")}</h2>
                <p>{t("guide_eightstep_paths_body")}</p>
              </section>
            {/if}

            {#each rows as row (row.timing)}
              {#if has(n, `head-${row.timing}`)}
                <div class="timing-head">
                  <h3>{t(row.title)}</h3>
                  <p>{t(row.body)}</p>
                </div>
              {/if}
              {@const shown = row.boxes.filter((box) =>
                has(n, `box-${row.timing}-${box.direction}`)
              )}
              {#if shown.length}
                <div class="box-grid" class:pair={shown.length > 1}>
                  {#each shown as box (box.direction)}
                    <SequenceShowcase
                      sequence={box.first.sequence}
                      items={box.first.items}
                      pool={box.pool}
                      trail={TIP_TRAIL}
                      render={PROP_RENDER}
                      canvasLetter={false}
                      loop
                      stripBeside={shown.length === 1}
                      {picTheme}
                    >
                      {#snippet text()}
                        <h4 class="box-title">
                          <img
                            class="element"
                            src={getElementImagePath(box.element)}
                            alt=""
                          />
                          {t(box.title)}
                        </h4>
                      {/snippet}
                    </SequenceShowcase>
                  {/each}
                </div>
              {/if}
            {/each}

            {#if has(n, "credit")}
              <footer class="credit">
                <p>{t("guide_caps_cap_credit")}</p>
                <div class="links">
                  <LinkChip href={localHref("/notation/caps")}
                    >{t("guide_caps_link_caps")}</LinkChip
                  >
                </div>
              </footer>
            {/if}
          </div>
        {/snippet}
      </GuideScreens>
    </main>
  </GuideShell>
{/if}

{#snippet pathPicker()}
  <div class="picker path-picker">
    <span class="picker-label" id="path-picker-label"
      >{t("guide_eightstep_path")}</span
    >
    <SegmentedControl
      options={PATH_OPTIONS}
      value={String(pathColumn)}
      onchange={(v) => (pathColumn = Number(v))}
      ariaLabelledby="path-picker-label"
      semantics="button-group"
      density="compact"
      columns={4}
    >
      {#snippet optionContent(value)}
        <span class="path-option">
          <span class="path-number">{value}</span>
          <span class="path-timing">{PATH_TIMING_WORD[value]}</span>
        </span>
      {/snippet}
    </SegmentedControl>
  </div>
{/snippet}

{#snippet propPicker()}
  <div class="picker">
    <span class="picker-label">{t("guide_eightstep_prop")}</span>
    <PropChoiceRow
      value={propType}
      options={PROP_CHOICES}
      label={t("guide_eightstep_prop")}
      onchange={(pt) => (propType = pt)}
    />
  </div>
{/snippet}

{#snippet spinPicker()}
  <div class="picker">
    <span class="picker-label">{t("guide_eightstep_motion")}</span>
    <div class="hand-motions">
      <div class="hand-motion">
        <span class="hand-label" id="motion-left-label"
          >{t("guide_eightstep_spin_left")}</span
        >
        <SegmentedControl
          options={motionOptions("left")}
          value={leftMotion}
          onchange={(motion) => {
            // A new motion has its own chart row, so the beat back goes
            // back to that row's value.
            leftMotion = motion;
            leftBack = null;
          }}
          ariaLabelledby="motion-left-label"
          semantics="radiogroup"
          color="blue"
        />
      </div>
      <div class="hand-motion">
        <span class="hand-label" id="motion-right-label"
          >{t("guide_eightstep_spin_right")}</span
        >
        <SegmentedControl
          options={motionOptions("right")}
          value={rightMotion}
          onchange={(motion) => (rightMotion = motion)}
          ariaLabelledby="motion-right-label"
          semantics="radiogroup"
          color="red"
        />
      </div>
    </div>
  </div>
  <div class="picker">
    <span class="picker-label">{t("guide_eightstep_turns")}</span>
    <TurnNotationControls
      {leftTurn}
      {rightTurn}
      leftBackTurn={leftBack ?? chartBack(leftMotion)}
      leftBackLabel={t("guide_eightstep_turns_back")}
      {labelMode}
      turnValues={TURN_VALUES}
      onturn={(hand, turn) => {
        if (hand === "left") leftTurn = turn;
        else if (hand === "left-back") leftBack = turn;
        else rightTurn = turn;
      }}
      onlabelmodechange={(mode) => (labelMode = mode)}
    />
  </div>
{/snippet}

{#snippet prospinChip()}
  <div class="chip">
    <LinkChip href={localHref("/guide/prospin-and-inspin")}
      >{t("guide_eightstep_link_prospin")}</LinkChip
    >
  </div>
{/snippet}

{#snippet spinReading()}
  <p class="prop-reading path-reading" aria-live="polite">
    <span class="rhythm">
      {#each capPathRhythm(spinPath) as half, h (h)}
        <span class="half">
          {#each half as el, i (i)}
            <img class="element" src={getElementImagePath(el)} alt="" />
          {/each}
        </span>
      {/each}
    </span>
    <span>{pathReading}</span>
  </p>
  {#if propReading}
    <p class="prop-reading" aria-live="polite">
      {#if propReading.element}
        <img
          class="prop-element"
          src={getElementImagePath(propReading.element)}
          alt=""
        />
      {/if}
      <span>{propReading.text}</span>
    </p>
  {/if}
  {#if poiProblem(spinCap)}
    <p class="poi-note">
      {t(
        poiProblem(spinCap) === "anti-zero"
          ? "guide_eightstep_poi_anti_zero"
          : "guide_eightstep_poi_note"
      )}
    </p>
  {/if}
{/snippet}

<style>
  /* Wider than the reading pages: on a large screen the paths go two to a
     row instead of leaving the sides empty. */
  .eight-step {
    width: 100%;
    min-width: 0;
    color: var(--theme-text);
    /* SequenceShowcase colours its controls with the Level 1 ink tokens; map
       them to this page's theme, as /guide/zans-diamond does. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
    /* The hand tiles and the spin section share one width, growing on very
       wide screens so they don't sit as a thin column in the middle. */
    --demo-width: clamp(1320px, 62cqw, 1680px);
  }
  .screen {
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2.5vh, 2rem);
    width: 100%;
    max-width: calc(1680px * max(var(--fit, 1), 1));
    margin-inline: auto;
    container-type: inline-size;
  }
  .eight-step h2,
  .eight-step h3,
  .eight-step h4 {
    margin: 0;
  }
  .eight-step p {
    max-width: 72ch;
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0;
  }
  .reading,
  .paths-intro,
  .credit,
  .hands {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    text-align: center;
  }
  .eight-step .lede {
    margin-inline: auto;
    text-align: center;
    font-size: 1.125rem;
    color: var(--theme-text);
    text-wrap: balance;
  }

  /* Three tiles in a row, as large as the row allows; a phone stacks them
     at a size that still fits one tile on screen. */
  .hands {
    gap: var(--spacing-lg, 20px);
  }
  .hand-tiles {
    width: 100%;
    max-width: calc(var(--demo-width) * min(var(--fit, 1), 1));
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 2.5vw, 32px);
  }
  /* The three hands stay side by side on every screen, so they read as
     one figure; the screen's fit shrinks them on a short window. */
  .hand-tiles {
    margin-inline: auto;
    max-width: min(100%, calc(var(--demo-width) * min(var(--fit, 1), 1)));
  }

  /* As wide as the hand tiles, growing with the screen on 4K. On a large
     window the hand-path row runs the full width; then the player sits
     beside only the controls that change it. */
  .spin-demo {
    width: 100%;
    max-width: calc(var(--demo-width) * max(var(--fit, 1), 1));
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 20px);
  }
  /* Its own container, so the path columns follow the row's width. */
  .path-row {
    container-type: inline-size;
  }
  /* Composed (a large window): player left, top-aligned with its controls,
     the strip under the controls. The player takes 480px at the pickers'
     own scale where the screen has the height for it; a shorter window
     shrinks it with the rest of the screen. */
  .spin-demo.composed :global(.banner) {
    align-items: flex-start;
  }
  .spin-demo.composed :global(.banner > .canvas-box) {
    flex-basis: calc(480px * min(var(--fit, 1), 1.6));
    align-self: flex-start;
  }
  /* Under 1150px the controls would not fit beside the full player (the two
     hand toggles need 646px side by side), so the section stacks: the player
     first and centred, the controls full width beneath. */
  @container (max-width: 1149.98px) {
    .spin-demo.composed :global(.banner) {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .spin-demo.composed :global(.banner > .canvas-box) {
      flex: none;
      width: min(100%, calc(480px * min(var(--fit, 1), 1.6)));
      margin-inline: auto;
    }
  }
  /* The controls beside the player. Every row fills this column, so all
     of them end on the right edge the hand-path row reaches, at every
     width. */
  .pickers {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 12px);
    container-type: inline-size;
  }
  .pickers.standalone {
    width: min(100%, 46rem);
    margin-inline: auto;
  }
  /* The pickers scale with the screen like the player beside them, up to
     half again on 4K and never below a readable size. */
  .pickers {
    zoom: clamp(0.85, var(--fit, 1), 1.6);
  }
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 6px);
  }
  .picker-label {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    color: var(--theme-text-muted);
  }
  /* Eight props in whole rows that fill the column: two of four, one of
     eight once the column has 900px (4K), four of two on a narrow phone.
     The switch to eight keeps a tile under about 220px wide. */
  .picker :global(.prop-grid) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  @container (min-width: 900px) {
    .picker :global(.prop-grid) {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }
  @container (max-width: 300px) {
    .picker :global(.prop-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .picker :global(.prop-option) {
    max-width: none;
  }
  /* Four tiles across a phone: a slimmer side padding leaves the longest
     prop name its width. */
  @container (max-width: 400px) {
    .picker :global(.prop-option) {
      padding-inline: 4px;
    }
  }
  /* The eight paths in one row, counting 1 to 8, each tile a number over
     its timing word. "Together" at 12px is about 55px; with the segment's
     padding and border a tile needs about 70px, so eight across need about
     600px of row. Below that the tiles take two rows of four, which fits any
     phone. */
  .path-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    line-height: 1.15;
  }
  .path-number {
    font-size: 1.125rem;
    font-variant-numeric: tabular-nums;
  }
  .path-timing {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted);
  }
  /* The selected tile sits on the accent, where the muted word would fade. */
  .path-picker :global(button[data-selected="true"] .path-timing) {
    color: inherit;
  }
  /* The control sets its column count as an inline variable, so the wider
     row overrides the grid itself. */
  @container (min-width: 600px) {
    .path-picker :global(.ui-segments[data-grid]) {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }
  /* The path's setup and the props' element, under the pickers: a fixed
     figure on the left (the path's rhythm, the props' element) and its
     sentence beside it. */
  .prop-reading {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin: 0;
  }
  .prop-element {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
  }
  /* The path's rhythm as two lines of three, each glyph the props glyph's
     size (2.25rem) with 3px between them. The figure's width and height come
     from that, so the sentence beside it stays put when the path changes. */
  .rhythm {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: calc(3 * 2.25rem + 2 * 3px);
    height: calc(2 * 2.25rem + 3px);
  }
  .rhythm .half {
    display: flex;
    gap: 3px;
  }
  .rhythm .element {
    display: block;
    width: 2.25rem;
    height: 2.25rem;
  }
  /* Each hand's toggle takes half the row and grows to it, labelled by
     hand; one toggle per row where two halves would crowd their words. */
  .hand-motions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
  }
  @container (max-width: 599.98px) {
    .hand-motions {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .hand-motion {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .hand-motion :global(.segmented-control) {
    flex: 1 1 0;
    min-width: 0;
  }
  /* One width for both labels, so the two toggles line up when stacked. */
  .hand-label {
    flex: none;
    width: 5.5rem;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text));
  }
  .chip {
    margin-top: var(--spacing-sm, 8px);
  }
  .poi-note {
    margin-top: var(--spacing-sm, 8px);
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  /* A timing's heading, then a box per direction, side by side once each
     has room for its canvas beside a wrapping strip. */
  .timing-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }
  .timing-head h3 {
    font-size: 1.375rem;
  }
  .box-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(28px, 3vw, 48px);
  }
  @container (min-width: 1100px) {
    .box-grid.pair {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* The element names the mode the box's paths open in. */
  .box-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    font-size: 1.125rem;
    color: var(--theme-text);
  }
  .box-title .element {
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
  }
  /* Stacked, the showcase centres its example line; the title follows. */
  @container (max-width: 600px) {
    .box-title {
      justify-content: center;
    }
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
  }
</style>
