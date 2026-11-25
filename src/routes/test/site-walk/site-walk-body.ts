/**
 * How the site walk's body answers the keys behind it.
 *
 * The camera controller says where the keys point and how fast; this decides
 * what the body does about it. Four things matter for it to feel direct:
 *
 * - Speed comes up fast and settles (an exponential, about 90% in 0.2 s at a
 *   walk), where a straight ramp spent its first tenth of a second barely
 *   moving and read as lag.
 * - The body turns to the keys and walks where it faces. Steering the
 *   velocity and turning the body after it let a reversal glide backwards for
 *   a quarter second.
 * - A bend builds up and dies away, and goes no faster than the steps in it
 *   can, or the planted feet skate. A start in another direction and a turn
 *   back are recorded turns: while one has the body, it faces and goes as the
 *   recording does.
 * - Letting go slows evenly over the distance the gait asks for, so the last
 *   step lands with the feet together exactly as the body comes to rest.
 *
 * First person keeps the camera's heading and simply eases the velocity.
 */

/** Time constant of the speed's rise at a walk (s): 90% in about 0.2 s. */
export const WALK_RISE_SECONDS = 0.09;
/** And to a run (s): 90% in about 0.35 s. */
export const RUN_RISE_SECONDS = 0.15;
/** Time constant when the keys ask for less speed, as in a turn (s). */
export const SLOW_SECONDS = 0.1;
/** The heading's spring (1/s), its top rate (rad/s, about 570 deg/s) and how fast it gets there (rad/s per s). */
export const TURN_SPRING = 13;
export const TURN_RATE = 10;
export const TURN_RISE = 110;
/** On its feet the body turns no faster than its steps can: at a walk, at a run and crouched (rad/s), and how fast it gets there (rad/s per s). */
export const BEND_WALK = 2.4;
export const BEND_RUN = 4.2;
export const BEND_CROUCH = 2.4;
export const BEND_RISE = 24;
/** A turn cut off by letting go dies away over this time constant (s). */
export const TURN_FADE_SECONDS = 0.07;
/** Speed kept while facing well off the keys: a tight turn, not a pivot. */
export const TURN_SPEED_FLOOR = 0.75;
/** Slowing from a run while the keys still ask for a walk (s). */
export const RUN_DOWN_SECONDS = 0.45;
/** Below this the body counts as standing (m/s). */
export const STANDING_SPEED = 0.05;
/** A stop with no gait to ask: standing after this long (s). */
export const PLAIN_STOP_SECONDS = 0.4;
/** In the air the keys only nudge: how slowly speed follows them (s), what they can bring a jump on the spot to (m/s), and the turn they get. */
export const AIR_SECONDS = 0.5;
export const AIR_SPEED = 1.2;
export const AIR_TURN = 0.3;
/** How quickly a slide or a roll brings the body to its own speed (s), and the turn the keys get in one. */
export const DRIVE_SECONDS = 0.045;
export const DRIVE_TURN = 0.3;
/** A roll turns to the keys at full rate for its first moment (s). */
export const DRIVE_AIM_SECONDS = 0.12;
/** How quickly the body takes up a recorded turn's own way (s). */
export const TURN_FOLLOW_SECONDS = 0.03;

export interface BodyFrame {
  /** What the keys ask for, world m/s on the ground. */
  wantX: number;
  wantZ: number;
  /** The walk speed, so a run can be told from a walk. */
  walkSpeed: number;
  dt: number;
  /** The distance (m) the gait wants to stop in from a speed (m/s). */
  planStop?: (speed: number) => number | null;
  /** How fast the planted feet let the body turn, to its left (1) or right (-1), at a speed (rad/s). */
  turnRoom?: (way: number, speed: number) => number;
  /** First person: face the camera and ease the velocity only. */
  eyeLevel: boolean;
  cameraYaw: number;
  /** Off the floor: the speed is kept, and the keys only nudge it. */
  air?: boolean;
  /** A move carries the body forward this fast (m/s), whatever the keys ask. */
  drive?: number | null;
  /** The move holds the body to the spot. */
  planted?: boolean;
  crouched?: boolean;
  /** A recorded turn has the body: how fast it turns (rad/s), and goes ahead and to its left (m/s). */
  turn?: { spin: number; ahead: number; left: number } | null;
}

