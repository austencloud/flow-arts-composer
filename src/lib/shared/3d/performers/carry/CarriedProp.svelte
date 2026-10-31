<script lang="ts" module>
  /** One stage for every carrier, after the bodies animate and before render. */
  const CARRY_STAGE_KEY = Symbol("prop-carry");
  /** Seconds between searches while the body has not appeared yet. */
  const SEARCH_INTERVAL_SECONDS = 0.25;
</script>

<script lang="ts">
  /**
   * A prop carried in one of the approved carry poses (prop-carry.ts).
   *
   * Give it a group that holds the person's body: it finds the body's
   * `PERFORMER_<id>` group inside (Avatar3D names it), then every frame
   * overwrites the right arm after locomotion (CarryRig) and moves the prop to
   * the hand. The bodies animate in `mainStage`, so a stage after it is the
   * last writer of the arm.
   */
  import { T, useStage, useTask, useThrelte, type Stage } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { Group, Matrix4, Quaternion, type Object3D } from "three";
  import { createWorkerPropVisual } from "#lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory.js";
  import type { WorkerPropVisual } from "#lib/shared/3d/worker-renderer/worlds/props/worker-prop-factory-types.js";
  import {
    CARRY_PROP_TYPES,
    CARRY_STAFF_LENGTH_M,
    CARRY_STAFF_RADIUS_M,
    type CarryAssignment,
  } from "./prop-carry";
  import {
    CarryRig,
    type CarryUpdate,
    carryPropBodyRotation,
    findCarryPerformer,
  } from "./prop-carry-rig";

  interface Props {
    /** A group holding the person's body (the whole scene will do). */
    root: Object3D | undefined;
    /** The body's Avatar3D id; without it, the first body under root. */
    performerId?: string;
    carry: CarryAssignment;
    isMoving: boolean;
    /** Ground height under the person, world metres. */
    groundY: number;
    /** Solve the arm this frame; otherwise replay the last solve. */
    solve?: boolean;
    visible?: boolean;
  }

  const props: Props = $props();
  const { mainStage, renderStage } = useThrelte() as unknown as {
    mainStage: Stage;
    renderStage: Stage;
  };
  const carryStage = useStage(CARRY_STAGE_KEY, {
    after: mainStage,
    before: renderStage,
  });

  // A carry never changes for a mounted component; a new prop remounts it.
  // svelte-ignore state_referenced_locally
  const { kind, color } = props.carry;
  const rig = new CarryRig(kind);
  const holder = new Group();
  holder.name = "CarriedProp";
  holder.matrixAutoUpdate = false;
  holder.visible = false;

  const propMatrix = new Matrix4();
  const frameInput: CarryUpdate = {
    deltaSeconds: 0,
    isMoving: false,
    solve: false,
    groundY: 0,
  };
  const parentInverse = new Matrix4();
  let visual: WorkerPropVisual | null = null;
  let disposed = false;
  let performerRoot: Object3D | null = null;
  let searchCooldown = 0;

  function findPerformer(root: Object3D): Object3D | null {
    if (performerRoot?.parent) return performerRoot;
    performerRoot = null;
    if (searchCooldown > 0) return null;
    searchCooldown = SEARCH_INTERVAL_SECONDS;
    performerRoot = findCarryPerformer(root, props.performerId);
    return performerRoot;
  }

  void createWorkerPropVisual({
    propType: CARRY_PROP_TYPES[kind],
    color,
    length: CARRY_STAFF_LENGTH_M,
    thickness: CARRY_STAFF_RADIUS_M,
    build: {
      finish: "day",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
      triangleGrip: "corner",
    },
  }).then((result) => {
    if (!result.ok) return;
    if (disposed) {
      result.visual.dispose();
      return;
    }
    visual = result.visual;
    // The factories add a translucent trail marker at the grip; a carried
    // prop has no trail.
    for (const child of [...visual.root.children]) {
      if (child.name.endsWith("trail-indicator")) visual.root.remove(child);
    }
    visual.root.traverse((node) => {
      node.castShadow = true;
    });
    visual.setState({
      worldRotation: carryPropBodyRotation(new Quaternion()),
    });
    holder.add(visual.root);
  });

  useTask(
    (delta) => {
      searchCooldown = Math.max(0, searchCooldown - delta);
      const root =
        props.visible === false || !props.root
          ? null
          : findPerformer(props.root);
      if (!root || !visual) {
        holder.visible = false;
        return;
      }
      if (!rig.isAttachedTo(root)) {
        if (!rig.attach(root, props.groundY)) {
          holder.visible = false;
          return;
        }
        rig.resetStandWeight(props.isMoving);
      }
      frameInput.deltaSeconds = delta;
      frameInput.isMoving = props.isMoving;
      frameInput.solve = props.solve ?? true;
      frameInput.groundY = props.groundY;
      const posed = rig.update(frameInput, propMatrix);
      if (!posed) {
        holder.visible = false;
        return;
      }
      const parent = holder.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        holder.matrix.multiplyMatrices(
          parentInverse.copy(parent.matrixWorld).invert(),
          propMatrix
        );
      } else {
        holder.matrix.copy(propMatrix);
      }
      holder.matrixWorldNeedsUpdate = true;
      holder.visible = true;
    },
    { stage: carryStage }
  );

  onDestroy(() => {
    disposed = true;
    rig.detach();
    visual?.dispose();
    visual = null;
  });
</script>

<T is={holder} />
