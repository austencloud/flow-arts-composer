<script lang="ts">
  /**
   * The walking player's visible body: the shared 3D character, walked by the
   * GaitWalker the scene puts in place each frame.
   *
   * `isActive` stays false on purpose: an active character sits on the layer a
   * first-person camera hides. Here the body is drawn in both views; from
   * inside its head only the head is left out, so looking down shows the body.
   */
  import { T, useTask } from "@threlte/core";
  import type { Group } from "three";
  import { Character3D, type CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { GaitWalker } from "#lib/shared/3d/locomotion/gait/gait-walker.js";
  import SiteWalkBlobs from "./SiteWalkBlobs.svelte";
  import { hideOwnHead } from "./hide-own-head.js";

  interface Props {
    walker: GaitWalker;
    characterId: CharacterId;
    /** The soft shadow under the feet, 0 to 1. */
    blobStrength: number;
    /** The ground straight under the body, m. */
    floorUnder: () => number;
  }
  const { walker, characterId, blobStrength, floorUnder }: Props = $props();

  const UNDERFOOT = [{ x: 0, z: 0 }];

  /** Up in the air the soft shadow stays on the ground and fades (m, to nothing). */
  const BLOB_GONE = 1.4;

  let host = $state.raw<Group | undefined>();
  let blob = $state.raw<Group | undefined>();
  let near = $state(1);

  $effect(() => {
    walker.mount(host ?? null);
    return () => walker.mount(null);
  });

  $effect(() => {
    let undo: (() => void) | null = null;
    walker.watchBody((root) => {
      undo?.();
      undo = root ? hideOwnHead(root) : null;
    });
    return () => {
      walker.watchBody(null);
      undo?.();
    };
  });

  useTask(() => {
    if (!host || !blob) return;
    const floor = floorUnder();
    blob.position.set(host.position.x, floor, host.position.z);
    near = Math.round(Math.max(0, 1 - Math.max(0, host.position.y - floor) / BLOB_GONE) * 20) / 20;
  });
</script>

<T.Group bind:ref={blob}>
  <SiteWalkBlobs points={UNDERFOOT} radius={0.5} strength={blobStrength * near} />
</T.Group>

<T.Group bind:ref={host}>
  <Character3D
    id="site-walk-player"
    avatarId={characterId}
    bluePropState={null}
    redPropState={null}
    visible={true}
    isActive={false}
    position={{ x: 0, y: 0, z: 0 }}
    facingAngle={0}
    enableLocomotion={false}
    gait={walker.driver}
  />
</T.Group>
