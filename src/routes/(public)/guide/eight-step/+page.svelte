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
  let labelMode = $state<MatrixLabelMode>("turns");
  const TURN_VALUES = turnValuesForLevel(4);
  const leftSpin = $derived<CapHandSpin>({
    motion: leftMotion,
    turns: leftTurn,
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
  const spinLabel = (spin: CapHandSpin, side: "left" | "right") =>
    spin.turns === "fl"
      ? t("shape_engine_float")
      : t("guide_eightstep_spin_label", {
          motion: motionName(spin.motion, side),
          value:
            labelMode === "ratios"
              ? ratioLabel(spin.turns)
              : localizedMatrixTurnSpokenLabel(spin.turns, "turns"),
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
  // The spin player can walk any of the eight paths. Each choice shows the
  // path's rhythm in its two halves, the way the pattern falls.
  let pathColumn = $state(1);
  const PATH_OPTIONS = $derived(
    CAP_HAND_PATHS.map((path) => {
      const [first, second] = capPathRhythm(path).map((half) =>
        half.map(elementalDisplayLabel).join(", ")
      );
      return {
        value: String(path.column),
        label: String(path.column),
        ariaLabel: t("guide_eightstep_path_option", {
          n: path.column,
          first: first!,
          second: second!,
        }),
      };
    })
  );
  const spinCap = $derived(
    capOnPath(CAP_HAND_PATHS[pathColumn - 1]!, leftSpin, rightSpin)
  );
  const spinExample = $derived(showcase(spinCap));

  // The spin player shows both element glyphs where the app always puts
  // them: the hands' at the bottom right, changing with the path's rhythm,
  // and the props' at the top right, which holds one element the whole way.
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

  // The props' one timing and direction names the CAP alongside its path.
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
          n: pathColumn,
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
          n: pathColumn,
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
          const left = { motion: lm, turns: leftTurn };
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
    <article class="eight-step guide-page-route">
      <header class="intro">
        <h1>{t("guide_eightstep_title")}</h1>
        <p class="lede">
          {t("guide_eightstep_lede", { name: "Gage DeMello" })}
        </p>
      </header>

      <section class="hands" aria-labelledby="hands-heading">
        <h2 id="hands-heading">{t("guide_eightstep_hands_title")}</h2>
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

      <div class="spin-demo">
        <SequenceShowcase
          sequence={spinExample.sequence}
          items={spinExample.items}
          trail={TIP_TRAIL}
          render={PROP_RENDER}
          canvasLetter={false}
          visibility={spinVisibility}
          loop
          {picTheme}
        >
          {#snippet text()}
            <h2>{t("guide_eightstep_spins_title")}</h2>
            <p>{t("guide_eightstep_spins_body")}</p>
            <div class="pickers">
              <div class="picker">
                <span class="picker-label" id="path-picker-label"
                  >{t("guide_eightstep_path")}</span
                >
                <div class="path-picker">
                  <SegmentedControl
                    options={PATH_OPTIONS}
                    value={String(pathColumn)}
                    onchange={(v) => (pathColumn = Number(v))}
                    ariaLabelledby="path-picker-label"
                    semantics="radiogroup"
                    density="compact"
                    columns={4}
                  >
                    {#snippet optionContent(value)}
                      {@const path = CAP_HAND_PATHS[Number(value) - 1]!}
                      <span class="path-option">
                        <span class="path-number">{value}</span>
                        <span class="rhythm">
                          {#each capPathRhythm(path) as half, h (h)}
                            <span class="half">
                              {#each half as el, i (i)}
                                <img
                                  class="element"
                                  src={getElementImagePath(el)}
                                  alt=""
                                />
                              {/each}
                            </span>
                          {/each}
                        </span>
                      </span>
                    {/snippet}
                  </SegmentedControl>
                </div>
              </div>
              <div class="picker">
                <span class="picker-label">{t("guide_eightstep_prop")}</span>
                <PropChoiceRow
                  value={propType}
                  options={PROP_CHOICES}
                  label={t("guide_eightstep_prop")}
                  onchange={(pt) => (propType = pt)}
                />
              </div>
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
                      onchange={(motion) => (leftMotion = motion)}
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
                  {labelMode}
                  turnValues={TURN_VALUES}
                  onturn={(hand, turn) =>
                    hand === "left" ? (leftTurn = turn) : (rightTurn = turn)}
                  onlabelmodechange={(mode) => (labelMode = mode)}
                />
              </div>
            </div>
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
            <div class="chip">
              <LinkChip href={localHref("/guide/prospin-and-inspin")}
                >{t("guide_eightstep_link_prospin")}</LinkChip
              >
            </div>
          {/snippet}
        </SequenceShowcase>
      </div>

      <section class="paths" aria-labelledby="paths-heading">
        <div class="paths-intro">
          <h2 id="paths-heading">{t("guide_eightstep_paths_title")}</h2>
          <p>{t("guide_eightstep_paths_body")}</p>
        </div>
        {#each rows as row (row.timing)}
          <section class="timing-row" aria-labelledby="timing-{row.timing}">
            <div class="timing-head">
              <h3 id="timing-{row.timing}">{t(row.title)}</h3>
              <p>{t(row.body)}</p>
            </div>
            <div class="box-grid">
              {#each row.boxes as box (box.direction)}
                <SequenceShowcase
                  sequence={box.first.sequence}
                  items={box.first.items}
                  pool={box.pool}
                  trail={TIP_TRAIL}
                  render={PROP_RENDER}
                  canvasLetter={false}
                  loop
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
          </section>
        {/each}
      </section>

      <footer class="credit">
        <p>{t("guide_caps_cap_credit")}</p>
        <div class="links">
          <LinkChip href={localHref("/notation/caps")}
            >{t("guide_caps_link_caps")}</LinkChip
          >
        </div>
      </footer>
    </article>
  </GuideShell>
{/if}

<style>
  /* Wider than the reading pages: on a large screen the paths go two to a
     row instead of leaving the sides empty. */
  .eight-step {
    width: 100%;
    min-width: 0;
    max-width: 2560px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
    display: flex;
    flex-direction: column;
    gap: clamp(48px, 6vw, 88px);
    container-type: inline-size;
    /* SequenceShowcase colours its controls with the Level 1 ink tokens; map
       them to this page's theme, as /guide/zans-diamond does. */
    --ink: var(--theme-text);
    --ink-dim: var(--theme-text-muted);
    /* The hand tiles and the spin section share one width, growing on very
       wide screens so they don't sit as a thin column in the middle. */
    --demo-width: clamp(1320px, 62cqw, 1680px);
  }
  .eight-step h1 {
    margin: 0;
    padding: 0;
    grid-column: auto;
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
  .intro,
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
    max-width: var(--demo-width);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 2.5vw, 32px);
  }
  @container (max-width: 640px) {
    .hand-tiles {
      grid-template-columns: minmax(0, 22rem);
      justify-content: center;
    }
  }

  /* As wide as the hand tiles above it, so the text column ends with its
     pickers instead of running on into empty space. */
  .spin-demo {
    width: 100%;
    max-width: var(--demo-width);
    margin-inline: auto;
  }
  /* The spin canvas is the section's picture: larger than the guide's usual
     feature canvas, so it carries the column its pickers fill. */
  .spin-demo :global(.banner > .canvas-box) {
    flex-basis: clamp(230px, 34cqw, 420px);
  }
  /* The spin section's text column holds the pickers, left-aligned. */
  .pickers {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 12px);
    margin-top: var(--spacing-sm, 8px);
    container-type: inline-size;
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
  /* Eight props in whole rows: one row of eight, two of four, four of two. */
  .picker :global(.prop-grid) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 104px));
  }
  @container (min-width: 780px) {
    .picker :global(.prop-grid) {
      grid-template-columns: repeat(8, minmax(0, 104px));
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
  /* Eight paths in whole rows: two of four with room, four of two on a
     phone, where four across would push the rhythms into each other. The
     data-grid match outranks the control's own column rule. */
  .path-picker :global(.ui-segments[data-grid]) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @container (min-width: 520px) {
    .path-picker :global(.ui-segments[data-grid]) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  /* The props' element and what it means, under the pickers. */
  .prop-reading {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin: 0;
  }
  .prop-element {
    flex: none;
    width: 2rem;
    height: 2rem;
  }
  /* Each path option: its number, then its rhythm as two lines of three. */
  .path-option {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }
  .path-number {
    min-width: 1ch;
    font-variant-numeric: tabular-nums;
  }
  .rhythm {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
  }
  .rhythm .half {
    display: flex;
    gap: 2px;
  }
  .rhythm .element {
    width: 1.25rem;
    height: 1.25rem;
  }
  /* Each hand's two motions sit side by side, labelled by hand. */
  .hand-motions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
  }
  .hand-motion {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }
  .hand-motion :global(.segmented-control) {
    width: 12rem;
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
  /* Stacked on a phone, the showcase puts its whole text column above the
     canvas, which would leave the picture a screen below the pickers that
     change it. Unwrap the text column so the canvas sits between the heading
     and the pickers. */
  @container (max-width: 600px) {
    .spin-demo :global(.banner-text) {
      display: contents;
    }
    .spin-demo :global(.banner > .canvas-box) {
      order: 1;
    }
    .spin-demo .pickers,
    .spin-demo .poi-note,
    .spin-demo .chip {
      order: 2;
    }
  }

  .paths {
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 5vw, 72px);
  }
  /* A row per timing: its heading, then a box per direction, side by side
     once each has room for its canvas beside a wrapping strip. */
  .timing-row {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 20px);
  }
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
    .box-grid {
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
