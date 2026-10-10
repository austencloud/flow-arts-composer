<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { Box3, Color, Mesh, PointLight, type Object3D } from "three";
  import { CameraMode, UnifiedCameraController } from "@austencloud/camera-3d";
  import type { AvatarState, PhysicsProvider } from "@austencloud/camera-3d";
  import MuseumPerformerStation3D from "#lib/features/museum/components/game/MuseumPerformerStation3D.svelte";
  import {
    createPhysicsWorldState,
    createRigidBody,
    disposePhysicsWorld,
    initPhysicsWorld,
    stepPhysics,
  } from "#lib/shared/3d/physics/rapier-world.js";
  import {
    createPlayerController,
    disposePlayerController,
  } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type {
    PhysicsWorldState,
    PlayerControllerState,
  } from "#lib/shared/3d/physics/types.js";
  import GltfAsset from "#lib/shared/3d/environments/primitives/GltfAsset.svelte";
  import { buildFirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";
  import { findFirstFireLockedCameraView } from "#lib/features/museum/data/first-fire-locked-cameras.js";
  import { firstFireCourtEffectId } from "#lib/features/museum/data/first-fire-court-vocabulary.js";
  import type { FirstFireShrineId } from "#lib/features/museum/data/first-fire-procession-plan.js";
  import {
    buildFirstFireGrayboxColliders,
    FIRST_FIRE_GRAYBOX_SPAWN,
  } from "./first-fire-graybox-colliders";
  import {
    extractShellTrimesh,
    type ShellTrimesh,
  } from "./first-fire-shell-collider";
  import {
    applyBareShellShading,
    BARE_SHELL_BACKGROUND,
    isBareShellRequested,
    isHiddenInBareShell,
  } from "./first-fire-graybox-bare-shell";
  import {
    parseViewParam,
    registerViewSource,
    type ViewPose,
  } from "#lib/shared/review/view-capture.js";
  import FirstFireCinderStateEffects from "#lib/features/museum/components/game/first-fire/FirstFireCinderStateEffects.svelte";
  import FirstFireProcessionFlames from "#lib/features/museum/components/game/first-fire/FirstFireProcessionFlames.svelte";
  import FirstFireShrineVolumes from "#lib/features/museum/components/game/first-fire/FirstFireShrineVolumes.svelte";
  import FirstFireEmberDressing from "./FirstFireEmberDressing.svelte";
  import FirstFireCoalDressing from "./FirstFireCoalDressing.svelte";
  import {
    applyFirstFireCourtMaterials,
    type FirstFireMaterialReport,
  } from "./first-fire-court-materials";
  import {
    extractFirstFireFlameAnchors,
    FIRST_FIRE_EXPECTED_FLAME_COUNT,
    type FirstFireFlameAnchor,
  } from "#lib/features/museum/services/first-fire-flame-field.js";
  import {
    activeFirstFireShrine,
    advanceFirstFireGrayboxProof,
    createFirstFireGrayboxReviewState,
    displayedFirstFireShrine,
    firstFirePhaseLabel,
    litFirstFireShrine,
    updateFirstFireGrayboxReview,
    visibleFirstFireFlameGroups,
  } from "#lib/features/museum/data/first-fire-procession-review.js";

  interface FirstFireGrayboxReviewDetails {
    phase: string;
    label: string;
    activeShrineId: FirstFireShrineId | null;
    displayedShrineId: FirstFireShrineId | null;
    orbitProgress: Record<FirstFireShrineId, number>;
    blackoutElapsedMs: number;
    performer: {
      performerId: string;
      sequenceId: string;
      catalogId: string;
      word: string;
    } | null;
  }

  interface Props {
    resetToken: number;
    reviewAdvanceToken: number;
    onAssetReady?: (details: { flameCount: number }) => void;
    onPositionChange?: (position: { x: number; y: number; z: number }) => void;
    onReviewChange?: (details: FirstFireGrayboxReviewDetails) => void;
  }

  const props: Props = $props();
  const threlte = useThrelte();
  const contract = buildFirstFireBlenderContract();
  /** ?camera=<id> stands the player at a Gate 3 locked camera for capture. */
  const lockedCameraId =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("camera");
  /**
   * ?shell=bare strips Gate 3 dressing so the carved shell can be judged on its
   * own. Gate 2 is reopened and the room cannot be read underneath the fittings.
   */
  const bareShell = isBareShellRequested();
  /**
   * ?view=<encoded> stands the player at a copied pose. Unlike ?camera=, which
   * names an authored camera, this replays an arbitrary view Austen was looking
   * at when he hit Copy view - which is the whole point: the agent judges the
   * frame that drew the complaint, not one nearby.
   */
  const replayPose =
    typeof window === "undefined"
      ? null
      : parseViewParam(window.location.search);
  const colliders = buildFirstFireGrayboxColliders(contract);
  const heroLight = new PointLight(new Color("#ff4a18"), 0, 13, 2);
  heroLight.castShadow = true;
  heroLight.shadow.mapSize.set(512, 512);
  heroLight.shadow.camera.near = 0.2;
  heroLight.shadow.camera.far = 13;
  heroLight.shadow.bias = -0.0015;
  heroLight.shadow.normalBias = 0.025;

  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  /**
   * The carved rock, as collision. Extracted when the GLB lands and attached
   * once the physics world exists - the loader callback and the async physics
   * init race, and whichever finishes second does the attaching.
   */
  let shellTrimesh: ShellTrimesh | null = null;
  let isShellColliderAttached = false;
  let physicsProvider = $state<PhysicsProvider | null>(null);
  let isInitialized = $state(false);
  let isDisposed = false;
  let appliedResetToken = -1;
  let appliedReviewAdvanceToken = props.reviewAdvanceToken;
  let fireElapsed = 0;
  let assetRevision = $state(0);
  let cameraRevision = $state(0);
  let stagedMeshes: Mesh[] = [];
  /** Re-materialisation counts, surfaced for verification. */
  let materialReport: FirstFireMaterialReport | null = $state(null);
  let flameAnchors = $state<FirstFireFlameAnchor[]>([]);
  /**
   * Top of each court's FF_PerformerPad_*, measured from the loaded GLB.
   *
   * The rig used to be handed a typed 0.22m while the pads actually top out at
   * 0.44m, so every performer stood 22cm inside their own plinth. Measuring the
   * mesh means the number cannot drift from the geometry again: rebuild the pad
   * in Blender at any height and the rig follows it.
   */
  let padSurfaceHeights = $state<Record<string, number>>({});
  let reviewState = $state(createFirstFireGrayboxReviewState());

  let playerPosition = $state({
    x: FIRST_FIRE_GRAYBOX_SPAWN.x,
    y: FIRST_FIRE_GRAYBOX_SPAWN.y,
    z: FIRST_FIRE_GRAYBOX_SPAWN.z,
  });
  let playerYaw = $state(FIRST_FIRE_GRAYBOX_SPAWN.yaw);
  let targetPlayerYaw = $state(FIRST_FIRE_GRAYBOX_SPAWN.yaw);
  /**
   * Live pitch, mirrored out of the camera controller. Yaw is owned here (the
   * room turns the player at gates), but pitch is the controller's alone, so a
   * capture has to read it back rather than assume it.
   */
  let playerPitch = $state(0);
  /** Pitch handed to the controller on mount. Only a ?view= replay sets it. */
  let initialPitch = $state(0);
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });

  const activeShrineId = $derived(
    activeFirstFireShrine(reviewState.procession.phase)
  );
  const displayedShrineId = $derived(
    displayedFirstFireShrine(reviewState.procession.phase)
  );
  // The court still burning. Equal to the active court while it is being
  // walked, then the finished court the visitor has not yet left: a performer
  // must not freeze and go dark the instant the orbit completes, while the
  // visitor is still standing next to them.
  const litShrineId = $derived(litFirstFireShrine(reviewState));
  const activeShrine = $derived(
    contract.shrines.find((candidate) => candidate.id === litShrineId) ?? null
  );
  const displayedShrine = $derived(
    contract.shrines.find((candidate) => candidate.id === displayedShrineId) ??
      null
  );
  // The {#key} that wraps the performer station is evaluated by the same
  // reactive pass that clears displayedShrine, and it runs BEFORE the {#if}
  // around it tears the block down - so reading `.id` off the narrowed value
  // inline throws on the frame the shrine goes away. Deriving the key here lets
  // it tolerate the null it is about to be unmounted for.
  const displayedShrineKey = $derived(
    displayedShrine
      ? `${displayedShrine.id}:${padSurfaceHeights[displayedShrine.id] ?? "unmeasured"}`
      : "no-shrine"
  );
  const visibleFlameGroups = $derived(visibleFirstFireFlameGroups(reviewState));
  // The volcanic dressing is the room's only light source, so it must go out
  // at the extinguish beat for the blackout to actually be black.
  const emberDressingLit = $derived(
    reviewState.procession.phase !== "fire-extinguished" &&
      reviewState.procession.phase !== "growth-complete"
  );
  const growthVisible = $derived(
    reviewState.procession.phase === "growth-complete"
  );

  function yawToward(
    from: { x: number; z: number },
    to: { x: number; z: number }
  ): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  const avatarState: AvatarState = {
    get position() {
      return playerPosition;
    },
    get facingAngle() {
      return playerYaw;
    },
    get isMoving() {
      return isMoving;
    },
    get moveDirection() {
      return moveDirection;
    },
    setMoveInput(input) {
      moveDirection = input;
      isMoving = input.x !== 0 || input.z !== 0;
    },
    updateMovement() {},
    setFacingAngle(angle) {
      targetPlayerYaw = angle;
    },
    snapFacingAngle(angle) {
      playerYaw = angle;
      targetPlayerYaw = angle;
    },
    updateLocomotion(delta) {
      let difference = targetPlayerYaw - playerYaw;
      while (difference > Math.PI) difference -= Math.PI * 2;
      while (difference < -Math.PI) difference += Math.PI * 2;
      const step = Math.min(Math.abs(difference), 12 * delta);
      playerYaw += Math.sign(difference) * step;
    },
  };

  function resetReview(): void {
    const spawn = {
      x: FIRST_FIRE_GRAYBOX_SPAWN.x,
      y: FIRST_FIRE_GRAYBOX_SPAWN.y,
      z: FIRST_FIRE_GRAYBOX_SPAWN.z,
    };
    reviewState = createFirstFireGrayboxReviewState();
    physicsProvider?.teleport?.(spawn);
    playerPosition = spawn;
    playerYaw = FIRST_FIRE_GRAYBOX_SPAWN.yaw;
    targetPlayerYaw = FIRST_FIRE_GRAYBOX_SPAWN.yaw;
    cameraRevision += 1;
  }

  /**
   * Gate 3 evidence capture. Stands the player at one locked camera so the
   * captured frame is registered to its approved Gate 2 counterpart by
   * construction rather than by eyeball.
   */
  function teleportToLockedCamera(cameraId: string): boolean {
    const view = findFirstFireLockedCameraView(contract, cameraId);
    if (!view) return false;
    const destination = {
      x: view.position.x,
      y: view.position.y,
      z: view.position.z,
    };
    physicsProvider?.teleport?.(destination);
    playerPosition = destination;
    playerYaw = view.yaw;
    targetPlayerYaw = view.yaw;
    avatarState.snapFacingAngle?.(view.yaw);
    cameraRevision += 1;
    return true;
  }

  /**
   * Stand the player at a copied pose. Same mechanism as the locked-camera
   * teleport: move the body, set the yaw, and bump cameraRevision so the
   * controller remounts and picks up the new initial angles.
   */
  function teleportToPose(pose: ViewPose): void {
    const destination = { x: pose.x, y: pose.y, z: pose.z };
    physicsProvider?.teleport?.(destination);
    playerPosition = destination;
    playerYaw = pose.yaw;
    targetPlayerYaw = pose.yaw;
    playerPitch = pose.pitch;
    initialPitch = pose.pitch;
    avatarState.snapFacingAngle?.(pose.yaw);
    cameraRevision += 1;
  }

  /**
   * Contribute this room's camera to the global U handler. Registered rather
   * than key-bound: the shortcut is app-wide, and a room only supplies the
   * pose and the frame that the shared capture wraps.
   */
  onMount(() =>
    registerViewSource({
      sceneId: "first-fire-graybox",
      pose: () => ({
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
        yaw: playerYaw,
        pitch: playerPitch,
      }),
      canvas: () => threlte.renderer?.domElement ?? null,
      state: () => ({
        phase: reviewState.procession.phase,
        shell: bareShell ? "bare" : "dressed",
        activeShrine: activeShrineId ?? "none",
        displayedShrine: displayedShrineId ?? "none",
      }),
    })
  );

  /**
   * Put the player wherever the URL asked for, after any teleport the room did
   * on its own. A copied ?view= outranks an authored ?camera=: the whole reason
   * a view was copied is that it shows something the authored cameras do not.
   */
  function applyEntryView(): void {
    if (replayPose) {
      teleportToPose(replayPose);
      return;
    }
    if (lockedCameraId) teleportToLockedCamera(lockedCameraId);
  }

  function teleportForReviewPhase(): void {
    const phase = reviewState.procession.phase;
    const shrineId = activeFirstFireShrine(phase);
    const shrine = contract.shrines.find(
      (candidate) => candidate.id === shrineId
    );
    const targetShrineId =
      phase === "approach"
        ? "dj"
        : phase === "dj-complete"
          ? "ek"
          : phase === "ek-complete"
            ? "fl"
            : shrineId;
    const targetShrine = contract.shrines.find(
      (candidate) => candidate.id === targetShrineId
    );
    // The S-procession has no hub: between courts the visitor stands at the
    // exit mouth of the court they just finished, facing the next one.
    const previousShrine =
      phase === "dj-complete"
        ? contract.shrines.find((candidate) => candidate.id === "dj")
        : phase === "ek-complete"
          ? contract.shrines.find((candidate) => candidate.id === "ek")
          : undefined;
    const fallback = previousShrine
      ? previousShrine.blenderExit
      : contract.threshold.blenderCentre;
    const destination =
      phase === "approach"
        ? {
            x: FIRST_FIRE_GRAYBOX_SPAWN.x,
            y: FIRST_FIRE_GRAYBOX_SPAWN.y,
            z: FIRST_FIRE_GRAYBOX_SPAWN.z,
          }
        : shrine
          ? {
              x: shrine.blenderEntry.x,
              y: FIRST_FIRE_GRAYBOX_SPAWN.y,
              z: -shrine.blenderEntry.y,
            }
          : phase === "growth-complete"
            ? {
                x: contract.pathSections.at(-1)?.blenderPoints[1]?.x ?? fallback.x,
                y: FIRST_FIRE_GRAYBOX_SPAWN.y,
                z: -(
                  contract.pathSections.at(-1)?.blenderPoints[1]?.y ?? fallback.y
                ),
              }
            : {
                x: fallback.x,
                y: FIRST_FIRE_GRAYBOX_SPAWN.y,
                z: -fallback.y,
              };
    const target = shrine
      ? { x: shrine.blenderCentre.x, z: -shrine.blenderCentre.y }
      : targetShrine
      ? {
          x: targetShrine.blenderEntry.x,
          z: -targetShrine.blenderEntry.y,
        }
      : {
          x: contract.doors.earth.blender.x,
          z: -contract.doors.earth.blender.y,
        };
    physicsProvider?.teleport?.(destination);
    playerPosition = destination;
    avatarState.snapFacingAngle?.(yawToward(destination, target));
    cameraRevision += 1;
  }

  /**
   * Give the physics world the rock the visitor can see.
   *
   * Vertices are already world-space, so the body sits at the origin: a
   * translation here would move the collision away from the mesh it was
   * measured from, which is the whole failure this replaces.
   */
  function attachShellCollider(): void {
    if (isShellColliderAttached || !physicsState?.world || !shellTrimesh) return;
    createRigidBody(
      physicsState,
      { type: "static", position: { x: 0, y: 0, z: 0 } },
      {
        type: "trimesh",
        vertices: shellTrimesh.vertices,
        indices: shellTrimesh.indices,
      }
    );
    isShellColliderAttached = true;
    // Verification seam, same reason as the material report below: "you can
    // walk where the rock is gone" has to be measurable from the page.
    (globalThis as Record<string, unknown>).__firstFireShellCollider = {
      triangles: shellTrimesh.triangles,
      meshes: shellTrimesh.meshes,
    };
  }

  function handleGrayboxReady(scene: Object3D): void {
    flameAnchors = extractFirstFireFlameAnchors(scene, contract.fireGuides);
    // Give each court its own rock, pad and molten channel. The GLB is
    // digest-locked Gate 2 evidence, so this re-materialises in memory only.
    // Bare mode leaves the GLB's own materials alone: the per-court art
    // direction is a Gate 3 decision and one honest rock reads the geometry
    // better than three tinted ones.
    materialReport = bareShell ? null : applyFirstFireCourtMaterials(scene);
    stagedMeshes = [];
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (bareShell && isHiddenInBareShell(object.name)) {
        object.visible = false;
        return;
      }
      // The carved shell ships smooth-shaded, which averages normals straight
      // across the hard corners a boolean produces: walls read as one smeared
      // gradient and whole facets go dark for no reason the geometry explains.
      // Flat shading gives every triangle its own normal, so a wall is a wall,
      // a corner is a corner, and a boolean artifact is visible as one.
      if (bareShell) applyBareShellShading(object);
      if (object.visible) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      // FF_Trench_(dj|ek|fl): the authored node names. The filter used to ask
      // for FF_Trench_*_Magma, which the GLB has never contained, so no trench
      // was ever staged and all three molten channels glowed from load - the
      // finished court's channel included.
      // Bare mode stages nothing. It is a static reading of the room, not a
      // proof of the procession, and the growth ribbon out to the Earth door
      // matches this filter - staging it would hide the last walkway.
      if (
        !bareShell &&
        /^FF_(Trench_(dj|ek|fl)|Growth_|Bridge_EmberBed|FireState_)/i.test(
          object.name
        )
      ) {
        stagedMeshes.push(object);
      }
    });
    // Measure the pedestals the room owns, rather than trusting a typed height.
    const measuredPads: Record<string, number> = {};
    scene.traverse((object) => {
      const match = /^FF_PerformerPad_(dj|ek|fl)\b/i.exec(object.name);
      if (!match || !(object instanceof Mesh)) return;
      measuredPads[match[1]!.toLowerCase()] = new Box3().setFromObject(object)
        .max.y;
    });
    padSurfaceHeights = measuredPads;

    // Collision comes off the same mesh that just loaded, so the carve and the
    // walkable space can never disagree.
    shellTrimesh = extractShellTrimesh(scene);
    if (!shellTrimesh) {
      console.warn(
        "[FirstFireGraybox] No structural mesh found for collision; the room is the outer envelope only."
      );
    }
    attachShellCollider();

    assetRevision += 1;
    // Verification seam: the re-materialisation counts have to be readable
    // from the page, otherwise "each court is its own environment" is a claim
    // rather than a measurement.
    (globalThis as Record<string, unknown>).__firstFireMaterialReport =
      materialReport;
    // Scene-graph handle for the same reason: composition defects have to be
    // measurable (which mesh, what size, where) instead of guessed at from a
    // screenshot. Root is the render tree, not just the graybox subtree.
    let root: Object3D = scene;
    while (root.parent) root = root.parent;
    (globalThis as Record<string, unknown>).__firstFireScene = root;
    if (flameAnchors.length !== FIRST_FIRE_EXPECTED_FLAME_COUNT) {
      console.warn(
        `[FirstFireGraybox] Expected ${FIRST_FIRE_EXPECTED_FLAME_COUNT} semantic flame guides, found ${flameAnchors.length}.`
      );
    }
    props.onAssetReady?.({ flameCount: flameAnchors.length });
  }

  onMount(async () => {
    physicsState = createPhysicsWorldState();
    await initPhysicsWorld(physicsState, { x: 0, y: -9.81, z: 0 });
    if (isDisposed || !physicsState) return;

    for (const collider of colliders) {
      createRigidBody(
        physicsState,
        {
          type: "static",
          position: {
            x: collider.position[0],
            y: collider.position[1],
            z: collider.position[2],
          },
          ...(collider.rotation ? { rotation: collider.rotation } : {}),
        },
        {
          type: "box",
          size: {
            x: collider.size[0],
            y: collider.size[1],
            z: collider.size[2],
          },
        }
      );
    }

    // The GLB may already be in hand: whichever of the two finishes second
    // attaches the rock.
    attachShellCollider();

    playerState = createPlayerController(physicsState, {
      position: {
        x: FIRST_FIRE_GRAYBOX_SPAWN.x,
        y: FIRST_FIRE_GRAYBOX_SPAWN.y,
        z: FIRST_FIRE_GRAYBOX_SPAWN.z,
      },
      autoStepMaxHeight: 0.45,
      snapToGroundDistance: 0.35,
    });
    physicsProvider = createRapierPhysicsProvider(physicsState, playerState);
    isInitialized = true;
    applyEntryView();
  });

  $effect(() => {
    if (!isInitialized || props.resetToken === appliedResetToken) return;
    appliedResetToken = props.resetToken;
    resetReview();
    // The initial reset token lands right after mount, so without this the
    // spawn teleport silently overwrites the ?camera= capture position and
    // every locked-camera frame is shot from the Water arrival instead.
    applyEntryView();
  });

  $effect(() => {
    if (
      !isInitialized ||
      props.reviewAdvanceToken === appliedReviewAdvanceToken
    ) {
      return;
    }
    appliedReviewAdvanceToken = props.reviewAdvanceToken;
    reviewState = advanceFirstFireGrayboxProof(reviewState);
    teleportForReviewPhase();
    // A locked camera outranks the phase teleport: the phase sets the room's
    // state, the camera decides where the evidence is shot from.
    applyEntryView();
  });

  $effect(() => {
    const phase = reviewState.procession.phase;
    const groups = visibleFlameGroups;
    assetRevision;
    stagedMeshes.forEach((mesh) => {
      const name = mesh.name.toLowerCase();
      if (name.startsWith("ff_firestate_")) {
        mesh.visible = false;
        return;
      }
      if (name.startsWith("ff_growth_")) {
        mesh.visible = phase === "growth-complete";
        return;
      }
      // The authored nodes are FF_Trench_dj / _ek / _fl. The old selectors
      // carried a trailing underscore, so none of them ever matched and every
      // trench fell through to the "any group lit" branch: all three channels
      // glowed from the moment the room loaded, including courts the visitor
      // had not reached. Measured in the running scene, not assumed.
      if (name.includes("trench_dj")) mesh.visible = groups.has("dj");
      else if (name.includes("trench_ek")) mesh.visible = groups.has("ek");
      else if (name.includes("trench_fl")) mesh.visible = groups.has("fl");
      else mesh.visible = groups.size > 0;
    });
  });

  $effect(() => {
    const shrine = activeShrine;
    if (bareShell || !shrine) {
      heroLight.intensity = 0;
      heroLight.visible = false;
      return;
    }
    heroLight.position.set(
      shrine.blenderCentre.x,
      2.3,
      -shrine.blenderCentre.y
    );
    heroLight.intensity = 68;
    heroLight.visible = true;
  });

  $effect(() => {
    props.onReviewChange?.({
      phase: reviewState.procession.phase,
      label: firstFirePhaseLabel(reviewState),
      activeShrineId,
      displayedShrineId,
      orbitProgress: { ...reviewState.procession.orbitProgress },
      blackoutElapsedMs: reviewState.blackoutElapsedMs,
      performer: displayedShrine
        ? {
            performerId: displayedShrine.performerId,
            sequenceId: displayedShrine.sequenceId,
            catalogId: displayedShrine.catalogId,
            word: displayedShrine.word,
          }
        : null,
    });
  });

  useTask((delta) => {
    fireElapsed += Math.min(delta, 1 / 20);
    const flicker =
      Math.sin(fireElapsed * 1.2) * 0.12 +
      Math.sin(fireElapsed * 4.7) * 0.08 +
      Math.sin(fireElapsed * 19.3) * 0.045;
    if (heroLight.visible) {
      heroLight.intensity = 68 * (1 + flicker);
      heroLight.color.setRGB(
        1,
        0.27 + Math.sin(fireElapsed * 2.3) * 0.025,
        0.075
      );
    }

    if (!isInitialized || !physicsState?.world || isDisposed) return;
    stepPhysics(physicsState, Math.min(delta, 1 / 30));
    const position = physicsProvider?.getPlayerPosition();
    if (!position) return;
    playerPosition = position;
    reviewState = updateFirstFireGrayboxReview(
      reviewState,
      contract,
      position,
      delta * 1000
    );
    props.onPositionChange?.(position);
  });

  onDestroy(() => {
    isDisposed = true;
    if (playerState && physicsState) {
      disposePlayerController(physicsState, playerState);
    }
    if (physicsState) disposePhysicsWorld(physicsState);
    heroLight.dispose();
  });
