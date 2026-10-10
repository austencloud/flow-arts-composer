<!--
  Test harness for LOOPPicker.

  The Extend drawer's option set is data-driven, and the generator closes
  orientation cycles by construction — so the "Repeated ×N" state is hard to
  reach by driving the real app, even though real sequences (hand-built in
  Construct, or bridge-extended) land there. This renders the real component
  against each option set so the states can actually be looked at.
-->
<script lang="ts">
  import LOOPPicker from "#lib/shared/components/loop-picker/LOOPPicker.svelte";
  import type { LOOPOption } from "#lib/features/create/shared/services/loop-validator.js";
  import {
    COMPACT_LOOP_REVIEW_OPTIONS,
    LOOP_REVIEW_OPTIONS,
  } from "./loop-picker-review-fixtures";

  const { swapped, inverted, swappedInverted, rewound, rotated, mirrored } =
    LOOP_REVIEW_OPTIONS;

  const cases: Array<{
    title: string;
    options: LOOPOption[];
    repeat: { count: 2 | 4 | 8 } | null;
  }> = [
    {
      title: "Closed in position AND orientation (the screenshot case)",
      options: COMPACT_LOOP_REVIEW_OPTIONS,
      repeat: null,
    },
    {
      title: "Closed in position, orientation returns after 2 repeats",
      options: COMPACT_LOOP_REVIEW_OPTIONS,
      repeat: { count: 2 },
    },
    {
      title: "Orientation returns after 4 repeats",
      options: [inverted, rewound],
      repeat: { count: 4 },
    },
    {
      title: "All six primitives — every tint at once",
      options: [rotated, mirrored, swapped, inverted, swappedInverted, rewound],
      repeat: { count: 8 },
    },
    { title: "Two options only", options: [inverted, rewound], repeat: null },
  ];

  // The picker centers its choice shelf in the real drawer, so the frame keeps
  // the drawer's full height to catch accidental stretching or top-stranding.
  let widthPx = $state(960);
  let heightPx = $state(800);
</script>

<div class="harness">
  <header>
    <h1>LOOPPicker states</h1>
    <label>
      Panel width: {widthPx}px
      <input type="range" min="280" max="1400" bind:value={widthPx} />
    </label>
    <label>
      Panel height: {heightPx}px
      <input type="range" min="320" max="1200" bind:value={heightPx} />
    </label>
  </header>

  <div class="cases">
    {#each cases as c}
      <section>
        <h2>{c.title}</h2>
        <div class="frame" style="width: {widthPx}px; height: {heightPx}px">
          <LOOPPicker
            directOptions={c.options}
            onSelect={() => {}}
            orientationRepeat={c.repeat}
            onOrientationRepeat={() => {}}
          />
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .harness {
    min-height: 100vh;
    padding: 2rem;
    background: #0e0e18;
    color: #fff;
    font-family: system-ui, sans-serif;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  .cases {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    align-items: flex-start;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.55);
  }

  .frame {
    max-width: 100%;
    display: flex;
    flex-direction: column;
  }
</style>
