<!--
  Mounts Post Studio the way the sequence viewer does: under the viewer's URL
  session and its shared studio surfaces, so a test can read the `ps` capture
  and drive the studio's controls.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { setViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import {
    setViewerUrlSessionContext,
    type ViewerUrlSession,
  } from "$lib/shared/sequence-viewer/services/viewer-url-session";
  import type { ViewerStudioSurfaces } from "$lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte";
  import PostStudio from "./PostStudio.svelte";

  interface Props {
    sequence: SequenceData;
    session: ViewerUrlSession;
    surfaces: ViewerStudioSurfaces;
  }

  let { sequence, session, surfaces }: Props = $props();

  setViewerUrlSessionContext(session);
  setViewerStudioSurfaces(surfaces);
</script>

<PostStudio
  {sequence}
  cardPreviewUrl={null}
  animationPreviewUrl={null}
  onRequestAnimation={() => undefined}
/>
