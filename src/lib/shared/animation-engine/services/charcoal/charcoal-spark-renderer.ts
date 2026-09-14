/**
 * CharcoalSparkRenderer - WebGL2 Point-Sprite Particle System
 *
 * Discrete spark particles that burst on direction changes and fall
 * under gravity, producing steel-wool / charcoal ember aesthetics.
 *
 * Architecture:
 *   - Pre-allocated particle pool (zero allocation in the hot path)
 *   - Two shader programs: spark point sprites + ember glow halos
 *   - Additive blending (SRC_ALPHA, ONE) for bright-on-dark compositing
 *   - Burst emission on high jerk (direction reversals)
 *   - Ambient emission during sustained movement
 *   - Gravity + drag physics per particle
 *   - Temperature-based color (core -> mid -> cool over lifetime)
 *
 * Implements ICharcoalRenderer - architecturally independent from
 * the fire overlay renderer (different physics, shaders, visual output).
 */

import type {
	FireFrameInput,
	FireOverlayConfig,
	PropTipData,
} from "../../domain/types/fire-types";
import type {
	CharcoalSpark,
	CharcoalSparkParams,
} from "../../domain/types/charcoal-spark-types";
import { DEFAULT_CHARCOAL_PARAMS } from "../../domain/types/charcoal-spark-types";

// Constants

const MAX_DPR = 2;

/**
 * Tip positions from FireTipTracker are in canvas-pixel space
 * (0..canvasSize), NOT the fixed 950 viewbox. We read the actual
 * canvas size from FireFrameInput.canvasWidth / canvasHeight each frame.
 */

// Shader Sources (GLSL 300 ES)

const SPARK_VERTEX = /* glsl */ `#version 300 es
precision highp float;

in vec2 a_position;
in float a_size;
in vec4 a_color;

uniform vec2 u_resolution;
uniform vec2 u_viewbox;

out vec4 v_color;

void main() {
  // Map viewbox coordinates to NDC [-1, 1]
  vec2 ndc = (a_position / u_viewbox) * 2.0 - 1.0;
  ndc.y = -ndc.y; // Flip Y: viewbox Y-down -> GL Y-up

  gl_Position = vec4(ndc, 0.0, 1.0);

  // Scale point size from viewbox units to device pixels
  float pixelsPerUnit = u_resolution.x / u_viewbox.x;
  gl_PointSize = a_size * pixelsPerUnit;

  v_color = a_color;
}
`;

const SPARK_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  // Distance from point center (gl_PointCoord is [0,1] within the point sprite)
  vec2 coord = gl_PointCoord - 0.5;
  float dist = length(coord) * 2.0; // Normalize to [0, 1] at edge

  // Soft circular falloff: bright core, soft edges
  float alpha = pow(1.0 - smoothstep(0.0, 1.0, dist), 1.8);

  // v_color is already premultiplied; scale by the radial falloff
  fragColor = v_color * alpha;
}
`;

const EMBER_VERTEX = /* glsl */ `#version 300 es
precision highp float;

in vec2 a_position;

uniform vec2 u_resolution;
uniform vec2 u_viewbox;
uniform float u_radius;

void main() {
  vec2 ndc = (a_position / u_viewbox) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  gl_Position = vec4(ndc, 0.0, 1.0);

  float pixelsPerUnit = u_resolution.x / u_viewbox.x;
  gl_PointSize = u_radius * 2.0 * pixelsPerUnit;
}
`;

const EMBER_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform vec4 u_color;
uniform float u_intensity;

out vec4 fragColor;

void main() {
  vec2 coord = gl_PointCoord - 0.5;
  float dist = length(coord) * 2.0;

  // Very soft exponential glow
  float glow = exp(-dist * dist * 3.0) * u_intensity;

  // Premultiplied output
  fragColor = vec4(u_color.rgb * glow, glow);
}
`;

// Shader program helper

interface ShaderProgram {
	program: WebGLProgram;
	uniforms: Map<string, WebGLUniformLocation>;
	attributes: Map<string, number>;
}

// CharcoalSparkRenderer

export class CharcoalSparkRenderer {
	private canvas: HTMLCanvasElement | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private initialized = false;
	private dpr = 1;

	// Shader programs
	private sparkProgram: ShaderProgram | null = null;
	private emberProgram: ShaderProgram | null = null;

	// Particle pool
	private particles: CharcoalSpark[] = [];
	private maxParticles = 0;

	// GPU buffers for spark rendering
	private sparkVAO: WebGLVertexArrayObject | null = null;
	private positionBuffer: WebGLBuffer | null = null;
	private sizeBuffer: WebGLBuffer | null = null;
	private colorBuffer: WebGLBuffer | null = null;

	// GPU buffers for ember glow rendering
	private emberVAO: WebGLVertexArrayObject | null = null;
	private emberPositionBuffer: WebGLBuffer | null = null;

	// CPU-side typed arrays (reused each frame, no allocation)
	private positionData: Float32Array = new Float32Array(0);
	private sizeData: Float32Array = new Float32Array(0);
	private colorData: Float32Array = new Float32Array(0);
	private emberPositionData: Float32Array = new Float32Array(0);

	// Timing
	private lastTime = 0;
	private reducedMotion = false;

	// Ambient emission accumulator per tip (fractional spark carry)
	private ambientAccumulators: Map<string, number> = new Map();
	// Burst count comes from jerk, not from elapsed time, so it would fire at
	// full strength in every sub-step. Each step takes its share and carries the
	// fractional remainder here, keeping a frame's burst total step-independent.
	private burstAccumulators: Map<string, number> = new Map();

	// Current params (updated externally via setParams)
	private currentParams: CharcoalSparkParams = { ...DEFAULT_CHARCOAL_PARAMS };

