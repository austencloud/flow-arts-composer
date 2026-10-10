<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { Color, Mesh, PointLight, Vector3, type Object3D } from "three";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { CameraMode, UnifiedCameraController } from "@austencloud/camera-3d";
  import type { AvatarState, PhysicsProvider } from "@austencloud/camera-3d";
  import {
    MUSEUM_GRAVITY,
    MUSEUM_JUMP_VELOCITY,
  } from "#lib/features/museum/domain/museum-design-rules.js";
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
  import PedestalMesh from "#lib/features/museum/components/graybox/PedestalMesh.svelte";
  import MuseumPerformerStation3D from "#lib/features/museum/components/game/MuseumPerformerStation3D.svelte";
  import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import ConsoleMesh from "#lib/features/museum/components/graybox/ConsoleMesh.svelte";
  import { pedestalFaceDataUri } from "#lib/features/museum/services/pedestal-face.js";
  import {
    CONSOLE_BUTTON_D,
    CONSOLE_FACE,
    CONSOLE_FACE_TILT,
    CONSOLE_FULL_M,
    CONSOLE_WAKE_M,
    applyVerb,
    consoleColumnX,
    consoleFaceSize,
    consoleFaceY,
    consoleRowY,
    defaultSettings,
    isHybrid,
    isModified,
    verbsFor,
    type ConsoleVerb,
    type PerformerSettings,
  } from "#lib/features/museum/domain/exhibit-console.js";
  import {
    boundSteps,
    effectiveSteps,
  } from "#lib/features/museum/services/exhibit-console-sequence.js";
  import ReflectivePool from "#lib/shared/3d/environments/primitives/ReflectivePool.svelte";
  import EmberFountains from "#lib/shared/3d/environments/scenes/ember/EmberFountains.svelte";
  import { userProportionsState } from "@austencloud/scene-3d";
  import {
    CAUSEWAY_Y,
    GROTTO_WATERLINE_Y,
    SHELF_Y,
    WATERLINE_Y,
    DOME_APEX_Y,
    inRectClosed,
  } from "#lib/features/museum/data/drowned-gallery-terrain.js";
  import { buildDrownedGalleryWalkSetup } from "./drowned-gallery-graybox-colliders";

  interface Props {
    resetToken: number;
    onAssetReady?: () => void;
    onPositionChange?: (position: { x: number; y: number; z: number }) => void;
  }

  const props: Props = $props();
  const threlte = useThrelte();
  /**
   * Reviewing a graybox means editing and reloading over and over, and being
   * thrown back to the dark approach each time makes the far end of the room
   * the expensive end to iterate on. The walk position survives a reload;
   * "Reset to approach" is how you go back on purpose.
   */
  const RESUME_KEY = "drowned-gallery-walk-resume";
  const setup = buildDrownedGalleryWalkSetup();
  const { layout, origin, colliders, spawn } = setup;

  const alcoveLightObjects = layout.alcoves.map((anchor, index) => {
    const light = new PointLight(new Color("#ffb35c"), 46, 11, 2);
    light.position.set(
      anchor.x - origin.x,
      SHELF_Y + 2.3,
      anchor.z - origin.z - 0.4
    );
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = 12;
    light.shadow.bias = -0.0015;
    light.shadow.normalBias = 0.025;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    return { id: `alcove-${index}`, light };
  });

  const grottoCentre = {
    x: (layout.grotto.minX + layout.grotto.maxX) / 2 - origin.x,
    z: (layout.grotto.minZ + layout.grotto.maxZ) / 2 - origin.z,
  };
  const poolCentre = {
    x: (layout.pool.minX + layout.pool.maxX) / 2 - origin.x,
    z: (layout.pool.minZ + layout.pool.maxZ) / 2 - origin.z,
  };
  const bloom = {
    x: layout.bloomAnchor.x - origin.x,
    z: layout.bloomAnchor.z - origin.z,
  };
  /**
   * The grotto's water is built at runtime because the GLB cannot carry it.
   * Blender's mirror slab exports as metalness 1 with no environment, which
   * renders pure black in Three.js — that black hole is what read as "no water
   * at all". A plain planar mirror in its place was no better: reflection at
   * full strength from every angle reads as an opening in the floor, not as a
   * pool. ReflectivePool adds the view-dependent part (Fresnel, absorption,
   * ripples, foam) that makes it a liquid.
   */
  const grottoWater = layout.waterPlanes
    .filter((plane) => plane.surfaceY === GROTTO_WATERLINE_Y)
    .map((plane, index) => {
      const centreX = (plane.minX + plane.maxX) / 2;
      const centreZ = (plane.minZ + plane.maxZ) / 2;
      // Exactly two surfaces sit at this datum: the channel and the mirror
      // pool. Only the channel ramps.
      const isChannel = inRectClosed(layout.channel, centreX, centreZ);
      return {
        id: `grotto-water-${index}`,
        isChannel,
        width: plane.maxX - plane.minX,
        depth: plane.maxZ - plane.minZ,
        centre: [centreX - origin.x, centreZ - origin.z] as [number, number],
        surfaceY: plane.surfaceY,
      };
    });

  /**
   * Graybox massing for the wing's furniture. A box of the right size in the
   * right place answers the only Gate 2 question — does the room read when you
   * walk it — and answers it without waiting on avatars or card art.
   */
  /**
   * Water's colour, and what the performers hold.
   *
   * Staff is BILATERAL — held at its centre, so both ends draw and the face
   * carries two figures. Swapping to a unilateral prop at the console leaves
   * the shape alone and halves the drawing, which is the lesson that button
   * exists to deliver.
   */
  const WATER_TINT = "#7fd4e8";
  const PEDESTAL_PROP = "staff";

  const isPedestal = (kind: string) =>
    kind === "pedestal" || kind === "opener-pedestal";

  /**
   * Pedestals render as their own object, not as graybox boxes: the whole point
   * of the thread is the figure on the top face, and a box cannot carry it.
   *
   * The face is GENERATED from each case's bound sequence. The opener's is the
   * bare hand path with no prop on it, which is why its pedestal is empty and
   * why it is the one that animates — nothing stands on it to compete.
   */
  const pedestalSpecs = layout.exhibitFixtures
    .filter((fixture) => isPedestal(fixture.kind))
    .map((fixture) => ({
      id: fixture.id,
      caseWord: fixture.caseWord ?? null,
      sequenceId: fixture.sequenceId ?? null,
      opener: fixture.kind === "opener-pedestal",
      position: [
        fixture.centre.x - origin.x,
        fixture.baseY,
        fixture.centre.z - origin.z,
      ] as [number, number, number],
      height: fixture.height,
      diameter: fixture.size.x,
    }));

  /**
   * What each performer is currently doing.
   *
   * MODIFICATIONS PERSIST. Walking away from a console does not reset the
   * performer it owns — the visitor's change is a change to the exhibit for as
   * long as they are in the wing, and the pedestal under the performer is what
   * reports it. There is no status lamp anywhere, because a base showing one
   * trace instead of two already says the prop changed, in the museum's own
   * grammar and with no new vocabulary.
   */
  const performerSettings = $state<Record<string, PerformerSettings>>(
    Object.fromEntries(
      pedestalSpecs
        .filter((spec) => spec.caseWord)
        .map((spec) => [spec.caseWord!, defaultSettings(PEDESTAL_PROP)])
    )
  );

  function faceUriFor(
    sequenceId: string,
    propType: string,
    opener: boolean,
    steps?: readonly StepData[]
  ): string | null {
    try {
      return pedestalFaceDataUri({
        sequenceId,
        propType,
        tint: WATER_TINT,
        handPathOnly: opener,
        ...(steps ? { steps } : {}),
      });
    } catch (error) {
      // Loud, not silent. A pedestal showing the wrong figure is worse than one
      // showing none, so a bad binding must reach the browser console rather
      // than degrade into a blank plate.
      console.error("[pedestal]", error);
      return null;
    }
  }

  /**
   * Faces, regenerated whenever a console changes what its performer is doing.
   *
   * Async because a full reversal is: it rewinds each step through the
   * pictograph dataset rather than merely playing the list backwards. Seeded
   * synchronously with the bound figure so no pedestal is ever briefly blank.
   */
  const pedestalFaces = $state<Record<string, string | null>>(
    Object.fromEntries(
      pedestalSpecs.map((spec) => [
        spec.id,
        spec.sequenceId
          ? faceUriFor(spec.sequenceId, PEDESTAL_PROP, spec.opener)
          : null,
      ])
    )
  );

  /**
   * The steps each performer is actually working from, after the console.
   *
   * ONE resolution, two consumers. The figure on the pedestal and the person
   * standing on it are the same choreography seen two ways, so they read the
   * same array. Resolving it twice is how the drawing and the dance would
   * quietly stop agreeing.
   */
  const caseSteps = $state<Record<string, readonly StepData[]>>(
    Object.fromEntries(
      pedestalSpecs
        .filter((spec) => spec.caseWord && spec.sequenceId && !spec.opener)
        .map((spec) => [spec.caseWord!, boundSteps(spec.sequenceId!)])
    )
  );

  $effect(() => {
    let cancelled = false;
    for (const spec of pedestalSpecs) {
      if (!spec.sequenceId || !spec.caseWord) continue;
      const settings = performerSettings[spec.caseWord];
      if (!settings) continue;
      const { propType, reversed, handsSwapped } = settings;
      const sequenceId = spec.sequenceId;
      const caseWord = spec.caseWord;
      void effectiveSteps(sequenceId, settings)
        .then((steps) => {
          if (cancelled) return;
          if (!spec.opener) caseSteps[caseWord] = steps;
          pedestalFaces[spec.id] = faceUriFor(
            sequenceId,
            propType,
            spec.opener,
            steps
          );
        })
        .catch((error) => console.error("[pedestal]", error));
      // Referenced so the effect re-runs on every field the face depends on.
      void reversed;
      void handsSwapped;
    }
    return () => {
      cancelled = true;
    };
  });

  const pedestals = $derived(
    pedestalSpecs.map((spec) => {
      const settings = spec.caseWord
        ? performerSettings[spec.caseWord]
        : undefined;
      return {
        id: spec.id,
        position: spec.position,
        height: spec.height,
        diameter: spec.diameter,
        faceUri:
          settings && !settings.traceVisible ? null : pedestalFaces[spec.id],
        animated: spec.opener,
      };
    })
  );

  const fixtureMeshes = layout.exhibitFixtures
    .filter(
      (fixture) =>
        !isPedestal(fixture.kind) &&
        fixture.kind !== "case-console" &&
        // The showcase is no longer massing. It is a person.
        fixture.kind !== "case-showcase"
    )
    .map((fixture) => ({
    id: fixture.id,
    kind: fixture.kind,
    position: [
      fixture.centre.x - origin.x,
      fixture.baseY + fixture.height / 2,
      fixture.centre.z - origin.z,
    ] as [number, number, number],
    scale: [fixture.size.x, fixture.height, fixture.size.z] as [
      number,
      number,
      number,
    ],
    rotation: [0, fixture.facing, 0] as [number, number, number],
    color:
      fixture.kind === "case-screen"
        ? "#123742"
        : fixture.kind === "case-showcase"
          ? "#6b7f86"
          : "#2b3a41",
    emissive: fixture.kind === "case-screen" ? "#1d6d84" : "#000000",
  }));

  /**
   * One console per performer.
   *
   * The reason is structural rather than a preference: the hand-swap button
   * only exists on the hybrid, so a single wing console would spend two thirds
   * of its life greying a button out. The wing-console instinct survives as a
   * framing rule instead — nothing here isolates the performer being changed,
   * and from any console all three cases stay in view.
   */
  const consoleSpecs = layout.exhibitFixtures
    .filter((fixture) => fixture.kind === "case-console")
    .map((fixture) => {
      const sequenceId = fixture.sequenceId!;
      const hybrid = isHybrid(boundSteps(sequenceId));
      // The performer this console owns, so the key light can find them.
      const showcase = layout.exhibitFixtures.find(
        (other) =>
          other.kind === "case-showcase" && other.caseWord === fixture.caseWord
      )!;
      return {
        id: fixture.id,
        caseWord: fixture.caseWord!,
        position: [
          fixture.centre.x - origin.x,
          fixture.baseY,
          fixture.centre.z - origin.z,
        ] as [number, number, number],
        height: fixture.height,
        footprint: fixture.size,
        verbs: verbsFor(hybrid),
        // In front of the performer and above their head, on the visitor's
        // side of the channel, so the lift models a lamp rather than a glow.
        keyLight: [
          showcase.centre.x - origin.x,
          showcase.baseY + showcase.height + 0.9,
          showcase.centre.z - origin.z + 1.5,
        ] as [number, number, number],
      };
    });

  /**
   * Where the visitor is, for the console approach test.
   *
   * Mirrored from BOTH movement paths on purpose. `playerPosition` only moves
   * on a teleport and `livePosition` only moves under physics, so a console
   * that watched either one alone would stay asleep for half the ways a
   * visitor can arrive at it — including every review-bridge jump.
   */
  let viewPoint = $state({ x: 0, y: 0, z: 0 });
  const aimOrigin = new Vector3();
  const aimDirection = new Vector3();

  const consoles = $derived(
    consoleSpecs.map((spec) => {
      const settings = performerSettings[spec.caseWord];
      const distance = Math.hypot(
        spec.position[0] - viewPoint.x,
        spec.position[2] - viewPoint.z
      );
      // Dark from across the room, live at arm's length. Nothing else in the
      // room changes as the visitor arrives, and nothing dims.
      const awake = Math.min(
        1,
        Math.max(0, (CONSOLE_WAKE_M - distance) / (CONSOLE_WAKE_M - CONSOLE_FULL_M))
      );
      const engaged: Record<string, boolean> = settings
        ? {
            trace: !settings.traceVisible,
            prop: settings.propType.toLowerCase() !== PEDESTAL_PROP,
            reverse: settings.reversed,
            "swap-hands": settings.handsSwapped,
          }
        : {};
      return {
        ...spec,
        awake,
        engaged,
        modified: settings ? isModified(settings, PEDESTAL_PROP) : false,
      };
    })
  );

  // ── The performers ────────────────────────────────────────────────────────

  /**
   * Which real prop the console's word puts in the performer's hands.
   *
   * The console cycles one bilateral prop and one unilateral one, because the
   * whole lesson of that button is that the figure belongs to the hand and the
   * copy count belongs to the prop. An unknown word falls back to the staff
   * rather than leaving a performer empty-handed.
   */
  function scenePropType(word: string): PropType {
    return word.toLowerCase() === "fan" ? PropType.FAN : PropType.STAFF;
  }

  /**
   * A performer stands where the massing box used to.
   *
   * The showcase fixture keeps owning the position, the facing, and the height
   * the plan was proved against — the sightline work behind this room measured
   * a 1.75 m figure standing on the pedestal's top face, and swapping in a real
   * avatar must not quietly move that. Its `baseY` is that top face, so the
   * station stands on it with no standing surface of its own.
   */
  const performerSpecs = layout.exhibitFixtures
    .filter((fixture) => fixture.kind === "case-showcase")
    .map((fixture) => {
      const caseWord = fixture.caseWord!;
      const pedestal = pedestalSpecs.find(
        (spec) => spec.caseWord === caseWord && !spec.opener
      )!;
      return {
        id: fixture.id,
        caseWord,
        sequenceId: pedestal.sequenceId!,
        worldX: fixture.centre.x - origin.x,
        worldY: fixture.baseY,
        worldZ: fixture.centre.z - origin.z,
        facing: fixture.facing,
      };
    });

  /**
   * How far away a performer stops moving.
   *
   * Generous, because these three ARE the room: a visitor arriving down the
   * causeway should already see them working. It exists only so the dark
   * approach and the tunnel out do not pay for three animated rigs.
   */
  const PERFORMER_ACTIVE_M = 30;

  const performers = $derived(
    performerSpecs.map((spec) => {
      const settings = performerSettings[spec.caseWord];
      const steps = caseSteps[spec.caseWord] ?? [];
      const propType = scenePropType(settings?.propType ?? PEDESTAL_PROP);
      const distance = Math.hypot(
        spec.worldX - viewPoint.x,
        spec.worldZ - viewPoint.z
      );
      return {
        ...spec,
        active: distance < PERFORMER_ACTIVE_M,
        // Rebuilt whenever the console changes the steps or the prop, which is
        // what makes a press visible in the performer's hands and not only in
        // the drawing under their feet.
        sequenceData: createSequenceData({
          id: `drowned-gallery-${spec.caseWord}`,
          name: spec.caseWord,
          word: spec.caseWord,
          steps,
          isCircular: true,
          intendedProp: {
            leftPropType: propType,
            rightPropType: propType,
            catDogMode: false,
          },
        }) satisfies SequenceData,
      };
    })
  );

  /**
   * Where a control physically is, in world space.
   *
   * Derived from the same numbers the mesh is built from rather than measured
   * off the rendered object, so aiming and drawing cannot drift apart. The
   * console's face is a plane tilted about X; a control at face-local
   * (lx, ly, lz) lands here.
   */
  function controlWorldPoint(
    spec: (typeof consoleSpecs)[number],
    lx: number,
    ly: number,
    lz: number
  ): { x: number; y: number; z: number } {
    const angle = CONSOLE_FACE_TILT - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Same datum the mesh uses. Deriving it here a second time is how the
    // pressable targets drifted away from the drawn buttons once already.
    const faceY = consoleFaceY(spec.height, spec.footprint);
    return {
      x: spec.position[0] + lx,
      y: spec.position[1] + faceY + (ly * cos - lz * sin),
      z: spec.position[2] + (ly * sin + lz * cos),
    };
  }

  interface ConsoleTarget {
    caseWord: string;
    verb: ConsoleVerb | "restore";
    point: { x: number; y: number; z: number };
  }

  /** Every pressable control in the wing, with its world position. */
  const consoleTargets = $derived(
    consoleSpecs.flatMap((spec): ConsoleTarget[] => {
      const { w: faceW, h: faceH } = consoleFaceSize(spec.footprint);
      const buttonY = consoleRowY(CONSOLE_FACE.buttonV, faceH);
      const restoreY = consoleRowY(CONSOLE_FACE.restoreBarV, faceH);
      const buttons = spec.verbs.map((verb, index) => ({
        caseWord: spec.caseWord,
        verb,
        point: controlWorldPoint(
          spec,
          consoleColumnX(index, spec.verbs.length, faceW),
          buttonY,
          0.045
        ),
      }));
      return [
        ...buttons,
        {
          caseWord: spec.caseWord,
          verb: "restore" as const,
          point: controlWorldPoint(spec, 0, restoreY, 0.035),
        },
      ];
    })
  );

  /**
   * The control the visitor is looking at, if any.
   *
   * A button is pressed by aiming at it and reaching for it, the way a button
   * on a real lectern is. There is no cursor, no hover list and no menu — the
   * camera is never taken, so the only thing that can mean "this one" is where
   * the visitor is looking from where they are standing.
   */
  const AIM_RADIUS = CONSOLE_BUTTON_D * 1.1;
  const REACH_M = 1.9;

  function aimedControl(): ConsoleTarget | null {
    const camera = threlte.camera.current;
    if (!camera) return null;
    camera.getWorldPosition(aimOrigin);
    camera.getWorldDirection(aimDirection);
    let best: ConsoleTarget | null = null;
    let bestOffset = Infinity;
    for (const target of consoleTargets) {
      const dx = target.point.x - aimOrigin.x;
      const dy = target.point.y - aimOrigin.y;
      const dz = target.point.z - aimOrigin.z;
      const along =
        dx * aimDirection.x + dy * aimDirection.y + dz * aimDirection.z;
      if (along <= 0.15 || along > REACH_M) continue;
      const offset = Math.hypot(
        dx - aimDirection.x * along,
        dy - aimDirection.y * along,
        dz - aimDirection.z * along
      );
      if (offset > AIM_RADIUS || offset >= bestOffset) continue;
      bestOffset = offset;
      best = target;
    }
    return best;
  }

  function pressAimedControl(): boolean {
    const target = aimedControl();
    if (!target) return false;
    const current = performerSettings[target.caseWord];
    if (!current) return false;
    performerSettings[target.caseWord] =
      target.verb === "restore"
        ? defaultSettings(PEDESTAL_PROP)
        : applyVerb(current, target.verb);
    return true;
  }

  /**
   * Mist where the water wing meets the fire wing.
   *
   * FirstFireSteamVent is NOT the thing to mount here — it is a whole forge
   * fixture (sunken slot walls, iron grate, glowing slag, coal bank, orange
   * up-light) and all of that would land in the middle of the channel. What
   * carries over is the emitter it delegates to, plus the three limits it
   * authored the hard way:
   *
   * 1. Not white. White on additive blending blows to a peach smear under AgX,
   *    so these are dim greys — cooled from the vent's warm greys because this
   *    plume is lit by the grotto's blue, not by coals.
   * 2. Not full height. A column run to the crown is a flat pale wash that
   *    takes the depth out of the room. Waist height reads as water breathing.
   * 3. Not dense. The route passes within a metre, so the visitor would
   *    otherwise stand inside the cloud with every sprite between them and the
   *    room.
   */
  const STEAM_RATE = 0.55;
  const steamPlume = {
    enabled: true,
    count: Math.round(34 * STEAM_RATE),
    riseSpeed: 0.42,
    colors: ["#242c30", "#2c353a", "#1c2326", "#333f44"],
    sizeRange: [0.22, 0.5] as [number, number],
    spawnRadius: Math.min(2.6, layout.channel.maxZ - layout.channel.minZ) * 0.6,
    maxHeight: 1.1,
    // Near-zero: steam keeps going up. Embers arc and fall; this must not.
    gravity: 0.015,
    burstInterval: 5.5,
    burstCount: 3,
  };
  /**
   * EmberFountains draws its points at `userProportionsState.groundY`, because
   * the ember components are authored against the avatar ground datum rather
   * than the museum floor. Cancelling it here keeps that detail out of the
   * placement below, exactly as FirstFireSteamVent does.
   */
  const steamFloorLift = $derived(-userProportionsState.groundY);
  const steamPosition = $derived([
    layout.alcoves[2]!.x - origin.x,
    GROTTO_WATERLINE_Y + steamFloorLift,
    (layout.channel.minZ + layout.channel.maxZ) / 2 - origin.z,
  ] as [number, number, number]);

  const shaftLights = layout.openShafts.map((shaft, index) => ({
    id: `shaft-${index}`,
    position: [
      (shaft.minX + shaft.maxX) / 2 - origin.x,
      1.6,
      (shaft.minZ + shaft.maxZ) / 2 - origin.z,
    ] as [number, number, number],
  }));

  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  let physicsProvider = $state<PhysicsProvider | null>(null);
  let isInitialized = $state(false);
  let isDisposed = false;
  const UNSEEN_RESET_TOKEN = Symbol("unseen");
  let appliedResetToken: number | symbol = UNSEEN_RESET_TOKEN;
  let fireElapsed = 0;

  const resumePoint = readResumePoint();
  const bootPoint = resumePoint ?? { ...spawn };

  let playerPosition = $state({ x: bootPoint.x, y: bootPoint.y, z: bootPoint.z });
  let playerYaw = $state(bootPoint.yaw);
  let targetPlayerYaw = $state(bootPoint.yaw);
  /** Non-null only for the tick the review bridge is aiming the camera. */
  let reviewYaw = $state<number | null>(null);
  /**
   * A one-frame pitch nudge for the review bridge.
   *
   * Yaw alone cannot aim at a console: the buttons sit on a one-metre lectern
   * roughly 0.7 m below eye level, so a horizontal ray passes over every one of
   * them. The camera controller already accepts an external pitch; this scene
   * simply never handed it one.
   */
  let reviewPitch = $state<number | null>(null);
  /** Physics-owned position, mirrored each frame so a reload can resume here. */
  let livePosition = { x: bootPoint.x, y: bootPoint.y, z: bootPoint.z };
  let resumeSaveElapsed = 0;
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });

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

  interface ResumePoint {
    x: number;
    y: number;
    z: number;
    yaw: number;
  }

  function readResumePoint(): ResumePoint | null {
    if (typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return null;
      const point = JSON.parse(raw) as Partial<ResumePoint>;
      const values = [point.x, point.y, point.z, point.yaw];
      if (!values.every((value) => typeof value === "number" && isFinite(value))) {
        return null;
      }
      return point as ResumePoint;
    } catch {
      return null;
    }
  }

  function writeResumePoint(): void {
    if (typeof sessionStorage === "undefined") return;
    try {
      // Physics owns the live position; playerPosition only moves on teleport.
      sessionStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ ...livePosition, yaw: playerYaw })
      );
    } catch {
      // A full or blocked sessionStorage costs a convenience, not the review.
    }
  }

  function clearResumePoint(): void {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      // See writeResumePoint.
    }
  }

  function resetPlayer(): void {
    const target = { x: spawn.x, y: spawn.y, z: spawn.z };
    physicsProvider?.teleport?.(target);
    playerPosition = target;
    viewPoint = target;
    playerYaw = spawn.yaw;
    targetPlayerYaw = spawn.yaw;
    // Same seam as the review bridge: the camera's yaw is the controller's, so
    // a reset that only rewrites the avatar's facing leaves the view where the
    // visitor last pointed it.
    reviewYaw = spawn.yaw;
    setTimeout(() => {
      reviewYaw = null;
    }, 0);
    clearResumePoint();
  }

  /**
   * Dev-only review bridge. A graybox exists to be LOOKED at, and an agent
   * verifying its own diff cannot take pointer lock — so without this the only
   * frame anyone can capture is the spawn point in the dark approach. Takes
   * PLAN metres (the same numbers the layout module and the Blender QA cameras
   * use) and converts to the GLB's authoring origin.
   */
  /**
   * How far the standing capsule's centre sits above the floor it rests on.
   *
   * Rapier settles the capsule with its bottom on the ground plus a small
   * margin, which is where `spawn.y` already puts the visitor. Repeated here so
   * the review bridge's teleports agree with the physics rather than fighting
   * it for the first second after every jump.
   */
  const PLAYER_STANDING_RISE = 0.9;

  function installReviewBridge(): (() => void) | undefined {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    const bridge = {
      /**
       * Teleport to a plan-space point. `y` is an elevation, not an offset.
       *
       * The default is the STANDING CAPSULE's centre, not the eye. The camera
       * controller adds its own 0.75 m eye offset on top of the avatar, so a
       * jump that landed the capsule at eye height put the review's eye 2.35 m
       * above the floor — three quarters of a metre taller than the visitor
       * every sightline in the plan was measured for, which is enough to put a
       * console's buttons out of reach and make the room read as a model.
       */
      go(planX: number, planZ: number, y = CAUSEWAY_Y + PLAYER_STANDING_RISE) {
        const target = { x: planX - origin.x, y, z: planZ - origin.z };
        physicsProvider?.teleport?.(target);
        playerPosition = target;
        viewPoint = target;
        return target;
      },
      /**
       * Face a plan-space point from wherever the player is standing.
       *
       * The camera's yaw belongs to UnifiedCameraController, not to the avatar:
       * every frame it pushes its own yaw back down through `snapFacingAngle`.
       * Writing `playerYaw` here therefore lasted exactly one frame and the view
       * never turned. The controller's `externalYaw` prop is the seam for this;
       * it is released on the next tick so the mouse still owns the camera the
       * moment a human takes over.
       */
      /**
       * Face a plan-space point. Pass `aimY` to look DOWN at it as well —
       * without that, an aim at a console clears the buttons entirely.
       */
      lookAt(planX: number, planZ: number, aimY?: number) {
        const dx = planX - origin.x - playerPosition.x;
        const dz = planZ - origin.z - playerPosition.z;
        const angle = Math.atan2(dx, dz);
        playerYaw = angle;
        targetPlayerYaw = angle;
        reviewYaw = angle;
        let pitch = 0;
        if (aimY !== undefined) {
          // Prefer the real camera, but only once it has actually been placed.
          // A scene whose render loop has never run — a hidden tab, a collapsed
          // pane — still HAS a camera, sitting at the origin, and trusting that
          // one silently aims the review upward instead of down at the lectern.
          // Standing next to the visitor is what makes it the visitor's eye.
          const eye = threlte.camera.current?.getWorldPosition(new Vector3());
          const placed =
            eye !== undefined &&
            Math.hypot(eye.x - playerPosition.x, eye.z - playerPosition.z) < 1;
          const eyeY = placed ? eye.y : playerPosition.y;
          // Positive pitch looks down, per UnifiedCameraController.
          pitch = Math.atan2(eyeY - aimY, Math.hypot(dx, dz));
          reviewPitch = pitch;
        }
        setTimeout(() => {
          reviewYaw = null;
          reviewPitch = null;
        }, 0);
        return { yaw: angle, pitch };
      },
      where: () => ({ ...playerPosition, yaw: playerYaw, origin }),
      /** What the consoles measure their approach against. */
      viewPoint: () => ({ ...viewPoint }),
      /**
       * Every control and where the eye actually is.
       *
       * The bridge's `lookAt` sets yaw only, so a review that can aim
       * horizontally still cannot aim DOWN at a lectern. This reports the miss
       * rather than leaving `press()` returning a bare false.
       */
      controls: () => {
        const camera = threlte.camera.current;
        const eye = camera
          ? camera.getWorldPosition(new Vector3())
          : new Vector3();
        return {
          eye: { x: eye.x, y: eye.y, z: eye.z },
          targets: consoleTargets.map((target) => ({
            caseWord: target.caseWord,
            verb: target.verb,
            point: target.point,
            drop: +(eye.y - target.point.y).toFixed(3),
            range: +Math.hypot(
              target.point.x - eye.x,
              target.point.y - eye.y,
              target.point.z - eye.z
            ).toFixed(3),
          })),
        };
      },
      /** Press whatever control the view is currently aimed at. */
      press: () => pressAimedControl(),
      /**
       * Press a named control directly, without aiming.
       *
       * The aimed path is the real one; this exists because a review pass that
       * cannot take pointer lock still has to be able to prove that a verb
       * changes the figure on the base.
       */
      set: (caseWord: string, verb: ConsoleVerb | "restore") => {
        const current = performerSettings[caseWord];
        if (!current) return null;
        performerSettings[caseWord] =
          verb === "restore"
            ? defaultSettings(PEDESTAL_PROP)
            : applyVerb(current, verb);
        return { ...performerSettings[caseWord] };
      },
      settings: () => JSON.parse(JSON.stringify(performerSettings)),
      consoles: () =>
        consoles.map((station) => ({
          id: station.id,
          caseWord: station.caseWord,
          verbs: [...station.verbs],
          awake: station.awake,
          modified: station.modified,
        })),
      /** The live scene graph, so a review pass can count what actually mounted. */
      scene: () => threlte.scene,
      water: grottoWater,
      layout,
    };
    (window as unknown as Record<string, unknown>).__dgWalk = bridge;
    return () => {
      delete (window as unknown as Record<string, unknown>).__dgWalk;
    };
  }

  /**
   * Blender's mirror pool is metalness 1 / roughness 0.02. EEVEE raytraces it;
   * Three.js has no environment to sample and renders it black. The runtime
   * water above replaces it, so the baked slab is hidden rather than lit.
   */
  function isBakedGrottoMirror(mesh: Mesh): boolean {
    if (!mesh.name.startsWith("DG_WaterSurface")) return false;
    const material = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
    return (material as { metalness?: number })?.metalness === 1;
  }

  function handleGrayboxReady(scene: Object3D): void {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (isBakedGrottoMirror(object)) {
        object.visible = false;
        return;
      }
      if (!object.visible) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    alcoveLightObjects.forEach(({ light }) => {
      light.shadow.needsUpdate = true;
    });
    props.onAssetReady?.();
  }

  let removeReviewBridge: (() => void) | undefined;
  let removePageHide: (() => void) | undefined;
  let removePressKey: (() => void) | undefined;

  onMount(async () => {
    removeReviewBridge = installReviewBridge();
    const onPageHide = () => writeResumePoint();
    window.addEventListener("pagehide", onPageHide);
    removePageHide = () => window.removeEventListener("pagehide", onPageHide);
    // Reach out and press it. One key, because a console you walk up to should
    // not need a vocabulary — you are already looking at the button you mean.
    const onPress = (event: KeyboardEvent) => {
      if (event.key !== "e" && event.key !== "E") return;
      if (pressAimedControl()) event.preventDefault();
    };
    window.addEventListener("keydown", onPress);
    removePressKey = () => window.removeEventListener("keydown", onPress);
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
          // Ramps are tilted slabs, so the body carries the tilt.
          rotation: collider.rotation,
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

    playerState = createPlayerController(physicsState, {
      position: { x: bootPoint.x, y: bootPoint.y, z: bootPoint.z },
      autoStepMaxHeight: 0.45,
      snapToGroundDistance: 0.35,
    });
    physicsProvider = createRapierPhysicsProvider(physicsState, playerState);
    isInitialized = true;
  });

  $effect(() => {
    if (!isInitialized) return;
    // The first run is mount, not a press. Adopting the token instead of
    // acting on it is what lets a resumed position survive — otherwise this
    // teleported to spawn and cleared the stored point on every load.
    if (appliedResetToken === UNSEEN_RESET_TOKEN) {
      appliedResetToken = props.resetToken;
      return;
    }
    if (props.resetToken === appliedResetToken) return;
    appliedResetToken = props.resetToken;
    resetPlayer();
  });

  useTask((delta) => {
    fireElapsed += Math.min(delta, 1 / 20);
    alcoveLightObjects.forEach(({ light }, index) => {
      const phase = index * 2.17;
      const flicker =
        Math.sin(fireElapsed * 1.2 + phase) * 0.12 +
        Math.sin(fireElapsed * 4.7 + phase) * 0.08 +
        Math.sin(fireElapsed * 19.3 + phase) * 0.045;
      light.intensity = 46 * (1 + flicker);
    });

    if (!isInitialized || !physicsState?.world || isDisposed) return;
    stepPhysics(physicsState, Math.min(delta, 1 / 30));
    const position = physicsProvider?.getPlayerPosition();
    if (!position) return;
    props.onPositionChange?.(position);
    livePosition = position;
    // The consoles wake off the visitor's own position, so it has to be the
    // live physics one rather than the teleport-only mirror.
    if (
      position.x !== viewPoint.x ||
      position.y !== viewPoint.y ||
      position.z !== viewPoint.z
    ) {
      viewPoint = { x: position.x, y: position.y, z: position.z };
    }
    resumeSaveElapsed += delta;
    if (resumeSaveElapsed >= 0.5) {
      resumeSaveElapsed = 0;
      writeResumePoint();
    }
  });

  onDestroy(() => {
    isDisposed = true;
    // A hard reload skips onDestroy's usual timing, so pagehide carries it too.
    writeResumePoint();
    removePageHide?.();
    removePressKey?.();
    removeReviewBridge?.();
    if (playerState && physicsState) {
      disposePlayerController(physicsState, playerState);
    }
    if (physicsState) disposePhysicsWorld(physicsState);
    alcoveLightObjects.forEach(({ light }) => light.dispose());
  });
