import { describe, expect, it, vi } from "vitest";
import { WebGLLedRenderer } from "$lib/shared/animation-engine/services/led/web-gl-led-renderer";
import {
  DEFAULT_LED_CONFIG,
  type LedFrameInput,
  type LedSample,
} from "$lib/shared/animation-engine/domain/types/led-types";

/** The streak geometry for one frame, read back from the instance buffer. */
interface SegmentProbe {
  buildSegments(
    leds: readonly LedSample[],
    canvasWidth: number,
    canvasHeight: number,
    config: typeof DEFAULT_LED_CONFIG,
    dt: number,
    timeDiscontinuity: boolean,
    firstPass: boolean,
    lastPass: boolean,
    startIndex: number
  ): number;
  instanceData: Float32Array;
  displayWidth: number;
  displayHeight: number;
}

const STRIDE = 15;

function staff(x: number, y: number): LedSample[] {
  return [0, 1].map((ledIndex) => ({
    x,
    y: y + ledIndex * 60,
    propIndex: 0,
    ledIndex,
    endpointIndex: ledIndex,
    brightness: 1,
    r: 1,
    g: 1,
    b: 1,
  }));
}

/**
 * A staff at (u, v) in the engine's square, drawn in a width x height frame
 * the way the sampler places it: scaled to the square, offset by its centring.
 */
function staffInFrame(
  width: number,
  height: number,
  u: number,
  v: number
): LedSample[] {
  const side = Math.min(width, height);
  const x = (width - side) / 2 + u * side;
  const y = (height - side) / 2 + v * side;
  return staff(x, y).map((led, ledIndex) => ({
    ...led,
    y: y + ledIndex * 0.15 * side,
  }));
}

function sweptLength(probe: SegmentProbe, written: number): number {
  let total = 0;
  for (let i = 0; i < written; i++) {
    const o = i * STRIDE;
    total += Math.hypot(
      probe.instanceData[o + 2]! - probe.instanceData[o]!,
      probe.instanceData[o + 3]! - probe.instanceData[o + 1]!
    );
  }
  return total;
}

/** One frame with no prior sets: a single pass that is both first and last. */
function buildFrame(
  probe: SegmentProbe,
  input: LedFrameInput,
  config: typeof DEFAULT_LED_CONFIG,
  dt: number,
  timeDiscontinuity: boolean
): number {
  return probe.buildSegments(
    input.leds,
    input.canvasWidth,
    input.canvasHeight,
    config,
    dt,
    timeDiscontinuity,
    true,
    true,
    0
  );
}

function renderer(): SegmentProbe {
  const probe = new WebGLLedRenderer() as unknown as SegmentProbe;
  probe.displayWidth = 396;
  probe.displayHeight = 700;
  return probe;
}

describe("WebGLLedRenderer frame changes", () => {
  it("does not streak a staff across a re-centred frame", () => {
    const probe = renderer();
    // Tall frame: the square sits 152 px down. Then the frame shrinks below
    // the square's width, so the same staff is drawn higher and smaller
    // without having moved.
    buildFrame(
      probe,
      {
        leds: staffInFrame(396, 700, 0.5, 0.4),
        currentTime: 1000,
        canvasWidth: 396,
        canvasHeight: 700,
      },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );
    probe.displayHeight = 349;
    const written = buildFrame(
      probe,
      {
        leds: staffInFrame(396, 349, 0.5, 0.4),
        currentTime: 1016,
        canvasWidth: 396,
        canvasHeight: 349,
      },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );

    expect(written).toBeGreaterThan(0);
    expect(sweptLength(probe, written)).toBeLessThan(1);
  });

  it("keeps a moving staff's streak while its frame resizes every frame", () => {
    const probe = renderer();
    // The opening tunnel's box shrinks a few pixels a frame while the staff
    // swings; each frame must still streak from where the staff was.
    buildFrame(
      probe,
      {
        leds: staffInFrame(396, 700, 0.4, 0.4),
        currentTime: 1000,
        canvasWidth: 396,
        canvasHeight: 700,
      },
      DEFAULT_LED_CONFIG,
      1 / 30,
      false
    );
    probe.displayHeight = 690;
    const written = buildFrame(
      probe,
      {
        leds: staffInFrame(396, 690, 0.5, 0.4),
        currentTime: 1033,
        canvasWidth: 396,
        canvasHeight: 690,
      },
      DEFAULT_LED_CONFIG,
      1 / 30,
      false
    );

    // Both LEDs moved a tenth of the 396 px square to the right.
    expect(sweptLength(probe, written)).toBeCloseTo(2 * 39.6, 0);
    // A continuing path joins the last frame with a butt cap, not a new dot.
    expect(probe.instanceData[9]).toBe(0);
  });

  it("still streaks real motion inside an unchanged frame", () => {
    const probe = renderer();
    const frame = { canvasWidth: 396, canvasHeight: 700 };
    buildFrame(
      probe,
      { leds: staff(200, 300), currentTime: 1000, ...frame },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );
    const written = buildFrame(
      probe,
      { leds: staff(200, 124), currentTime: 1016, ...frame },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );

    expect(sweptLength(probe, written)).toBeGreaterThan(100);
  });
});

