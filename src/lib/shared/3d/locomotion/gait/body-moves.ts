/**
 * What the body is doing besides walking: jumping, falling, landing, crouching,
 * sliding, rolling, turning about. It says which move plays and where in it the body is, and
 * what that asks of the body's travel. It draws nothing and moves nothing.
 *
 * A crouch is the player's: only the crouch key, or no room to stand, ends it.
 * A jump, a roll or a fall stands the body up while it lasts and gives the
 * crouch back after; the run key in a crouch is a crouched run.
 *
 * A key is answered on the frame it is pressed. The jump clip's long wind-up is
 * cut to what shows as a dip and a push; on the move there is no wait to speak
 * of. A jump asked for a moment too early or too late still happens.
 */
import type { MoveFrame } from "./gait-animator";
import { within, type GaitClip, type GaitSide, type MoveName, type TurnName } from "./gait-clips";
import { sampleTravel, sampleWay } from "./gait-pose";

export const GRAVITY = 9.81;
/** Upward speed at the push (m/s): about 0.45 m high, 0.6 s in the air, the same as the recorded jump. */
export const JUMP_SPEED = 3;
const AIR_SECONDS = (2 * JUMP_SPEED) / GRAVITY;
/** A jump pressed this long before the ground still counts (s), and this long after leaving it. */
const JUMP_EARLY = 0.14;
const JUMP_LATE = 0.1;
/** Off the ground this long without a jump is a fall (s): longer than off a step or a kerb. */
const LEDGE = 0.16;
/** The push before leaving the floor (s), and how much of the clip it shows (s). */
const PUSH = { still: { seconds: 0.12, shows: 0.28 }, moving: { seconds: 0.034, shows: 0.034 } };
/** Below this a jump is on the spot (m/s). */
const STILL = 0.6;
/** A jump that has not met the ground by its end turns into a fall after this (s). */
const OVERTIME = 0.06;
/** Meeting the ground faster than this is a hard landing (m/s): a drop of about 1.3 m. */
const HARD = 5;
/** On the move, walking takes over from a landing after this long (s); standing, the keys can after the other. */
const LAND_MOVING = 0.1;
const LAND_FREE = 0.08;
/** A hard landing on the move, until running again; on the spot, until the keys answer. */
const HARD_MOVING = 0.34;
const HARD_FREE = 0.42;
/** A slide needs a run (m/s). */
export const SLIDE_SPEED = 2.2;
/** Where in the clips the slide and the rolls start, can be left, and hand back. */
const SLIDE = { from: 0.02, free: 0.5, done: 0.82, low: [0.06, 0.66], rate: 1.1, start: 0.5, end: 1 } as const;
const ROLL = { from: 0.02, free: 0.72, done: 0.82, low: [0.06, 0.62], rate: 1.05, start: 0.62, end: 0.85 } as const;
const ROLL_STAND = { from: 0.16, free: 0.66, done: 0.78, low: [0.2, 0.6], rate: 1.5, start: 0.8, end: 0.8 } as const;
/** A turn on the spot is for more than this (rad), the turn about for more than that, on the spot and on the move. */
const TURN_STAND = 0.7;
const TURN_ABOUT = 1.9;
const TURN_BACK = 2.2;
/** Below this a turn starts from standing; above the other it starts from a run (m/s). */
const TURN_STILL = 0.5;
const TURN_RUNNING = 2.2;
/** Past this a turn about may go either way round, whichever suits the feet (rad). */
const EITHER_WAY = 2.6;
/** A turn back waits this long for a step that suits it (s). */
const TURN_WAIT = 0.2;
/** What coming into one on the wrong foot counts as (m squared). */
const TURN_WRONG_FOOT = 0.5;
/** How far a turn may be stretched or shrunk to the angle asked for. */
const TURN_WARP = [0.3, 1.45] as const;
/** After a turn, what is left of it is walked (s). */
const TURN_AFTER = 0.3;
/** Where each turn can be come into, where walking takes over with the keys held and with them let go, and its pace. */
const TURNS: Record<TurnName, Turn> = {
  turnStand: { from: [0, 0.06], done: 0.64, rest: 1, rate: 1.5 },
  turnWalk: { from: [0, 0.06], done: 0.86, rest: 0.8, rate: 1.35 },
  turnRun: { from: [0.06, 0.3], done: 0.9, rest: 0.9, rate: 1.05 },
  turnCrouch: { from: [0, 0.1], done: 0.9, rest: 1, rate: 1.5 },
};
/** A driven move that has been stopped by something solid for this long ends (s). */
const BLOCKED = 0.15;

