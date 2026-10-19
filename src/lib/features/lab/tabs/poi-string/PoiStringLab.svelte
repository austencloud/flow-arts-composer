<!--
  PoiStringLab.svelte - Where does the hand go to spin this CAP on poi?

  Plays one of Gage DeMello's CAPs (from Mentive's SpiroAnim) at tempo. Each
  poi head follows the drawing, and the hand sits where its string has to be
  to carry it there. The head's path is coloured by how far that hand strays
  from the drawn one. The physics lives in poi-string-check.ts.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import TurnNotationControls from "#lib/shared/shape-matrix/app/components/TurnNotationControls.svelte";
  import type { MatrixLabelMode } from "#lib/shared/shape-matrix/domain/matrix-turn-band.js";
  import {
    turnValuesForLevel,
    type TurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";
  import {
    CAP_HAND_PATHS,
    capOnPath,
    capPairing,
    capPathMode,
    capStrip,
    type Cap,
    type CapHandSpin,
    type CapSpin,
  } from "#lib/shared/guide-topics/caps-topic.js";
  import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
  import { TND_TO_ELEMENTAL } from "#lib/shared/pictograph/shared/domain/utils/tnd-calculator.js";
  import {
    getElementImagePath,
    type ElementalType,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { elementalDisplayLabel } from "#lib/shared/pictograph/shared/components/elemental-display-label.js";
  import {
    DEFAULT_POI_STRING_OPTIONS,
    HARD_STRAY_METRES,
    STEER_STRAY_METRES,
    solvePoiHand,
    type PoiHandEffort,
    type PoiHandResult,
    type PoiHandSample,
  } from "./poi-string-check.js";

  type Side = "left" | "right";
  const SIDES: readonly Side[] = ["left", "right"];
  type Motion = CapHandSpin["motion"];

  let column = $state(1);
  let mode = $state<"chart" | "same">("chart");
  let leftChart = $state<CapSpin>("antispin");
  let rightChart = $state<CapSpin>("antispin");
  let leftMotion = $state<Motion>("anti");
  let rightMotion = $state<Motion>("anti");
  let leftTurn = $state<TurnValue>(1);
  let rightTurn = $state<TurnValue>(1);
  let labelMode = $state<MatrixLabelMode>("turns");
  let bpm = $state(DEFAULT_POI_STRING_OPTIONS.bpm);
  let handRadius = $state(DEFAULT_POI_STRING_OPTIONS.handRadius);
  let stringLength = $state(DEFAULT_POI_STRING_OPTIONS.stringLength);
  let turnaroundBeats = $state(DEFAULT_POI_STRING_OPTIONS.turnaroundBeats);
  let speedBlendBeats = $state(DEFAULT_POI_STRING_OPTIONS.speedBlendBeats);
  let gravity = $state<"on" | "off">("on");
  let playing = $state(true);

  const TURN_VALUES = turnValuesForLevel(4);
  // On Gage's chart the right hand's prospin settles to Pro 0 every third
  // beat; the arrow marks what that third beat does.
  const CHART_SPINS: { value: CapSpin; label: string }[] = [
    { value: "antispin", label: "Anti 1" },
    { value: "extension", label: "Pro 0" },
    { value: "prospin", label: "Pro 1 → Pro 0" },
  ];
  const MOTIONS: { value: Motion; label: string }[] = [
    { value: "anti", label: "Anti" },
    { value: "pro", label: "Pro" },
  ];
  // The left hand switches motion on its beat back, so its choices read
  // forward, then back. On Gage's chart the turns change on the way back too.
  const LEFT_CHART_SPINS: { value: CapSpin; label: string }[] = [
    { value: "antispin", label: "Anti 1 → Pro 0" },
    { value: "extension", label: "Pro 0 → Anti 1" },
    { value: "prospin", label: "Pro 1 → Anti 1" },
  ];
  const LEFT_MOTIONS: { value: Motion; label: string }[] = [
    { value: "anti", label: "Anti → Pro" },
    { value: "pro", label: "Pro → Anti" },
  ];
  const tone = (
    options: { value: string; label: string }[],
    t: "blue" | "red"
  ) => options.map((o) => ({ ...o, tone: t }));

  const path = $derived(CAP_HAND_PATHS[column - 1]!);
  const cap = $derived<Cap>(
    mode === "chart"
      ? path.caps.find((c) => {
          const p = capPairing(c);
          return p.capping === leftChart && p.circling === rightChart;
        })!
      : capOnPath(
          path,
          { motion: leftMotion, turns: leftTurn },
          { motion: rightMotion, turns: rightTurn }
        )
  );

  const beatSteps = $derived(capStrip(cap).slice(1));
  // The hands' timing and direction on each beat, as the pictograph glyph
  // reads it. The capping hand's beat back flips the direction.
  const beatElements = $derived(
    beatSteps.map((step) => deriveTnDFromPictograph(step).elementalType)
  );
  const pathElement = (p: (typeof CAP_HAND_PATHS)[number]): ElementalType =>
    TND_TO_ELEMENTAL[capPathMode(p)];

  const results = $derived.by(() => {
    const beats = beatSteps;
    const options = {
      bpm,
      handRadius,
      stringLength,
      turnaroundBeats,
      speedBlendBeats,
      gravity: gravity === "on",
    };
    const run = (side: Side) =>
      solvePoiHand(
        beats.map((step) => step.motions[side]!),
        options
      );
    return { left: run("left"), right: run("right") };
  });

  // One scale for every setting, so a longer string draws longer. It only
  // grows when the poi would leave the frame.
  const extent = $derived(Math.max(1.4, (handRadius + stringLength) * 1.1));
  const beatCount = $derived(results.left.beats.length);

  // The head's path, cut into runs that share an effort band.
  function trail(samples: PoiHandSample[]) {
    const runs: { effort: PoiHandEffort; d: string }[] = [];
    samples.forEach((s, i) => {
      const point = `${s.head.x.toFixed(4)},${s.head.y.toFixed(4)}`;
      const last = runs.at(-1);
      if (last && last.effort === s.effort) last.d += ` L${point}`;
      else {
        const prev = samples[i - 1];
        const from = prev
          ? `M${prev.head.x.toFixed(4)},${prev.head.y.toFixed(4)} L`
          : "M";
        runs.push({ effort: s.effort, d: `${from}${point}` });
      }
    });
    return runs;
  }
  // The path the hand has to take, closed round the loop.
  const handPath = (samples: PoiHandSample[]) =>
    `M${samples
      .map((s) => `${s.hand.x.toFixed(4)},${s.hand.y.toFixed(4)}`)
      .join(" L")} Z`;
  const trails = $derived({
    left: trail(results.left.samples),
    right: trail(results.right.samples),
  });
  const handPaths = $derived({
    left: handPath(results.left.samples),
    right: handPath(results.right.samples),
  });

  // Plays at the chosen tempo, so a beat on screen lasts a real beat.
  let beatPos = $state(0);
  let frame = 0;
  let last = 0;
  function tick(now: number) {
    if (last && playing)
      beatPos = (beatPos + ((now - last) / 1000) * (bpm / 60)) % beatCount;
    last = now;
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  onDestroy(() => cancelAnimationFrame(frame));

  const at = (result: PoiHandResult) =>
    result.samples[
      Math.floor((beatPos / beatCount) * result.samples.length) %
        result.samples.length
    ]!;
  const now = $derived({ left: at(results.left), right: at(results.right) });
  const currentBeat = $derived(Math.floor(beatPos));

  const cm = (metres: number) => `${Math.round(metres * 100)} cm`;
  // Each follows "Left hand" or "Right hand".
  function summary(result: PoiHandResult) {
    const peak = result.beats.findIndex((b) => b.maxStray === result.maxStray);
    const loose = result.beats
      .map((b, i) => (b.effort === "loose" ? i + 1 : 0))
      .filter(Boolean);
    const floats = loose.length
      ? `; the poi nearly floats on beat${loose.length > 1 ? "s" : ""} ${loose.join(", ")}`
      : "";
    return `strays up to ${cm(result.maxStray)} from the drawn path, most on beat ${peak + 1}${floats}`;
  }
</script>

<div class="poi-string-lab">
  <header>
    <h2>Poi String Check</h2>
    <p>
      A poi string can only pull along itself, so wherever the poi head goes,
      the hand has to be one string length away in the direction of the pull.
      This plays a CAP at tempo with each poi head on its drawn path and works
      out where the hand has to be. Every pattern can be spun; what changes is
      how far the hand strays from the drawn circle. CAPs are Gage DeMello's,
      from Mentive's SpiroAnim.
    </p>
  </header>

  <div class="layout">
    <div class="stage">
      <svg
        viewBox="{-extent} {-extent} {extent * 2} {extent * 2}"
        role="img"
        aria-label="Both poi playing the CAP, each head's path coloured by how far its hand strays"
      >
        <circle class="hand-circle" r={handRadius} />
        {#each SIDES as side (side)}
          <path
            class="hand-path {side}"
            d={handPaths[side]}
            stroke-width={extent * 0.006}
          />
          {#each trails[side] as run, i (i)}
            <path
              class="trail {side} {run.effort}"
              d={run.d}
              stroke-width={extent * 0.012}
            />
          {/each}
        {/each}
        {#each SIDES as side (side)}
          {@const s = now[side]}
          <circle
            class="drawn-hand"
            cx={s.drawn.x}
            cy={s.drawn.y}
            r={extent * 0.025}
            stroke-width={extent * 0.006}
          />
          <line
            class="string {s.effort}"
            x1={s.hand.x}
            y1={s.hand.y}
            x2={s.head.x}
            y2={s.head.y}
            stroke-width={extent * 0.008}
          />
          <circle
            class="hand {side}"
            cx={s.hand.x}
            cy={s.hand.y}
            r={extent * 0.025}
          />
          <circle
            class="head {side}"
            cx={s.head.x}
            cy={s.head.y}
            r={extent * 0.04}
          />
        {/each}
      </svg>
      <div class="playbar">
        <button type="button" class="play" onclick={() => (playing = !playing)}>
          {playing ? "Pause" : "Play"}
        </button>
        <span>Beat {currentBeat + 1} of {beatCount} · {cap.word}</span>
      </div>
      <ul class="legend">
        <li>
          <span class="swatch close"></span>Hand within {cm(STEER_STRAY_METRES)}
        </li>
        <li>
          <span class="swatch steer"></span>{cm(STEER_STRAY_METRES)} to {cm(
            HARD_STRAY_METRES
          )}
        </li>
        <li>
          <span class="swatch hard"></span>Over {cm(HARD_STRAY_METRES)}
        </li>
        <li><span class="swatch loose"></span>Poi nearly floats</li>
      </ul>
      <p class="note">
        Solid dot: where the hand has to be. Ring: where the drawing puts it.
        The thin line traces the hand's needed path.
      </p>
    </div>

    <div class="controls">
      <div class="row">
        <span class="label" id="poi-path-label">Hand path</span>
        <SegmentedControl
          options={CAP_HAND_PATHS.map((p) => ({
            value: String(p.column),
            label: String(p.column),
            ariaLabel: `${p.column}, opens in ${elementalDisplayLabel(pathElement(p))}`,
          }))}
          value={String(column)}
          onchange={(v) => (column = Number(v))}
          ariaLabelledby="poi-path-label"
          semantics="radiogroup"
          density="compact"
          columns={4}
        >
          {#snippet optionContent(value)}
            {@const p = CAP_HAND_PATHS[Number(value) - 1]!}
            <span class="path-option">
              <img
                class="element"
                src={getElementImagePath(pathElement(p))}
                alt=""
              />
              {p.column}
            </span>
          {/snippet}
        </SegmentedControl>
      </div>
      <div class="row">
        <span class="label" id="poi-mode-label">Spins</span>
        <SegmentedControl
          options={[
            { value: "chart", label: "Gage's chart" },
            { value: "same", label: "Same turns" },
          ]}
          value={mode}
          onchange={(v) => (mode = v)}
          ariaLabelledby="poi-mode-label"
          semantics="radiogroup"
        />
      </div>
      {#if mode === "chart"}
        <div class="row hands">
          <span class="hand-label" id="poi-left-chart">Left hand</span>
          <SegmentedControl
            options={tone(LEFT_CHART_SPINS, "blue")}
            value={leftChart}
            onchange={(v) => (leftChart = v)}
            ariaLabelledby="poi-left-chart"
            semantics="radiogroup"
            color="blue"
          />
          <span class="hand-label" id="poi-right-chart">Right hand</span>
          <SegmentedControl
            options={tone(CHART_SPINS, "red")}
            value={rightChart}
            onchange={(v) => (rightChart = v)}
            ariaLabelledby="poi-right-chart"
            semantics="radiogroup"
            color="red"
          />
        </div>
      {:else}
        <div class="row hands">
          <span class="hand-label" id="poi-left-motion">Left hand</span>
          <SegmentedControl
            options={tone(LEFT_MOTIONS, "blue")}
            value={leftMotion}
            onchange={(v) => (leftMotion = v)}
            ariaLabelledby="poi-left-motion"
            semantics="radiogroup"
            color="blue"
          />
          <span class="hand-label" id="poi-right-motion">Right hand</span>
          <SegmentedControl
            options={tone(MOTIONS, "red")}
            value={rightMotion}
            onchange={(v) => (rightMotion = v)}
            ariaLabelledby="poi-right-motion"
            semantics="radiogroup"
            color="red"
          />
        </div>
        <div class="row">
          <span class="label">Turns</span>
          <TurnNotationControls
            {leftTurn}
            {rightTurn}
            {labelMode}
            turnValues={TURN_VALUES}
            onturn={(hand, turn) =>
              hand === "left" ? (leftTurn = turn) : (rightTurn = turn)}
            onlabelmodechange={(m) => (labelMode = m)}
          />
        </div>
      {/if}
      <p class="note">
        Each hand repeats three beats. The left hand caps: two beats on, one
        back, switching between pro and anti on the way back. An arrow shows
        what the third beat does differently.
      </p>

      <ValueSlider
        label="Tempo"
        value={bpm}
        min={40}
        max={300}
        step={5}
        format={(v) => `${v} bpm`}
        onchange={(v) => (bpm = v)}
      />
      <ValueSlider
        label="Hand circle radius"
        value={handRadius}
        min={0.1}
        max={1.2}
        step={0.05}
        format={(v) => `${v.toFixed(2)} m`}
        onchange={(v) => (handRadius = v)}
      />
      <ValueSlider
        label="String length"
        value={stringLength}
        min={0.3}
        max={1.2}
        step={0.05}
        format={(v) => `${v.toFixed(2)} m`}
        onchange={(v) => (stringLength = v)}
      />
      <ValueSlider
        label="Turnaround"
        value={turnaroundBeats}
        min={0.02}
        max={0.25}
        step={0.01}
        format={(v) => `${v.toFixed(2)} beat`}
        onchange={(v) => (turnaroundBeats = v)}
      />
      <ValueSlider
        label="Speed change"
        value={speedBlendBeats}
        min={0.02}
        max={0.5}
        step={0.01}
        format={(v) => `${v.toFixed(2)} beat`}
        onchange={(v) => (speedBlendBeats = v)}
      />
      <div class="row">
        <span class="label" id="poi-gravity-label">Gravity</span>
        <SegmentedControl
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          value={gravity}
          onchange={(v) => (gravity = v)}
          ariaLabelledby="poi-gravity-label"
          semantics="radiogroup"
          density="compact"
        />
      </div>
    </div>
  </div>

  <section class="beats" aria-label="Beat by beat">
    <div class="beat-row">
      <p class="verdict"><strong>Hands</strong> timing and direction</p>
      <ol class="modes" style="--beats: {Math.min(beatElements.length, 12)}">
        {#each beatElements as element, i (i)}
          <li class:current={i === currentBeat}>
            {#if element}
              <img
                class="element"
                src={getElementImagePath(element)}
                alt={elementalDisplayLabel(element)}
              />
            {/if}
          </li>
        {/each}
      </ol>
    </div>
    {#each SIDES as side (side)}
      {@const result = results[side]}
      <div class="beat-row">
        <p class="verdict {side}">
          <strong>{side === "left" ? "Left" : "Right"} hand</strong>
          {summary(result)}
        </p>
        <ol style="--beats: {Math.min(result.beats.length, 12)}">
          {#each result.beats as b, i (i)}
            <li class={b.effort} class:current={i === currentBeat}>
              <span class="n">{i + 1}</span>
              <span class="v">{cm(b.maxStray)}</span>
            </li>
          {/each}
        </ol>
      </div>
    {/each}
    <p class="note">
      Each cell shows the furthest the hand strays from the drawn path on that
      beat. Gravity alone moves it some: a plain wall-plane circle strays about
      20 cm at 180 bpm. Speed change is how long the poi takes to settle into a
      new spin speed. Beats run at an even tempo, as the animation does.
    </p>
  </section>
</div>

<style>
  .poi-string-lab {
    --clean-left: #60a5fa;
    --clean-right: #f87171;
    --steer: #facc15;
    --hard: #f97316;
    --loose: #e879f9;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 24px);
    padding: var(--spacing-lg, 24px);
    max-width: 1200px;
    margin: 0 auto;
    /* A size container takes no width from its content, so claim the row. */
    width: 100%;
    box-sizing: border-box;
    container-type: inline-size;
    color: var(--theme-text);
  }
  header h2 {
    margin: 0 0 var(--spacing-xs, 4px);
    font-size: 1.375rem;
  }
  header p,
  .note {
    margin: 0;
    max-width: 68ch;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--theme-text-dim, var(--theme-text));
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--spacing-lg, 24px);
    align-items: start;
  }
  /* Side by side only when both the stage and the pickers get room. */
  @container (max-width: 880px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .stage {
      width: 100%;
      max-width: 34rem;
    }
  }
  .stage {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }
  svg {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }
  .hand-circle {
    fill: none;
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.18));
    stroke-width: 0.006;
    stroke-dasharray: 0.03 0.03;
  }
  .trail {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.75;
  }
  .trail.left.close {
    stroke: var(--clean-left);
  }
  .trail.right.close {
    stroke: var(--clean-right);
  }
  .trail.steer {
    stroke: var(--steer);
  }
  .trail.hard {
    stroke: var(--hard);
  }
  .trail.loose {
    stroke: var(--loose);
  }
  .hand-path {
    fill: none;
    opacity: 0.45;
    stroke-linejoin: round;
  }
  .hand-path.left {
    stroke: var(--clean-left);
  }
  .hand-path.right {
    stroke: var(--clean-right);
  }
  .drawn-hand {
    fill: none;
    stroke: var(--theme-text);
    opacity: 0.6;
  }
  .string {
    stroke: var(--theme-text);
    opacity: 0.8;
  }
  .string.loose {
    stroke: var(--loose);
    stroke-dasharray: 0.02 0.02;
  }
  .hand {
    fill: var(--theme-text);
  }
  .head.left {
    fill: var(--clean-left);
  }
  .head.right {
    fill: var(--clean-right);
  }
  .playbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 16px);
    font-size: 0.875rem;
  }
  .play {
    min-width: 5rem;
    min-height: 44px;
    padding: 0 var(--spacing-md, 16px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md, 16px);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 6px);
  }
  .swatch {
    width: 1.25rem;
    height: 0.35rem;
    border-radius: 999px;
  }
  .swatch.close {
    background: linear-gradient(90deg, var(--clean-left), var(--clean-right));
  }
  .swatch.steer {
    background: var(--steer);
  }
  .swatch.hard {
    background: var(--hard);
  }
  .swatch.loose {
    background: var(--loose);
  }
  .controls {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 6px);
  }
  .row.hands {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    align-items: center;
  }
  .label,
  .hand-label {
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text));
  }
  .beats {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
  }
  .beat-row {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 6px);
  }
  .verdict {
    margin: 0;
    font-size: 0.9375rem;
  }
  .verdict.left strong {
    color: var(--clean-left);
  }
  .verdict.right strong {
    color: var(--clean-right);
  }
  ol {
    display: grid;
    grid-template-columns: repeat(var(--beats), minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ol li {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 2px;
    border-radius: 8px;
    border: 2px solid transparent;
    background: color-mix(in srgb, var(--cell) 22%, transparent);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
  ol li.close {
    --cell: #22c55e;
  }
  ol li.steer {
    --cell: var(--steer);
  }
  ol li.hard {
    --cell: var(--hard);
  }
  ol li.loose {
    --cell: var(--loose);
  }
  ol li.current {
    border-color: var(--theme-text);
  }
  .n {
    opacity: 0.65;
    font-size: 0.75rem;
  }
  .path-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .path-option .element {
    width: 1.25rem;
    height: 1.25rem;
  }
  ol.modes li {
    --cell: var(--theme-text);
    background: color-mix(in srgb, var(--cell) 6%, transparent);
    padding: 4px 2px;
  }
  ol.modes .element {
    width: min(2rem, 100%);
    aspect-ratio: 1;
  }
</style>
