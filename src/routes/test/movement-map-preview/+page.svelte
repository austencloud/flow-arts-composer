<!--
  Verification fixture. Drives the annotate screen with a known-good Level 1
  loop and a canvas-recorded clip, so the instrument can be inspected without
  hunting for footage. Not the shipping route: that is /test/movement-map.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { FALG } from "#lib/shared/combination/domain/demo-fixtures.js";
  import { getMovementAnnotationStore } from "#lib/features/movement-map/services/movement-annotation-store.js";
  import { createMovementMapState } from "#lib/features/movement-map/state/movement-map-state.svelte.js";
  import { setMovementMapContext } from "#lib/features/movement-map/context/movement-map-context.js";
  import AnnotateView from "#lib/features/movement-map/components/AnnotateView.svelte";

  const movementMap = createMovementMapState(getMovementAnnotationStore());
  setMovementMapContext({ state: movementMap });

  let ready = $state(false);

  async function recordClip(seconds: number): Promise<{ url: string }> {
    const canvas = document.createElement("canvas");
    canvas.width = 540;
    canvas.height = 960;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);

    let frame = 0;
    const draw = () => {
      const t = frame / 30;
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#1b2233");
      g.addColorStop(1, "#0d1018");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(t * 1.6);
      ctx.strokeStyle = "#f2c14e";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-170, 0);
      ctx.lineTo(170, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 2.2);
      ctx.strokeStyle = "#4da3ff";
      ctx.beginPath();
      ctx.moveTo(-170, 0);
      ctx.lineTo(170, 0);
      ctx.stroke();
      ctx.restore();
      frame++;
    };

    recorder.start();
    await new Promise<void>((resolve) => {
      const timer = setInterval(draw, 1000 / 30);
      setTimeout(() => {
        clearInterval(timer);
        recorder.stop();
        resolve();
      }, seconds * 1000);
    });
    await new Promise((r) => (recorder.onstop = r));
    return { url: URL.createObjectURL(new Blob(chunks, { type: "video/webm" })) };
  }

  onMount(async () => {
    await movementMap.loadSpace();
    await movementMap.loadAnnotations();

    const duration = 8;
    const { url } = await recordClip(duration);
    movementMap.setVideo({
      id: "preview-clip",
      label: "preview-clip.webm",
      url,
      duration,
      isLocal: true,
    });
    movementMap.setSequence(FALG);

    // Two passes of the 8-step loop across the clip, evenly spread, so the
    // phase readout and the pass counter both have something real to show.
    const marks = 16;
    const beatTimestamps = Array.from(
      { length: marks },
      (_, i) => (i * duration) / (marks + 1)
    );
    movementMap.setStepMap({
      beatTimestamps,
      endTimestamp: (marks * duration) / (marks + 1),
      stepCount: FALG.steps.length,
      source: "manual",
      updatedAt: new Date(),
    });
    movementMap.goToStage("annotate");
    movementMap.seek(duration * 0.28);
    ready = true;
  });
</script>

<div class="page">
  {#if ready}
    <AnnotateView />
  {:else}
    <p class="loading">Preparing preview clip&hellip;</p>
  {/if}
</div>

<style>
  .page {
    height: 100dvh;
    overflow: hidden;
    background: var(--theme-panel-bg, #12121c);
    color: #fff;
  }
  .loading {
    padding: 2rem;
    font-family: system-ui, sans-serif;
  }
</style>
