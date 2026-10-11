<script lang="ts">
  import { onMount } from "svelte";
  import { useTask } from "@threlte/core";
  import { Avatar3D } from "@austencloud/scene-3d";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import {
    sampleFlowFestLivingCommunity,
    type FlowFestFestivalCommunityLayout,
    type FlowFestLivingCommunityFrame,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-living-fire-jam.js";
  import {
    createFlowFestPlaceholderPool,
    flowFestPerformerSequenceProof,
    flowFestSequenceForPerformer,
    generateFlowFestPerformerPool,
    FLOW_FEST_PERFORMER_PROFILES,
    type FlowFestPerformerSequencePool,
    type FlowFestPerformerSequenceProof,
  } from "./flow-fest-performer-sequences";

  interface Props {
    community: FlowFestFestivalCommunityLayout;
    energy?: number;
    onAvatarReady?: (id: string) => void;
    onSimulationFrame?: (frame: FlowFestLivingCommunityFrame) => void;
    onSequencePool?: (proof: FlowFestPerformerSequenceProof) => void;
  }

  const props: Props = $props();

  // The scene boots on placeholders so the fire circle is never empty, then
  // swaps to generated LOOPs the moment the generator answers.
  let sequencePool = $state<FlowFestPerformerSequencePool>(
    createFlowFestPlaceholderPool()
  );

  onMount(() => {
    let cancelled = false;
    void generateFlowFestPerformerPool({ count: 4 })
      .then((pool) => {
        if (cancelled) return;
        sequencePool = pool;
        props.onSequencePool?.(flowFestPerformerSequenceProof(pool));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const pool = createFlowFestPlaceholderPool();
        pool.notes.push(
          `LOOP generation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        sequencePool = pool;
        props.onSequencePool?.(flowFestPerformerSequenceProof(pool));
      });
    return () => {
      cancelled = true;
    };
  });

  let elapsedSeconds = 0;
  let updateAccumulator = 0;
  let frame = $state(
    sampleFlowFestLivingCommunity(props.community, 0, props.energy ?? 0)
  );
  const framesById = $derived(
    new Map(frame.people.map((person) => [person.id, person]))
  );

  $effect(() => {
    const community = props.community;
    const energy = props.energy ?? 0;
    frame = sampleFlowFestLivingCommunity(community, elapsedSeconds, energy);
  });

  useTask((delta) => {
    elapsedSeconds += Math.min(Math.max(delta, 0), 0.25);
    updateAccumulator += delta;
    if (updateAccumulator < 0.1) return;
    updateAccumulator %= 0.1;
    frame = sampleFlowFestLivingCommunity(
      props.community,
      elapsedSeconds,
      props.energy ?? 0
    );
    props.onSimulationFrame?.(frame);
  });
</script>

{#each props.community.people as person (person.id)}
  {@const living = framesById.get(person.id)}
  {#if living}
    {#if person.role === "spectator"}
      <Avatar3D
        id={`flow-fest-${person.id}`}
        avatarId={person.avatarId}
        bluePropState={null}
        redPropState={null}
        visible={true}
        isActive={false}
        position={{ x: living.x, y: living.y, z: living.z }}
        facingAngle={living.facingAngle}
        isMoving={living.isMoving}
        moveSpeed={living.isMoving ? 0.54 : 0}
        moveDirection={{
          x: Math.sin(living.facingAngle),
          z: Math.cos(living.facingAngle),
        }}
        enableLocomotion={true}
        enableFootPlanting={true}
        onModelSwapped={() => props.onAvatarReady?.(person.id)}
      />
    {:else}
      {@const profile = FLOW_FEST_PERFORMER_PROFILES[person.role]}
      <LiveSequencePerformer3D
        id={`flow-fest-${person.id}`}
        position={{ x: living.x, y: living.y, z: living.z }}
        facingAngle={living.facingAngle}
        avatarId={person.avatarId}
        propType={profile.propType}
        sequence={flowFestSequenceForPerformer(sequencePool, person.id)}
        effectId={profile.effectId}
        effectQualityTier="low"
        phaseOffsetSteps={person.phaseOffset}
        playbackSpeed={0.92 + (props.energy ?? 0) * 0.34}
        active={living.active}
        onReady={() => props.onAvatarReady?.(person.id)}
      />
    {/if}
  {/if}
{/each}
