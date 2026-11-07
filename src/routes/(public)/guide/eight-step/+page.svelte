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
   *
   * One rule for the screens (2026-11-05): a control is never on a screen
   * without the player it changes. The words live in copy.json beside this
   * file, so Austen can retype them in place.
   */
  import { onMount } from "svelte";
  import { dev } from "$app/env";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import { createPageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    watchSmallScreen,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import SequenceShowcase from "../level-1/_components/SequenceShowcase.svelte";
  import { stripToSequence } from "../level-1/_data/guide-sequence-adapter";
  import HandTile from "#lib/shared/guide-topics/components/HandTile.svelte";
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
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import TurnNotationControls from "@tka/shape-engine/app/components/TurnNotationControls.svelte";
  import type { MatrixLabelMode } from "@tka/shape-domain";
  import { ratioLabel } from "@tka/shape-domain";
  import { localizedMatrixTurnSpokenLabel } from "@tka/shape-engine/services/shape-matrix-display.js";
  import {
    turnValuesForLevel,
    type TurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";
  import copyJson from "./copy.json";

  const copy = createPageCopy({
    file: "src/routes/(public)/guide/eight-step/copy.json",
    initial: copyJson,
  });

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
  // Each case is one whole sentence in copy.json, so Austen can retype it.
  const PROP_TIMING_KEY = {
    split: "split",
    tog: "together",
    quarter: "quarter",
  } as const;
  const PROP_DIRECTION_KEY = { same: "same", opp: "opposite" } as const;
  const propReading = $derived.by(() => {
    const props = capPropRelationship(spinCap);
    if (props.kind === "full") {
      return {
        element: props.element.element as ElementalType,
        key: `props-${PROP_TIMING_KEY[props.timing]}-${PROP_DIRECTION_KEY[props.direction]}`,
      };
    }
    if (props.kind === "direction-only") {
      return {
        element: null,
        key: `props-drift-${PROP_DIRECTION_KEY[props.direction]}`,
      };
    }
    return null;
  });
  // Every sentence the props line can show, so the line keeps its height
  // while the picks change it.
  const PROP_LINE_KEYS = [
    ...CAP_TIMINGS.flatMap((timing) =>
      CAP_DIRECTIONS.map((direction) => `props-${timing}-${direction}`)
    ),
    "props-drift-same",
    "props-drift-opposite",
  ];
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

  // The tile's timing word is a control label; the heading and its sentence
  // are copy.
  const TIMING_WORD: Record<CapTiming, Parameters<typeof t>[0]> = {
    split: "guide_eightstep_timing_split_title",
    together: "guide_eightstep_timing_together_title",
    quarter: "guide_eightstep_timing_quarter_title",
  };
  const DIRECTION_WORD: Record<CapDirection, Parameters<typeof t>[0]> = {
    same: "guide_eightstep_screen_same",
    opposite: "guide_eightstep_screen_opposite",
  };

  // The path row: the eight numbers in the chart's order, 1 to 8. Split and
  // together paths are not neighbours in that order, so each tile names its
  // timing under the number instead of sitting in a group.
  const PATH_OPTIONS = $derived(
    CAP_HAND_PATHS.map((path) => ({
      value: String(path.column),
      label: String(path.column),
      ariaLabel: `${t("guide_eightstep_path_option", { n: path.column })}, ${t(TIMING_WORD[path.timing])}`,
    }))
  );
  const PATH_TIMING_WORD = $derived(
    Object.fromEntries(
      CAP_HAND_PATHS.map((path) => [
        String(path.column),
        t(TIMING_WORD[path.timing]),
      ])
    ) as Record<string, string>
  );
  // The caption names the picked path's setup, one whole sentence per path in
  // copy.json; every path's sentence reserves the line's height.
  const PATH_LINE_KEYS = CAP_HAND_PATHS.map((path) => `path-${path.column}`);

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
  // The whole line as text, for the showcase's height reservation and its
  // crawlable copy; the visible line renders the same words through CopyText.
  const fillCopy = (key: string, values: readonly string[]) =>
    values.reduce(
      (text, value, i) => text.replace(`{${i}}`, value),
      copy.text[key] ?? ""
    );
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
    const variantKey = QUARTER_PATH[path.column];
    const variant = variantKey ? t(variantKey) : null;
    const notPoi = !!poiProblem(cap);
    const line = variant
      ? fillCopy("example-variant", [variant, spins.left, spins.right])
      : fillCopy("example", [spins.left, spins.right]);
    return {
      ...spins,
      variant,
      notPoi,
      proseHtml: notPoi ? `${line} ${copy.text["not-poi"] ?? ""}` : line,
    };
  };

  // A row per timing, a box per direction; each box's examples cycle with
  // "Show another example".
  const rows = $derived(
    CAP_TIMINGS.map((timing) => ({
      timing,
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
          element: TND_TO_ELEMENTAL[capMode(timing, direction)],
          first: showcase(entries[0]!.cap),
          pool: entries.map(({ path, cap, left, right }) => ({
            word: cap.id,
            loopLabel: "",
            ...exampleProse(path, cap, left, right),
            items: capStrip(cap),
          })),
        };
      }),
    }))
  );

  // One screen at a time. The hands open, then the player with its controls,
  // then the timings. Three layouts: a phone (either way up) gets a screen per
  // control plus one for the steps; a tablet, the Fold and a laptop get two
  // player screens; a large window gets one. The Fold and a portrait tablet
  // count as "small" for other guide pages, whose figures need the height;
  // here the player and a compact control share their frame.
  let tier = $state<ScreenTier>("large");
  let phone = $state(false);
  // Same and Opposite share a screen where a pair still leaves each player
  // its size; the query is the one that takes in 820x1180 and 1000x800.
  let pairRoom = $state(true);
  onMount(() => watchScreenTier((v) => (tier = v)));
  onMount(() => watchSmallScreen((v) => (phone = v)));
  onMount(() => {
    const mq = window.matchMedia("(min-width: 800px) and (min-height: 760px)");
    const update = () => (pairRoom = mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  });
  const layout = $derived<"phone" | "mid" | "large">(
    phone ? "phone" : tier === "large" ? "large" : "mid"
  );
  const views = $derived.by(() => {
    const out: { label: string; parts: string[] }[] = [
      {
        label: t("guide_eightstep_screen_hands"),
        parts: ["lede", "hands", "credit"],
      },
    ];
    const spin = (label: string, ...parts: string[]) =>
      out.push({ label, parts: ["spin", ...parts] });
    if (layout === "phone") {
      spin(t("guide_eightstep_path"), "pickPath", "readPath");
      spin(t("guide_eightstep_prop"), "pickProp", "readProps");
      spin(t("guide_eightstep_screen_spin"), "pickSpin");
      spin(t("guide_eightstep_screen_steps"), "strip", "backNote");
    } else if (layout === "mid" && pairRoom) {
      spin(t("guide_eightstep_path"), "strip", "pickPath", "readPath");
      spin(
        t("guide_eightstep_screen_prop_spin"),
        "pickProp",
        "pickSpin",
        "readProps",
        "backNote"
      );
    } else if (layout === "mid") {
      // The Fold's frame cannot hold a real player over all these controls.
      spin(t("guide_eightstep_path"), "strip", "pickPath", "readPath");
      spin(t("guide_eightstep_prop"), "pickProp", "readProps");
      spin(t("guide_eightstep_screen_spin"), "pickSpin", "backNote");
    } else {
      spin(
        t("guide_eightstep_screen_all"),
        "strip",
        "pickPath",
        "pickProp",
        "pickSpin",
        "readPath",
        "readProps",
        "backNote"
      );
    }
    // Every box screen carries its timing's head, and the first also the
    // paths' words, so no timing needs a screen of words alone.
    CAP_TIMINGS.forEach((timing, m) => {
      const title = t(TIMING_WORD[timing]);
      const head = [...(m === 0 ? ["pathsIntro"] : []), `head-${timing}`];
      if (layout === "phone" || (layout === "mid" && !pairRoom)) {
        CAP_DIRECTIONS.forEach((direction, k) =>
          out.push({
            label: `${title}, ${t(DIRECTION_WORD[direction])}`,
            parts: [
              ...(k === 0 ? head : [`head-${timing}`]),
              `box-${timing}-${direction}`,
            ],
          })
        );
      } else {
        out.push({
          label: title,
          parts: [...head, ...CAP_DIRECTIONS.map((d) => `box-${timing}-${d}`)],
        });
      }
    });
    return out;
  });
  const has = (n: number, part: string) => views[n]?.parts.includes(part);

  // Two boxes side by side: six steps a row beside the start box, so the steps
  // grow with the window instead of thinning into one long row. The share keeps
  // the minimum under a seventh of a box's width; above that the start box takes
  // a row of its own and the players lose its height. A lone box on the Fold
  // fits all twelve in one row beside it at 40. Elsewhere the steps stay one
  // size.
  let windowWidth = $state(0);

  // Every timing screen draws its players at one size. The fit search cannot
  // promise that: it stops anywhere in a band, and where depends on the screen
  // it came from. So these boxes step out of it (their own --fit is fixed) and
  // take the room the frame leaves a player, measured here. A phone sets its
  // size outright.
  const BOX_PLAYER_FLOOR = 135;
  let boxPlayer = $state(0);
  function measureBoxPlayer(grid: HTMLElement) {
    const content = grid.closest<HTMLElement>(".fit-content");
    const area = grid.closest<HTMLElement>(".fit-area");
    if (!content || !area) return;
    const measure = () => {
      const player = grid.querySelector<HTMLElement>(".banner > .canvas-box");
      if (!player || layout === "phone") return;
      const rest = content.offsetHeight - player.offsetHeight;
      boxPlayer = Math.max(
        BOX_PLAYER_FLOOR,
        Math.floor(area.clientHeight - rest)
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(area);
    return { destroy: () => observer.disconnect() };
  }
  const boxStripMinCell = $derived(
    layout === "large" || (layout === "mid" && pairRoom)
      ? Math.round(windowWidth * 0.058)
      : layout === "mid"
        ? 40
        : 42
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

<svelte:window bind:innerWidth={windowWidth} />

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
        title={copy.text.title ?? ""}
        labels={views.map((v) => v.label)}
        hubHref={localHref("/guide")}
      >
        {#snippet titleContent()}<CopyText {copy} key="title" />{/snippet}
        {#snippet screen(n)}
          <div class="screen {layout}" class:compact={layout !== "large"}>
            {#if has(n, "lede")}
              <p class="lede">
                <CopyText {copy} key="lede" islands={[gageName]} />
              </p>
            {/if}

            {#if has(n, "hands")}
              <section class="hands" aria-labelledby="hands-heading-{n}">
                <h2 id="hands-heading-{n}">
                  <CopyText {copy} key="hands-title" />
                </h2>
                <div class="hand-tiles">
                  <HandTile
                    sequence={hands}
                    hand="left"
                    captionContent={handLeftCaption}
                    trail={HAND_TRAIL}
                  />
                  <HandTile
                    sequence={hands}
                    hand="both"
                    captionContent={handBothCaption}
                    trail={HAND_TRAIL}
                    stepNumbers
                  />
                  <HandTile
                    sequence={hands}
                    hand="right"
                    captionContent={handRightCaption}
                    trail={HAND_TRAIL}
                  />
                </div>
              </section>
            {/if}

            {#if has(n, "credit")}
              <footer class="credit">
                <p><CopyText {copy} key="credit" /></p>
                <LinkChip href={localHref("/notation/caps")}
                  >{t("guide_caps_link_caps")}</LinkChip
                >
              </footer>
            {/if}

            <!-- The player and the controls that change it, always together:
                 the path row runs the full width above a wide player, and the
                 other controls and the reading lines sit beside or under it.
                 A screen without the steps passes the showcase an empty strip;
                 the steps' words stay in its screen-reader text. -->
            {#if has(n, "spin")}
              <div
                class="spin-demo"
                class:no-strip={!has(n, "strip")}
                class:big-player={layout === "large"}
                class:phone-steps={layout === "phone" && has(n, "strip")}
                class:fold-stack={layout === "mid" && !pairRoom && !has(n, "strip")}
              >
                {#if has(n, "pickPath") && layout === "mid"}
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
                  stripUnder={layout === "large"}
                  stripMinCell={layout === "large" ? 60 : undefined}
                  strip={has(n, "strip") ? undefined : noStrip}
                  {picTheme}
                >
                  {#snippet text()}
                    {#if has(n, "pickProp") || has(n, "pickSpin") || (has(n, "pickPath") && layout !== "mid")}
                      <div class="pickers">
                        {#if has(n, "pickPath") && layout !== "mid"}
                          {@render pathPicker()}
                        {/if}
                        {#if has(n, "pickProp")}{@render propPicker()}{/if}
                        {#if has(n, "pickSpin")}{@render spinPicker()}{/if}
                      </div>
                    {/if}
                    {#if has(n, "readPath") || has(n, "readProps") || has(n, "backNote")}
                      <div class="readings">
                        {#if has(n, "backNote")}
                          <p class="back-note">
                            <CopyText {copy} key="back-note" />
                          </p>
                        {/if}
                        {#if has(n, "readPath")}{@render pathLine()}{/if}
                        {#if has(n, "readProps")}{@render propsLine()}{/if}
                      </div>
                    {/if}
                  {/snippet}
                </SequenceShowcase>
              </div>
            {/if}

            {#each rows as row (row.timing)}
              {#if has(n, `head-${row.timing}`)}
                <!-- The first timing's head also carries the paths' words.
                     The hidden copy reserves that height on all three, so
                     every box screen leaves its players the same room. A phone
                     sets its player's size outright and needs no reserve. -->
                <div class="box-head">
                  {#if layout !== "phone"}
                    <div class="head-group head-ghost" aria-hidden="true">
                      <div class="paths-intro">
                        <h2>{copy.text["paths-title"]}</h2>
                        <p>{copy.text["paths-body"]}</p>
                      </div>
                      <div class="timing-head">
                        <h3>{copy.text[`timing-${row.timing}-title`]}</h3>
                        <p>{copy.text[`timing-${row.timing}-body`]}</p>
                      </div>
                    </div>
                  {/if}
                  <div class="head-group">
                    {#if has(n, "pathsIntro")}
                      <section class="paths-intro">
                        <h2><CopyText {copy} key="paths-title" /></h2>
                        <p><CopyText {copy} key="paths-body" /></p>
                      </section>
                    {/if}
                    <div class="timing-head">
                      <h3>
                        <CopyText {copy} key="timing-{row.timing}-title" />
                      </h3>
                      <p>
                        <CopyText {copy} key="timing-{row.timing}-body" />
                      </p>
                    </div>
                  </div>
                </div>
              {/if}
              {@const shown = row.boxes.filter((box) =>
                has(n, `box-${row.timing}-${box.direction}`)
              )}
              {#if shown.length}
                <div
                  class="box-grid"
                  class:pair={shown.length > 1}
                  class:stacks={layout !== "phone"}
                  class:fixed-player={layout === "phone"}
                  style:--box-player={boxPlayer ? `${boxPlayer}px` : null}
                  use:measureBoxPlayer
                >
                  {#each shown as box (box.direction)}
                    <SequenceShowcase
                      sequence={box.first.sequence}
                      items={box.first.items}
                      pool={box.pool}
                      trail={TIP_TRAIL}
                      render={PROP_RENDER}
                      canvasLetter={false}
                      loop
                      stripBeside
                      stripMinCell={boxStripMinCell}
                      {picTheme}
                    >
                      {#snippet exampleLine(index)}
                        {@const line = box.pool[index]!}
                        {#snippet leftSpin()}{line.left}{/snippet}
                        {#snippet rightSpin()}{line.right}{/snippet}
                        {#snippet variantName()}{line.variant}{/snippet}
                        <span>
                          {#if line.variant}
                            <CopyText
                              {copy}
                              key="example-variant"
                              islands={[variantName, leftSpin, rightSpin]}
                            />
                          {:else}
                            <CopyText
                              {copy}
                              key="example"
                              islands={[leftSpin, rightSpin]}
                            />
                          {/if}
                        </span>
                        {#if line.notPoi}
                          <span><CopyText {copy} key="not-poi" /></span>
                        {/if}
                      {/snippet}
                      {#snippet text()}
                        <h4 class="box-title">
                          <img
                            class="element"
                            src={getElementImagePath(box.element)}
                            alt=""
                          />
                          <span
                            ><CopyText
                              {copy}
                              key="direction-{box.direction}"
                            /></span
                          >
                        </h4>
                      {/snippet}
                    </SequenceShowcase>
                  {/each}
                </div>
              {/if}
            {/each}

          </div>
        {/snippet}
      </GuideScreens>
    </main>
  </GuideShell>

  <LazyMount
    loader={() => import("#lib/shared/copy-edit/CopyEditBar.svelte")}
    active={dev}
    debugName="copy edit bar"
  />
{/if}

{#snippet gageName()}Gage DeMello{/snippet}
{#snippet handLeftCaption()}<CopyText {copy} key="hand-left" />{/snippet}
{#snippet handBothCaption()}<CopyText {copy} key="hand-both" />{/snippet}
{#snippet handRightCaption()}<CopyText {copy} key="hand-right" />{/snippet}
{#snippet noStrip(_progress: number)}{/snippet}

{#snippet pathPicker()}
  <div class="picker path-picker">
    <span class="picker-label" id="path-picker-label"
      >{t("guide_eightstep_path")}</span
    >
    <SegmentedControl
      size={layout === "phone" ? "sm" : "md"}
      density={layout === "phone" ? "tight" : "compact"}
      options={PATH_OPTIONS}
      value={String(pathColumn)}
      onchange={(v) => (pathColumn = Number(v))}
      ariaLabelledby="path-picker-label"
      semantics="button-group"
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
    <div class="picker-head">
      <span class="picker-label">{t("guide_eightstep_motion")}</span>
      <LinkChip href={localHref("/guide/prospin-and-inspin")}
        >{t("guide_eightstep_link_prospin")}</LinkChip
      >
    </div>
    <div class="hand-motions">
      <div class="hand-motion">
        <span class="hand-label" id="motion-left-label"
          >{t("guide_eightstep_spin_left")}</span
        >
        <SegmentedControl
          size={layout === "phone" ? "sm" : "md"}
          density={layout === "phone" ? "tight" : "standard"}
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
          size={layout === "phone" ? "sm" : "md"}
          density={layout === "phone" ? "tight" : "standard"}
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

{#snippet pathLine()}
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
    <span class="line-stack">
      {#each PATH_LINE_KEYS as key (key)}
        <span class="line-ghost" aria-hidden="true"
          >{copy.text[key]} {copy.text["corner-hands"]}</span
        >
      {/each}
      <span class="line-live">
        <span><CopyText {copy} key="path-{spinPath.column}" /></span>
        <span><CopyText {copy} key="corner-hands" /></span>
      </span>
    </span>
  </p>
{/snippet}

{#snippet propsLine()}
  {#if propReading}
    <p class="prop-reading" aria-live="polite">
      <span class="prop-element-slot">
        {#if propReading.element}
          <img
            class="prop-element"
            src={getElementImagePath(propReading.element)}
            alt=""
          />
        {/if}
      </span>
      <span class="line-stack">
        {#each PROP_LINE_KEYS as key (key)}
          <span class="line-ghost" aria-hidden="true"
            >{copy.text[key]}{key.includes("drift")
              ? ""
              : ` ${copy.text["corner-props"]}`}</span
          >
        {/each}
        <span class="line-live">
          <span><CopyText {copy} key={propReading.key} /></span>
          {#if propReading.element}
            <span><CopyText {copy} key="corner-props" /></span>
          {/if}
        </span>
      </span>
    </p>
  {/if}
  {#if poiProblem(spinCap)}
    <p class="poi-note">
      <CopyText
        {copy}
        key={poiProblem(spinCap) === "anti-zero" ? "poi-anti-zero" : "poi-note"}
      />
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
  /* The playing step grows and takes a ring. When the steps close the frame,
     this keeps the ring's bottom edge inside it. */
  .spin-demo:not(.no-strip),
  .box-grid {
    padding-block-end: 6px;
  }
  .screen {
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2.5vh, 2rem);
    width: 100%;
    margin-inline: auto;
    container-type: inline-size;
  }
  .eight-step h2,
  .eight-step h3,
  .eight-step h4 {
    margin: 0;
  }
  /* The guide's shared heading and paragraph sizes follow the window's width.
     This page's words hold one size in a window of any width. */
  .eight-step h2 {
    font-size: var(--title-size, 1.75rem);
  }
  .eight-step p {
    font-size: var(--read-size, 1.0625rem);
    line-height: 1.6;
    color: var(--theme-text-muted);
    margin: 0;
  }
  .screen.compact {
    --title-size: 1.375rem;
    --read-size: 1rem;
  }
  .screen.phone {
    --title-size: 1.3rem;
    --read-size: 0.95rem;
  }
  .paths-intro,
  .credit,
  .hands {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    text-align: center;
  }
  .lede.lede {
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
    max-width: min(100%, calc(var(--demo-width) * var(--fit, 1)));
  }
  /* A phone's frame is short: the first screen's words close up, and the
     credit runs beside its link. */
  .screen.phone {
    gap: var(--spacing-xs, 6px);
  }
  .screen.phone .hands {
    gap: var(--spacing-xs, 6px);
  }
  .screen.phone .credit {
    flex-direction: row;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    text-align: start;
  }
  .screen.phone .credit :global(a) {
    flex: none;
    white-space: nowrap;
  }
  /* A phone's chip row sits beside the guide contents button. Without its
     number and with a shorter fade, the longest screen name shows whole. */
  @media (max-width: 480px) {
    .eight-step.eight-step :global(.pills.pills.pills.pills) {
      mask-image: linear-gradient(
        to right,
        transparent,
        #000 6px,
        #000 calc(100% - 6px),
        transparent
      );
    }
    .eight-step.eight-step :global(.pill.pill .pill-n) {
      display: none;
    }
    .eight-step.eight-step :global(.pill.pill) {
      padding-inline: 0.5rem;
    }
  }

  /* The player and its controls. The fit search grows the player until the
     screen is full; the words and controls keep one size at every window.
     Canvas left and the controls beside it, except on a tall narrow frame,
     where the player runs the frame's width on top. */
  .spin-demo {
    width: 100%;
    max-width: calc(var(--demo-width) * max(var(--fit, 1), 1));
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 12px);
  }
  .spin-demo.spin-demo :global(.banner) {
    flex-direction: row-reverse;
    align-items: center;
    gap: clamp(0.75rem, 2.5cqw, 2rem);
  }
  .spin-demo.spin-demo :global(.banner > .canvas-box.canvas-box) {
    flex: 0 0 min(calc(300px * var(--fit, 1)), 52cqw);
    width: auto;
    margin: 0;
    align-self: center;
  }
  /* A sideways phone's steps sit beside the player, and each one's width sets
     the other's. A set size stops them settling on either of two layouts. */
  @media (orientation: landscape) {
    .spin-demo.phone-steps :global(.banner > .canvas-box.canvas-box) {
      flex-basis: min(52cqw, calc(100svh - 150px));
    }
  }
  .spin-demo.spin-demo :global(.banner > .banner-text) {
    justify-content: center;
    gap: var(--spacing-md, 12px);
  }
  /* A large window keeps every control on this one screen. The player stands
     over its steps in one column, which takes the room the window adds. The
     controls hold a set column centred against it, so more canvas never
     stretches a control. */
  .spin-demo.big-player {
    max-width: none;
  }
  .spin-demo.big-player :global(.showcase) {
    display: grid;
    grid-template-columns:
      min(calc(1000px * var(--fit, 1)), calc(100cqw - 680px))
      minmax(0, 820px);
    justify-content: center;
    gap: var(--spacing-sm, 8px) clamp(0.75rem, 2.5cqw, 2rem);
  }
  .spin-demo.big-player :global(.showcase > .banner) {
    display: contents;
  }
  .spin-demo.big-player :global(.banner > .canvas-box.canvas-box) {
    grid-area: 1 / 1;
  }
  .spin-demo.big-player :global(.showcase > .guide-step-strip) {
    grid-area: 2 / 1;
  }
  .spin-demo.big-player :global(.banner > .banner-text) {
    grid-area: 1 / 2 / 3 / 3;
    align-self: center;
    min-width: 0;
  }
  @media (min-height: 1001px) {
    .spin-demo.big-player :global(.banner > .banner-text) {
      grid-area: 1 / 2;
    }
  }
  /* The Fold upright is too narrow for controls beside a player without their
     words wrapping, so its prop and spin screens run them under the player. */
  .spin-demo.fold-stack :global(.banner) {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .spin-demo.fold-stack :global(.banner > .canvas-box.canvas-box) {
    flex: none;
    width: min(100%, calc(300px * var(--fit, 1)));
    margin-inline: auto;
  }
  @media (max-aspect-ratio: 4/5) {
    .spin-demo.spin-demo :global(.banner) {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .spin-demo.spin-demo :global(.banner > .canvas-box.canvas-box) {
      flex: none;
      width: min(100%, calc(300px * var(--fit, 1)));
      margin-inline: auto;
    }
  }
  /* The showcase's strip gap has nothing under it on a screen with no strip. */
  .spin-demo.no-strip :global(.showcase) {
    gap: 0;
  }
  /* Its own container, so the path columns follow the row's width. */
  .path-row {
    container-type: inline-size;
  }
  .pickers {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 12px);
    container-type: inline-size;
  }
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 6px);
  }
  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
  }
  .picker-label {
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    color: var(--theme-text-muted);
  }
  /* Eight props in whole rows that fill the column: one of eight where the
     column has 700px, two of four, four of two on a narrow phone. */
  /* The shared control floors its buttons at 44px whatever its density; a
     phone gives that height to the player. */
  .picker.picker :global(.segment) {
    min-height: var(--segment-floor, 44px);
  }
  .picker :global(.prop-grid) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  @container (min-width: 700px) {
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
  /* Below a large window, and on a short one, the tiles tighten so the
     player keeps the height. */
  .screen.compact {
    --prop-img-size: 26px;
    --tile-block: 4px;
    --tile-gap: 2px;
    --tile-row-gap: 6px;
  }
  @media (max-height: 1000px) {
    .screen.large {
      --prop-img-size: 26px;
      --tile-block: 4px;
      --tile-gap: 2px;
      --tile-row-gap: 6px;
    }
  }
  .picker :global(.prop-option) {
    padding-block: var(--tile-block, 10px 8px);
    gap: var(--tile-gap, 6px);
  }
  .picker :global(.prop-grid) {
    gap: var(--tile-row-gap, 10px);
  }
  /* Four tiles across a phone, or eight across a column: a slimmer side
     padding leaves the longest prop name its width. */
  @container (max-width: 400px) {
    .picker :global(.prop-grid) {
      column-gap: 3px;
    }
    .picker :global(.prop-option) {
      padding-inline: 0;
    }
  }
  @container (min-width: 700px) {
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
  /* The path's setup and the props' element: a fixed figure on the left (the
     path's rhythm, the props' element) and its sentences beside it. Every
     sentence the line can show sits hidden in one grid cell, so the line keeps
     its height while the picks change it. */
  .readings {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .prop-reading.prop-reading {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin: 0;
    max-width: none;
    line-height: 1.4;
  }
  .prop-element-slot {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
  }
  .prop-element {
    display: block;
    width: 2.25rem;
    height: 2.25rem;
  }
  .line-stack {
    flex: 1 1 0;
    display: grid;
    min-width: 0;
  }
  .line-ghost,
  .line-live {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .line-ghost {
    visibility: hidden;
    pointer-events: none;
  }
  .line-live {
    display: block;
  }
  .back-note.back-note {
    font-size: 0.9375rem;
    line-height: 1.4;
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
  /* Each hand's name sits over its toggle, so the toggle has the whole width
     for its words. A wide column, and a phone's short frame, put the name
     beside the toggle instead to save the height. */
  .hand-motions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-sm, 8px) var(--spacing-lg, 24px);
  }
  @container (max-width: 479.98px) {
    .hand-motions {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .hand-motion {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .hand-motion :global(.segmented-control) {
    min-width: 0;
  }
  .hand-label {
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text));
  }
  /* One width for both names, so the two toggles line up. */
  .screen.phone .hand-motion {
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }
  .screen.phone .hand-motion :global(.segmented-control) {
    flex: 1 1 0;
  }
  .screen.phone .hand-label {
    flex: none;
    width: 5.5rem;
  }
  @container (min-width: 640px) {
    .hand-motion {
      flex-direction: row;
      align-items: center;
      gap: var(--spacing-sm, 8px);
    }
    .hand-motion :global(.segmented-control) {
      flex: 1 1 0;
    }
    .hand-label {
      flex: none;
      width: 5.5rem;
    }
  }
  .poi-note {
    margin-top: var(--spacing-sm, 8px);
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  /* A timing's heading, one centred block over its boxes, then a box per
     direction. The hidden copy and the live words share one grid cell. */
  .box-head {
    display: grid;
  }
  .head-group {
    grid-area: 1 / 1;
    align-self: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--spacing-xs, 6px);
    min-width: 0;
  }
  .head-ghost {
    visibility: hidden;
    pointer-events: none;
  }
  .timing-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }
  .box-head h2 {
    font-size: var(--head-size, 1.25rem);
  }
  .timing-head h3 {
    font-size: var(--head-size, 1.25rem);
  }
  .box-head p {
    font-size: var(--head-body-size, 1rem);
    line-height: 1.35;
  }
  /* A sideways phone is too short to stack the two heads over its box. */
  @container (min-width: 640px) {
    .screen.phone .head-group {
      flex-direction: row;
      align-items: center;
      gap: var(--spacing-lg, 24px);
    }
    .screen.phone .timing-head {
      flex: 1 1 0;
    }
    .screen.phone .paths-intro {
      flex: 2 1 0;
    }
  }
  .box-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(16px, 3vw, 48px);
  }
  .box-grid.pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* A box's player sits beside its words where it can stay large there;
     every box in a window draws it at one size. Its words sit under it in a
     narrow column. Each box reserves the same three lines for its example, so
     the quarter boxes' longer lines do not shrink their players. */
  .box-grid.box-grid :global(.banner) {
    flex-direction: row-reverse;
    align-items: center;
    gap: clamp(0.75rem, 3cqw, 1.5rem);
  }
  .box-grid.stacks {
    --fit: 4;
  }
  .box-grid.box-grid :global(.banner > .canvas-box.canvas-box) {
    flex: 0 0 min(var(--box-player, 300px), 58cqw);
    width: auto;
    margin: 0;
    align-self: center;
  }
  .box-grid :global(.example-prose) {
    min-height: var(--example-lines, 3lh);
  }
  /* A phone's box player takes a set share of the frame, so a long example
     changes the words' room and never the player's size. */
  .box-grid.box-grid.fixed-player :global(.banner > .canvas-box.canvas-box) {
    flex-basis: min(52cqw, calc(100svh - 150px));
  }
  .box-grid.box-grid :global(.ex-ghost),
  .box-grid.box-grid :global(.ex-live) {
    font-size: var(--example-size, 1.0625rem);
    line-height: 1.3;
    text-align: start;
  }
  .box-grid.box-grid :global(.banner-text) {
    justify-content: center;
    gap: 0.4rem;
  }
  .box-grid.box-grid :global(.cycle) {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0.4rem 0.7rem;
    margin-top: 0.3rem;
  }
  .box-grid :global(.cycle-btn) {
    font-size: var(--cycle-size, var(--example-size, 1.0625rem));
    padding-inline: var(--cycle-pad, 1.05rem);
  }
  @container (max-width: 439.98px) {
    .box-grid.stacks :global(.banner) {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .box-grid.stacks :global(.banner > .canvas-box.canvas-box) {
      flex: none;
      width: min(100%, var(--box-player, 300px));
      margin-inline: auto;
    }
  }
  /* On a phone the player and the words stay side by side and the words
     tighten, so the steps fit under them. */
  .screen.phone {
    --min-touch-target: 34px;
    --head-size: 1.0625rem;
    --head-body-size: 0.875rem;
    --example-size: 0.9375rem;
    --cycle-pad: 0.6rem;
    --box-title-size: 0.9375rem;
    --box-element-size: 1.75rem;
    --example-lines: 0;
    --segment-floor: 34px;
    --cycle-pad: 0.25rem;
    --cycle-size: 0.875rem;
  }
  /* The element names the mode the box's paths open in. */
  .box-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    font-size: var(--box-title-size, 1.125rem);
    color: var(--theme-text);
  }
  .box-title .element {
    width: var(--box-element-size, 2.25rem);
    height: var(--box-element-size, 2.25rem);
    flex: none;
  }
  .credit {
    font-size: 0.875rem;
  }
</style>
