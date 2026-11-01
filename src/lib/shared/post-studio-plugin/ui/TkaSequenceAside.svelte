<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    clampDisplayedBeatNumber,
    displayedBeatNumber,
  } from "#lib/shared/animation-engine/services/step-calculator.js";
  import TunnelPoseCell, { type TunnelPose } from "./TunnelPoseCell.svelte";
  import { postCardHighlightedStepIndex } from "./post-card-highlight";
  import { tkaEditorOf } from "./tka-editor-context";
  import { createPerformerSequences } from "../performer-sequences.svelte";
  import { performerSequence } from "../performer-sequence";
  import {
    backPerformerName,
    followerPropColors,
    postFollowers,
  } from "../tunnel-performers";
  import { tapGuidePoses } from "../tap-guide";
  import { tunnelPropNudges } from "../tunnel-prop-nudges";
  import { setCellPropNudges } from "#lib/shared/sequence-viewer/cell-prop-nudge-context";
  import { findPartnerTunnelUrl } from "#lib/shared/sequence-viewer/tunnel/partner-tunnel.js";

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

  // The empty cells under Start draw each performer's mandala, front first.
  const mandalaFills = $derived(
    shownView === "both" && sequence
      ? [
          { sequence, colors: null },
          ...followers.flatMap((_, index) => {
            const of = followerSequences.current?.[index];
            return of
              ? [
                  {
                    sequence: of,
                    colors: followerPropColors(index, followers.length),
                  },
                ]
              : [];
          }),
        ]
      : undefined
  );

  // The last empty cell carries a QR to the tunnel page, which names both
  // performers. Like the card's own QR it names the source sequences, not the
  // copies labeled for the footage, so it looks up the codes of the post's
  // source and of the partner built from that source.
  const sourceSequence = $derived(facts?.sequence ?? null);
  let tunnelQrUrl = $state<string | null>(null);
  $effect(() => {
    const front = sourceSequence;
    const follower = followers.length === 1 ? followers[0] : undefined;
    tunnelQrUrl = null;
    if (!front || !follower) return;
    let live = true;
    void performerSequence(front, follower)
      .then((back) => findPartnerTunnelUrl(front, back))
      .then((url) => {
        if (live) tunnelQrUrl = url;
      });
    return () => {
      live = false;
    };
  });

  const cardPropTypes = $derived({
    left: options?.leftPropTypeOverride ?? options?.propTypeOverride,
    right: options?.rightPropTypeOverride ?? options?.propTypeOverride,
  });

  /** Every performer's pose at a card cell (-1 the start), front first. */
  function cellPoses(cellIndex: number): TunnelPose[] {
    if (!sequence) return [];
    const front =
      cellIndex < 0
        ? (sequence.startPlacement ?? sequence.startingPlacement)
        : sequence.steps[cellIndex];
    return [{ data: front }, ...followerPoses(cellIndex)];
  }

  // The front pair's staffs slide off a partner's on the same spot, as the
  // partner's slide off theirs in the overlay.
  setCellPropNudges((cellIndex) => {
    if (shownView !== "both" || followers.length === 0) return undefined;
    return tunnelPropNudges(
      cellPoses(cellIndex).map((pose) => ({
        motions: pose.data?.motions,
        propTypes: cardPropTypes,
      }))
    )[0];
  });

  /**
   * The performers behind at a card cell (-1 the start), in tunnel colors,
   * drawn over the front pair's cell: the whole tunnel at that landing.
   */
  function followerPoses(cellIndex: number): TunnelPose[] {
    if (!sequence) return [];
    const { followers: poses } = tapGuidePoses(
      cellIndex + 1,
      beatsBehind,
      sequence.steps.length
    );
    return poses.map((pose, index) => {
      const of = followerSequences.current?.[index] ?? null;
      return {
        data: !of
          ? null
          : pose.stepIndex === null
            ? (of.startPlacement ?? of.startingPlacement)
            : of.steps[pose.stepIndex],
        ...followerPropColors(index, followers.length),
      };
    });
  }
</script>

{#snippet tunnelOverlay(cellIndex: number)}
  <TunnelPoseCell
    poses={cellPoses(cellIndex)}
    label=""
    grid={false}
    frontDrawn
    propTypes={cardPropTypes}
  />
{/snippet}

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
      {#if shownSequence}
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
          leftPropType={options?.leftPropTypeOverride ??
            options?.propTypeOverride}
          rightPropType={options?.rightPropTypeOverride ??
            options?.propTypeOverride}
          forceContain
          cellOverlay={shownView === "both" ? tunnelOverlay : undefined}
          showMandala={!!mandalaFills}
          {mandalaFills}
          showQRCode={shownView === "both" && !!tunnelQrUrl}
          qrUrl={tunnelQrUrl ?? undefined}
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