export interface BodyOutput {
  /** Ground displacement for this frame, m. */
  moveX: number;
  moveZ: number;
  /** Whether the walk plays. */
  moving: boolean;
  /** Ground speed the walk is played at, m/s. */
  speed: number;
  /** True while the keys are up and the body is coming to rest. */
  stopping: boolean;
}

function wrap(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function ease(current: number, target: number, seconds: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / seconds));
}

export class SiteWalkBody {
  yaw: number;
  speed = 0;
  private vx = 0;
  private vz = 0;
  /** How fast the body is turning (rad/s). */
  private spin = 0;
  /** Even slowing while the keys are up (m/s per s), or null while they are down. */
  private braking: number | null = null;
  /** Seconds in the slide or roll the body is in. */
  private driven = 0;
  /** How fast it goes to its left: only in a recorded turn (m/s). */
  private side = 0;

  constructor(yaw: number) {
    this.yaw = yaw;
  }

  /** A teleport: standing, facing `yaw`. */
  reset(yaw: number): void {
    this.yaw = yaw;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this.spin = 0;
    this.braking = null;
    this.driven = 0;
    this.side = 0;
  }

  step(frame: BodyFrame): BodyOutput {
    const dt = Math.max(0, frame.dt);
    const want = frame.planted ? 0 : Math.hypot(frame.wantX, frame.wantZ);
    const pressed = want > 1e-3;
    const drive = frame.drive ?? null;
    this.driven = drive === null ? 0 : this.driven + dt;

    if (frame.eyeLevel) {
      this.braking = null;
      this.spin = 0;
      this.yaw = frame.cameraYaw;
      if (drive !== null) return this.driveAlong(drive, frame, dt);
      const seconds = frame.air ? AIR_SECONDS : want > frame.walkSpeed * 1.05 ? RUN_RISE_SECONDS : WALK_RISE_SECONDS;
      if (pressed || !frame.air) {
        this.vx = ease(this.vx, frame.planted ? 0 : frame.wantX, pressed ? seconds : SLOW_SECONDS, dt);
        this.vz = ease(this.vz, frame.planted ? 0 : frame.wantZ, pressed ? seconds : SLOW_SECONDS, dt);
      }
      this.speed = Math.hypot(this.vx, this.vz);
      if (!pressed && this.speed < STANDING_SPEED) this.vx = this.vz = this.speed = 0;
      return { moveX: this.vx * dt, moveZ: this.vz * dt, moving: this.speed > 0, speed: this.speed, stopping: false };
    }

    const turn = frame.turn ?? null;
    this.side = ease(this.side, turn?.left ?? 0, TURN_FOLLOW_SECONDS, dt);
    if (turn) {
      this.braking = null;
      this.speed = ease(this.speed, turn.ahead, TURN_FOLLOW_SECONDS, dt);
      const spin = ease(this.spin, turn.spin, TURN_FOLLOW_SECONDS, dt);
      this.yaw = wrap(this.yaw + ((this.spin + spin) / 2) * dt);
      this.spin = spin;
      return this.go(this.speed * dt, dt, false);
    }

    const before = this.speed;
    if (frame.air || drive !== null) {
      this.braking = null;
      const share = drive === null ? AIR_TURN : this.driven < DRIVE_AIM_SECONDS ? 1 : DRIVE_TURN;
      if (pressed) {
        const heading = wrap(Math.atan2(frame.wantX, frame.wantZ) - this.yaw);
        this.turn(heading * share, dt, TURN_RATE, TURN_RISE);
      } else this.fadeTurn(dt);
      if (drive !== null) this.speed = ease(this.speed, drive, DRIVE_SECONDS, dt);
      else if (pressed) {
        const along = (frame.wantX * Math.sin(this.yaw) + frame.wantZ * Math.cos(this.yaw)) / want;
        const top = Math.max(this.speed, Math.min(want, AIR_SPEED));
        this.speed = ease(this.speed, along > 0 ? top * along : 0, AIR_SECONDS, dt);
      }
      return this.go(this.speed * dt, dt, false);
    }
    if (!pressed) this.fadeTurn(dt);
    if (frame.planted) {
      this.braking = null;
      this.speed = ease(this.speed, 0, SLOW_SECONDS / 2, dt);
      return this.go(this.speed * dt, dt, false);
    }
    if (pressed) {
      this.braking = null;
      const heading = Math.atan2(frame.wantX, frame.wantZ);
      const run = Math.max(0, Math.min(1, (this.speed - frame.walkSpeed) / frame.walkSpeed));
      const error = wrap(heading - this.yaw);
      const bend = frame.crouched ? BEND_CROUCH : BEND_WALK + (BEND_RUN - BEND_WALK) * run;
      this.turn(error, dt, Math.min(bend, frame.turnRoom?.(Math.sign(error), this.speed) ?? bend), BEND_RISE);
      const left = wrap(heading - this.yaw);
      const target = want * Math.max(TURN_SPEED_FLOOR, Math.cos(left));
      const running = frame.walkSpeed * 1.05;
      const seconds =
        target < this.speed
          ? this.speed > running && want <= running
            ? RUN_DOWN_SECONDS
            : SLOW_SECONDS
          : want > running
            ? RUN_RISE_SECONDS
            : WALK_RISE_SECONDS;
      this.speed = ease(this.speed, target, seconds, dt);
    } else if (this.speed > 0) {
      if (this.braking === null) {
        const distance = frame.planStop?.(this.speed) ?? (this.speed * PLAIN_STOP_SECONDS) / 2;
        this.braking = distance > 1e-3 ? (this.speed * this.speed) / (2 * distance) : Infinity;
      }
      this.speed = Math.max(0, this.speed - this.braking * dt);
    } else {
      this.braking = null;
    }
    // The ground an even change covers, so a stop ends exactly where it was planned to.
    const pace = this.braking !== null ? (before + this.speed) / 2 : this.speed;
    return this.go(pace * dt, dt, this.braking !== null && pace > 0);
  }

