<script lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PostAnimationAppearanceTool from "../editor/PostAnimationAppearanceTool.svelte";
  import {
    mappingPreviewAppearance,
    type MappingPreviewAppearance,
  } from "./post-timing-animation";
  import type { PostTimingSession } from "./post-timing-session.svelte";

  let {
    editor,
    session,
    defaultPropType,
  }: {
    editor: PostEditorState;
    session: PostTimingSession;
    defaultPropType?: PropType;
  } = $props();
  const id = $props.id();

  const appearance = $derived(
    mappingPreviewAppearance(editor.project, session.takeId)
  );

  function saveAppearance(
    next: MappingPreviewAppearance,
    settingKey?: string
  ): void {
    const takeId = session.takeId;
    if (!takeId) return;
    editor.editMappingPreviewAppearance(takeId, next, settingKey);
  }
</script>

<div class="playback-mode">
  <span id="{id}-playback-label">Playback</span>
  <SegmentedControl
    options={[
      { value: "continuous", label: "Continuous" },
      { value: "step", label: "Step by step" },
    ]}
    value={session.playbackMode}
    onchange={(mode) => (session.playbackMode = mode)}
    size="md"
    color="accent"
    semantics="radiogroup"
    ariaLabelledby="{id}-playback-label"
  />
</div>
<p class="mode-help">Step by step pauses the video at each mapped landing.</p>
<PostAnimationAppearanceTool
  {editor}
  locked={!session.takeId}
  {defaultPropType}
  appearanceOverride={appearance}
  appearanceKey={session.takeId ?? "mapping"}
  scopeLabel={session.take
    ? `Timing preview · ${session.take.label}`
    : "Timing preview"}
  timingSection={session.section}
  timingSectionLabel={session.timing && session.timing.sections.length > 1
    ? `Part ${session.sectionIndex + 1} of ${session.timing.sections.length}`
    : undefined}
  onAppearanceChange={saveAppearance}
/>

<style>
  .playback-mode {
    display: grid;
    gap: 0.5rem;
  }
  .playback-mode span {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, #aaa);
  }
  .mode-help {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, #aaa);
  }
</style>
