<script lang="ts">
  /**
   * Everyone at the jam: fire spinners inside the rope, LED spinners out at
   * the edge, watchers along the rope, the safety people in their chairs and
   * the DJ. Who is out follows the night curve; the fire spinners light at the
   * flame on the way in and walk straight to their own spot; watchers and
   * performers turn to a player who has been flowing a while, and one
   * performer comes over to mirror them.
   *
   * Every performer is mounted from the start, hidden and held still until the
   * night brings them out, so nobody loads or pops in mid-scene. Watchers,
   * the seated safety people and the DJ are real character models posed by a
   * few shared skeletons (flow-fest-jam-crowd.ts) rather than a full rig each.
   */
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { Color, PointLight, Vector3, type Group, type MeshBasicMaterial, type PerspectiveCamera } from "three";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import { SEATED_AUDIENCE_ANIMATION_URLS } from "#lib/shared/3d/config/seated-audience-assets.js";
  import { getAvatarModelPath, propFinishState } from "@austencloud/scene-3d";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    insidePolygon,
    type FlowFestJamLayout,
    type JamOutsideSpinner,
    type JamPerformer,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
  import {
    JAM_LIGHT_UP_SECONDS,
    createJamEntrant,
    createJamWanderer,
    jamDuetSpot,
    jamFireIds,
    jamOutsideOpenYaw,
    jamOutsideSpinnersOut,
    jamOutsideSpot,
    jamPerformersInside,
    jamSpinnerFacing,
    jamWatcherFacing,
    stepJamWanderers,
    type JamWanderer,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.js";
  import {
    createFlowFestPlaceholderPool,
    flowFestSequenceForPerformer,
    type FlowFestPerformerSequencePool,
  } from "../flow-fest-sim/flow-fest-performer-sequences";
  import {
    buildFireGroundGlow,
    facingFromYaw,
    facingToward,
    JAM_HUMAN_AVATARS,
    jamAvatarFor,
    jamFireProp,
    jamPropType,
    type JamFireProp,
    jamSequencePool,
    turnToward,
  } from "./flow-fest-jam-people";
  import { JamCrowd } from "./flow-fest-jam-crowd";
  import { CAMP_CHAIR_SEAT_TOP } from "./flow-fest-jam-meshes";

  export interface JamPeopleStats {
    insidePerformers: number;
    litFires: number;
    outsideSpinners: number;
    outsideSpinnersShown: number;
    /** The cap on outside spinners right now, after the frame-time adjustment. */
    outsideCapNow: number;
    watchers: number;
    seated: number;
    /** Performers posing every frame; the crowd shares skeletons and is not counted. */
    liveRigs: number;
    /** Performers inside within 6 m of the entrance; a few at most once the night is going. */
    nearEntrance: number;
  }

  export interface JamPlayerView {
    x: number;
    z: number;
    present: boolean;
    flowing: boolean;
  }

  interface Props {
    layout: FlowFestJamLayout;
    ground: (x: number, z: number) => number;
    inside: number;
    watching: number;
    ropeGlow: number;
    /** The festival clock; the DJ plays until the booth's hour. */
    hour: number;
    player: JamPlayerView;
    notice: number;
    duet: boolean;
    /** Bumped each time a duet starts so both routines restart together. */
    duetSync: number;
    /** Most outside spinners shown; furthest from the camera go first, and fewer while frames run long. */
    outsideCap?: number;
    /** False while the scene is still loading; frame times then say nothing about steady cost. */
    settled?: boolean;
    /** Real point lights on the fires nearest the camera. */
    fireLightCount?: number;
    onSequencePool?: (pool: FlowFestPerformerSequencePool) => void;
    onStats?: (stats: JamPeopleStats) => void;
    /** Where the lit fire props are, for the fire's sound. */
    onFires?: (points: { x: number; y: number; z: number }[]) => void;
    /**
     * Behind the loading screen: every performer's effects are mounted so
     * their shaders compile before anyone sees the jam.
     */
    compiling?: boolean;
    /** Each person who has loaded and is posed (names: jamCastPieces). */
    onPiece?: (name: string) => void;
  }

  const props: Props = $props();
  const { camera } = useThrelte();
  const layout = props.layout;
  const ring = layout.boundary;

  let sequencePool = $state<FlowFestPerformerSequencePool>(createFlowFestPlaceholderPool());
  onMount(() => {
    let cancelled = false;
    void jamSequencePool()
      .then((pool) => {
        if (cancelled) return;
        sequencePool = pool;
        props.onSequencePool?.(pool);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        poolSettled = true;
        props.onPiece?.("sequences");
      });
    return () => {
      cancelled = true;
    };
  });

  // ---------------------------------------------------------------- plans

  /**
   * A rig plans its props' contact (which beats to displace, how the chest
   * turns) the first frame it poses, half a second or so in one go. Nobody is
   * in the circle when the jam opens, so each performer would pay that on
   * screen as they walk on. Instead each rig poses for a few frames behind
   * the loading screen, one at a time as soon as its motion and the real
   * sequences are in; the plan is cached and showing it later costs nothing.
   * Three frames, because the first live pose also measures the arms and the
   * plan is redone once against them.
   */
  const PLAN_FRAMES = 3;
  let poolSettled = false;
  const motionReady: string[] = [];
  const planned = new Set<string>();
  let warming = $state<string | null>(null);
  let warmFrames = 0;

  function motionIn(id: string): void {
    motionReady.push(id);
    props.onPiece?.(`performer-motion:${id}`);
  }

  function warmPlans(): void {
    if (!poolSettled) return;
    if (warming) {
      if (++warmFrames < PLAN_FRAMES) return;
      planned.add(warming);
      props.onPiece?.(`plan:${warming}`);
      warming = null;
    }
    const next = motionReady.find((id) => !planned.has(id));
    if (next) {
      warming = next;
      warmFrames = 0;
    }
  }

  // ---------------------------------------------------------------- inside

  /**
   * Where a performer stands and faces. Plain data written straight onto the
   * wrapper group each frame: as reactive state it went through Svelte for
   * every rig on every update, about a tenth of the frame.
   */
  interface Place {
    x: number;
    y: number;
    z: number;
    facing: number;
  }
  const places = new Map<string, Place>();
  const movers = new Map<string, Group>();
  /** The rig itself stands at the origin; its wrapper group carries it. */
  const RIG_ORIGIN = { x: 0, y: 0, z: 0 };

  function placeAt(id: string, x: number, y: number, z: number, facing: number): void {
    const p = places.get(id);
    if (p) {
      p.x = x;
      p.y = y;
      p.z = z;
      p.facing = facing;
    } else places.set(id, { x, y, z, facing });
    const group = movers.get(id);
    if (group) {
      group.position.set(x, y, z);
      group.rotation.y = facing;
    }
  }

  function mover(id: string): (group: Group) => void {
    return (group) => {
      skipMatricesWhileHidden(group);
      movers.set(id, group);
      const p = places.get(id)!;
      placeAt(id, p.x, p.y, p.z, p.facing);
    };
  }

  interface InsideView {
    id: string;
    performer: JamPerformer;
    /** The fire model they hold, and whether there is one to light. */
    fire: JamFireProp;
    lit: boolean;
    duet: boolean;
    shown: boolean;
  }

  // Everyone is mounted from the start at their own spot, hidden until they come in.
  const insideViews = $state<InsideView[]>(
    layout.performers.map((performer) => {
      placeAt(
        performer.id,
        performer.start.x,
        props.ground(performer.start.x, performer.start.z),
        performer.start.z,
        facingToward(layout.centre, performer.start),
      );
      return {
        id: performer.id,
        performer,
        fire: jamFireProp(performer.prop, performer.juggler, propFinishState.build),
        lit: false,
        duet: false,
        shown: false,
      };
    }),
  );
  const burnsById = new Map(insideViews.map((view) => [view.id, view.fire.burns]));
  const canBurn = (performer: JamPerformer) => burnsById.get(performer.id) ?? false;
  const wanderers = new Map<string, JamWanderer>();
  const enteredAt = new Map<string, number>();
  let clock = 0;
  let populated = false;
  let duetId: string | null = null;
  let litCount = 0;
  /**
   * Fire spinners burning at once. The layout allows more, but each burning
   * pair of props brings its own trails, glow and smoke, and past eight the
   * jam drops well below 60 fps. Eight burning while the rest wait at the
   * dip station or rest between burns is also what a busy jam looks like.
   */
  const FIRE_AT_ONCE = 8;

  function syncInside(): JamPerformer[] {
    const want = jamPerformersInside(layout, props.inside);
    const wantIds = new Set(want.map((p) => p.id));
    for (const id of [...wanderers.keys()]) {
      if (!wantIds.has(id)) {
        wanderers.delete(id);
        enteredAt.delete(id);
      }
    }
    for (const performer of want) {
      if (wanderers.has(performer.id)) continue;
      // Whoever is already in when the scene starts is already at their spot,
      // lit and spinning; after that, each newcomer lights at the flame and
      // walks straight to their spot.
      const w = populated ? createJamEntrant(performer, layout.entrance.flame) : createJamWanderer(performer);
      wanderers.set(performer.id, w);
      enteredAt.set(performer.id, populated ? clock : -JAM_LIGHT_UP_SECONDS);
      placeAt(
        performer.id,
        w.x,
        props.ground(w.x, w.z),
        w.z,
        populated ? facingToward(w, w.home) : jamSpinnerFacing(w, layout.centre, clock),
      );
    }
    populated = true;
    return want;
  }

  // ---------------------------------------------------------------- outside

  interface OutsideView {
    id: string;
    spinner: JamOutsideSpinner;
    openYaw: number;
    shown: boolean;
  }
  const outsideViews = $state<OutsideView[]>(
    layout.outsideSpinners.map((spinner) => {
      const openYaw = jamOutsideOpenYaw(spinner, layout.obstacles);
      placeAt(spinner.id, spinner.x, props.ground(spinner.x, spinner.z), spinner.z, facingFromYaw(openYaw));
      return {
        id: spinner.id,
        spinner,
        openYaw,
        shown: false,
      };
    }),
  );
  let outsideOut = 0;
  let outsideShownCount = 0;

  /**
   * Every performer is mounted from the start and hidden until needed. Three
   * still walks a hidden subtree when it updates matrices, and a rig is a
   * hundred-odd objects, so a hidden wrapper skips that walk. Showing it
   * again picks up wherever it was moved meanwhile.
   */
  function skipMatricesWhileHidden(group: Group): void {
    const update = group.updateMatrixWorld.bind(group);
    group.updateMatrixWorld = (force?: boolean) => {
      if (group.visible) update(force);
    };
  }

  // ---------------------------------------------------------------- crowd

  const crowd = new JamCrowd();
  const watcherSlots = [...layout.spectators].sort((a, b) => a.order - b.order);
  const watcherKind = (id: string) => `standing:${jamAvatarFor(id)}`;
  const watcherFacingBase = watcherSlots.map((slot) => facingFromYaw(slot.yaw));
  let watcherCount = 0;
  let lastNotice = 0;

  // The same everyday people as the rest of the jam; the museum audience's
  // cast includes a goblin, a zombie and a suit of armour.
  const seated = layout.stations
    .filter((s) => s.occupied)
    .map((s, i) => {
      const id = JAM_HUMAN_AVATARS[(i * 4) % JAM_HUMAN_AVATARS.length]!;
      return { station: s, kind: `seated:${id}`, modelUrl: getAvatarModelPath(id) };
    });

  /**
   * Where the pelvis sits on the camp chair, chair-local metres along its
   * facing: just in front of the backrest's foot, so the back rests on it.
   */
  const CHAIR_HIPS_X = -0.1;

  const booth = layout.djBooth;
  const djX = booth.x - Math.cos(booth.yaw) * 0.75;
  const djZ = booth.z - Math.sin(booth.yaw) * 0.75;
  const djGround = props.ground(djX, djZ);
  const djFacing = facingFromYaw(booth.yaw);
  let djBaseY = djGround;

  function hash01(id: string, salt: number): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  }

  async function buildCrowd(): Promise<void> {
    // Every kind starts loading at once; the shared loaders dedupe the URLs.
    const standingKinds = new Set([...watcherSlots.map((s) => watcherKind(s.id)), `standing:${jamAvatarFor("dj")}`]);
    const kinds: Promise<unknown>[] = [];
    for (const key of standingKinds) {
      kinds.push(crowd.addKind(key, getAvatarModelPath(key.slice("standing:".length)), "standing", undefined, 2));
    }
    for (const s of seated) {
      kinds.push(crowd.addKind(s.kind, s.modelUrl, "seated", SEATED_AUDIENCE_ANIMATION_URLS[0], 1, CAMP_CHAIR_SEAT_TOP));
    }
    await Promise.allSettled(kinds);

    await Promise.all(
      watcherSlots.map(async (slot, i) => {
        const key = watcherKind(slot.id);
        const m = await crowd.measure(key);
        const scale = 0.96 + hash01(slot.id, 3) * 0.08;
        await crowd.place(
          slot.id,
          key,
          {
            x: slot.x,
            y: props.ground(slot.x, slot.z) - m.minY * scale,
            z: slot.z,
            rotationY: watcherFacingBase[i]!,
            scale,
            tint: hash01(slot.id, 7),
          },
          Math.floor(hash01(slot.id, 11) * 2),
        );
        crowd.setVisible(slot.id, i < watcherCount);
        props.onPiece?.(`watcher:${slot.id}`);
      }),
    );

    await Promise.all(
      seated.map(async ({ station, kind }) => {
        const m = await crowd.measure(kind);
        // The chair faces +x in its own frame; the figure faces +z in its own.
        // Both resolve to (cos yaw, sin yaw) in the world.
        const dx = Math.cos(station.yaw);
        const dz = Math.sin(station.yaw);
        const back = CHAIR_HIPS_X - m.hipsForward;
        await crowd.place(station.id, kind, {
          x: station.x + dx * back,
          y: props.ground(station.x, station.z) + CAMP_CHAIR_SEAT_TOP - m.seatY,
          z: station.z + dz * back,
          rotationY: facingFromYaw(station.yaw),
          tint: hash01(station.id, 7),
        });
        props.onPiece?.(`seated:${station.id}`);
      }),
    );

    const djKey = `standing:${jamAvatarFor("dj")}`;
    const dm = await crowd.measure(djKey);
    djBaseY = djGround - dm.minY;
    await crowd.place("dj", djKey, { x: djX, y: djBaseY, z: djZ, rotationY: djFacing, tint: 0.2 });
    props.onPiece?.("dj");
  }

  onMount(() => {
    void buildCrowd().catch((error) => console.error("[jam] crowd failed", error));
  });

  // ---------------------------------------------------------------- fire light

  const fireLightCount = props.fireLightCount ?? 4;
  const fireLights = Array.from({ length: fireLightCount }, () => {
    const light = new PointLight(new Color(1.0, 0.55, 0.22), 0, 9, 2);
    light.castShadow = false;
    return light;
  });
  const glow = buildFireGroundGlow(layout.performers.length + 2);
  const cameraPosition = new Vector3();
  const scratch = new Vector3();

  // ---------------------------------------------------------------- frame

  let refresh = 0;
  let statsClock = 0;
  const SUBSTEP = 1 / 20;

  /**
   * The outside spinners are the furthest live rigs, so they are what gives
   * when frames run long. With vsync a frame takes 16.7 ms or 33 ms, so what
   * matters is the share of frames that miss their slot, not the average: a
   * 19 ms average is already one frame in eight dropped. After two seconds
   * with more than 2% missed, two spinners go, never below two. Headroom
   * cannot be measured, so one comes back after a long run with almost no
   * misses, and the wait doubles each time that brought the misses back.
   */
  const MIN_OUTSIDE = 2;
  let capNow = Infinity;
  /** Share of recent frames over 20 ms, averaged over about a second. */
  let missed = 0;
  let slowFor = 0;
  let steadyFor = 0;
  let raiseAfter = 20;
  let raisedLast = false;

  function adaptOutsideCap(delta: number, maxCap: number): void {
    if (capNow > maxCap) capNow = maxCap;
    // Ignore stalls (loading, a hidden tab); they say nothing about steady cost.
    if (delta <= 0 || delta > 0.25) return;
    missed += ((delta * 1000 > 20 ? 1 : 0) - missed) * 0.02;
    if (missed > 0.02) {
      slowFor += delta;
      steadyFor = 0;
    } else {
      slowFor = 0;
      if (missed < 0.005) steadyFor += delta;
    }
    if (slowFor > 2 && capNow > MIN_OUTSIDE) {
      capNow = Math.max(MIN_OUTSIDE, capNow - 2);
      if (raisedLast) raiseAfter = Math.min(240, raiseAfter * 2);
      raisedLast = false;
      slowFor = 0;
      missed = 0;
    } else if (steadyFor > raiseAfter && capNow < maxCap) {
      capNow += 1;
      raisedLast = true;
      steadyFor = 0;
    }
  }

  useTask((delta) => {
    // A slow frame still moves the jam on by the time that passed, in steps
    // small enough for the wander's steering; a stall over a second is dropped.
    const elapsed = Math.min(Math.max(delta, 0), 1);
    clock += elapsed;
    crowd.update(elapsed);
    warmPlans();
    if (props.settled !== false) adaptOutsideCap(delta, props.outsideCap ?? layout.outsideSpinners.length);
    const cam = camera.current as PerspectiveCamera;
    cameraPosition.copy(cam.position);

    const insideList = syncInside();

    // The duet: the nearest performer to a player who has flowed long enough
    // walks over to a spot beside them.
    const player = props.player;
    if (props.duet && player.present && player.flowing) {
      if (!duetId) {
        let best: string | null = null;
        let bestDistance = Infinity;
        for (const w of wanderers.values()) {
          const d = Math.hypot(w.x - player.x, w.z - player.z);
          if (d < bestDistance) {
            bestDistance = d;
            best = w.id;
          }
        }
        duetId = best;
      }
      const w = duetId ? wanderers.get(duetId) : undefined;
      if (w) w.hold = jamDuetSpot(player, layout.centre, ring);
    } else if (duetId) {
      const w = wanderers.get(duetId);
      if (w) w.hold = null;
      duetId = null;
    }

    const playerInside = player.present && insidePolygon(player, ring);
    const list = [...wanderers.values()];
    const context = { boundary: ring, centre: layout.centre, extraBodies: playerInside ? [player] : [] };
    for (let left = elapsed; left > 1e-6; left -= SUBSTEP) stepJamWanderers(list, Math.min(SUBSTEP, left), context);

    refresh += elapsed;
    if (refresh < 1 / 30) return;
    const step = refresh;
    refresh = 0;

    // Inside: positions, facing, fire.
    const fire = jamFireIds(insideList, props.ropeGlow, Math.min(FIRE_AT_ONCE, layout.light.maxFireAtOnce), canBurn);
    const firePoints: { x: number; y: number; z: number; d: number }[] = [];
    for (const view of insideViews) {
      const w = wanderers.get(view.id);
      if (!w) {
        if (view.shown) view.shown = false;
        if (view.lit) view.lit = false;
        continue;
      }
      const y = props.ground(w.x, w.z);
      const isDuet = view.id === duetId;
      let target = jamSpinnerFacing(w, layout.centre, clock);
      if (isDuet) target = facingToward(w, player);
      else if (props.notice > 0.05 && player.present) {
        target = jamWatcherFacing(w, target, player, props.notice, layout.interaction.noticeRadiusMeters);
      }
      // Spinners turn slowly; someone walking in turns at a walker's rate.
      const rate = w.approaching || isDuet ? 2.4 : 0.6;
      placeAt(view.id, w.x, y, w.z, turnToward(places.get(view.id)!.facing, target, step * rate));
      if (view.duet !== isDuet) view.duet = isDuet;
      if (!view.shown) view.shown = true;
      const lightUpDone = clock - (enteredAt.get(view.id) ?? 0) >= JAM_LIGHT_UP_SECONDS * 0.6;
      const lit = fire.has(view.id) && lightUpDone;
      if (view.lit !== lit) view.lit = lit;
      if (lit) firePoints.push({ x: w.x, y, z: w.z, d: cameraPosition.distanceToSquared(scratch.set(w.x, y, w.z)) });
    }
    litCount = firePoints.length;
    props.onFires?.(firePoints);

    // Fire light: real lights on the nearest few, a ground glow under all.
    firePoints.sort((a, b) => a.d - b.d);
    for (let i = 0; i < fireLights.length; i++) {
      const light = fireLights[i]!;
      const p = firePoints[i];
      if (!p) {
        light.intensity = 0;
        continue;
      }
      const flicker = 0.82 + 0.12 * Math.sin(clock * 11 + i * 2.1) + 0.06 * Math.sin(clock * 27 + i * 5.3);
      light.position.set(p.x, p.y + 1.25, p.z);
      light.intensity = 7.5 * flicker * Math.min(1, props.ropeGlow * 1.4);
    }
    const night = Math.min(1, props.ropeGlow * 1.4);
    glow.mesh.count = firePoints.length;
    firePoints.forEach((p, i) => {
      const flicker = 0.85 + 0.15 * Math.sin(clock * 9 + i * 1.7);
      const r = 2.6 * flicker;
      glow.matrix.makeScale(r, 1, r).setPosition(p.x, props.ground(p.x, p.z) + 0.05, p.z);
      glow.mesh.setMatrixAt(i, glow.matrix);
    });
    glow.mesh.instanceMatrix.needsUpdate = true;
    (glow.mesh.material as MeshBasicMaterial).color.setRGB(0.42 * night, 0.19 * night, 0.06 * night);

    // Outside: everyone out by the night curve, nearest the camera kept under
    // the cap, with a few metres' grace so the edge does not flicker in and out.
    const out = jamOutsideSpinnersOut(layout, props.inside);
    outsideOut = out.length;
    const outIds = new Set(out.map((s) => s.id));
    const cap = Math.min(capNow, props.outsideCap ?? layout.outsideSpinners.length);
    const ranked = outsideViews
      .filter((v) => outIds.has(v.id))
      .map((v) => {
        const p = places.get(v.id)!;
        return { v, d: Math.hypot(p.x - cameraPosition.x, p.z - cameraPosition.z) - (v.shown ? 3 : 0) };
      })
      .sort((a, b) => a.d - b.d);
    const showIds = new Set(ranked.slice(0, cap).map((r) => r.v.id));
    outsideShownCount = 0;
    for (const view of outsideViews) {
      const shown = showIds.has(view.id);
      if (view.shown !== shown) view.shown = shown;
      if (!shown) continue;
      outsideShownCount++;
      const spot = jamOutsideSpot(view.spinner, clock);
      let facing = facingFromYaw(view.openYaw + (spot.yaw - view.spinner.yaw));
      if (props.notice > 0.05 && player.present) {
        facing = jamWatcherFacing(spot, facing, player, props.notice, layout.interaction.noticeRadiusMeters);
      }
      placeAt(view.id, spot.x, props.ground(spot.x, spot.z), spot.z, facing);
    }

    // Watchers: slots fill in order.
    const filled = Math.round(Math.max(0, Math.min(1, props.watching)) * watcherSlots.length);
    if (filled !== watcherCount) {
      for (let i = 0; i < watcherSlots.length; i++) crowd.setVisible(watcherSlots[i]!.id, i < filled);
      watcherCount = filled;
    }
    const noticing = props.notice > 0.05 && player.present;
    if (noticing || lastNotice > 0) {
      for (let i = 0; i < filled; i++) {
        const slot = watcherSlots[i]!;
        const base = watcherFacingBase[i]!;
        const facing = noticing ? jamWatcherFacing(slot, base, player, props.notice, layout.interaction.noticeRadiusMeters) : base;
        crowd.turn(slot.id, facing);
      }
    }
    lastNotice = noticing ? props.notice : 0;

    // The DJ sways a little while the booth is open; there is no music to keep time with.
    const playing = props.hour < booth.untilHour && props.ropeGlow > 0.05;
    crowd.turn("dj", djFacing + (playing ? 0.08 * Math.sin(clock * 0.9) : 0));
    crowd.lift("dj", djBaseY + (playing ? 0.012 * Math.sin(clock * 1.7) : 0));

    statsClock += step;
    if (statsClock > 1) {
      statsClock = 0;
      const insideShown = insideViews.filter((v) => v.shown).length;
      props.onStats?.({
        insidePerformers: insideShown,
        litFires: litCount,
        outsideSpinners: outsideOut,
        outsideSpinnersShown: outsideShownCount,
        outsideCapNow: Math.min(capNow, props.outsideCap ?? layout.outsideSpinners.length),
        watchers: watcherCount,
        seated: seated.length,
        liveRigs: insideShown + outsideShownCount,
        nearEntrance: list.filter((w) => Math.hypot(w.x - layout.entrance.x, w.z - layout.entrance.z) < 6).length,
      });
    }
  });

  onDestroy(() => {
    crowd.dispose();
    glow.mesh.geometry.dispose();
    (glow.mesh.material as { dispose(): void }).dispose();
  });

  function sequenceFor(id: string): SequenceData {
    return flowFestSequenceForPerformer(sequencePool, id);
  }
