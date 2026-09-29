<!--
  Test harness for Crossfade.svelte. The rapid-toggle button runs its key
  changes on real timers INSIDE the page so the interruption happens faster
  than the fade duration — driving it from the test runner would put a
  playwright round-trip between clicks and miss the mid-transition window.
-->
<script lang="ts">
  import { tick } from "svelte";
  import Crossfade from "./Crossfade.svelte";

  let key = $state("alpha");
  let focusKey = $state<"idle" | "playing" | "finished">("idle");
  let focusAfterSwap = $state("");
  let stepKey = $state("first");
  let stepDirection = $state<-1 | 1>(1);
  let maxReadableStepLayers = $state(0);
  let maxBackOutgoingX = $state(0);
  let collapseMidpoint = $state(0);
  let maxInteractiveLayers = $state(0);
  let observedOverlap = $state(false);
  let outsideKey = $state<"idle" | "playing">("idle");
  let outsideStage = $state<ReturnType<typeof Crossfade> | null>(null);
  let stage: HTMLDivElement;

  const HEIGHTS: Record<string, number> = { alpha: 60, beta: 160, gamma: 100 };

  async function play(): Promise<void> {
    focusKey = "playing";
    // Read focus as soon as the swap commits. On a busy page the browser's
    // own fix-up for the inert layer can land before the leaving layer's
    // delayed `outrostart`, so the handoff has to be done by this point.
    await tick();
    focusAfterSwap = document.activeElement?.textContent ?? "";
  }

  // Plays and stops from a control outside the stage, stopping before the
  // idle layer has finished fading out, so the key returns to a layer that
  // resumes instead of remounting. In the page for the rapid toggle's reason.
  async function playAndStopFromOutside(): Promise<void> {
    outsideKey = "playing";
    await new Promise((resolve) => setTimeout(resolve, 20));
    outsideKey = "idle";
    await tick();
    outsideStage?.focusShown();
  }

  function rapidToggle(): void {
    key = "beta";
    setTimeout(() => (key = "alpha"), 20);
    setTimeout(() => (key = "beta"), 40);
  }

  function sampleInteractiveLayers(): void {
    maxInteractiveLayers = 0;
    observedOverlap = false;
    rapidToggle();
    const start = performance.now();
    const sample = () => {
      const layers = [
        ...stage.querySelectorAll<HTMLElement>(".crossfade > .layer"),
      ];
      observedOverlap ||= layers.length > 1;
      maxInteractiveLayers = Math.max(
        maxInteractiveLayers,
        layers.filter(
          (layer) =>
            !layer.inert && layer.getAttribute("aria-hidden") !== "true"
        ).length
      );
      if (performance.now() - start < 250) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }

  function measureCollapse(): void {
    key = "beta";
    setTimeout(() => {
      key = "alpha";
      requestAnimationFrame(() => {
        setTimeout(() => {
          collapseMidpoint =
            stage
              .querySelector<HTMLElement>(".crossfade")
              ?.getBoundingClientRect().height ?? 0;
        }, 30);
      });
    }, 120);
  }

  function moveStep(next: "first" | "second", direction: -1 | 1): void {
    stepDirection = direction;
    stepKey = next;
  }

  function sampleStepTransition(trackBackDirection = false): void {
    const startedAt = performance.now();
    const sample = () => {
      const layers = [
        ...stage.ownerDocument.querySelectorAll<HTMLElement>(
          '[data-testid="step-stage"] .crossfade > .layer'
        ),
      ];
      const readable = layers.filter(
        (layer) => Number.parseFloat(getComputedStyle(layer).opacity) > 0.05
      ).length;
      maxReadableStepLayers = Math.max(maxReadableStepLayers, readable);

      if (trackBackDirection) {
        const outgoing = layers.find((layer) =>
          layer.textContent?.includes("second decision")
        );
        if (outgoing) {
          const matrix = new DOMMatrixReadOnly(
            getComputedStyle(outgoing).transform
          );
          maxBackOutgoingX = Math.max(maxBackOutgoingX, matrix.e);
        }
      }

      if (performance.now() - startedAt < 190) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }

  function measureForwardStep(): void {
    maxReadableStepLayers = 0;
    moveStep("second", 1);
    sampleStepTransition();
  }

  function measureBackStep(): void {
    maxBackOutgoingX = 0;
    moveStep("first", -1);
    sampleStepTransition(true);
  }
</script>

<button type="button" onclick={() => (key = "alpha")}>Show alpha</button>
<button type="button" onclick={() => (key = "gamma")}>Show gamma</button>
<button type="button" onclick={rapidToggle}>Rapid toggle</button>
<button type="button" onclick={measureCollapse}>Measure collapse</button>
<button type="button" onclick={sampleInteractiveLayers}
  >Measure interactive layers</button
>
<output data-testid="interactive-layer-count">{maxInteractiveLayers}</output>
<output data-testid="observed-overlap">{observedOverlap}</output>
<output data-testid="collapse-midpoint">{collapseMidpoint}</output>

<div bind:this={stage} data-testid="stage" style="width: 240px;">
  <Crossfade {key} duration={80} animateHeight>
    <div class="panel" style="height: {HEIGHTS[key]}px;">
      {key} panel <button type="button">Panel action</button>
    </div>
  </Crossfade>
</div>

<div data-testid="scaled-stage" style="width: 240px; transform: scale(0.8);">
  <Crossfade key="scaled" duration={80} animateHeight>
    <div style="height: 125px;">scaled panel</div>
  </Crossfade>
</div>

<!-- A control that swaps itself out, like Play trading places with the
     playing controls. -->
<output data-testid="focus-after-swap">{focusAfterSwap}</output>
<div data-testid="focus-stage">
  <Crossfade
    key={focusKey}
    duration={80}
    mode="swap"
    label={focusKey === "finished" ? "Playback finished" : undefined}
  >
    {#if focusKey === "idle"}
      <button type="button" onclick={play}>Play</button>
    {:else if focusKey === "playing"}
      <button type="button" onclick={() => (focusKey = "idle")}
        >Keep building</button
      >
      <button type="button" onclick={() => (focusKey = "finished")}
        >Finish</button
      >
    {:else}
      <p>Finished</p>
    {/if}
  </Crossfade>
</div>

<!-- Controls outside the keyed region, like a phone layout that shows the
     playing controls under the player. -->
<button type="button" onclick={playAndStopFromOutside}
  >Play and stop from outside</button
>
<div data-testid="outside-stage">
  <Crossfade
    bind:this={outsideStage}
    key={outsideKey}
    duration={80}
    mode="swap"
  >
    {#if outsideKey === "idle"}
      <button type="button">Idle action</button>
    {:else}
      <p>Playing</p>
    {/if}
  </Crossfade>
</div>

<button type="button" onclick={measureForwardStep}>Measure step forward</button>
<button type="button" onclick={measureBackStep}>Measure step back</button>
<output data-testid="max-readable-step-layers">{maxReadableStepLayers}</output>
<output data-testid="max-back-outgoing-x">{maxBackOutgoingX}</output>
<div data-testid="step-stage" style="width: 240px;">
  <Crossfade
    key={stepKey}
    duration={80}
    mode="swap"
    motion="step"
    direction={stepDirection}
    animateHeight
  >
    <div class="panel" style="height: {stepKey === 'first' ? 70 : 130}px;">
      {stepKey} decision
    </div>
  </Crossfade>
</div>
