<script lang="ts">
  /**
   * One performer spinning poi on real strings. The performer plays the
   * sequence; each hand's prop state is replaced by its string sim's hand, so
   * the arm reaches where the sim put it, and PoiTether3D draws the string
   * and head. The rigid poi meshes are off, so the stock grip holds the
   * hand: closing each finger onto a hidden handle re-solved from scratch
   * whenever the arm fell short of the sim's hand (a few fps when slack).
   */
  import { T, useTask } from "@threlte/core";
  import type { Group, Object3D } from "three";
  import type { PropState3D } from "@austencloud/scene-3d";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { DEFAULT_CHARACTER_ID } from "#lib/shared/3d/domain/character-model.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import PoiTether3D from "#lib/shared/3d/props/poi/PoiTether3D.svelte";
  import type { PoiTetherHand } from "./poi-tether-hand";

  interface Props {
    sequence: SequenceData;
    left: PoiTetherHand | null;
    right: PoiTetherHand | null;
    bpm: number;
  }

  let { sequence, left, right, bpm }: Props = $props();

  let root = $state<Group | undefined>(undefined);
  let leftFrame = $state<Object3D | null>(null);
  let rightFrame = $state<Object3D | null>(null);

  // The rig names each hand's anchor group; the strings are drawn in the
  // scene and carried there by the anchor's world matrix.
  useTask(() => {
    if (!root || (leftFrame && rightFrame)) return;
    leftFrame = root.getObjectByName("PERFORMER_PROP_LEFT") ?? null;
    rightFrame = root.getObjectByName("PERFORMER_PROP_RIGHT") ?? null;
  });

  function propStateOverride(
    side: "left" | "right",
    prop: PropState3D,
    scoreTime: number
  ): PropState3D {
    const hand = side === "left" ? left : right;
    if (!hand) return prop;
    hand.advance(scoreTime);
    return hand.apply(prop);
  }
</script>

<T.AmbientLight intensity={1.1} />
<T.DirectionalLight position={[2.4, 4.5, 3.8]} intensity={1.7} />
<T.DirectionalLight position={[-3, 2.2, 1]} intensity={0.6} color="#99c7ff" />
<T.Mesh rotation.x={-Math.PI / 2} position.y={0}>
  <T.CircleGeometry args={[4, 48]} />
  <T.MeshStandardMaterial color="#2a2f3a" roughness={0.95} />
</T.Mesh>

<T.Group bind:ref={root}>
  <LiveSequencePerformer3D
    id="poi-tether"
    position={{ x: 0, y: 0, z: 0 }}
    facingAngle={0}
    characterId={DEFAULT_CHARACTER_ID}
    propType={PropType.POI}
    {sequence}
    effectId="led"
    playbackSpeed={bpm / 60}
    showEffects={false}
    showProps={false}
    enableLocomotion={false}
    enableFootPlanting={false}
    contactMode="legacy"
    {propStateOverride}
  />
</T.Group>

{#if left}
  <PoiTether3D
    points={left.sim.points}
    frame={leftFrame}
    color="blue"
    visible={leftFrame != null}
  />
{/if}
{#if right}
  <PoiTether3D
    points={right.sim.points}
    frame={rightFrame}
    color="red"
    visible={rightFrame != null}
  />
{/if}
