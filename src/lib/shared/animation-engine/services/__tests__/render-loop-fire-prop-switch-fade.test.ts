import { describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "../animation-render-loop";
import type {
  RenderFrameParams,
  RenderLoopConfig,
} from "../IAnimationRenderLoop";
import type { IAnimationRenderer } from "../IAnimationRenderer";
import { FireTipTracker } from "../fire-tip-tracker";
import { DEFAULT_FIRE_CONFIG } from "../../domain/types/fire-types";
import type { FireFrameInput } from "../../domain/types/fire-types";
import {
  decayResidualHeat,
  FIRE_RESIDUAL_PEAK_HEAT,
} from "../fire/fire-emitter-fade";
import { DEFAULT_TRAIL_SETTINGS } from "../../domain/types/trail-types";

/**
 * Switching a fire-capable prop to hands removes every tip at once: `hand` maps
 * to an empty PROP_TIP_POINTS entry, so FireTipTracker emits nothing. The fire
 * canvas is WebGL2 with preserveDrawingBuffer:true, so the last frame the
 * renderer drew stays composited until something draws over it — which is why
 * the render loop has to keep driving a renderer that still holds live fire.
 *
 * The GL work can't run under jsdom, so these fakes reproduce the renderers'
 * residual-state contract (the real decay math is covered directly in
 * fire/fire-emitter-fade.test.ts) and the assertions are about what the loop
 * chooses to call.
 */

/** Temperature dissipation the cinematic profile actually advects with. */
const CINEMATIC_TEMPERATURE_DISSIPATION = 0.972;

class FakeFireRenderer {
  readonly tipCounts: number[] = [];
  clearCount = 0;
  private residualHeat = 0;

  isInitialized(): boolean {
    return true;
  }

  setQuality(): void {}

  clearSimulation(): void {
    this.clearCount++;
    this.residualHeat = 0;
  }

  hasResidualFire(): boolean {
    return this.residualHeat > 0;
  }

  renderFire(input: FireFrameInput): void {
    this.tipCounts.push(input.tips.length);
    if (input.tips.length > 0) {
      this.residualHeat = FIRE_RESIDUAL_PEAK_HEAT;
      return;
    }
    this.residualHeat = decayResidualHeat(
      this.residualHeat,
      CINEMATIC_TEMPERATURE_DISSIPATION,
      1
    );
  }
}

class FakeCharcoalRenderer {
  readonly tipCounts: number[] = [];
  clearCount = 0;
  private liveParticles = 0;

  isInitialized(): boolean {
    return true;
  }

  clearSimulation(): void {
    this.clearCount++;
    this.liveParticles = 0;
  }

  hasActiveParticles(): boolean {
    return this.liveParticles > 0;
  }

  renderCharcoal(input: FireFrameInput): void {
    this.tipCounts.push(input.tips.length);
    this.liveParticles =
      input.tips.length > 0 ? 40 : Math.max(0, this.liveParticles - 1);
  }
}

function frameParams(
  leftPropType: string,
  rightPropType: string,
  overrides: Partial<RenderFrameParams> = {}
): RenderFrameParams {
  return {
    stepData: null,
    currentStep: 0,
    trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
    gridVisible: false,
    gridMode: null,
    letter: null,
    props: {
      leftProp: { centerPathAngle: 0, staffRotationAngle: 0 },
      rightProp: { centerPathAngle: Math.PI, staffRotationAngle: 0 },
      additionalLayers: [],
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      tunnelSpectrum: false,
    },
    visibility: {
      gridVisible: false,
      propsVisible: true,
      trailsVisible: false,
      leftMotionVisible: true,
      rightMotionVisible: true,
    },
    isPlaying: true,
    leftPropType,
    rightPropType,
    fireConfig: { ...DEFAULT_FIRE_CONFIG },
    tipEffectMap: { "*": { effect: "fire" } },
    ...overrides,
  } as RenderFrameParams;
}

function createLoop(renderers: Partial<Record<string, unknown>>) {
  const renderer = {
    renderScene: vi.fn(),
    isLeftPropCrossfadeInProgress: () => false,
    isRightPropCrossfadeInProgress: () => false,
  } as unknown as IAnimationRenderer;

  const loop = new AnimationRenderLoop();
  loop.initialize({
    renderer,
    TrailCapturer: null,
    pathCache: null,
    canvasSize: 500,
    fireTipTracker: new FireTipTracker(),
    renderers: renderers as never,
  } satisfies RenderLoopConfig);
  return loop;
}

/** FireTipTracker skips three warmup frames before it emits any tip. */
const WARMUP_FRAMES = 3;
const FRAME_MS = 1000 / 60;

describe("AnimationRenderLoop fire emitter lifecycle across a prop switch", () => {
  it("keeps driving the fire renderer with no tips so live fire ages out", () => {
    const fire = new FakeFireRenderer();
    const loop = createLoop({ fire });

    let time = 100;
    const advance = (params: RenderFrameParams) => {
      loop.renderSync(params, time, 1 / 60);
      time += FRAME_MS;
    };

    // Burn with a fire-capable prop in both hands.
    for (let i = 0; i < WARMUP_FRAMES + 5; i++) {
      advance(frameParams("staff", "staff"));
    }
    expect(fire.tipCounts.length).toBeGreaterThan(0);
    expect(fire.tipCounts.every((count) => count > 0)).toBe(true);
    const emittingFrames = fire.tipCounts.length;

    // Switch both props to hands. Hands carry no tip points, so nothing is
    // emitted from here on — but the plume already in the field must keep
    // being stepped and redrawn instead of freezing on the canvas.
    advance(frameParams("hand", "hand"));
    expect(fire.tipCounts.length).toBe(emittingFrames + 1);
    expect(fire.tipCounts.at(-1)).toBe(0);

    // Nothing was hard-cleared: the switch stops emission, it does not wipe
    // the canvas.
    expect(fire.clearCount).toBe(0);

    // Run until the loop stops calling: the fade is many frames long, and then
    // it genuinely ends rather than simulating forever.
    let guardFrames = 0;
    let callsBefore = -1;
    while (callsBefore !== fire.tipCounts.length && guardFrames < 2000) {
      callsBefore = fire.tipCounts.length;
      advance(frameParams("hand", "hand"));
      guardFrames++;
    }

    const fadeFrames = fire.tipCounts.length - emittingFrames;
    expect(fadeFrames).toBeGreaterThan(60); // over a second of real fade
    expect(fadeFrames).toBeLessThan(600);
    expect(guardFrames).toBeLessThan(2000);

    // The loop itself never hard-clears across a prop switch — the only clear
    // in the whole lifecycle is the renderer's own, once its field is empty,
    // and that one needs a real GL context to observe.
    expect(fire.clearCount).toBe(0);
  });

  it("resumes emission when a fire-capable prop comes back mid-fade", () => {
    const fire = new FakeFireRenderer();
    const loop = createLoop({ fire });

    let time = 100;
    const advance = (params: RenderFrameParams) => {
      loop.renderSync(params, time, 1 / 60);
      time += FRAME_MS;
    };

    for (let i = 0; i < WARMUP_FRAMES + 3; i++) {
      advance(frameParams("staff", "staff"));
    }
    for (let i = 0; i < 10; i++) {
      advance(frameParams("hand", "hand"));
    }
    expect(fire.tipCounts.slice(-10).every((count) => count === 0)).toBe(true);

    advance(frameParams("staff", "staff"));
    expect(fire.tipCounts.at(-1)).toBeGreaterThan(0);

    // Coming back mid-fade re-arms the emitter without a hard clear, so the
    // dying plume and the new flame overlap instead of popping.
    expect(fire.clearCount).toBe(0);
  });

  it("fades the hand that lost its prop while the other hand keeps burning", () => {
    const fire = new FakeFireRenderer();
    const loop = createLoop({ fire });

    let time = 100;
    for (let i = 0; i < WARMUP_FRAMES + 3; i++) {
      loop.renderSync(frameParams("staff", "staff"), time, 1 / 60);
      time += FRAME_MS;
    }
    const bothHandsTips = fire.tipCounts.at(-1) ?? 0;
    expect(bothHandsTips).toBe(4); // staff has two ends per hand

    loop.renderSync(frameParams("hand", "staff"), time, 1 / 60);
    expect(fire.tipCounts.at(-1)).toBe(2);
    expect(fire.clearCount).toBe(0);
  });

  it("does not start driving a renderer that never had fire", () => {
    const fire = new FakeFireRenderer();
    const loop = createLoop({ fire });

    let time = 100;
    for (let i = 0; i < WARMUP_FRAMES + 5; i++) {
      loop.renderSync(frameParams("hand", "hand"), time, 1 / 60);
      time += FRAME_MS;
    }

    expect(fire.tipCounts).toHaveLength(0);
    expect(fire.clearCount).toBe(0);
  });

  it("fades sparks the same way when charcoal owns the tips", () => {
    const charcoal = new FakeCharcoalRenderer();
    const loop = createLoop({ charcoal });

    let time = 100;
    const advance = (propType: string) => {
      loop.renderSync(
        frameParams(propType, propType, {
          tipEffectMap: { "*": { effect: "charcoal" } },
        }),
        time,
        1 / 60
      );
      time += FRAME_MS;
    };

    for (let i = 0; i < WARMUP_FRAMES + 3; i++) advance("staff");
    const emittingFrames = charcoal.tipCounts.length;
    expect(emittingFrames).toBeGreaterThan(0);

    for (let i = 0; i < 60; i++) advance("hand");

    const fadeFrames = charcoal.tipCounts.length - emittingFrames;
    expect(fadeFrames).toBeGreaterThan(1);
    expect(charcoal.tipCounts.at(-1)).toBe(0);
    expect(charcoal.clearCount).toBe(0);
  });

  it("fades independently per performer", () => {
    const fireA = new FakeFireRenderer();
    const fireB = new FakeFireRenderer();
    const loopA = createLoop({ fire: fireA });
    const loopB = createLoop({ fire: fireB });

    let time = 100;
    for (let i = 0; i < WARMUP_FRAMES + 3; i++) {
      loopA.renderSync(frameParams("staff", "staff"), time, 1 / 60);
      loopB.renderSync(frameParams("staff", "staff"), time, 1 / 60);
      time += FRAME_MS;
    }

    for (let i = 0; i < 5; i++) {
      loopA.renderSync(frameParams("hand", "hand"), time, 1 / 60);
      loopB.renderSync(frameParams("staff", "staff"), time, 1 / 60);
      time += FRAME_MS;
    }

    expect(fireA.tipCounts.slice(-5).every((count) => count === 0)).toBe(true);
    expect(fireB.tipCounts.slice(-5).every((count) => count > 0)).toBe(true);
  });

  it("keeps fading while playback is paused", () => {
    const fire = new FakeFireRenderer();
    const loop = createLoop({ fire });

    let time = 100;
    for (let i = 0; i < WARMUP_FRAMES + 3; i++) {
      loop.renderSync(frameParams("staff", "staff"), time, 1 / 60);
      time += FRAME_MS;
    }
    const emittingFrames = fire.tipCounts.length;

    // Paused frames still advance wall-clock time: the rAF loop stays alive
    // while fireConfig is set, so a prop swapped out on a paused canvas fades
    // the same way it does mid-playback.
    for (let i = 0; i < 10; i++) {
      loop.renderSync(
        frameParams("hand", "hand", { isPlaying: false }),
        time,
        1 / 60
      );
      time += FRAME_MS;
    }

    expect(fire.tipCounts.length).toBe(emittingFrames + 10);
    expect(fire.tipCounts.slice(-10).every((count) => count === 0)).toBe(true);
  });
});