export interface MoveInput {
  dt: number;
  /** The body stands on something. */
  grounded: boolean;
  /** Ground speed (m/s). */
  speed: number;
  /** Upward speed before the ground is taken into account (m/s). */
  rise: number;
  /** A walk key is held, and the run key with it. */
  wantsMove: boolean;
  sprinting: boolean;
  /** Pressed since the last step. */
  jump: boolean;
  crouch: boolean;
  roll: boolean;
  /** Whether there is room to stand up here. */
  room: () => boolean;
  /** Where the keys point, in the world. */
  wantX?: number;
  wantZ?: number;
  /** Which way the body faces, or null where it faces the camera and never turns on its own. */
  yaw?: number | null;
  /** The feet a turn has to suit. */
  feet?: TurnFeet | null;
}

/** What the gait can say about a turn before it is begun. */
export interface TurnFeet {
  /** This body's size against the clips' own. */
  readonly scale: number;
  /** How far a move's feet are from where the feet are now, their speeds counted in (m squared). */
  misfit(name: MoveName, at: number, rate: number, mirrored: boolean): number;
  /** Whether the body is on a foot, or with both off the floor, coming down on it. */
  on(side: GaitSide): boolean;
}

/** What a turn asks of the body: how fast it turns (rad/s), and goes ahead and to its left (m/s). */
export interface TurnDrive {
  spin: number;
  ahead: number;
  left: number;
}

export interface MoveOutput {
  /** Leave the floor now, at this upward speed (m/s). */
  launch: number | null;
  /** How fast the move carries the body forward (m/s), or null where the keys decide. */
  drive: number | null;
  /** The body keeps its speed: the keys only nudge it. */
  air: boolean;
  /** The body stays where it is. */
  planted: boolean;
  crouched: boolean;
  /** Lower than a crouch: sliding or rolling. */
  low: boolean;
  /** A turn has the body: it faces and goes as this says. */
  turn: TurnDrive | null;
  move: MoveFrame | null;
}

type State = "ground" | "push" | "jump" | "fall" | "land" | "hardLand" | "slide" | "roll" | "turn";
type Driven = typeof SLIDE | typeof ROLL | typeof ROLL_STAND;

