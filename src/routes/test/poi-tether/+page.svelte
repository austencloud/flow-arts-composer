<script lang="ts">
  /**
   * Real poi, step 1 of docs/superpowers/specs/active/2026-10-22-real-poi-design.md:
   * one performer plays a poi-legal chart CAP, each hand's poi on a string
   * sim. The hand solver says where each hand aims; the sim moves the head
   * from where the hand actually is. Fast, the poi follows the pattern; slow,
   * the string goes slack at the top and the head drops, because the physics
   * says so.
   */
  import { Canvas, T } from "@threlte/core";
  import { onMount } from "svelte";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DEFAULT_POI_TETHER_OPTIONS } from "#lib/shared/poi/poi-tether.js";
  import {
    CAPS,
    capHandSteps,
    capWorksOnPoi,
    pairStrip,
  } from "#lib/shared/guide-topics/caps-topic.js";
  import { stripToSequence } from "../../(public)/guide/level-1/_data/guide-sequence-adapter";
  import PoiTetherStage from "./PoiTetherStage.svelte";
  import { PoiTetherHand } from "./poi-tether-hand";

  // Gage's 1-EE: both hands extend round the wall plane. Any poi-legal CAP
  // works; this one is the plainest circle.
  const cap =
    CAPS.find((c) => c.id === "1-EE" && capWorksOnPoi(c)) ??
    CAPS.find(capWorksOnPoi)!;
  const sequence = stripToSequence(
    pairStrip(
      cap.id,
      cap.word,
      capHandSteps(cap.left),
      capHandSteps(cap.right),
      PropType.POI
    ),
    { word: cap.word, name: cap.id }
  );

  let bpm = $state(180);
  let stringLength = $state(DEFAULT_POI_TETHER_OPTIONS.stringLength);
  // Poi hands turn small circles; the grid's 52 cm is out of reach once the
  // hand strays, and an out-of-reach hand makes the finger grip re-solve
  // every frame. The rig's own fitted circle isn't used: it depends on the
  // first frame's palm sample and has read anywhere from 18 to 52 cm.
  let handRadius = $state(0.18);
  let gravity = $state<"on" | "off">("on");
  let steeringGain = $state(DEFAULT_POI_TETHER_OPTIONS.steeringGain);

  // A new tempo, string or circle is a new track and a fresh poi. The
  // steering gain is read live, so turning it doesn't restart the spin.
  const hands = $derived.by(() => {
    const settings = {
      bpm,
      stringLength,
      handRadius,
      gravity: gravity === "on",
      steeringGain: DEFAULT_POI_TETHER_OPTIONS.steeringGain,
    };
    return {
      left: PoiTetherHand.create(sequence, "left", settings),
      right: PoiTetherHand.create(sequence, "right", settings),
    };
  });

  $effect(() => {
    const gain = steeringGain;
    for (const hand of [hands.left, hands.right])
      if (hand) hand.sim.options.steeringGain = gain;
  });

  interface Readout {
    tension: number;
    slack: boolean;
    error: number;
    lost: boolean;
  }
  let readouts = $state<{ left: Readout | null; right: Readout | null }>({
    left: null,
    right: null,
  });

  const read = (hand: PoiTetherHand | null): Readout | null =>
    hand && {
      tension: hand.sim.tension,
      slack: hand.sim.slack,
      error: hand.sim.headError,
      lost: hand.sim.lost,
    };

  onMount(() => {
    const timer = setInterval(() => {
      readouts = { left: read(hands.left), right: read(hands.right) };
    }, 200);
    return () => clearInterval(timer);
  });

  const SIDES = [
    { key: "left", label: "Blue (left)" },
    { key: "right", label: "Red (right)" },
  ] as const;
</script>

<svelte:head>
  <title>Poi tether · test</title>
</svelte:head>

<main class="page">
  <section class="stage" aria-label="Performer with real poi">
    <Canvas>
      <T.PerspectiveCamera makeDefault position={[0, 1.5, 4.2]} fov={40}>
        <OrbitControls
          enableDamping
          target={[0, 1.4, 0]}
          minDistance={1}
          maxDistance={10}
        />
      </T.PerspectiveCamera>
      <PoiTetherStage
        {sequence}
        left={hands.left}
        right={hands.right}
        {bpm}
      />
    </Canvas>
  </section>

  <aside class="panel">
    <h1>Poi tether</h1>
    <p class="note">{cap.id} · {cap.word}, wall plane</p>

    <ValueSlider
      label="Tempo"
      value={bpm}
      min={30}
      max={240}
      step={1}
      format={(v) => `${Math.round(v)} bpm`}
      onchange={(v) => (bpm = v)}
    />
    <ValueSlider
      label="String length"
      value={stringLength}
      min={0.3}
      max={0.9}
      step={0.01}
      format={(v) => `${Math.round(v * 100)} cm`}
      onchange={(v) => (stringLength = v)}
    />
    <ValueSlider
      label="Hand circle"
      value={handRadius}
      min={0.1}
      max={0.7}
      step={0.01}
      format={(v) => `${Math.round(v * 100)} cm`}
      onchange={(v) => (handRadius = v)}
    />
    <ValueSlider
      label="Steering gain"
      value={steeringGain}
      min={0}
      max={120}
      step={1}
      format={(v) => `${Math.round(v)}`}
      onchange={(v) => (steeringGain = v)}
    />
    <div class="row">
      <span class="label">Gravity</span>
      <SegmentedControl
        ariaLabel="Gravity"
        size="sm"
        value={gravity}
        options={[
          { value: "on", label: "On" },
          { value: "off", label: "Off" },
        ]}
        onchange={(v) => (gravity = v)}
      />
    </div>

    <dl class="readouts">
      {#each SIDES as side (side.key)}
        {@const r = readouts[side.key]}
        <div class="readout">
          <dt>{side.label}</dt>
          <dd>
            {#if r}
              <span class="num">{r.tension.toFixed(2)}</span> weights ·
              <span class="state" class:slack={r.slack}>
                {r.lost ? "lost" : r.slack ? "slack" : "tight"}
              </span>
              · off path <span class="num">{Math.round(r.error * 100)}</span> cm
            {:else}
              no poi
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  </aside>
</main>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
    min-height: 100dvh;
    background: var(--theme-panel-bg, #12151c);
    color: var(--theme-text, #e8e8e8);
  }
  .stage {
    position: relative;
    min-height: 60dvh;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    border-left: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    overflow-y: auto;
  }
  h1 {
    margin: 0;
    font-size: var(--font-size-lg, 1.25rem);
  }
  .note {
    margin: 0;
    opacity: 0.75;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .readouts {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }
  .readout dt {
    font-weight: 600;
  }
  .readout dd {
    margin: 0;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .state {
    display: inline-block;
    min-width: 3.2em;
  }
  .state.slack {
    color: var(--semantic-warning, #f5b041);
  }
  @media (max-width: 820px) {
    .page {
      grid-template-columns: 1fr;
      grid-template-rows: 60dvh auto;
    }
    .panel {
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    }
  }
</style>