describe("WebGLLedRenderer join cuts", () => {
  const CENTRE = { x: 200, y: 350 };
  const RADIUS = 60;

  /** A staff spinning about its middle, at `degrees`, with an LED at each end. */
  function spunStaff(degrees: number): LedSample[] {
    const a = (degrees * Math.PI) / 180;
    return [-1, 1].map((side, ledIndex) => ({
      x: CENTRE.x + side * RADIUS * Math.cos(a),
      y: CENTRE.y + side * RADIUS * Math.sin(a),
      propIndex: 0,
      ledIndex,
      endpointIndex: ledIndex,
      brightness: 1,
      r: 1,
      g: 1,
      b: 1,
    }));
  }

  function spin(probe: SegmentProbe, degrees: number, timeMs: number): number {
    return buildFrame(
      probe,
      {
        leds: spunStaff(degrees),
        currentTime: timeMs,
        canvasWidth: 396,
        canvasHeight: 700,
      },
      DEFAULT_LED_CONFIG,
      1 / 30,
      false
    );
  }

  function segment(probe: SegmentProbe, i: number) {
    const d = probe.instanceData;
    const o = i * STRIDE;
    return {
      a: { x: d[o]!, y: d[o + 1]! },
      b: { x: d[o + 2]!, y: d[o + 3]! },
      cutStart: { x: d[o + 11]!, y: d[o + 12]! },
      cutEnd: { x: d[o + 13]!, y: d[o + 14]! },
    };
  }

  const near = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    Math.hypot(p.x - q.x, p.y - q.y) < 1e-3;

  it("cuts the chords of one arc along a shared line where they meet", () => {
    const probe = renderer();
    spin(probe, 0, 1000);
    const written = spin(probe, 30, 1033);

    let joins = 0;
    for (let i = 0; i + 1 < written; i++) {
      const here = segment(probe, i);
      const next = segment(probe, i + 1);
      if (!near(here.b, next.a)) continue;
      joins++;
      expect(here.cutEnd.x).toBeCloseTo(next.cutStart.x, 5);
      expect(here.cutEnd.y).toBeCloseTo(next.cutStart.y, 5);
      expect(Math.hypot(here.cutEnd.x, here.cutEnd.y)).toBeCloseTo(1, 5);
      // Not square to either chord: the cut bisects the angle between them.
      const dir = { x: here.b.x - here.a.x, y: here.b.y - here.a.y };
      const len = Math.hypot(dir.x, dir.y);
      expect(
        (here.cutEnd.x * dir.x + here.cutEnd.y * dir.y) / len
      ).toBeLessThan(0.99999);
    }
    expect(joins).toBeGreaterThan(0);
  });

  it("meets the next frame's first chord on the arc's tangent", () => {
    const probe = renderer();
    spin(probe, 0, 1000);
    const first = spin(probe, 30, 1033);
    const tip = spunStaff(30)[1]!;
    const handOff = { x: tip.x, y: tip.y };
    let endCut: { x: number; y: number } | undefined;
    for (let i = 0; i < first; i++) {
      const s = segment(probe, i);
      if (near(s.b, handOff)) endCut = s.cutEnd;
    }

    const second = spin(probe, 60, 1066);
    let startCut: { x: number; y: number } | undefined;
    for (let i = 0; i < second; i++) {
      const s = segment(probe, i);
      if (near(s.a, handOff)) startCut = s.cutStart;
    }

    expect(endCut).toBeDefined();
    expect(startCut).toBeDefined();
    expect(endCut!.x).toBeCloseTo(startCut!.x, 4);
    expect(endCut!.y).toBeCloseTo(startCut!.y, 4);
    // The tip turns clockwise on screen (y down), so its tangent at 30° is
    // (-sin 30°, cos 30°).
    expect(endCut!.x).toBeCloseTo(-0.5, 3);
    expect(endCut!.y).toBeCloseTo(Math.sqrt(3) / 2, 3);
  });
});

