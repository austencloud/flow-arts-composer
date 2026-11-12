<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    clampDisplayedBeatNumber,
    displayedBeatNumber,
  } from "#lib/shared/animation-engine/services/step-calculator.js";
  import TunnelChoreoCard from "./TunnelChoreoCard.svelte";
  import { postCardHighlightedStepIndex } from "./post-card-highlight";
  import { tkaEditorOf } from "./tka-editor-context";
  import { createPerformerSequences } from "../performer-sequences.svelte";
  import {
    FRONT_PROP_COLORS,
    backPerformerName,
    followerPropColors,
    postAnimationPropType,
    postFollowers,
  } from "../tunnel-performers";

  /**
   * The post's sequence beside the preview while editing, its step lit as
   * the playhead reaches it, so the choreography stays in view next to the
   * video it becomes. A tunnel post shows the whole tunnel, landing by
   * landing, or one performer's own sheet.
   */
  let { editor }: { editor: VideoEditorState } = $props();

  const facts = $derived(tkaEditorOf(editor));
  const sequence = $derived(facts?.displaySequence ?? null);
  const options = $derived(facts?.cardRenderOptions ?? null);

  const followers = $derived(postFollowers(editor.project));
  const beatsBehind = $derived(
    followers.map((follower) => follower.beatsBehind)
  );
  // A partner facing the other way does the moves mirrored, flipped, swapped.
  const followerSequences = createPerformerSequences(
    () => sequence,
    () => followers
  );

  /** "both", "front", or the index of a performer behind. */
  let view = $state<"both" | "front" | number>("both");
  const shownView = $derived(
    followers.length === 0 ||
      (typeof view === "number" && view >= followers.length)
      ? "front"
      : view
  );
  const viewOptions = $derived([
    { value: "both", label: followers.length > 1 ? "All" : "Both" },
    { value: "front", label: "Front" },
    ...followers.map((_, index) => ({
      value: `back-${index}`,
      label: backPerformerName(index, followers.length),
    })),
  ]);

  /** The front performer's beat on screen now; null while no sequence layer shows. */
  const playheadBeat = $derived.by(() => {
    const steps = sequence?.steps.length ?? 0;
    if (!steps) return null;
    const layer = editor.frameLayers.find(
      (it) =>
        it.displayedBeatNumber !== undefined ||
        it.sequencePosition !== undefined
    );
    if (!layer) return null;
    const beat =
      layer.displayedBeatNumber ??
      displayedBeatNumber(layer.sequencePosition ?? 0, false);
    return {
      beat: clampDisplayedBeatNumber(beat, steps),
      pass: layer.sequencePassIndex ?? 0,
    };
  });

  /** A performer some beats behind is that many cells back, wrapping a pass. */
  function beatBehind(behind: number): number | undefined {
    if (!playheadBeat || !sequence) return undefined;
    const steps = sequence.steps.length;
    const beat = playheadBeat.beat - behind;
    if (beat >= 1 || playheadBeat.pass === 0) return Math.max(0, beat);
    return ((((beat - 1) % steps) + steps) % steps) + 1;
  }

  const highlightedStepIndex = $derived(
    postCardHighlightedStepIndex(
      typeof shownView === "number"
        ? beatBehind(beatsBehind[shownView] ?? 0)
        : playheadBeat?.beat
    )
  );
  const shownSequence = $derived(
    typeof shownView === "number"
      ? (followerSequences.current?.[shownView] ?? null)
      : sequence
  );

  /** The source behind the labeled sheet; the tunnel QR names its code. */
  const sourceSequence = $derived(facts?.sequence ?? null);

  // The card draws the prop the post's animation draws: a prop picked on the
  // animation clip, else the post's own.
  const animationPropType = $derived(postAnimationPropType(editor.project));
  const cardPropTypes = $derived({
    left:
      animationPropType ??
      options?.leftPropTypeOverride ??
      options?.propTypeOverride,
    right:
      animationPropType ??
      options?.rightPropTypeOverride ??
      options?.propTypeOverride,
  });
  // On a tunnel each performer keeps their place's colors on their own sheet.
  const shownColors = $derived(
    followers.length === 0
      ? undefined
      : typeof shownView === "number"
        ? followerPropColors(shownView, followers.length)
        : FRONT_PROP_COLORS
  );
</script>

{#if sequence}
  <div class="sequence-aside" aria-label="Sequence">
    {#if followers.length > 0}
      <SegmentedControl
        color="accent"
        size="sm"
        density="compact"
        options={viewOptions}
        value={typeof shownView === "number" ? `back-${shownView}` : shownView}
        onchange={(value) =>
          (view = value.startsWith("back-")
            ? Number(value.slice(5))
            : (value as "both" | "front"))}
        ariaLabel="Performers"
      />
    {/if}
    <div class="card">
      {#if shownView === "both" && sequence}
        <TunnelChoreoCard
          {sequence}
          {sourceSequence}
          {followers}
          {highlightedStepIndex}
          showHighlight={highlightedStepIndex !== null}
          darkMode
          showWord
          showStepNumbers
          showDifficultyLevel={false}
          includeStartPlacement={options?.includeStartPlacement ?? true}
          showLoopGlyph={options?.showLoopGlyph ?? true}
          leftPropType={cardPropTypes.left}
          rightPropType={cardPropTypes.right}
          forceContain
        />
      {:else if shownSequence}
        <ChoreoCard
          sequence={shownSequence}
          {highlightedStepIndex}
          showHighlight={highlightedStepIndex !== null}
          darkMode
          showWord
          showStepNumbers
          showDifficultyLevel={false}
          includeStartPlacement={options?.includeStartPlacement ?? true}
          showLoopGlyph={options?.showLoopGlyph ?? true}
          leftPropType={cardPropTypes.left}
          rightPropType={cardPropTypes.right}
          primaryPropColors={shownColors}
          forceContain
        />
      {/if}
    </div>
  </div>
{/if}

<style>
  .sequence-aside {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  /* The card fits itself inside the box it is given, so the box takes the
     column's remaining size; an auto-height box would shrink the card to nothing. */
  .card {
    flex: 1;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--ve-theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.75rem;
    background: #08080c;
  }
</style>