interface Turn {
  from: readonly [number, number];
  done: number;
  rest: number;
  rate: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class BodyMoves {
  state: State = "ground";
  /** The crouch asked for, kept while a move stands the body up. */
  crouched = false;
  private serials = 0;
  private move: MoveFrame | null = null;
  /** Seconds in this state, off the ground, since a jump was pressed, held up by something solid. */
  private time = 0;
  private off = 0;
  private asked = 0;
  private blocked = 0;
  private driven: Driven = SLIDE;
  private entry = 1;
  /** The way round a turn goes (1 to the left), how much it is stretched, the size of the body, and seconds waited for a step. */
  private side = 1;
  private warp = 1;
  private size = 1;
  private waited = 0;
  private turnFrom = 0;
  /** Seconds until another turn may start. */
  private turned = 0;
  private readonly wayA = { yaw: 0, x: 0, z: 0 };
  private readonly wayB = { yaw: 0, x: 0, z: 0 };
  /** A push plays slower toward its end: to this rate, at this pace. */
  private pushEnd = 1;
  private pushSlows = 0;

  constructor(private readonly clips: Record<MoveName, GaitClip>) {}

  /** A teleport: standing up, doing nothing. */
  reset(): void {
    this.enter("ground");
    this.crouched = false;
    this.move = null;
    this.off = this.asked = this.waited = this.turned = 0;
  }

  step(input: MoveInput): MoveOutput {
    const { dt, grounded } = input;
    this.asked = input.jump ? JUMP_EARLY : Math.max(0, this.asked - dt);
    this.off = grounded ? 0 : this.off + dt;
    this.time += dt;
    this.turned = Math.max(0, this.turned - dt);
    let launch: number | null = null;
    // In the air or low on the floor, the crouch key says how to come up.
    if (input.crouch && !this.upright) this.crouched = !this.crouched;
    switch (this.state) {
      case "ground":
        this.onGround(input);
        break;
      case "push":
        // Quick into the dip, and out of it at the pace of the jump itself.
        this.move!.rate = Math.max(this.pushEnd, this.move!.rate - this.pushSlows * dt);
        this.move!.at += this.move!.rate * dt;
        if (this.time >= (this.move!.name === "jump" ? PUSH.still.seconds : PUSH.moving.seconds)) {
          launch = JUMP_SPEED;
          const [up, down] = this.clips[this.move!.name].air!;
          this.move = { ...this.move!, at: up, rate: (down - up) / AIR_SECONDS, air: true };
          this.enter("jump");
        }
        break;
      case "jump":
        this.inJump(input);
        break;
      case "fall":
        this.move!.at += this.move!.rate * dt;
        if (grounded) this.meetGround(input);
        break;
      case "land":
      case "hardLand":
        this.inLanding(input);
        break;
      case "slide":
      case "roll":
        this.inDriven(input);
        break;
      case "turn":
        this.inTurn(input);
        break;
    }
    const state = this.state as State;
    const driven = state === "slide" || state === "roll";
    const at = this.move?.at ?? 0;
    return {
      launch,
      drive: driven ? this.pace(at) : null,
      air: state === "push" || state === "jump" || state === "fall",
      planted: state === "hardLand" && this.move!.name === "landHard",
      crouched: this.crouched && this.upright,
      low: driven && at >= this.driven.low[0] && at <= this.driven.low[1],
      turn: state === "turn" ? this.turnDrive() : this.waited > 0 ? { spin: 0, ahead: input.speed, left: 0 } : null,
      move: this.move,
    };
  }

  /** On its feet, where the crouch key means now. */
  private get upright(): boolean {
    return this.state === "ground" || this.state === "land" || this.state === "hardLand" || this.state === "turn";
  }

  private enter(state: State): void {
    this.state = state;
    this.time = 0;
    this.blocked = 0;
  }

  private play(name: MoveName, at: number, rate: number, air: boolean, ease: number): void {
    this.move = { name, at, rate, serial: ++this.serials, air, ease };
  }

  private onGround(input: MoveInput): void {
    if (this.off > LEDGE) return this.fall();
    if (this.startJump(input)) return;
    if (input.roll) return this.startDriven("roll", input.speed > STILL || input.wantsMove ? "roll" : "rollStand", input.speed);
    if (input.crouch) {
      if (!this.crouched && input.sprinting && input.speed > SLIDE_SPEED) return this.startDriven("slide", "slide", input.speed);
      if (!this.crouched) this.crouched = true;
      else if (input.room()) this.crouched = false;
    }
    this.startTurn(input);
  }

  // ------------------------------------------------------------- turning

  /** A start in another direction, or a turn back on the move: a recorded turn, from the place in it that suits the feet. */
  private startTurn(input: MoveInput): void {
    const name = this.turnFor(input);
    if (!name) {
      this.waited = 0;
      return;
    }
    const best = this.bestEntry(name, input);
    const moving = input.speed > TURN_STILL;
    if (moving && best.cost >= TURN_WRONG_FOOT && this.waited < TURN_WAIT) {
      this.waited += Math.max(input.dt, 1e-6);
      return;
    }
    this.waited = 0;
    const { rate } = TURNS[name];
    this.size = input.feet?.scale ?? 1;
    this.side = this.sideOf(name, best.mirrored);
    this.warp = 1;
    this.turnFrom = best.at;
    this.play(name, best.at, rate / this.clips[name].seconds, false, moving ? 0.08 : 0.07);
    this.move!.mirrored = best.mirrored;
    this.entry = clamp(input.speed / Math.max(0.2, this.way(name, best.at).ahead), 0.2, 1.3);
    this.enter("turn");
    this.aimTurn(input);
  }

  private turnFor(input: MoveInput): TurnName | null {
    const { speed } = input;
    if (!input.wantsMove || input.yaw == null || !input.feet || this.off > 0) return null;
    const size = Math.abs(this.wrongBy(input));
    if (speed > TURN_STILL) return size < TURN_BACK || this.crouched ? null : speed > TURN_RUNNING ? "turnRun" : "turnWalk";
    if (size < (this.turned > 0 ? TURN_ABOUT : TURN_STAND)) return null;
    return this.crouched ? "turnCrouch" : size > TURN_ABOUT ? "turnWalk" : "turnStand";
  }

  /** How far the keys are from where the body faces (rad, positive to its left). */
  private wrongBy(input: MoveInput): number {
    return wrap(Math.atan2(input.wantX ?? 0, input.wantZ ?? 0) - (input.yaw ?? 0));
  }

  private sideOf(name: TurnName, mirrored: boolean): number {
    return Math.sign(this.clips[name].way!.yaw.at(-1)!) * (mirrored ? -1 : 1);
  }

  private bestEntry(name: TurnName, input: MoveInput): { at: number; mirrored: boolean; cost: number } {
    const { from, rate } = TURNS[name];
    const error = this.wrongBy(input);
    const standing = input.speed <= TURN_STILL;
    const last = standing ? Math.min(from[1], from[0] + 0.06) : from[1];
    let best = { at: from[0], mirrored: false, cost: Infinity };
    for (const mirrored of [false, true]) {
      if (this.sideOf(name, mirrored) !== Math.sign(error) && Math.abs(error) < EITHER_WAY) continue;
      for (let at = from[0]; at <= last + 1e-6; at += 0.02) {
        const pace = standing ? 0 : (this.way(name, at).ahead - input.speed) * 0.1;
        const foot = standing || this.takesOver(name, at, mirrored, input.feet!) ? 0 : TURN_WRONG_FOOT;
        const cost = input.feet!.misfit(name, at, rate / this.clips[name].seconds, mirrored) + pace * pace + foot;
        if (cost < best.cost) best = { at, mirrored, cost };
      }
    }
    return best;
  }

  /** A turn takes over the foot the body is on: it stands in the turn too, or it is not the next to. */
  private takesOver(name: TurnName, at: number, mirrored: boolean, feet: TurnFeet): boolean {
    const down = this.clips[name].down!;
    const sides = ["left", "right"] as const;
    const other = { left: "right", right: "left" } as const;
    const stands = (side: GaitSide) => feet.on(mirrored ? other[side] : side);
    const standing = sides.filter((side) => down[side].some((span) => within(at, span)));
    if (standing.length) return standing.every(stands);
    const lands = (side: GaitSide) => Math.min(...down[side].map(([start]) => (start > at ? start : Infinity)));
    return !stands(lands("left") < lands("right") ? "left" : "right");
  }

  /** Stretch what is left of the turn to the angle still asked for. */
  private aimTurn(input: MoveInput): void {
    if (!input.wantsMove || input.yaw == null) return;
    const clip = this.clips[this.move!.name];
    const left = Math.abs(clip.way!.yaw.at(-1)! - sampleWay(clip, this.move!.at, this.wayA).yaw);
    if (left < 0.3) return;
    // Round the way it is going: up to a quarter back, else all the way on.
    let error = this.wrongBy(input) * this.side;
    if (error < -Math.PI / 2) error += 2 * Math.PI;
    this.warp = clamp(error / left, TURN_WARP[0], TURN_WARP[1]);
  }

  /** How a turn goes at a place in it, unstretched and to its own side. */
  private way(name: TurnName, at: number): TurnDrive {
    const clip = this.clips[name];
    const h = 0.02;
    const a = clamp(at - h, 0, 1);
    const b = clamp(at + h, 0, 1);
    const was = sampleWay(clip, a, this.wayA);
    const is = sampleWay(clip, b, this.wayB);
    const perSecond = TURNS[name].rate / ((b - a) * clip.seconds);
    const x = (is.x - was.x) * perSecond * this.size;
    const z = (is.z - was.z) * perSecond * this.size;
    const facing = (was.yaw + is.yaw) / 2;
    const sin = Math.sin(facing);
    const cos = Math.cos(facing);
    return { spin: (is.yaw - was.yaw) * perSecond, ahead: x * sin + z * cos, left: x * cos - z * sin };
  }

  private turnDrive(): TurnDrive {
    const { name, at, mirrored } = this.move!;
    const way = this.way(name as TurnName, at);
    const flip = mirrored ? -1 : 1;
    // In at about the speed the body already has.
    const u = clamp((at - this.turnFrom) / 0.2, 0, 1);
    const share = this.entry + (1 - this.entry) * u * u * (3 - 2 * u);
    return { spin: way.spin * flip * this.warp, ahead: way.ahead * share, left: way.left * flip * share };
  }

  private inTurn(input: MoveInput): void {
    const move = this.move!;
    move.at += move.rate * input.dt;
    if (this.off > LEDGE) return this.fall();
    if (this.startJump(input)) return;
    if (input.roll || input.crouch) {
      this.done();
      return this.onGround(input);
    }
    this.aimTurn(input);
    const { done, rest } = TURNS[move.name as TurnName];
    if (move.at < (input.wantsMove ? done : rest)) return;
    this.done();
    this.turned = TURN_AFTER;
  }

  private startJump(input: MoveInput): boolean {
    if (this.asked <= 0 || this.off > JUMP_LATE) return false;
    if (this.crouched && !input.room()) return false;
    this.asked = 0;
    const name: MoveName = input.speed < STILL ? "jump" : "leap";
    const { seconds, shows } = name === "jump" ? PUSH.still : PUSH.moving;
    const clip = this.clips[name];
    const up = clip.air![0];
    const from = Math.max(0, up - shows / clip.seconds);
    const mean = (up - from) / seconds;
    this.pushEnd = (clip.air![1] - up) / AIR_SECONDS;
    this.pushSlows = Math.max(0, (2 * (mean - this.pushEnd)) / seconds);
    this.play(name, from, Math.max(mean, 2 * mean - this.pushEnd), false, name === "jump" ? 0.05 : 0.06);
    this.enter("push");
    return true;
  }

  private inJump(input: MoveInput): void {
    const move = this.move!;
    const down = this.clips[move.name].air![1];
    move.at += move.rate * input.dt;
    const over = (move.at - down) / move.rate;
    move.at = Math.min(move.at, down);
    if (input.grounded && input.rise <= 0 && this.time > 0.06) return this.meetGround(input);
    if (over > OVERTIME) this.fall();
  }

  private fall(): void {
    this.play("fall", 0, 1 / this.clips.fall.seconds, true, 0.16);
    this.enter("fall");
  }

  private meetGround(input: MoveInput): void {
    const jumped = this.state === "jump" ? this.move! : null;
    const moving = input.wantsMove || input.speed > STILL;
    if (-input.rise >= HARD) {
      const name = moving ? "landRun" : "landHard";
      this.play(name, name === "landRun" ? 0.04 : 0.02, 1 / this.clips[name].seconds, false, 0.06);
      return this.enter("hardLand");
    }
    // Pressed just before the ground: up again at once.
    if (this.startJump({ ...input, speed: input.speed })) return;
    if (!jumped && moving) return this.done();
    const name = jumped ? jumped.name : "jump";
    const clip = this.clips[name];
    const at = clip.air![1];
    const rate = this.landingRate(clip, at, input.speed);
    if (jumped && jumped.at > at - 0.04) this.move = { ...jumped, at, rate, air: false };
    else this.play(name, at, rate, false, 0.07);
    this.enter("land");
  }

  /** A landing on the move goes as fast as the body does, so its foot stays where it came down. */
  private landingRate(clip: GaitClip, at: number, speed: number): number {
    const own = clip.travel ? (sampleTravel(clip, 1) - sampleTravel(clip, at)) / ((1 - at) * clip.seconds) : 0;
    return (own > 0.1 ? clamp(speed / own, 0.6, 1.1) : 1) / clip.seconds;
  }

  private inLanding(input: MoveInput): void {
    const move = this.move!;
    move.at += move.rate * input.dt;
    if (this.off > LEDGE) return this.fall();
    const hard = this.state === "hardLand";
    const moving = move.name !== "jump" && move.name !== "landHard";
    const free = hard ? (moving ? HARD_MOVING : HARD_FREE * this.clips.landHard.seconds) : moving ? LAND_MOVING : LAND_FREE;
    if (this.time < (hard ? free : 0.04)) return;
    if (this.startJump(input)) return;
    if (this.time < free) return;
    if (moving || this.crouched || input.wantsMove || input.crouch || input.roll || move.at > 0.96) {
      this.done();
      this.onGround(input);
    }
  }

  private done(): void {
    this.move = null;
    this.enter("ground");
  }

  private startDriven(state: "slide" | "roll", name: "slide" | "roll" | "rollStand", speed: number): void {
    this.driven = name === "slide" ? SLIDE : name === "roll" ? ROLL : ROLL_STAND;
    this.play(name, this.driven.from, this.driven.rate / this.clips[name].seconds, false, name === "rollStand" ? 0.09 : 0.07);
    const own = this.clipPace(this.driven.from + 0.04);
    // In at about the speed the body already has, so it neither brakes nor leaps.
    this.entry = name === "slide" ? clamp(speed / own, this.driven.start, 1) : this.driven.start;
    this.enter(state);
  }

  /** How fast the clip's own performer goes at a place in it (m/s). */
  private clipPace(at: number): number {
    const clip = this.clips[this.move!.name];
    const h = 0.03;
    const a = clamp(at - h, 0, 1);
    const b = clamp(at + h, 0, 1);
    return ((sampleTravel(clip, b) - sampleTravel(clip, a)) / (b - a)) * this.move!.rate;
  }

  private pace(at: number): number {
    const { from, done, end } = this.driven;
    const u = clamp((at - from) / (done - from), 0, 1);
    return this.clipPace(at) * (this.entry + (end - this.entry) * u * u * (3 - 2 * u));
  }

  private inDriven(input: MoveInput): void {
    const move = this.move!;
    move.at += move.rate * input.dt;
    if (this.off > LEDGE) return this.fall();
    this.blocked = this.time > 0.1 && input.speed < this.pace(move.at) * 0.35 ? this.blocked + input.dt : 0;
    const { free, done } = this.driven;
    if (move.at > free && this.startJump(input)) return;
    if (move.at < done && this.blocked < BLOCKED) return;
    this.done();
    if (!input.room()) this.crouched = true;
  }
}
