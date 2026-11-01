<script lang="ts">
  import TunnelPoseCell from "./TunnelPoseCell.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PostProject } from "@austencloud/video-editor/core";
  import type { PostTimingSession } from "#lib/shared/share/components/post-studio/builder/post-timing-session.svelte.js";
  import { createPerformerSequences } from "../performer-sequences.svelte";
  import {
    backPerformerName,
    followerPropColors,
    postFollowers,
  } from "../tunnel-performers";
  import {
    nextTapPosition,
    tapGuidePoses,
    type TapGuidePose,
  } from "../tap-guide";

  /**
   * The pose the next tap marks, drawn before Austen taps: the front
   * performer's landing with every performer behind on top, in their tunnel
   * colors. Each tap moves it on one landing.
   */
  let {
    session,
    sequence,
    project,
  }: {
    session: PostTimingSession;
    sequence: SequenceData;
    project: PostProject;
  } = $props();

  // The tunnel animation on this post, if any, says who follows and how.
  const followers = $derived(postFollowers(project));
  const beatsBehind = $derived(
    followers.map((follower) => follower.beatsBehind)
  );
  const followerSequences = createPerformerSequences(
    () => sequence,
    () => followers
  );

  const steps = $derived(sequence.steps);
  const firstTapPosition = $derived(session.section?.firstTapPosition ?? 1);
  const hasTaps = $derived((session.section?.taps.length ?? 0) > 0);
  const position = $derived(
    nextTapPosition(
      session.resolvedSection?.fit?.labels ?? [],
      firstTapPosition,
      session.mediaSeconds
    )
  );
  const poses = $derived(tapGuidePoses(position, beatsBehind, steps.length));

  const performers = $derived([
    { pose: poses.leader, sequence, left: undefined, right: undefined },
    ...poses.followers.map((pose, index) => ({
      pose,
      // Until a turned partner's sequence builds, it is not drawn.
      sequence: followerSequences.current?.[index] ?? null,
      ...followerPropColors(index, beatsBehind.length),
    })),
  ]);

  function poseData(pose: TapGuidePose, of: SequenceData | null) {
    if (!of) return null;
    return pose.stepIndex === null
      ? (of.startPlacement ?? of.startingPlacement)
      : of.steps[pose.stepIndex];
  }

  function poseName(pose: TapGuidePose): string {
    if (pose.stepIndex === null) return "Start";
    const letter = steps[pose.stepIndex]?.letter;
    return letter
      ? `Move ${pose.position} · ${letter}`
      : `Move ${pose.position}`;
  }
</script>

<div class="guide" aria-live="polite">
  {#key session.tapCount}<span class="flash" aria-hidden="true"></span>{/key}
  <p class="prompt">Tap when you land here</p>
  <TunnelPoseCell
    poses={performers.map((performer) => ({
      data: poseData(performer.pose, performer.sequence),
      left: performer.left,
      right: performer.right,
    }))}
    label={performers.map((p) => poseName(p.pose)).join(", ")}
  />
  <p class="names">
    <span>Front: {poseName(poses.leader)}</span>
    {#each poses.followers as pose, index (index)}
      <span class="partner"
        >{backPerformerName(index, poses.followers.length)}: {poseName(
          pose
        )}</span
      >
    {/each}
  </p>
  {#if !hasTaps}
    <div class="first" role="group" aria-label="First tap">
      <button
        type="button"
        aria-pressed={firstTapPosition === 0}
        onclick={() => session.setFirstTapPosition(0)}>First tap: Start</button
      >
      <button
        type="button"
        aria-pressed={firstTapPosition === 1}
        onclick={() => session.setFirstTapPosition(1)}>Move 1</button
      >
    </div>
  {/if}
</div>

<style>
  .guide {
    position: relative;
    display: grid;
    gap: 0.25rem;
    padding: 0.375rem;
    border-radius: 0.375rem;
    background: rgb(8 8 12 / 0.82);
    color: #fff;
    box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 0.45);
    overflow: hidden;
  }
  .flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    animation: flash var(--duration-emphasis) var(--ease-out) forwards;
  }
  @keyframes flash {
    from {
      box-shadow: inset 0 0 0 3px var(--theme-accent, #ffd166);
      background: rgb(255 255 255 / 0.16);
    }
    to {
      box-shadow: inset 0 0 0 3px transparent;
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash {
      animation: none;
    }
  }
  .prompt,
  .names {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .prompt {
    font-weight: 600;
  }
  .names {
    display: grid;
    color: rgb(255 255 255 / 0.8);
  }
  .first {
    display: flex;
    gap: 0.25rem;
  }
  .first button {
    flex: 1;
    min-height: 2rem;
    border: 1px solid rgb(255 255 255 / 0.3);
    border-radius: 0.25rem;
    background: transparent;
    color: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .first button[aria-pressed="true"] {
    background: rgb(255 255 255 / 0.18);
    border-color: var(--theme-accent, #ffd166);
  }
</style>