</script>

{#if bareShell}
  <!--
    Gate 2 review lighting. A grey-blue background rather than near-black, so a
    hole in the shell reads as a hole instead of as one more shadow. No fog: the
    far end of a corridor is exactly what needs judging.

    No hemisphere light here, which is the obvious choice and the wrong one - a
    vault's normals point down, so a sky/ground hemisphere hands the whole
    ceiling its ground colour and the room reads as an open trench with a black
    lid. Ambient carries base visibility and four directionals give form,
    including one aimed up from below the floor purely to describe the vault.

    These intensities are set against the single grey the bare shading applies,
    not against the GLB's near-black basalt, and they are read back off the
    canvas rather than eyeballed. Ambient plus key used to sum past 1.6, which
    was invisible on dark rock and blew the vault flat the moment the room
    actually became grey; the first correction overshot the other way and left
    the whole frame inside a 47-level band. Nothing here should clip and nothing
    should sit in a smear - a blown ceiling hides a hole exactly as well as a
    black one does.
  -->
  <T.Color attach="background" args={[BARE_SHELL_BACKGROUND]} />
  <T.AmbientLight color="#eef1f5" intensity={0.6} />
  <T.DirectionalLight position={[-18, 24, 14]} intensity={0.95} />
  <T.DirectionalLight position={[16, 14, -20]} intensity={0.5} />
  <T.DirectionalLight position={[0, -14, 6]} intensity={0.62} />
  <T.DirectionalLight position={[24, 6, 18]} intensity={0.4} />
{:else}
  <T.Color attach="background" args={["#040303"]} />
  <T.FogExp2 attach="fog" args={["#0b0807", 0.012]} />

  <!--
    Gate 3: no ambient fill and no key light. Every photon in the Cinder Court
    comes from something that is burning, which is the only way the extinguish
    beat can take the room to true black. The graybox's neutral hemisphere and
    directional pair washed the basalt to salmon and are deliberately gone. A
    floor-level bounce term stands in for radiosity off the magma without
    surviving the blackout.
  -->
  <T.HemisphereLight
    color="#3a1206"
    groundColor="#1a0704"
    intensity={emberDressingLit ? 0.09 : 0}
  />
  <T.PointLight
    position={[-27, 2.6, 0]}
    color="#7cc7dd"
    intensity={24}
    distance={11}
    decay={2}
  />
{/if}
<T is={heroLight} />
{#if growthVisible && !bareShell}
  <T.PointLight
    position={[
      contract.doors.earth.blender.x - 2.5,
      2.1,
      -contract.doors.earth.blender.y,
    ]}
    color="#72d957"
    intensity={52}
    distance={15}
    decay={2}
    castShadow
    shadow.mapSize.width={512}
    shadow.mapSize.height={512}
  />
{/if}

<GltfAsset
  url="/models/museum/cave/first-fire-cinder-court-graybox.glb"
  emissiveBoost={1.05}
  onReady={handleGrayboxReady}
/>

<!-- Everything from here to the performer rigs is Gate 3, and none of it mounts
     in bare mode. The anchors are still extracted above so the page's readiness
     count and the flame-guide warning stay honest. -->
{#if !bareShell}
  {#if flameAnchors.length > 0}
    <FirstFireProcessionFlames
      anchors={flameAnchors}
      visibleGroups={visibleFlameGroups}
    />
  {/if}

  <FirstFireCinderStateEffects {contract} {reviewState} />

  <FirstFireEmberDressing
    {contract}
    lit={emberDressingLit}
    activeShrineId={litShrineId ?? null}
  />

  <!-- The coal vocabulary applied to the first section of the walk. Follows the
       same lit flag as the rest of the dressing so the extinguish beat still
       takes the room to true black. -->
  <FirstFireCoalDressing {contract} lit={emberDressingLit} />

  {#if activeShrine}
    <FirstFireShrineVolumes
      shrineId={activeShrine.id}
      position={[activeShrine.blenderCentre.x, 0, -activeShrine.blenderCentre.y]}
    />
  {/if}
{/if}

{#if displayedShrine}
  <!-- Keyed on the measurement too: the station reads standingSurfaceHeight once
       at mount, so a rig mounted before the GLB resolved would keep the stale
       height for the rest of the walk. -->
  {#key displayedShrineKey}
    {@const entry = {
      x: displayedShrine.blenderEntry.x,
      z: -displayedShrine.blenderEntry.y,
    }}
    {@const centre = {
      x: displayedShrine.blenderCentre.x,
      z: -displayedShrine.blenderCentre.y,
    }}
    <MuseumPerformerStation3D
      stationId={displayedShrine.performerId}
      worldX={centre.x}
      worldY={0}
      worldZ={centre.z}
      facingAngle={yawToward(centre, entry)}
      sequenceId={displayedShrine.sequenceId}
      autoPlay={true}
      active={displayedShrine.id === litShrineId}
      showGrid={displayedShrine.id === activeShrineId}
      showPlatform={false}
      standingSurfaceHeight={padSurfaceHeights[displayedShrine.id] ?? 0.22}
      effectId={firstFireCourtEffectId(displayedShrine.id)}
    />
  {/key}
{/if}

{#if isInitialized && physicsProvider}
  {#key cameraRevision}
    <UnifiedCameraController
      destinationId="first-fire-cinder-court-graybox-walk"
      {avatarState}
      {physicsProvider}
      enabled={true}
      initialYaw={playerYaw}
      {initialPitch}
      onRotationChange={(_yaw, pitch) => (playerPitch = pitch)}
      allowedModes={[CameraMode.FIRST_PERSON]}
      disableModeToggle={true}
      showControlsHint={false}
      moveSpeed={4}
      sprintMultiplier={1.8}
      gravity={9.81}
      jumpForce={4.5}
    />
  {/key}
{/if}
