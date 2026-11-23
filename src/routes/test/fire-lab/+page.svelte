<script lang="ts">
  import { Canvas } from "@threlte/core";
  import FireLabScene, { type MotionMode } from "./FireLabScene.svelte";

  let motionMode = $state<MotionMode>("idle");
  let speed = $state(1.0);
  let bloomOn = $state(true);
</script>

<div class="page">
  <header>
    <h1>Fire Lab</h1>
    <p>
      The shipped production fire (V1 blackbody-warp shader + wick model), driven
      under simulated staff motion. Three columns run at rest / medium / fast spin.
      Drag to orbit, scroll to zoom.
    </p>
  </header>

  <div class="stage">
    <Canvas>
      <FireLabScene {motionMode} {speed} {bloomOn} />
    </Canvas>
    <div class="labels">
      <span>Rest</span>
      <span>Medium spin</span>
      <span>Fast spin</span>
    </div>
  </div>

  <div class="controls">
    <div class="group">
      {#each [["idle", "Idle"], ["spin", "Spin"], ["reversals", "Reversals"]] as const as [mode, label]}
        <button
          type="button"
          aria-pressed={motionMode === mode}
          class:active={motionMode === mode}
          onclick={() => (motionMode = mode)}
        >
          {label}
        </button>
      {/each}
      <button type="button" aria-pressed={bloomOn} class:active={bloomOn} onclick={() => (bloomOn = !bloomOn)}>
        Bloom {bloomOn ? "on" : "off"}
      </button>
    </div>
    <label>
      <span>Base spin speed <em>{speed.toFixed(2)} rev/s</em></span>
      <input type="range" min="0.1" max="2.0" step="0.05" bind:value={speed} />
    </label>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #07080c;
    color: #e8e8ee;
    display: flex;
    flex-direction: column;
    padding: 16px 20px;
    gap: 12px;
    font-family: system-ui, sans-serif;
  }

  header h1 {
    margin: 0 0 4px;
    font-size: 1.3rem;
  }

  header p {
    margin: 0;
    color: #8a8fa3;
    font-size: 0.85rem;
    max-width: 70ch;
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 480px;
    border: 1px solid #1d2030;
    border-radius: 10px;
    overflow: hidden;
  }

  .labels {
    position: absolute;
    inset-inline: 0;
    bottom: 10px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    text-align: center;
    pointer-events: none;
    font-size: 0.8rem;
    color: #b8bdd2;
    text-shadow: 0 1px 4px #000;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 22px;
    align-items: center;
    padding: 10px 14px;
    background: #0d0f16;
    border: 1px solid #1d2030;
    border-radius: 10px;
  }

  .group {
    display: flex;
    gap: 8px;
  }

  button {
    background: #161a26;
    color: #cdd2e4;
    border: 1px solid #2a2f44;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 0.85rem;
    cursor: pointer;
    min-width: 100px;
  }

  button.active {
    background: #2c3550;
    border-color: #4a5680;
    color: #fff;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: #8a8fa3;
    min-width: 220px;
  }

  label em {
    font-style: normal;
    color: #cdd2e4;
    font-variant-numeric: tabular-nums;
  }

  input[type="range"] {
    accent-color: #ff8822;
  }

  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