</script>

<T.Color attach="background" args={["#020407"]} />
<T.FogExp2 attach="fog" args={["#03080c", 0.02]} />

<T.HemisphereLight color="#5c7c86" groundColor="#04121a" intensity={0.4} />
<T.DirectionalLight
  position={[6, 18, -8]}
  color="#9fc4c8"
  intensity={0.35}
  castShadow={false}
/>

<!-- Glowworm dome fill over the grotto -->
<T.PointLight
  position={[grottoCentre.x, DOME_APEX_Y - 1.5, grottoCentre.z]}
  color="#73e8c8"
  intensity={95}
  distance={26}
  decay={2}
/>
<!-- Mirror pool underlight -->
<T.PointLight
  position={[poolCentre.x, WATERLINE_Y + 1.2, poolCentre.z]}
  color="#2e93b8"
  intensity={40}
  distance={14}
  decay={2}
/>
<!-- Drowned gallery bloom + shaft light wells -->
<T.PointLight
  position={[bloom.x, -2.4, bloom.z]}
  color="#5cd8b8"
  intensity={26}
  distance={11}
  decay={2}
/>
{#each shaftLights as entry (entry.id)}
  <T.PointLight
    position={entry.position}
    color="#5aa8c0"
    intensity={30}
    distance={12}
    decay={2}
  />
{/each}
{#each alcoveLightObjects as entry (entry.id)}
  <T is={entry.light} />
{/each}

{#each grottoWater as entry (entry.id)}
  <ReflectivePool
    width={entry.width}
    depth={entry.depth}
    position={[entry.centre[0], entry.surfaceY, entry.centre[1]]}
    deepColor="#0a2c38"
    shallowColor="#2c8394"
    reflectionTint={0x9fbcc2}
    shoreFade={2.6}
    rippleScale={1.25}
    rippleStrength={0.09}
    foamWidth={0.2}
    flowSpeed={0.8}
    waveAmplitudeStart={entry.isChannel ? 0 : 1}
    waveAmplitudeEnd={1}
  />
{/each}

{#each pedestals as pedestal (pedestal.id)}
  <PedestalMesh
    position={pedestal.position}
    height={pedestal.height}
    diameter={pedestal.diameter}
    faceUri={pedestal.faceUri}
    tint={WATER_TINT}
    animated={pedestal.animated}
  />
{/each}

{#each performers as performer (performer.id)}
  <MuseumPerformerStation3D
    stationId={performer.id}
    worldX={performer.worldX}
    worldY={performer.worldY}
    worldZ={performer.worldZ}
    facingAngle={performer.facing}
    sequenceData={performer.sequenceData}
    autoPlay={true}
    active={performer.active}
    showGrid={false}
    showPlatform={false}
    standingSurfaceHeight={0}
  />
{/each}

{#each consoles as station (station.id)}
  <ConsoleMesh
    position={station.position}
    height={station.height}
    footprint={station.footprint}
    verbs={station.verbs}
    engaged={station.engaged}
    awake={station.awake}
    modified={station.modified}
    tint={WATER_TINT}
  />
  <!-- The key-light lift on the performer this console owns. It rises with the
       visitor's approach and never falls below zero: nothing in the room dims
       to make room for it, which is the whole difference between a light in a
       room and an interface overlay. -->
  <T.PointLight
    position={[
      station.keyLight[0],
      station.keyLight[1],
      station.keyLight[2],
    ]}
    color="#cfeff8"
    intensity={22 * station.awake}
    distance={6}
    decay={2}
  />
{/each}

{#each fixtureMeshes as fixture (fixture.id)}
  <T.Mesh
    position={fixture.position}
    rotation={fixture.rotation}
    scale={fixture.scale}
    castShadow
    receiveShadow
  >
    <T.BoxGeometry />
    <T.MeshStandardMaterial
      color={fixture.color}
      emissive={fixture.emissive}
      emissiveIntensity={fixture.kind === "case-screen" ? 0.85 : 0}
      roughness={0.72}
      metalness={0.04}
    />
  </T.Mesh>
{/each}

<!-- Mist over the channel's east end, in line with CCCC and three metres from
     the Fire threshold: the water wing exhaling into the fire wing. -->
<T.Group position={steamPosition}>
  <EmberFountains config={steamPlume} />
</T.Group>

<GltfAsset
  url="/models/museum/cave/drowned-gallery-graybox.glb"
  emissiveBoost={1.1}
  onReady={handleGrayboxReady}
/>

{#if isInitialized && physicsProvider}
  <UnifiedCameraController
    destinationId="drowned-gallery-graybox-walk"
    {avatarState}
    {physicsProvider}
    enabled={true}
    initialYaw={spawn.yaw}
    initialPitch={0}
    externalYaw={reviewYaw}
    externalPitch={reviewPitch}
    allowedModes={[CameraMode.FIRST_PERSON]}
    disableModeToggle={true}
    moveSpeed={3.2}
    sprintMultiplier={1.8}
    gravity={MUSEUM_GRAVITY}
    jumpForce={MUSEUM_JUMP_VELOCITY}
  />
{/if}