describe("WebGLLedRenderer resize", () => {
  interface Fbo {
    fbo: object;
    texture: object;
  }
  interface ResizeProbe {
    canvas: { width: number; height: number };
    gl: unknown;
    displayWidth: number;
    displayHeight: number;
    accumFBOs: { read: Fbo; write: Fbo } | null;
    createFramebuffers(): void;
    resize(width: number, height: number): void;
  }

  /** A GL stand-in that records blits and which framebuffers are deleted. */
  function fakeGl() {
    const blits: Array<{ read: unknown; draw: unknown; rects: number[] }> = [];
    const deleted = new Set<unknown>();
    let read: unknown = null;
    let draw: unknown = null;
    const gl = new Proxy(
      {
        READ_FRAMEBUFFER: "read",
        DRAW_FRAMEBUFFER: "draw",
        FRAMEBUFFER: "both",
        createTexture: () => ({}),
        createFramebuffer: () => ({}),
        deleteFramebuffer: (fbo: unknown) => deleted.add(fbo),
        bindFramebuffer: (target: string, fbo: unknown) => {
          if (target !== "draw") read = fbo;
          if (target !== "read") draw = fbo;
        },
        blitFramebuffer: (...args: number[]) =>
          blits.push({ read, draw, rects: args.slice(0, 8) }),
      } as Record<string | symbol, unknown>,
      { get: (target, key) => (key in target ? target[key] : () => undefined) }
    );
    return { gl, blits, deleted };
  }

  it("carries the retained light onto the re-centred square instead of wiping it", () => {
    const { gl, blits, deleted } = fakeGl();
    const probe = new WebGLLedRenderer() as unknown as ResizeProbe;
    vi.stubGlobal("devicePixelRatio", 1);
    probe.canvas = { width: 0, height: 0 };
    probe.gl = gl;
    probe.displayWidth = 400;
    probe.displayHeight = 700;
    probe.createFramebuffers();
    const before = probe.accumFBOs!.read;

    // The tall frame shrinks to its square, as the tunnel's canvas does when
    // it settles into the animation's box.
    probe.resize(360, 360);

    expect(blits).toHaveLength(1);
    expect(blits[0]!.read).toBe(before.fbo);
    expect(blits[0]!.draw).toBe(probe.accumFBOs!.read.fbo);
    // Old square: 400 wide, 150 down a 700 frame. New square: the whole frame.
    expect(blits[0]!.rects).toEqual([0, 150, 400, 550, 0, 0, 360, 360]);
    expect(deleted.has(before.fbo)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("WebGLLedRenderer reframe", () => {
  interface RenderProbe extends SegmentProbe {
    canvas: { width: number; height: number };
    gl: unknown;
    initialized: boolean;
    createFramebuffers(): void;
    resize(width: number, height: number): void;
    renderLeds(input: LedFrameInput, config: typeof DEFAULT_LED_CONFIG): void;
  }

  const PROGRAMS = [
    "streakProgram",
    "accumProgram",
    "boxResolveProgram",
    "bloomDownProgram",
    "bloomUpProgram",
    "displayProgram",
  ] as const;

  /** A renderer on a GL stand-in that logs which shader programs run. */
  function renderProbe() {
    const used: string[] = [];
    const gl = new Proxy(
      {
        createTexture: () => ({}),
        createFramebuffer: () => ({}),
        useProgram: (program: { name: string }) => used.push(program.name),
      } as Record<string | symbol, unknown>,
      { get: (target, key) => (key in target ? target[key] : () => undefined) }
    );
    vi.stubGlobal("devicePixelRatio", 1);
    const probe = new WebGLLedRenderer() as unknown as RenderProbe &
      Record<(typeof PROGRAMS)[number], unknown>;
    probe.canvas = { width: 396, height: 700 };
    probe.gl = gl;
    probe.initialized = true;
    probe.displayWidth = 396;
    probe.displayHeight = 700;
    for (const name of PROGRAMS) {
      probe[name] = { program: { name }, uniforms: { get: () => ({}) } };
    }
    probe.createFramebuffers();
    return { probe, used };
  }

  function tunnelFrame(
    timeMs: number,
    height: number,
    u: number
  ): LedFrameInput {
    return {
      leds: staffInFrame(396, height, u, 0.4),
      currentTime: timeMs,
      canvasWidth: 396,
      canvasHeight: height,
    };
  }

  it("shows the moment again on a resized box without a new exposure", () => {
    const { probe, used } = renderProbe();
    probe.renderLeds(tunnelFrame(967, 700, 0.3), DEFAULT_LED_CONFIG);
    probe.renderLeds(tunnelFrame(1000, 700, 0.4), DEFAULT_LED_CONFIG);
    expect(used).toContain("streakProgram");

    // The tunnel's box shrinks one tick after the frame was drawn.
    probe.resize(396, 690);
    used.length = 0;
    probe.renderLeds(tunnelFrame(1000, 690, 0.4), DEFAULT_LED_CONFIG);
    expect(used).not.toContain("streakProgram");
    expect(used).not.toContain("accumProgram");
    expect(used).not.toContain("boxResolveProgram");
    expect(used).toContain("displayProgram");

    // Later ticks of that moment draw nothing at all.
    used.length = 0;
    probe.renderLeds(tunnelFrame(1000, 690, 0.4), DEFAULT_LED_CONFIG);
    expect(used).toHaveLength(0);

    // The next frame streaks on from where the staff was, without a new dot.
    const build = vi.spyOn(probe, "buildSegments");
    probe.renderLeds(tunnelFrame(1033, 690, 0.5), DEFAULT_LED_CONFIG);
    const written = build.mock.results[0]!.value as number;
    expect(sweptLength(probe, written)).toBeCloseTo(2 * 39.6, 0);
    expect(probe.instanceData[9]).toBe(0);
    vi.unstubAllGlobals();
  });
});
