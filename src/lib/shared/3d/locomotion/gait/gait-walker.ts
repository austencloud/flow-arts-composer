/**
 * One walking body for a host that moves it: the host says each frame where
 * the body is, and the body's feet, hips and arms follow from how far it
 * really moved. Hand `driver` to the 3D character's `gait` and it poses the
 * body in the character's own update.
 *
 * The body is put in place here and not through a reactive position: a
 * reactive one is drawn a frame after the camera that follows it, which shows
 * as the body twitching against its own shadow and the camera. Each `put` says
 * how long its move took, so a dropped frame changes how far the body goes and
 * never how fast its legs run.
 */
import { Vector3, type Group, type Object3D } from "three";
import { GaitAnimator, type MoveFrame } from "./gait-animator";
import type { GaitClip, GaitClipSet, GaitSide, MoveName } from "./gait-clips";

/** Moving further than this in one frame is a teleport, not a step (m). */
const TELEPORT = 1;

/**
 * Where the eyes sit in the head, as shares of the head's height (head joint
 * to crown): a little under halfway up, and about 9 cm forward on a grown-up.
 */
const EYE_UP = 0.45;
const EYE_FORWARD = 0.39;

const headAt = new Vector3();
const up = new Vector3();
const ahead = new Vector3();

/** Where the body got to and what it is doing. */
export interface BodyPlace {
  x: number;
  groundY: number;
  z: number;
  yaw: number;
  stopping: boolean;
  crouched?: boolean;
  move?: MoveFrame | null;
  /** How fast it is going up (m/s). */
  lift?: number;
}

export class GaitWalker {
  private animator: GaitAnimator | null = null;
  private body: Object3D | null = null;
  private clips: GaitClipSet | null = null;
  private host: Group | null = null;
  private head: Object3D | null = null;
  private crown: Object3D | null = null;
  private place: BodyPlace = { x: 0, groundY: 0, z: 0, yaw: 0, stopping: false };
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  /** Seconds put in place since the body was last posed. */
  private seconds = 0;
  private fresh = true;

  /** What the character component calls. */
  readonly driver = {
    attach: (root: Object3D): void => {
      this.body = root;
      this.head = this.crown = null;
      root.traverse((part) => {
        if (/Head$/.test(part.name)) this.head = part;
        else if (/HeadTop_End$/.test(part.name)) this.crown = part;
      });
      this.begin();
      this.onBody?.(root);
    },
    detach: (): void => {
      this.body = null;
      this.head = this.crown = null;
      this.animator?.detach();
      this.onBody?.(null);
    },
    update: (delta: number): void => this.update(delta),
  };

  private onBody: ((root: Object3D | null) => void) | null = null;

  /** Hear when the character's body arrives or goes, starting with the body it has now. */
  watchBody(heard: ((root: Object3D | null) => void) | null): void {
    this.onBody = heard;
    if (heard && this.body) heard(this.body);
  }

  /**
   * Where the body's eyes are now, in the world: the head as last posed,
   * standing where the body was last put. Ask after the character's update
   * for this frame's pose. False until the body has a head.
   */
  eyes(out: Vector3): boolean {
    const { head, crown } = this;
    if (!head || !crown) return false;
    crown.updateWorldMatrix(true, false);
    headAt.setFromMatrixPosition(head.matrixWorld);
    up.setFromMatrixPosition(crown.matrixWorld).sub(headAt);
    ahead.set(0, 0, 1).transformDirection(head.matrixWorld);
    out.copy(headAt).addScaledVector(up, EYE_UP).addScaledVector(ahead, EYE_FORWARD * up.length());
    return true;
  }

  /** The clips have arrived. */
  use(clips: GaitClipSet): void {
    this.clips = clips;
    this.begin();
  }

  /** The group the body stands in. */
  mount(host: Group | null): void {
    this.host = host;
    this.fresh = true;
  }

  /** Where the body got to in `dt` seconds. Call once a frame, before the character updates. */
  put(dt: number, place: BodyPlace): void {
    this.seconds += dt;
    this.place = place;
    if (!this.host) return;
    this.host.position.set(place.x, place.groundY, place.z);
    this.host.rotation.y = place.yaw;
  }

  /** What `BodyMoves` asks of the feet before a turn. */
  get scale(): number {
    return this.animator?.scale ?? 1;
  }

  misfit(name: MoveName, at: number, rate: number, mirrored: boolean): number {
    return this.animator?.ready ? this.animator.misfit(name, at, rate, mirrored) : 0;
  }

  /** Whether the body is on a foot, or coming down on it. */
  on(side: GaitSide): boolean {
    return this.animator?.ready ? this.animator.on(side) : false;
  }

  /** How fast the body may turn for its planted feet. */
  turnRoom(way: number, speed: number): number {
    return this.animator?.ready ? this.animator.turnRoom(way, speed) : Infinity;
  }

  /** How far the body should take to stop from a speed, or null with no body to ask. */
  planStop(speed: number): number | null {
    return this.animator?.ready ? this.animator.planStop(speed) : null;
  }

  /** Wave, point, bow: the same one again ends it. */
  gesture(clip: GaitClip, whole: boolean, times: number): void {
    const { animator } = this;
    if (!animator?.ready) return;
    if (animator.gestureClip === clip) animator.endGesture();
    else animator.startGesture(clip, whole, times);
  }

  private begin(): void {
    if (!this.clips || !this.body) return;
    this.animator ??= new GaitAnimator(this.clips);
    if (!this.animator.attach(this.body)) console.warn("[gait] this body has no skeleton the walk knows");
    this.fresh = true;
  }

  private update(delta: number): void {
    const { x, z, yaw, stopping, crouched, move, lift } = this.place;
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    const turned = yaw - this.lastYaw;
    const turn = Math.atan2(Math.sin(turned), Math.cos(turned));
    this.lastX = x;
    this.lastZ = z;
    this.lastYaw = yaw;
    // Not put anywhere this frame, the body stands where it is.
    const dt = this.seconds > 0 ? this.seconds : delta;
    this.seconds = 0;
    if (!this.animator?.ready || dt <= 0) return;
    const moved = Math.hypot(dx, dz);
    if (this.fresh || moved > TELEPORT) {
      this.animator.reset();
      this.fresh = false;
      this.animator.update(dt, { speed: 0, crouched });
      return;
    }
    this.animator.update(dt, { speed: moved / dt, turnRate: turn / dt, stopping, crouched, move, lift });
  }
}
