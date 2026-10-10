<script lang="ts">
  import Viewer3DViewPresets from "./Viewer3DViewPresets.svelte";
  import type { ViewerControlSink } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    onSettingChange?: ViewerControlSink;
  }
  let { onSettingChange }: Props = $props();
</script>

<Viewer3DViewPresets grid {onSettingChange} />
