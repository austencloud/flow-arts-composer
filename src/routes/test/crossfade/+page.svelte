<script lang="ts">
  // Verification harness for the generic Crossfade primitive. Toggles `key`
  // across content of DIFFERENT widths/heights and measures, every animation
  // frame during the transition, the wrapper's box and a downstream sibling's
  // top. Both must stay constant while both layers are mounted (zero shift).
  //
  // The automated probe (runShiftProbe) drives the worst case: it swaps between
  // a short label and a very long one, samples getBoundingClientRect across the
  // whole transition window, and reports whether the downstream marker ever
  // moved. DevTools evaluate_script can read window.__crossfadeProbe.
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  const labels = [
    "Red",
    "Blue · Global Override With A Very Long Tail",
    "OK",
    "Loading the next thing…",
  ];
  let idx = $state(0);
  const label = $derived(labels[idx]!);

  let delayMs = $state(0);
  const fillColors = ["#3b2a5a", "#1f4a3a", "#5a2a2a", "#2a3f5a"];

  function next() {
    idx = (idx + 1) % labels.length;
  }

  let mode = $state<"crossfade" | "swap">("crossfade");

  let probeResult = $state("not run");
  let wrapperEl: HTMLElement;
  let markerEl: HTMLElement;

  async function runShiftProbe() {
    probeResult = "running…";
    // Start from a known short label.
    idx = 0;
    await tick2();
    const baselineMarkerTop = markerEl.getBoundingClientRect().top;
    const baselineWrapperTop = wrapperEl.getBoundingClientRect().top;

    let maxMarkerDelta = 0;
    let maxWrapperTopDelta = 0;
    let sampling = true;

    function sample() {
      if (!sampling) return;
      const m = markerEl.getBoundingClientRect().top;
      const w = wrapperEl.getBoundingClientRect().top;
      maxMarkerDelta = Math.max(maxMarkerDelta, Math.abs(m - baselineMarkerTop));
      maxWrapperTopDelta = Math.max(maxWrapperTopDelta, Math.abs(w - baselineWrapperTop));
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);

    // Trigger the worst-case swap (short -> very long label) and watch the full
    // transition window plus a margin.
    idx = 1;
    await wait(600);
    sampling = false;

    const pass = maxMarkerDelta < 1 && maxWrapperTopDelta < 1;
    probeResult = `${pass ? "PASS" : "FAIL"} — downstream marker moved ≤ ${maxMarkerDelta.toFixed(2)}px, wrapper top ≤ ${maxWrapperTopDelta.toFixed(2)}px during transition`;
    (window as unknown as Record<string, unknown>).__crossfadeProbe = {
      pass,
      maxMarkerDelta,
      maxWrapperTopDelta,
    };
  }

  function wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }
  function tick2() {
    return new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  }
</script>

<svelte:head><title>Crossfade Primitive Harness</title></svelte:head>

<div class="harness">
  <h1>Crossfade primitive</h1>
  <p class="hint">
    Cycle the label (varied widths). The box must not shove the marker below it
    while old and new overlap. Run the probe for an automated zero-shift check.
  </p>

  <div class="row">
    <span class="tag">label:</span>
    <span bind:this={wrapperEl} class="boxed">
      <Crossfade key={label} {mode} delay={delayMs}>
        <span class="label">{label}</span>
      </Crossfade>
    </span>
    <span class="after">← marker should never move →</span>
  </div>
  <div bind:this={markerEl} class="marker">downstream marker (watch my top)</div>

  <div class="controls">
    <button onclick={next}>Next label</button>
    <button onclick={() => (mode = mode === "crossfade" ? "swap" : "crossfade")}>
      mode: {mode}
    </button>
    <button onclick={() => (delayMs = delayMs === 0 ? 200 : 0)}>
      delay: {delayMs}ms
    </button>
    <button onclick={runShiftProbe}>Run zero-shift probe</button>
  </div>

  <p class="status" data-testid="probe-result">probe: <code>{probeResult}</code></p>

  <h2>Icon swap (fixed-size content, classic crossfade)</h2>
  <div class="row">
    <span class="icon-box">
      <Crossfade key={idx % 2}>
        {#if idx % 2 === 0}
          <span class="icon">▲</span>
        {:else}
          <span class="icon">●</span>
        {/if}
      </Crossfade>
    </span>
    <span class="after">fixed 48px slot — pure crossfade, no reflow ever</span>
  </div>

  <h2>Fill mode (parent-sized panels)</h2>
  <div class="fill-stage">
    <Crossfade key={idx} fill duration={DURATION.normal}>
      <div class="fill-panel" style:background={fillColors[idx % fillColors.length]}>
        panel {idx}
      </div>
    </Crossfade>
  </div>
  <span class="after">
    fixed 240×120 parent — fill layers (absolute inset:0) swap without resizing
    the box. Use "Next label" to cycle.
  </span>
</div>

<style>
  .harness {
    padding: 24px;
    font-family: system-ui, sans-serif;
    color: #e6e6e6;
    background: #14151a;
    min-height: 100vh;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 28px 0 8px; color: #9aa0a6; }
  .hint { font-size: 13px; color: #9aa0a6; max-width: 560px; }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }
  .tag { font-size: 12px; color: #9aa0a6; }
  .boxed {
    display: inline-block;
    border: 1px dashed #3a3d44;
    padding: 6px 10px;
    border-radius: 6px;
  }
  .label { font-size: 18px; font-weight: 600; white-space: nowrap; }
  .after { font-size: 12px; color: #6b7077; }
  .marker {
    margin-top: 10px;
    font-size: 13px;
    color: #a78bfa;
    border-top: 1px solid #2a2d34;
    padding-top: 10px;
  }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
  button {
    min-height: 44px;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #3a3d44;
    background: #23262d;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  button:hover { background: #2c2f37; }
  .status { font-size: 12px; color: #9aa0a6; margin-top: 12px; }
  code { color: #a78bfa; }
  .icon-box {
    display: inline-grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border: 1px dashed #3a3d44;
    border-radius: 6px;
  }
  .icon { font-size: 28px; }
  /* Fixed-size parent for fill mode. The Crossfade fills it; panels stack
     absolute/inset:0 and swap without changing this box. */
  .fill-stage {
    width: 240px;
    height: 120px;
    border: 1px dashed #3a3d44;
    border-radius: 8px;
    overflow: hidden;
  }
  .fill-panel {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
  }
</style>
