<!--
  CardSurfaceStub - test-only stand-in for CardInspectModal's heavy children
  (CardPreviewStack, the live ChoreoCard, CardArrowFixGrid and the pictograph
  editor), used ONLY by CardInspectModal.svelte.test.ts.

  Those surfaces bake card images, run pictograph renderers and reach into
  the arrow-override repositories: all orthogonal to the modal chrome under
  test (dialog role, focus containment, focus return). The stub accepts any
  props and renders an inert box so the dialog has content but no extra
  controls, which keeps the Tab-wrap assertions about the modal's own buttons.
-->
<script lang="ts">
  const props: Record<string, unknown> = $props();
  void props;
</script>

<div class="card-surface-stub">card surface</div>