	// Emission density scale. Quadratic (area-based) so particles-per-unit-area
	// stays constant as the canvas shrinks.
	private canvasScale = 1.0;
	// Linear scale for particle size + ember glow radius. Sparks authored at
	// the reference size need to shrink proportionally on smaller canvases
	// so the halo stays the same fraction of the frame.
	private sizeScale = 1.0;
	// Linear scale for everything measured in canvas units per unit TIME:
	// spawn speeds, gravity, and the tip speed/jerk thresholds that gate
	// emission. Tip positions arrive in canvas-pixel space (see the note at the
	// top of this file), so a tip tracing the same choreography on a 250px
	// canvas moves at roughly a quarter the pixels-per-second it does at 950.
	// Particle size and emission count already scaled with the canvas; motion
	// did not, so on a small container gravity of 480 px/s^2 cleared the whole
	// frame in under a second and the shower was gone before you could see it -
	// while the unscaled thresholds meant the slower tip often failed to trigger
	// ambient or burst emission at all. Scaling motion by the same linear ratio
	// makes trajectories geometrically similar: a spark covers the same
	// FRACTION of the frame in the same time at any size.
	//
	// Deliberately NOT clamped at 1.0 the way sizeScale is. Above the reference
	// the error runs the other way - fixed gravity is proportionally too weak,
	// so sparks hang and drift - and there is no reason to cap correctness.
	private motionScale = 1.0;
	// Charcoal default params (sizeMin/Max, emberGlowRadius) were tuned on
	// a 950px canvas, so the linear size-scale is referenced to 950 - not
	// the project-wide 500 - to preserve the look at full size.
	private static readonly REFERENCE_SIZE = 950;

	/**
	 * Recompute every canvas-size-derived scale. Called from both context
	 * creation and resize so the two can never drift apart.
	 */
	private updateScales(width: number, height: number): void {
		const areaRatio = (width * height) / (CharcoalSparkRenderer.REFERENCE_SIZE ** 2);
		this.canvasScale = Math.max(0.1, Math.min(1.0, areaRatio));
		const minDim = Math.min(width, height);
		this.sizeScale = Math.max(0.1, Math.min(1.0, minDim / CharcoalSparkRenderer.REFERENCE_SIZE));
		this.motionScale = Math.max(0.1, minDim / CharcoalSparkRenderer.REFERENCE_SIZE);
		this.teleportDistance = minDim * 0.5;
		this.cullMargin = Math.max(48, minDim * 0.06);
	}

	// A tip that moves further than this in one frame did not travel - it wrapped
	// a loop seam or the scene changed. Spawning a batch along that jump would
	// draw a spark ribbon across a path the prop never took.
	private teleportDistance = CharcoalSparkRenderer.REFERENCE_SIZE * 0.5;
	// Frame bounds in viewbox units, refreshed each frame from FireFrameInput.
	// hasLeftFrame culls against these.
	private frameWidth = CharcoalSparkRenderer.REFERENCE_SIZE;
	private frameHeight = CharcoalSparkRenderer.REFERENCE_SIZE;
	// How far past an edge a spark may sit before it is retired. Comfortably
	// wider than a sprite plus its glow, so nothing is cut while still visible.
	private cullMargin = CharcoalSparkRenderer.REFERENCE_SIZE * 0.06;
	// Spawn origin for the particle currently being created, set by
	// resolveSpawnOrigin so the spawn helpers stay single-argument-per-concern.
	private spawnOriginX = 0;
	private spawnOriginY = 0;
	// Round-robin write position into the particle pool. See findInactiveSlot.
	private spawnCursor = 0;
	// The slice of this frame's tip travel the current sub-step is responsible
	// for, as fractions of prev->current. See the sub-stepping loop.
	private segU0 = 0;
	private segU1 = 1;
	// Whether the tip being emitted from jumped rather than travelled.
	private segmentIsTeleport = false;

	// Physics has to advance in small steps or drag integration diverges and
	// fast sparks tunnel. A stuttering frame is therefore split into this many
	// steps at most, each no longer than one 60fps tick.
	private static readonly MAX_STEP_SECONDS = 1 / 60;
	private static readonly MAX_SUB_STEPS = 6;

	// Emission throttle, 0..1. See applyEmissionBudget.
	private emissionScale = 1;
	private spawnsThisFrame = 0;

	// IFireOverlayRenderer implementation

	initialize(container: HTMLElement, width: number, height: number): boolean {
		this.canvas = document.createElement("canvas");
		this.canvas.style.position = "absolute";
		this.canvas.style.top = "0";
		this.canvas.style.left = "0";
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.canvas.style.pointerEvents = "none";
		this.canvas.style.zIndex = "2";
		this.canvas.style.background = "transparent";
		this.canvas.setAttribute("aria-hidden", "true");
		this.canvas.dataset.overlayType = "emissive";

		this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		this.canvas.width = Math.round(width * this.dpr);
		this.canvas.height = Math.round(height * this.dpr);

		container.appendChild(this.canvas);

		return this.initGLContext(width, height, true);
	}

	initializeHeadless(width: number, height: number): boolean {
		this.canvas = new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
		this.dpr = 1;
		return this.initGLContext(width, height, false);
	}

	private initGLContext(width: number, height: number, isDom: boolean): boolean {
		this.updateScales(width, height);

		this.gl = this.canvas!.getContext("webgl2", {
			alpha: true,
			premultipliedAlpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true,
		}) as WebGL2RenderingContext | null;

		if (!this.gl) {
			console.warn("WebGL2 not available for charcoal spark overlay");
			this.cleanup();
			return false;
		}

		if (!this.compilePrograms()) {
			this.cleanup();
			return false;
		}

		this.allocateParticlePool(this.currentParams.maxParticles);
		this.createGPUBuffers();

		const gl = this.gl;
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		gl.disable(gl.DEPTH_TEST);

		if (isDom && typeof window !== "undefined" && window.matchMedia) {
			this.reducedMotion = window.matchMedia(
				"(prefers-reduced-motion: reduce)"
			).matches;
		}

		this.lastTime = performance.now();
		this.initialized = true;
		return true;
	}

