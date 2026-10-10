<!--
  Mounts Post Studio the way the sequence viewer does: under the viewer's URL
  session and its shared studio surfaces, so a test can read the `ps` capture
  and drive the studio's controls.
-->
<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";
  import { setViewerStudioSurfaces } from "#lib/shared/sequence-viewer/context/viewer-studio-surfaces-context.js";
  import {
    setViewerUrlSessionContext,
    type ViewerUrlSession,
  } from "#lib/shared/sequence-viewer/services/viewer-url-session.js";
  import type { ViewerStudioSurfaces } from "#lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.js";
  import PostStudio from "./PostStudio.svelte";

  interface Props {
    sequence: SequenceData;
    initialProject?: PostProject;
    session: ViewerUrlSession;
    surfaces: ViewerStudioSurfaces;
  }

  let { sequence, initialProject, session, surfaces }: Props = $props();

  setViewerUrlSessionContext(session);
  setViewerStudioSurfaces(surfaces);
</script>

<PostStudio
  {sequence}
  {initialProject}
  cardPreviewUrl={null}
  animationPreviewUrl={null}
  onRequestAnimation={() => undefined}
/>