  /** So far along its facing, and whatever is left of a turn's way to the side. */
  private go(ahead: number, dt: number, stopping: boolean): BodyOutput {
    if (Math.abs(this.side) < 1e-3) this.side = 0;
    const left = this.side * dt;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const d = Math.hypot(ahead, left);
    return { moveX: sin * ahead + cos * left, moveZ: cos * ahead - sin * left, moving: d > 0, speed: dt > 0 ? d / dt : 0, stopping };
  }

  /** First person: a slide or a roll goes the way the body was going, or where the camera looks. */
  private driveAlong(drive: number, frame: BodyFrame, dt: number): BodyOutput {
    const speed = Math.hypot(this.vx, this.vz);
    const yaw = this.driven < DRIVE_AIM_SECONDS || speed < 0.2 ? (Math.hypot(frame.wantX, frame.wantZ) > 1e-3 ? Math.atan2(frame.wantX, frame.wantZ) : frame.cameraYaw) : Math.atan2(this.vx, this.vz);
    this.speed = ease(speed, drive, DRIVE_SECONDS, dt);
    this.vx = Math.sin(yaw) * this.speed;
    this.vz = Math.cos(yaw) * this.speed;
    return { moveX: this.vx * dt, moveZ: this.vz * dt, moving: true, speed: this.speed, stopping: false };
  }

  /** A turn nobody asks for any more dies away. */
  private fadeTurn(dt: number): void {
    this.spin *= Math.exp(-dt / TURN_FADE_SECONDS);
    this.yaw = wrap(this.yaw + this.spin * dt);
  }

  /** A critically damped spring onto the heading, eased in and capped. */
  private turn(error: number, dt: number, rate: number, rise: number): void {
    const fade = Math.exp(-TURN_SPRING * dt);
    const pull = this.spin - error * TURN_SPRING;
    let spin = fade * (this.spin - pull * TURN_SPRING * dt);
    const left = fade * (-error + pull * dt);
    const most = Math.min(rate, Math.max(0, this.spin * Math.sign(spin)) + rise * dt);
    let held = Math.abs(spin) > most;
    if (held) spin = Math.sign(spin) * most;
    // Asked the other way, the turn it is in dies away first.
    const swing = spin - this.spin;
    if (spin * this.spin < 0 && Math.abs(swing) > 3 * rise * dt) {
      spin = this.spin + Math.sign(swing) * 3 * rise * dt;
      held = true;
    }
    this.yaw = wrap(this.yaw + (held ? ((this.spin + spin) / 2) * dt : error + left));
    this.spin = spin;
  }
}