	resize(width: number, height: number): void {
		if (!this.canvas) return;
		this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		this.canvas.width = Math.round(width * this.dpr);
		this.canvas.height = Math.round(height * this.dpr);

		// Scale emission density by canvas area relative to reference size.
		// A 300px canvas gets ~10% of the particles of a 950px canvas,
		// keeping visual density proportional instead of overwhelming small previews.
		this.updateScales(width, height);
	}

	renderCharcoal(input: FireFrameInput, _config: FireOverlayConfig): void {
		if (!this.initialized || !this.gl || !this.canvas) return;

		// Deterministic when an explicit dt (seconds) is supplied (export); else
		// derive the wall-clock delta so the live path is byte-identical.
		const now = input.currentTime;
		const srcDt =
			input.dt ?? (this.lastTime > 0 ? (now - this.lastTime) / 1000 : 0);
		this.lastTime = now;
		// One simulated span per frame, used for BOTH emission and physics. It
		// follows real elapsed time so a long frame emits the sparks its distance
		// earned instead of thinning the stream out exactly where the tip covered
		// the most ground. Capped, or returning from a backgrounded tab would
		// dump the whole pool in one frame.
		let simDt = Math.min(srcDt, 0.1);
		if (this.reducedMotion) simDt *= 0.2;
		if (simDt <= 0) simDt = 0.016;

		// On loop: seamless sequences keep sparks continuous; non-seamless deactivate
		// existing particles so they don't linger at old positions.
		if (input.loopDetected && !input.isSeamlesslyLoopable) {
			this.clearSimulation();
		}

		const params = this.currentParams;
		this.frameWidth = input.canvasWidth;
		this.frameHeight = input.canvasHeight;

		// Emission and physics, sub-stepped. A long frame is split into slices of
		// at most one 60fps tick; each slice emits its own share of the tip's
		// travel and then ages the pool by exactly that slice.
		//
		// This is what closes the last of the stutter holes. The old code clamped
		// physics to 33ms while emission ran on the real elapsed time, so a 100ms
		// frame spawned 100ms worth of sparks and then aged everything by 33ms.
		// The shower's age ordering stopped matching its spatial ordering and a
		// seam appeared at the join - measured at 16ms of missing trail, which at
		// a 1.5 rev/s spin is a 59px hole. Advancing in bounded steps keeps the
		// two in lockstep no matter how long the frame ran.
		const steps = Math.min(
			CharcoalSparkRenderer.MAX_SUB_STEPS,
			Math.max(1, Math.ceil(simDt / CharcoalSparkRenderer.MAX_STEP_SECONDS))
		);
		const stepDt = simDt / steps;
		this.spawnsThisFrame = 0;

		for (let step = 0; step < steps; step++) {
			this.segU0 = step / steps;
			this.segU1 = (step + 1) / steps;

			for (const tip of input.tips) {
				this.emitFromTip(tip, params, stepDt, srcDt);
			}

			this.updateParticles(params, stepDt);
		}

		this.applyEmissionBudget(params, simDt);

		this.draw(input, params);
	}

	clearSimulation(): void {
		for (const p of this.particles) {
			p.active = false;
		}
		this.ambientAccumulators.clear();
		this.burstAccumulators.clear();
		this.emissionScale = 1;
		// Blank the visible default framebuffer too. preserveDrawingBuffer:true
		// retains the last spark frame in the drawing buffer; when this renderer is
		// parked warm (canvas hidden via keep-warm) then re-shown, the browser
		// composites that stale frame for one frame before draw()'s gl.clear runs.
		// Clearing here mirrors fire's clearSimulation and removes the flash.
		// (0,0,0,0) is correct under premultipliedAlpha:true.
		const gl = this.gl;
		if (gl && this.initialized) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
	}

	/**
	 * True while sparks emitted earlier are still alive. The render loop keeps
	 * calling renderCharcoal() with an empty tip list for as long as this holds,
	 * so a shower already in the air finishes falling when its prop is swapped
	 * for hands instead of freezing on the canvas. Mirrors the fire renderer's
	 * hasResidualFire().
	 */
	hasActiveParticles(): boolean {
		for (const p of this.particles) {
			if (p.active) return true;
		}
		return false;
	}

