<!--
  Mounts the real AutumnScene under a scene feature context, the way the
  viewer does, so a test can watch its boot ledger reach the loading curtain.
  The test stubs Threlte, the asset loader and the world builder.
-->
<script lang="ts">
  import AutumnScene from "#lib/shared/3d/environments/scenes/AutumnScene.svelte";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import type { SceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";

  const props: { features: SceneFeatureState } = $props();
  setSceneFeatureContext(props.features);
</script>

<AutumnScene />
