<!--
  Mounts Post Studio the way the sequence viewer does: the TKA scope around
  the package editor, under the viewer's URL session and its shared studio
  surfaces, so a test can read the `ps` capture and drive the studio's
  controls.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PostProject } from "@austencloud/video-editor/core";
  import { VideoEditor } from "@austencloud/video-editor/ui";
  import { setViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import {
    setViewerUrlSessionContext,
    type ViewerUrlSession,
  } from "$lib/shared/sequence-viewer/services/viewer-url-session";
  import type { ViewerStudioSurfaces } from "$lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte";
  import TkaEditorScope from "./TkaEditorScope.svelte";

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

<TkaEditorScope
  {sequence}
  {initialProject}
  cardPreviewUrl={null}
  animationPreviewUrl={null}
  onRequestAnimation={() => undefined}
>
  {#snippet children(scope)}
    <VideoEditor
      host={scope.editor.host}
      plugin={scope.plugin}
      editor={scope.editor}
      inspectorTarget={scope.inspectorTarget}
      registerExport={scope.registerExport}
      audioSeed={scope.audioSeed}
      onAudioChange={scope.onAudioChange}
    />
  {/snippet}
</TkaEditorScope>
