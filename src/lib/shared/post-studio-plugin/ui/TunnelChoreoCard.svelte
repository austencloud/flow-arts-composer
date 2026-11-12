<script lang="ts">
  import type { ComponentProps } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import TunnelPoseCell, { type TunnelPose } from "./TunnelPoseCell.svelte";
  import { createPerformerSequences } from "../performer-sequences.svelte";
  import { performerSequence } from "../performer-sequence";
  import {
    FRONT_PROP_COLORS,
    followerPropColors,
    type PostFollower,
  } from "../tunnel-performers";
  import { tapGuidePoses } from "../tap-guide";
  import { tunnelPropNudges } from "../tunnel-prop-nudges";
  import { setCellPropNudges } from "#lib/shared/sequence-viewer/cell-prop-nudge-context";
  import { findPartnerTunnelUrl } from "#lib/shared/sequence-viewer/tunnel/partner-tunnel.js";

  /**
   * The whole tunnel on one card: the front performer's sheet in red and
   * blue with every performer behind drawn into each cell in tunnel colors
   * (the viewer's own prop colors never apply here), each performer's
   * mandala in the empty cells under Start, and a QR to the tunnel page. The
   * post's side panel and its card clip both draw this, so the end card of a
   * tunnel post shows the tunnel, not the front performer alone.
   */
  type CardProps = ComponentProps<typeof ChoreoCard>;
  let {
    sequence,
    sourceSequence,
    followers,
    leftPropType,
    rightPropType,
    ...cardProps
  }: Omit<
    CardProps,
    | "sequence"
    | "cellOverlay"
    | "showMandala"
    | "mandalaFills"
    | "showQRCode"
    | "qrUrl"
    | "qrSequence"
  > & {
    /** The sheet as the post labels it (mirrored for footage, and so on). */
    sequence: SequenceData;
    /** The stored sequence behind `sequence`; the QR names its code. */
    sourceSequence: SequenceData | null;
    followers: readonly PostFollower[];
  } = $props();

  const beatsBehind = $derived(
    followers.map((follower) => follower.beatsBehind)
  );
  // A partner facing the other way does the moves mirrored, flipped, swapped.
  const followerSequences = createPerformerSequences(
    () => sequence,
    () => followers
  );

  const mandalaFills = $derived([
    { sequence, colors: FRONT_PROP_COLORS },
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
  ]);

  // The QR names the source sequences, not the copies labeled for the
  // footage, so it looks up the codes of the source and of the partner built
  // from that source.
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

  const propTypes = $derived({ left: leftPropType, right: rightPropType });

  /** Every performer's pose at a card cell (-1 the start), front first. */
  function cellPoses(cellIndex: number): TunnelPose[] {
    const front =
      cellIndex < 0
        ? (sequence.startPlacement ?? sequence.startingPlacement)
        : sequence.steps[cellIndex];
    return [{ data: front }, ...followerPoses(cellIndex)];
  }

  /** The performers behind at a card cell (-1 the start), in tunnel colors. */
  function followerPoses(cellIndex: number): TunnelPose[] {
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

  // The front pair's staffs slide off a partner's on the same spot, as the
  // partner's slide off theirs in the overlay.
  setCellPropNudges((cellIndex) =>
    followers.length === 0
      ? undefined
      : tunnelPropNudges(
          cellPoses(cellIndex).map((pose) => ({
            motions: pose.data?.motions,
            propTypes,
          }))
        )[0]
  );
</script>

{#snippet tunnelOverlay(cellIndex: number)}
  <TunnelPoseCell
    poses={cellPoses(cellIndex)}
    label=""
    grid={false}
    frontDrawn
    {propTypes}
  />
{/snippet}

<ChoreoCard
  {sequence}
  {...cardProps}
  {leftPropType}
  {rightPropType}
  primaryPropColors={FRONT_PROP_COLORS}
  cellOverlay={tunnelOverlay}
  showMandala
  {mandalaFills}
  showQRCode={!!tunnelQrUrl}
  qrUrl={tunnelQrUrl ?? undefined}
/>