	dispose(): void {
		this.cleanup();
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	getCanvas(): HTMLCanvasElement | null {
		return this.canvas;
	}

	setCanvasZIndex(z: number): void {
		if (this.canvas) this.canvas.style.zIndex = String(z);
	}

	getGl(): WebGL2RenderingContext | null {
		return this.gl;
	}

	// Parameter updates

	/** Update spark params from external sliders. Only reallocates pool when maxParticles changes. */
	setParams(params: CharcoalSparkParams): void {
		const poolChanged = params.maxParticles !== this.maxParticles;
		this.currentParams = params;

		if (poolChanged) {
			this.allocateParticlePool(params.maxParticles);
			this.resizeGPUBuffers();
		}
	}

	// Particle pool

	private allocateParticlePool(count: number): void {
		this.maxParticles = count;
		this.spawnCursor = 0;
		this.particles = [];
		for (let i = 0; i < count; i++) {
			this.particles.push({
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				life: 0,
				maxLife: 0,
				size: 0,
				temperature: 0,
				active: false,
			});
		}

		// CPU-side typed arrays
		this.positionData = new Float32Array(count * 2);
		this.sizeData = new Float32Array(count);
		this.colorData = new Float32Array(count * 4);
	}

	// Emission

	/**
	 * Place the spawn origin for particle `index` of a batch of `count`.
	 *
	 * Every particle a frame emits used to spawn at the tip's end-of-frame
	 * position. At a steady 60fps the tip barely moves between frames and that
	 * reads as a stream; the moment a frame runs long the tip jumps, and the
	 * whole batch lands in one spot with a gap behind it - coal arriving in fat
	 * slices instead of a continuous shower. Spreading the batch along the
	 * segment the tip actually swept restores the stream: the particles were
	 * emitted over that span of time, so they belong over that span of space.
	 *
	 * Stratified with a jittered offset rather than evenly spaced, or a large
	 * batch draws a visible picket fence of sparks along the path.
	 */
	private resolveSpawnOrigin(tip: PropTipData, index: number, count: number): number {
		if (this.segmentIsTeleport) {
			this.spawnOriginX = tip.x;
			this.spawnOriginY = tip.y;
			return 0;
		}

		// local = 0 is the start of THIS sub-step (oldest spark of the slice),
		// 1 the end. Position maps it into the sub-step's share of the frame's
		// travel; age is local to the sub-step, since the remaining sub-steps
		// will age the spark the rest of the way themselves.
		const local = (index + Math.random()) / count;
		const u = this.segU0 + (this.segU1 - this.segU0) * local;
		this.spawnOriginX = tip.prevX + (tip.x - tip.prevX) * u;
		this.spawnOriginY = tip.prevY + (tip.y - tip.prevY) * u;
		return 1 - local;
	}

	/**
	 * Holds emission to what the particle pool can actually sustain.
	 *
	 * A pool holds (spawn rate x lifetime) sparks in equilibrium. Every coal
	 * preset asks for far more than that: at intensity 0.90 forge-burst emits
	 * around 49,000 sparks a second into a 4,520 slot pool against a nominal
	 * 1.96s lifetime, which is 15x oversubscribed. The pool is therefore always
	 * full and every spawn recycles a living spark, so sparks survive 130ms of
	 * the ~2s they were given - 7% of their lifetime.
	 *
	 * That is what made the shower read as fat slices rather than coal. The
	 * whole pool is packed into the 130ms of trail nearest the tip, where
	 * additive blending saturates it to flat white lumps, and there is nothing
	 * behind them because every older spark was recycled to feed the front.
	 *
	 * Throttling emission to the sustainable rate spends the same pool over the
	 * full lifetime instead: the same number of sparks on screen, spread across
	 * a trail ~15x longer, at a density that reads as individual embers.
	 *
	 * The scale is derived from the PREVIOUS frame's demand, which makes this a
	 * feedback loop - so it is computed against the unthrottled rate, or the
	 * throttle would relax as soon as it took effect and oscillate. Eased
	 * rather than applied outright so a speed change does not step the density.
	 */
	private applyEmissionBudget(params: CharcoalSparkParams, simDt: number): void {
		if (simDt <= 0 || this.maxParticles <= 0) return;

		const avgLifetime = Math.max(0.05, (params.lifetimeMin + params.lifetimeMax) / 2);

		// The authored lifetime is only an UPPER bound on how long a spark lasts:
		// most of them leave the frame and get culled well before it. Budgeting
		// against the authored figure therefore reserves the pool for sparks that
		// no longer exist, and the visible shower pays for it - which is how a
		// correct throttle still produced a thin scatter.
		//
		// Little's law gives the real number from what the pool is holding:
		// mean survival = live sparks / spawn rate. It is only trusted while the
		// pool has headroom. A saturated pool shortens survival by recycling, and
		// feeding THAT back would raise the budget, saturate harder, and run away.
		let liveCount = 0;
		for (const p of this.particles) if (p.active) liveCount++;
		const spawnRate = this.spawnsThisFrame / simDt;
		const saturated = liveCount >= this.maxParticles * 0.95;
		const observedLifetime =
			!saturated && spawnRate > 0 ? liveCount / spawnRate : avgLifetime;
		const effectiveLifetime = Math.max(
			0.05,
			Math.min(avgLifetime, observedLifetime)
		);
		const sustainableRate = this.maxParticles / effectiveLifetime;
		const unthrottledRate =
			this.spawnsThisFrame / simDt / Math.max(0.01, this.emissionScale);

		const target =
			unthrottledRate > sustainableRate
				? Math.max(0.01, sustainableRate / unthrottledRate)
				: 1;

		this.emissionScale += (target - this.emissionScale) * 0.2;
	}

	/**
	 * A jump-cut and a stuttering frame both hand us a large prev->current
	 * distance, and distance alone cannot separate them - both are bounded by
	 * the canvas, not by time. The frame's duration is the tiebreaker: a seek
	 * arrives on an ordinary-length frame, while a stutter's distance is large
	 * precisely BECAUSE the frame ran long. So the threshold grows with the
	 * frame, up to a bound.
	 *
	 * Biased toward interpolating: mistaking travel for a teleport dumps the
	 * whole frame's emission on one point, which is the visible hole this work
	 * exists to remove. Mistaking a seek for travel draws a faint streak that
	 * fades within a spark lifetime.
	 */
	private resolveSegmentKind(tip: PropTipData, frameDt: number): void {
		const dx = tip.x - tip.prevX;
		const dy = tip.y - tip.prevY;
		const slack = Math.min(3, Math.max(1, frameDt * 60));
		const limit = this.teleportDistance * slack;
		this.segmentIsTeleport = dx * dx + dy * dy > limit * limit;
	}

	private emitFromTip(
		tip: PropTipData,
		params: CharcoalSparkParams,
		stepDt: number,
		frameDt: number
	): void {
		this.resolveSegmentKind(tip, frameDt);

		const scale = this.canvasScale;
		const stepShare = this.segU1 - this.segU0;
		const tipKey = `${tip.propIndex}_${tip.tipIndex}`;
		// tip.jerk and tip.speed are derivatives of a canvas-pixel position, so
		// they shrink with the container. Thresholds authored against the
		// reference canvas have to shrink with them or a small preview never
		// clears the gate and emits nothing.
		const motion = this.motionScale;

		// Burst emission on high jerk (direction reversals). Note that for a tip
		// on a spinning prop this gate is effectively always open - a 1.5 rev/s
		// spin reports a jerk around 33,000 against a threshold of 23 at high
		// intensity - so the burst behaves as a second, saturated ambient
		// channel rather than an occasional reversal pop. It is spread along the
		// travel segment for that reason: at max rate it IS the stream.
		if (tip.jerk > params.burstThreshold * motion) {
			const excess = tip.jerk - params.burstThreshold * motion;
			const frameCount = Math.min(
				(excess / motion) * params.burstMultiplier * scale,
				params.burstMax * scale
			);
			const accumulated =
				(this.burstAccumulators.get(tipKey) ?? 0) +
				frameCount * stepShare * this.emissionScale;
			const count = Math.floor(accumulated);
			this.burstAccumulators.set(tipKey, accumulated - count);

			for (let i = 0; i < count; i++) {
				this.spawnParticle(tip, params, this.resolveSpawnOrigin(tip, i, count) * stepDt);
			}
			this.spawnsThisFrame += count;
		}

		// Ambient emission during sustained movement - proportional to speed.
		// Scaled by canvas area so small previews aren't overwhelmed.
		if (tip.speed > params.ambientSpeedThreshold * motion) {
			const speedFactor = tip.speed / (150 * motion);
			const accumulated =
				(this.ambientAccumulators.get(tipKey) ?? 0) +
				params.ambientRate * speedFactor * scale * stepDt * this.emissionScale;
			const toEmit = Math.floor(accumulated);

			this.ambientAccumulators.set(tipKey, accumulated - toEmit);

			for (let i = 0; i < toEmit; i++) {
				this.spawnParticle(tip, params, this.resolveSpawnOrigin(tip, i, toEmit) * stepDt);
			}
			this.spawnsThisFrame += toEmit;
		} else if (params.idleRate > 0) {
			const accumulated =
				(this.ambientAccumulators.get(tipKey) ?? 0) +
				params.idleRate * scale * stepDt * this.emissionScale;
			const toEmit = Math.floor(accumulated);

			this.ambientAccumulators.set(tipKey, accumulated - toEmit);
			this.spawnsThisFrame += toEmit;

			for (let i = 0; i < toEmit; i++) {
				this.spawnIdleParticle(tip, params, this.resolveSpawnOrigin(tip, i, toEmit) * stepDt);
			}
		}
	}

	/**
	 * @param age Seconds elapsed since this spark was conceptually emitted, from
	 *   0 (end of frame) up to dt. Catching each spark up by its own age keeps a
	 *   batch from being born as one synchronised cohort that then dies as one.
	 */
	private spawnParticle(
		tip: PropTipData,
		params: CharcoalSparkParams,
		age: number
	): void {
		// Find an inactive slot (oldest first)
		const slot = this.findInactiveSlot();
		if (!slot) return;

		// Inherit a fraction of the tip's velocity vector.
		// Sparks carry the tip's momentum - they fly where the tip was going
		// but slower, so the tip leaves them behind. On direction reversals,
		// the burst system (jerk detection) creates the dramatic spark pops.
		//
		// Jittered per spark, and that jitter is load-bearing rather than
		// decoration. A frame's batch is spawned spread along the segment the
		// tip swept, but every spark then flies at the SAME fraction of the tip's
		// speed, so the batch translates as a rigid body and closes back up to
		// (1 - inheritance) of the segment it was spread across. Consecutive
		// frames therefore land as separate packets with clear air between them:
		// the shower breaks into discrete slices instead of reading as a stream.
		// Varying the fraction makes each batch shear out and overlap its
		// neighbours, which is also the truer behaviour - embers do not all
		// leave the prop with the same grip. The mean is left on the authored
		// parameter so preset tuning still means what it meant.
		const inherit = params.velocityInheritance * (0.55 + Math.random() * 0.9);
		const inheritedVx = tip.velocityX * inherit;
		const inheritedVy = tip.velocityY * inherit;

		// Add random perturbation centered on the tip's velocity direction.
		// If the tip is nearly stationary, use a fully random direction.
		const perturbAngle =
			tip.speed > this.motionScale
				? Math.atan2(tip.velocityY, tip.velocityX) +
					(Math.random() - 0.5) * 2.0 * params.spreadAngle
				: Math.random() * Math.PI * 2;

		// Inherited velocity already scales - it comes from a tip moving in
		// canvas pixels. The perturbation does not, so it gets motionScale or
		// it would fling sparks clean off a small frame while the inherited
		// component barely moved them.
		const perturbSpeed =
			(params.perturbSpeedMin +
				Math.random() * (params.perturbSpeedMax - params.perturbSpeedMin)) *
			this.motionScale;

		slot.vx = inheritedVx + Math.cos(perturbAngle) * perturbSpeed;
		slot.vy = inheritedVy + Math.sin(perturbAngle) * perturbSpeed;
		slot.x = this.spawnOriginX + slot.vx * age;
		slot.y = this.spawnOriginY + slot.vy * age;
		slot.maxLife =
			params.lifetimeMin +
			Math.random() * (params.lifetimeMax - params.lifetimeMin);
		slot.life = Math.max(0.001, slot.maxLife - age);
		slot.size =
			(params.sizeMin + Math.random() * (params.sizeMax - params.sizeMin)) *
			this.sizeScale;
		slot.temperature = 1.0;
		slot.active = true;
	}

	/**
	 * Spawn a low-energy particle for idle/stationary tips.
	 * Minimal horizontal velocity - gravity pulls them straight down
	 * like embers falling off a still-burning prop.
	 */
	private spawnIdleParticle(
		_tip: PropTipData,
		params: CharcoalSparkParams,
		age: number
	): void {
		const slot = this.findInactiveSlot();
		if (!slot) return;

		// Random direction, very low speed (just enough to spread slightly)
		const angle = Math.random() * Math.PI * 2;
		const speed = params.perturbSpeedMin * 0.3 * this.motionScale;

		slot.vx = Math.cos(angle) * speed;
		slot.vy = Math.sin(angle) * speed;
		slot.x = this.spawnOriginX + slot.vx * age;
		slot.y = this.spawnOriginY + slot.vy * age;
		slot.maxLife =
			params.lifetimeMin +
			Math.random() * (params.lifetimeMax - params.lifetimeMin) * 0.6;
		slot.life = Math.max(0.001, slot.maxLife - age);
		slot.size =
			(params.sizeMin + Math.random() * (params.sizeMax - params.sizeMin) * 0.5) *
			this.sizeScale;
		slot.temperature = 0.7 + Math.random() * 0.3; // Cooler starting temp
		slot.active = true;
	}

	private findInactiveSlot(): CharcoalSpark | null {
		// First pass: find any inactive slot
		if (this.particles.length === 0) return null;

		// Hand out slots in a fixed cycle. Because slots are written in cyclic
		// order, the one the cursor is pointing at is always the slot written
		// longest ago - which is exactly "recycle the spark that has been alive
		// the longest", so the shower truncates cleanly at its tail.
		//
		// Two bugs died here. The old code scanned the whole pool for the lowest
		// REMAINING life, which is only the same as oldest when every spark
		// shares a maxLife - and they do not, maxLife is randomised across a
		// factor of ~2.7. Remaining life is therefore uncorrelated with position
		// along the trail, so recycling killed sparks at random points in the
		// middle of the visible shower and punched holes in it.
		//
		// It was also the single most expensive thing this renderer did. The
		// scan is O(pool) and runs once PER SPAWN: 828 spawns a frame over a
		// 4,520 slot pool at intensity 0.90 is 3.7 million comparisons a frame,
		// which measured at 10.9ms - two thirds of the entire 16.7ms frame
		// budget, for the whole app, spent finding array indices. That is what
		// was making playback stutter in the first place.
		const slot = this.particles[this.spawnCursor]!;
		this.spawnCursor = (this.spawnCursor + 1) % this.particles.length;
		return slot;
	}

	// ======================================================================
	// Physics
	// ======================================================================

	/**
	 * Whether a spark is outside the frame and not coming back.
	 *
	 * Asymmetric on purpose. Nothing in this simulation accelerates a spark back
	 * toward the frame horizontally, and below the bottom edge gravity only
	 * takes it further - those are one-way trips. Above the TOP edge gravity is
	 * a restoring force, so a spark thrown over the top genuinely does come
	 * back and is left alone; only the far-field bound catches it.
	 */
	private hasLeftFrame(p: CharcoalSpark): boolean {
		const m = this.cullMargin;
		const w = this.frameWidth;
		const h = this.frameHeight;

		// Far field: too distant to return within any lifetime, whatever it is
		// doing. Also catches the slow inward drifter the directional tests keep.
		const far = m + Math.max(w, h);
		if (p.x < -far || p.x > w + far || p.y < -far || p.y > h + far) return true;

		if (p.x < -m && p.vx <= 0) return true;
		if (p.x > w + m && p.vx >= 0) return true;
		if (p.y > h + m && p.vy >= 0) return true;

		return false;
	}

	private updateParticles(params: CharcoalSparkParams, dt: number): void {
		const dragPerFrame = Math.pow(params.drag, dt);

		for (const p of this.particles) {
			if (!p.active) continue;

			// Apply gravity (positive = downward in viewbox Y-down space).
			// Scaled so an ember falls the same fraction of the frame per
			// second at any container size - unscaled, 480 px/s^2 dropped a
			// spark clean out of a 250px preview in well under a second.
			p.vy += params.gravity * this.motionScale * dt;

			// Apply drag
			p.vx *= dragPerFrame;
			p.vy *= dragPerFrame;

			// Integrate position
			p.x += p.vx * dt;
			p.y += p.vy * dt;

			// Retire sparks that have left the frame for good. Without this they
			// stayed in the pool for the whole of their lifetime: measured at Hot
			// Coal's settings, 69% of live sparks were outside the canvas -
			// stepped every frame, counted against the emission budget, and never
			// drawn. Reclaiming those slots is what lets the visible shower carry
			// its density again.
			if (this.hasLeftFrame(p)) {
				p.active = false;
				continue;
			}

			// Decay lifetime and temperature
			p.life -= dt;
			p.temperature = Math.max(0, p.life / p.maxLife);

			// Shrink over life
			if (params.shrinkOverLife) {
				// Keep original spawn size encoded in maxLife ratio
				// size stays constant first 50%, then shrinks
				const lifeRatio = p.life / p.maxLife;
				if (lifeRatio < 0.5) {
					// sizeMin is the floor; original size is in p.size
					// We don't want to keep overwriting, so just scale
					// Actually we need original size. Use temperature as proxy:
					// at t=0.5, size = full. at t=0, size = sizeMin
					// Avoid storing extra data by using a smooth ramp
				}
			}

			// Deactivate dead particles
			if (p.life <= 0) {
				p.active = false;
			}
		}
	}

	// ======================================================================
	// Rendering
	// ======================================================================

	private draw(input: FireFrameInput, params: CharcoalSparkParams): void {
		const gl = this.gl!;
		const canvas = this.canvas!;

		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT);

		const resolution: [number, number] = [canvas.width, canvas.height];
		const viewbox: [number, number] = [input.canvasWidth, input.canvasHeight];

		this.drawSparks(gl, params, resolution, viewbox);
		this.drawEmberGlows(gl, params, input.tips, resolution, viewbox);
	}

