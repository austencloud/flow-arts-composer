<script lang="ts">
  import { onDestroy } from "svelte";
  import Scene3DSetupGuide from "#lib/shared/3d/components/onboarding/Scene3DSetupGuide.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

  const viewer = createViewer3DState(undefined, {});
  viewer.enter3D();
  setViewer3DContext(viewer);

  onDestroy(() => viewer.dispose());
</script>

<svelte:head>
  <title>3D scene setup guide</title>
  <meta name="description" content="Guided setup overlay test surface." />
</svelte:head>

<main class="stage-stand-in">
  <div class="stage-glow" aria-hidden="true"></div>
  <Scene3DSetupGuide force />
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, #080b14);
  }

  .stage-stand-in {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 50% 72%,
        rgba(73, 112, 171, 0.22),
        transparent 30%
      ),
      linear-gradient(155deg, #18233a 0%, #090d18 52%, #03050a 100%);
  }

  .stage-glow {
    position: absolute;
    left: 50%;
    bottom: 12%;
    width: min(42rem, 60vw);
    aspect-ratio: 2 / 1;
    border-radius: 50%;
    background: radial-gradient(
      ellipse,
      rgba(106, 154, 222, 0.16),
      transparent 68%
    );
    transform: translateX(-50%);
  }
</style>
