<!--
  One 3D clip's stage, kept for as long as the post is open (see
  `stage-3d-slots.svelte.ts`). It builds as soon as the post opens, so the
  clip is ready when the playhead reaches it, and it shows in the clip's own
  layer whenever that layer is mounted. Everything a layer alone knows (the
  performers' steps at this post time, the export size) comes from the
  layer's slot; the rest comes from the post itself.
-->
<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import type { PostAnimationItem } from "../item-kinds";
  import type PostStudioStage3DLayer from "./PostStudioStage3DLayer.svelte";
  import { stage3DOrbitAngle, stage3DSecondsPerTurn } from "../stage-3d";
  import { createPerformerSequences } from "../performer-sequences.svelte";
  import { useTkaEditor } from "./tka-editor-context";
  import { layerCardRenderOptions } from "./tka-canvas-layer";
  import { stage3DShotEditor } from "./stage-3d-shot-editor.svelte";
  import { stage3DSlots } from "./stage-3d-slots.svelte";

  let {
    editor,
    item,
    Stage,
  }: {
    editor: VideoEditorState;
    item: PostAnimationItem;
    /** The stage component, loaded only when the post has a 3D clip. */
    Stage: typeof PostStudioStage3DLayer;
  } = $props();

  const tka = useTkaEditor();
  const sequence = $derived(tka.performedSequence);
  const followerSequences = createPerformerSequences(
    () => sequence,
    () => item.followers
  );
  const followerCount = $derived(item.followers?.length ?? 0);
  const cardRenderOptions = $derived(
    layerCardRenderOptions(tka.cardRenderOptions, item)
  );
  const shownStage = $derived(
    stage3DShotEditor.draftFor(item.id) ?? item.stage3d ?? null
  );
  const orbitAngle = $derived(
    shownStage
      ? stage3DOrbitAngle(
          editor.previewSeconds,
          item.start,
          stage3DSecondsPerTurn(editor.project, {
            ...item,
            stage3d: shownStage,
          }),
          shownStage.orbitDirection ?? 1
        )
      : 0
  );

  const live = $derived(stage3DSlots.get(item.id));
  const slot = $derived(live?.slot ?? null);
  // Off the playhead the performers hold where they were last shown.
  let heldSteps: readonly number[] | null = null;
  const performerSteps = $derived.by((): readonly number[] => {
    const steps = live?.performerSteps;
    if (steps) heldSteps = steps;
    return steps ?? heldSteps ?? Array(followerCount + 1).fill(0);
  });
</script>

{#if item.stage3d && sequence}
  <Stage
    itemId={item.id}
    {sequence}
    followerSequences={followerSequences.current}
    swapHandColors={tka.handsDrawnSwapped}
    {followerCount}
    {performerSteps}
    stage={item.stage3d}
    {orbitAngle}
    postSeconds={editor.previewSeconds}
    leftPropType={cardRenderOptions?.leftPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    rightPropType={cardRenderOptions?.rightPropTypeOverride ??
      cardRenderOptions?.propTypeOverride}
    exporting={live?.exporting ?? false}
    exportSize={live?.exportSize ?? null}
    {slot}
    parked={slot === null}
  />
{/if}
