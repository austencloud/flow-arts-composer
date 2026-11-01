<!--
  Test-only host for MotionVisibilityToggle: supplies the viewer visibility
  context the toggle reads, plus one control outside the popover so the
  containment assertions have something Tab could escape to.
-->
<script lang="ts">
  import { setViewerVisibilityContext } from "../context/viewer-visibility-context";
  import { SequenceViewerVisibilityState } from "../state/viewer-visibility-state.svelte";
  import MotionVisibilityToggle from "./MotionVisibilityToggle.svelte";

  setViewerVisibilityContext(new SequenceViewerVisibilityState());
</script>

<MotionVisibilityToggle />
<button data-testid="outside">outside</button>