</script>

{#each fireLights as light, i (i)}
  <T is={light} />
{/each}
<T is={glow.mesh} />
<T is={crowd.group} />

{#each insideViews as view (view.id)}
  <T.Group visible={view.shown} oncreate={mover(view.id)}>
    <LiveSequencePerformer3D
      id={`ffj-${view.id}`}
      position={RIG_ORIGIN}
      facingAngle={0}
      characterId={jamAvatarFor(view.id)}
      propType={view.fire.propType}
      propBuild={view.fire.propBuild ? { ...propFinishState.build, ...view.fire.propBuild } : undefined}
      sequence={view.duet ? sequencePool.loops[0] ?? sequenceFor(view.id) : sequenceFor(view.id)}
      effectId="fire"
      contactMode="legacy"
      effectQualityTier="low"
      showEffects={view.lit || props.compiling}
      posePlayback={view.shown || warming === view.id ? "live" : "captured"}
      phaseOffsetSteps={view.duet ? props.duetSync * 64 : (view.performer.seeds[1] * 8)}
      playbackSpeed={view.duet ? 1 : 0.9 + view.performer.seeds[2] * 0.2}
      active={view.shown}
      onReady={() => props.onPiece?.(`performer:${view.id}`)}
      onMotionReady={() => motionIn(view.id)}
    />
  </T.Group>
{/each}

{#each outsideViews as view (view.id)}
  <T.Group visible={view.shown} oncreate={mover(view.id)}>
    <LiveSequencePerformer3D
      id={`ffj-${view.id}`}
      position={RIG_ORIGIN}
      facingAngle={0}
      characterId={jamAvatarFor(view.id)}
      propType={jamPropType(view.spinner.prop, view.spinner.juggler)}
      sequence={sequenceFor(view.id)}
      effectId="led"
      contactMode="legacy"
      effectQualityTier="low"
      showEffects={(view.shown && props.ropeGlow > 0.2) || props.compiling}
      posePlayback={view.shown || warming === view.id ? "live" : "captured"}
      phaseOffsetSteps={(view.id.length * 1.7) % 8}
      playbackSpeed={0.95}
      active={view.shown}
      onReady={() => props.onPiece?.(`performer:${view.id}`)}
      onMotionReady={() => motionIn(view.id)}
    />
  </T.Group>
{/each}
