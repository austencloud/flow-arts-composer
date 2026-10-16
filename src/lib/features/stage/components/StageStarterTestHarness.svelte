<script lang="ts">
  import StageStarter from "./StageStarter.svelte";

  let appliedCount = $state(0);
</script>

<StageStarter
  word="TEST"
  showDirector={false}
  directorHref="/test/stage"
  onApply={() => {
    appliedCount += 1;
  }}
  onChooseSequence={() => undefined}
  onOpenChoreography={() => undefined}
  onVisibilityChange={() => undefined}
  onStartEmptyStage={() => undefined}
  onReturnToExample={() => undefined}
/>

<output data-testid="starter-applied-count">{appliedCount}</output>

<style>
  :global(body) {
    margin: 0;
    background: #08090d;
    color: #f7f7fa;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }
</style>