	private drawSparks(
		gl: WebGL2RenderingContext,
		params: CharcoalSparkParams,
		resolution: [number, number],
		viewbox: [number, number]
	): void {
		if (!this.sparkProgram || !this.sparkVAO) return;

		// Build CPU arrays from active particles
		let activeCount = 0;
		for (const p of this.particles) {
			if (!p.active) continue;
			const i = activeCount;

			// Position
			this.positionData[i * 2] = p.x;
			this.positionData[i * 2 + 1] = p.y;

			// Size (shrink in last half of life if enabled)
			let size = p.size;
			if (params.shrinkOverLife) {
				const lifeRatio = p.life / p.maxLife;
				if (lifeRatio < 0.5) {
					size *= lifeRatio * 2.0; // linear ramp from full to 0
				}
			}
			this.sizeData[i] = size;

			// Color from temperature
			const t = p.temperature;
			const [r, g, b] = this.temperatureToColor(t, params);

			// Opacity: fade in first 5%, full until 70%, fade out last 30%
			const lifeRatio = p.life / p.maxLife;
			let opacity: number;
			if (lifeRatio > 0.95) {
				// Fade in: first 5% of life
				opacity = (1.0 - lifeRatio) / 0.05;
			} else if (lifeRatio > 0.3) {
				// Full opacity
				opacity = 1.0;
			} else {
				// Fade out: last 30%
				opacity = lifeRatio / 0.3;
			}

			// Premultiply alpha for additive blending
			const a = opacity;
			this.colorData[i * 4] = r * a;
			this.colorData[i * 4 + 1] = g * a;
			this.colorData[i * 4 + 2] = b * a;
			this.colorData[i * 4 + 3] = a;

			activeCount++;
		}

		if (activeCount === 0) return;

		// Upload to GPU
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positionData, 0, activeCount * 2);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sizeData, 0, activeCount);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colorData, 0, activeCount * 4);

		// Draw
		const prog = this.sparkProgram;
		gl.useProgram(prog.program);
		gl.uniform2f(prog.uniforms.get("u_resolution")!, resolution[0], resolution[1]);
		gl.uniform2f(prog.uniforms.get("u_viewbox")!, viewbox[0], viewbox[1]);

		gl.bindVertexArray(this.sparkVAO);
		gl.drawArrays(gl.POINTS, 0, activeCount);
		gl.bindVertexArray(null);
	}

	private drawEmberGlows(
		gl: WebGL2RenderingContext,
		params: CharcoalSparkParams,
		tips: PropTipData[],
		resolution: [number, number],
		viewbox: [number, number]
	): void {
		if (!this.emberProgram || !this.emberVAO || tips.length === 0) return;

		// Resize ember position data if needed
		if (this.emberPositionData.length < tips.length * 2) {
			this.emberPositionData = new Float32Array(tips.length * 2);
		}

		for (let i = 0; i < tips.length; i++) {
			this.emberPositionData[i * 2] = tips[i]!.x;
			this.emberPositionData[i * 2 + 1] = tips[i]!.y;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.emberPositionBuffer);
		gl.bufferSubData(
			gl.ARRAY_BUFFER,
			0,
			this.emberPositionData,
			0,
			tips.length * 2
		);

		const prog = this.emberProgram;
		gl.useProgram(prog.program);
		gl.uniform2f(prog.uniforms.get("u_resolution")!, resolution[0], resolution[1]);
		gl.uniform2f(prog.uniforms.get("u_viewbox")!, viewbox[0], viewbox[1]);
		gl.uniform1f(prog.uniforms.get("u_radius")!, params.emberGlowRadius * this.sizeScale);
		gl.uniform1f(prog.uniforms.get("u_intensity")!, params.emberGlowIntensity);

		// Ember glow color: use the mid color (warm orange) normalized to 0-1
		const [mr, mg, mb] = params.midColor;
		gl.uniform4f(
			prog.uniforms.get("u_color")!,
			mr / 255,
			mg / 255,
			mb / 255,
			1.0
		);

		gl.bindVertexArray(this.emberVAO);
		gl.drawArrays(gl.POINTS, 0, tips.length);
		gl.bindVertexArray(null);
	}

	// ======================================================================
	// Color mapping
	// ======================================================================

	/**
	 * Map temperature [0, 1] through a 3-stop color ramp.
	 * Returns normalized [0, 1] RGB.
	 */
	private temperatureToColor(
		t: number,
		params: CharcoalSparkParams
	): [number, number, number] {
		let r: number, g: number, b: number;

		if (t > 0.5) {
			// Hot half: core -> mid
			const blend = (t - 0.5) * 2.0; // 0 at mid, 1 at core
			r = this.lerpChannel(params.midColor[0], params.coreColor[0], blend);
			g = this.lerpChannel(params.midColor[1], params.coreColor[1], blend);
			b = this.lerpChannel(params.midColor[2], params.coreColor[2], blend);
		} else {
			// Cool half: cool -> mid
			const blend = t * 2.0; // 0 at cool, 1 at mid
			r = this.lerpChannel(params.coolColor[0], params.midColor[0], blend);
			g = this.lerpChannel(params.coolColor[1], params.midColor[1], blend);
			b = this.lerpChannel(params.coolColor[2], params.midColor[2], blend);
		}

		// Normalize from 0-255 to 0-1
		return [r / 255, g / 255, b / 255];
	}

	private lerpChannel(a: number, b: number, t: number): number {
		return a + (b - a) * t;
	}

	// ======================================================================
	// Shader compilation
	// ======================================================================

	private compilePrograms(): boolean {
		const gl = this.gl!;

		this.sparkProgram = this.createShaderProgram(
			gl,
			SPARK_VERTEX,
			SPARK_FRAGMENT,
			["u_resolution", "u_viewbox"],
			["a_position", "a_size", "a_color"]
		);
		if (!this.sparkProgram) return false;

		this.emberProgram = this.createShaderProgram(
			gl,
			EMBER_VERTEX,
			EMBER_FRAGMENT,
			["u_resolution", "u_viewbox", "u_radius", "u_intensity", "u_color"],
			["a_position"]
		);
		if (!this.emberProgram) return false;

		return true;
	}

	private createShaderProgram(
		gl: WebGL2RenderingContext,
		vertSrc: string,
		fragSrc: string,
		uniformNames: string[],
		attributeNames: string[]
	): ShaderProgram | null {
		const vert = this.compileShader(gl, gl.VERTEX_SHADER, vertSrc);
		if (!vert) return null;

		const frag = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
		if (!frag) {
			gl.deleteShader(vert);
			return null;
		}

		const program = gl.createProgram()!;
		gl.attachShader(program, vert);
		gl.attachShader(program, frag);
		gl.linkProgram(program);

		// Shaders can be detached after linking
		gl.deleteShader(vert);
		gl.deleteShader(frag);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.warn(
				"CharcoalSparkRenderer: program link failed:",
				gl.getProgramInfoLog(program)
			);
			gl.deleteProgram(program);
			return null;
		}

		const uniforms = new Map<string, WebGLUniformLocation>();
		for (const name of uniformNames) {
			const loc = gl.getUniformLocation(program, name);
			if (loc !== null) {
				uniforms.set(name, loc);
			}
		}

		const attributes = new Map<string, number>();
		for (const name of attributeNames) {
			const loc = gl.getAttribLocation(program, name);
			if (loc >= 0) {
				attributes.set(name, loc);
			}
		}

		return { program, uniforms, attributes };
	}

	private compileShader(
		gl: WebGL2RenderingContext,
		type: number,
		source: string
	): WebGLShader | null {
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const typeLabel = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
			console.warn(
				`CharcoalSparkRenderer: ${typeLabel} shader compile failed:`,
				gl.getShaderInfoLog(shader)
			);
			gl.deleteShader(shader);
			return null;
		}

		return shader;
	}

	// ======================================================================
	// GPU buffer management
	// ======================================================================

	private createGPUBuffers(): void {
		const gl = this.gl!;

		// === Spark VAO ===
		this.sparkVAO = gl.createVertexArray();
		gl.bindVertexArray(this.sparkVAO);

		const sparkProg = this.sparkProgram!;

		// Position buffer (vec2)
		this.positionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.positionData.byteLength,
			gl.DYNAMIC_DRAW
		);
		const posLoc = sparkProg.attributes.get("a_position")!;
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		// Size buffer (float)
		this.sizeBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.sizeData.byteLength, gl.DYNAMIC_DRAW);
		const sizeLoc = sparkProg.attributes.get("a_size")!;
		gl.enableVertexAttribArray(sizeLoc);
		gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

		// Color buffer (vec4)
		this.colorBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.colorData.byteLength,
			gl.DYNAMIC_DRAW
		);
		const colorLoc = sparkProg.attributes.get("a_color")!;
		gl.enableVertexAttribArray(colorLoc);
		gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);

		// === Ember VAO ===
		this.emberVAO = gl.createVertexArray();
		gl.bindVertexArray(this.emberVAO);

		const emberProg = this.emberProgram!;

		// Ember position buffer (vec2) - up to 16 tips max
		this.emberPositionData = new Float32Array(32);
		this.emberPositionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.emberPositionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.emberPositionData.byteLength,
			gl.DYNAMIC_DRAW
		);
		const emberPosLoc = emberProg.attributes.get("a_position")!;
		gl.enableVertexAttribArray(emberPosLoc);
		gl.vertexAttribPointer(emberPosLoc, 2, gl.FLOAT, false, 0, 0);

		gl.bindVertexArray(null);
	}

	/** Resize GPU buffers when particle pool size changes. */
	private resizeGPUBuffers(): void {
		const gl = this.gl;
		if (!gl) return;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.positionData.byteLength,
			gl.DYNAMIC_DRAW
		);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.sizeData.byteLength, gl.DYNAMIC_DRAW);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.colorData.byteLength,
			gl.DYNAMIC_DRAW
		);
	}

	// ======================================================================
	// Cleanup
	// ======================================================================

	private cleanup(): void {
		const gl = this.gl;

		if (gl) {
			// Delete VAOs
			if (this.sparkVAO) gl.deleteVertexArray(this.sparkVAO);
			if (this.emberVAO) gl.deleteVertexArray(this.emberVAO);

			// Delete buffers
			if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
			if (this.sizeBuffer) gl.deleteBuffer(this.sizeBuffer);
			if (this.colorBuffer) gl.deleteBuffer(this.colorBuffer);
			if (this.emberPositionBuffer)
				gl.deleteBuffer(this.emberPositionBuffer);

			// Delete programs
			if (this.sparkProgram) gl.deleteProgram(this.sparkProgram.program);
			if (this.emberProgram) gl.deleteProgram(this.emberProgram.program);

			gl.getExtension("WEBGL_lose_context")?.loseContext();
		}

		this.sparkVAO = null;
		this.emberVAO = null;
		this.positionBuffer = null;
		this.sizeBuffer = null;
		this.colorBuffer = null;
		this.emberPositionBuffer = null;
		this.sparkProgram = null;
		this.emberProgram = null;
		this.particles = [];
		this.ambientAccumulators.clear();
		this.burstAccumulators.clear();

		if (this.canvas) {
			if (typeof (this.canvas as any).remove === "function") {
				this.canvas.remove();
			}
			this.canvas = null;
		}

		this.gl = null;
		this.initialized = false;
	}
}

// ── EffectPlugin descriptor ──────────────────────────────────────────────────
import type { EffectPlugin } from "../effects/effect-plugin";
import type { EffectRendererManager } from "../effect-renderer-manager";
import type { EffectRendererLike } from "../effects/effect-renderer";
import type { CharcoalIntent } from "$lib/shared/effects/domain/effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";

export const charcoalEffectPlugin: EffectPlugin<CharcoalIntent> = {
  id: "charcoal",
  kind: "webgl",
  createRenderer: () => new CharcoalSparkRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.charcoal,
  configKey: "charcoalRenderer",
  onInit: (mgr: EffectRendererManager, renderer: EffectRendererLike) => {
    const charcoalParams = mgr.getCharcoalParamsFromConfig();
    if (charcoalParams) (renderer as CharcoalSparkRenderer).setParams(charcoalParams);
  },
  onDisable: (mgr: EffectRendererManager) => {
    if (!mgr.isEffectEnabled("fire")) {
      mgr.fireTipTracker?.reset();
    }
  },
};
