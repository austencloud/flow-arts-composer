<script lang="ts">
  /**
   * The standing guests: the jam's own `JamCrowd`, fed plain placements.
   *
   * `JamCrowd` poses a few shared skeletons for many people and takes a
   * position and a facing per person, so it needs nothing from the jam's
   * layout. Figures are made on first need and then only moved or hidden, so
   * switching between 40, 80 and 150 does not reload anyone.
   */
  import { onDestroy } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { getAvatarModelPath } from "@austencloud/scene-3d";
  import { JamCrowd } from "../flow-fest-jam/flow-fest-jam-crowd";
  import { JAM_HUMAN_AVATARS } from "../flow-fest-jam/flow-fest-jam-people";
  import type { GuestFigure } from "./site-walk-plan";

  interface Props {
    figures: readonly GuestFigure[];
  }
  const props: Props = $props();

  const crowd = new JamCrowd();
  let disposed = false;
  let version = 0;
  let madeUpTo = 0;
  let kindsReady: Promise<unknown> | null = null;

  const kindFor = (i: number) => `standing:${JAM_HUMAN_AVATARS[(i * 5) % JAM_HUMAN_AVATARS.length]!}`;

  function loadKinds(): Promise<unknown> {
    kindsReady ??= Promise.allSettled(
      JAM_HUMAN_AVATARS.map((id) => crowd.addKind(`standing:${id}`, getAvatarModelPath(id), "standing", undefined, 2)),
    );
    return kindsReady;
  }

  async function apply(list: readonly GuestFigure[]): Promise<void> {
    const mine = ++version;
    if (list.length > 0) await loadKinds();
    for (let i = 0; i < list.length; i++) {
      if (disposed || mine !== version) return;
      const figure = list[i]!;
      const id = `guest-${i}`;
      const key = kindFor(i);
      try {
        const measure = await crowd.measure(key);
        const scale = 0.96 + (((i * 37) % 9) / 9) * 0.08;
        // Nobody stands square: a few degrees off the stage, a slight lean, each different.
        const wobble = Math.sin(i * 12.9898) * 43758.5453;
        const jitter = (wobble - Math.floor(wobble)) * 2 - 1;
        const at = {
          x: figure.x,
          y: -measure.minY * scale,
          z: figure.z,
          rotationY: figure.yaw + jitter * 0.14,
          lean: jitter * 0.035,
          scale,
          tint: ((i * 53) % 100) / 100,
        };
        if (crowd.has(id)) crowd.move(id, at);
        else await crowd.place(id, key, at, i % 2);
        crowd.setVisible(id, true);
      } catch (error) {
        console.warn("[site walk] a guest could not be placed", error);
      }
      madeUpTo = Math.max(madeUpTo, i + 1);
    }
    if (disposed || mine !== version) return;
    for (let i = list.length; i < madeUpTo; i++) crowd.setVisible(`guest-${i}`, false);
  }

  $effect(() => {
    void apply(props.figures);
  });

  useTask((delta) => {
    crowd.update(delta);
  });

  onDestroy(() => {
    disposed = true;
    crowd.dispose();
  });
</script>

<T is={crowd.group} />
