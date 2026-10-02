/**
 * WebGLLedRenderer - photometric LED overlay
 *
 * Creates a transparent WebGL2 canvas overlaid on the Canvas2D animation canvas
 * and renders addressable LED props as a long-exposure photograph of themselves.
 *
 * Every quantity here comes from `domain/led-photometry.ts`. Nothing in this
 * file authors light: a prop carries a fixed flux budget, its LEDs divide that
 * budget between them, each LED deposits its share along the path it sweeps
 * during the frame, and the frames integrate under an explicit shutter.
 *
 * Architecture per frame:
 *   1. Streak pass:  one Gaussian capsule per LED per sub-step, additive, HDR
 *   2. Accumulate:   eye — history * exp(-dt/tau) + deposit, at a fixed gain
 *                    camera — two staggered box accumulators, same fixed gain
 *   3. Downsample:   5-level 13-tap chain, partial Karis on the first level
 *   4. Upsample:     3x3 tent mixed upward by the glare weight
 *   5. Display:      lerp composite, AgX tone map, straight-alpha output
 *
 * @deprecated Superseded by render-graph WebGPULedExecutor (WGSL port of the
 * same pipeline against the same photometry module). Gated behind
 * window.__TKA_UNIFIED_VIEWER.
 */

import type { LedFrameInput, LedOverlayConfig } from "../../domain/types/led-types";
import { ledBrightnessToFloat } from "../../domain/types/led-types";
import {
	BLOOM_COMPOSITE_STRENGTH,
	BLOOM_COMPOSITE_STRENGTH_MAX,
	BLOOM_TENT_RADIUS_FRAME_FRACTION,
	CAMERA_EXPOSURE_MAX_S,
	CAMERA_EXPOSURE_MIN_S,
	DISPLAY_EXPOSURE_GAIN,
	EYE_TIME_CONSTANT_S,
	GLARE_WEIGHT_MAX,
	GLARE_WEIGHT_MIN,
	MAX_SUB_STEPS,
	PROP_REFERENCE_FLUX,
	SHUTTER_GAIN_REFERENCE_S,
	effectiveSigmaPx,
	emitterSigmaPx,
	perLedFlux,
	shutterNormalization,
	streakDensity,
	subStepCount,
	advanceBoxShutter,
	type LedShutter,
} from "../../domain/led-photometry";
import { LED_SAMPLER_MAX_LEDS } from "../led-sampler";
import {
	FULLSCREEN_VERT,
	LED_STREAK_VERT,
	LED_STREAK_FRAG,
	LED_ACCUMULATE_FRAG,
	LED_BOX_RESOLVE_FRAG,
	BLOOM_DOWNSAMPLE_FRAG,
	BLOOM_UPSAMPLE_FRAG,
	LED_DISPLAY_FRAG,
} from "./led-shader-sources";

const MAX_DPR = 2;
const MAX_LEDS = LED_SAMPLER_MAX_LEDS;
const BLOOM_MIP_COUNT = 5;

/** Floats per instance. One instance is one sub-step of one LED.
 *  Layout: [ax, ay, bx, by, r, g, b, density, sigma, capStart, capEnd] */
const INSTANCE_STRIDE_FLOATS = 11;

/** Instances allocated up front. The buffer grows on demand up to
 *  MAX_LEDS * MAX_SUB_STEPS; a typical spin asks for 1-4 sub-steps, so
 *  reserving the ceiling would waste half a megabyte permanently. */
const INITIAL_SEGMENT_CAPACITY = MAX_LEDS * 2;
const MAX_SEGMENT_CAPACITY = MAX_LEDS * MAX_SUB_STEPS;

/** If the gap between frames exceeds this (seconds), or an LED jumps further
 *  than MAX_STREAK_VIEWBOX, the frame is a discontinuity: the capsule collapses
 *  to a stationary splat rather than stretching across a pause or a reset. */
const MAX_STREAK_DT = 0.1;
const MAX_STREAK_VIEWBOX = 400;

/** Substituted for the real elapsed time on the first frame and across a
 *  discontinuity, where the measured gap says nothing about motion. */
const FALLBACK_DT = 1 / 60;
const MIN_DT = 1 / 240;

// Framebuffer types (mirrored from WebGLFireRenderer)

interface DoubleFBO {
	read: FBOAttachment;
	write: FBOAttachment;
}

interface FBOAttachment {
	fbo: WebGLFramebuffer;
	texture: WebGLTexture;
}

// Shader program with cached uniform locations

interface ShaderProgram {
	program: WebGLProgram;
	uniforms: Map<string, WebGLUniformLocation>;
}

/** One prop's LEDs for one frame. Photometry is per-prop: flux, footprint and
 *  sub-step count all depend on how many LEDs share this strip and how long it
 *  is on screen. */
interface PropGroup {
	/** Indices into `input.leds`. */
	members: number[];
	firstLedIndex: number;
	lastLedIndex: number;
	firstMember: number;
	lastMember: number;
}

export class WebGLLedRenderer {
	private canvas: HTMLCanvasElement | null = null;
	private gl: WebGL2RenderingContext | null = null;
	private initialized = false;
	private dpr = 1;

	// Shader programs
	private streakProgram: ShaderProgram | null = null;
	private accumProgram: ShaderProgram | null = null;
	private boxResolveProgram: ShaderProgram | null = null;
	private bloomDownProgram: ShaderProgram | null = null;
	private bloomUpProgram: ShaderProgram | null = null;
	private displayProgram: ShaderProgram | null = null;

	// Geometry
	private quadVAO: WebGLVertexArrayObject | null = null;
	private streakVAO: WebGLVertexArrayObject | null = null;
	private quadBuffer: WebGLBuffer | null = null;
	private instanceBuffer: WebGLBuffer | null = null;
	private segmentCapacity = INITIAL_SEGMENT_CAPACITY;
	private instanceData: Float32Array = new Float32Array(
		INITIAL_SEGMENT_CAPACITY * INSTANCE_STRIDE_FLOATS,
	);

	/** Per-LED previous-frame positions in input canvas coords, keyed by
	 *  `propIndex*1000 + ledIndex`. Those coords include the frame's centring
	 *  offset, so they are only comparable while the input frame keeps its size;
	 *  see `inputFrame`. */
	private prevPositions: Map<number, { x: number; y: number }> = new Map();
	/** The input frame the stored positions were measured in. A change moves
	 *  every LED at once (the square re-centres and rescales), which would
	 *  otherwise deposit a streak from the old spot to the new one. */
	private inputFrame = { width: 0, height: 0 };
	/** Previous-frame position of each LED in this frame's order, viewbox coords. */
	private prevScratch = new Float32Array(MAX_LEDS * 2);
	/** Reused across frames; a per-frame Map would allocate inside the RAF loop. */
	private propGroups: Map<number, PropGroup> = new Map();
	/** Sub-step rotation and center tables, indexed 0..subSteps. */
	private stepCos = new Float32Array(MAX_SUB_STEPS + 1);
	private stepSin = new Float32Array(MAX_SUB_STEPS + 1);
	private stepCx = new Float32Array(MAX_SUB_STEPS + 1);
	private stepCy = new Float32Array(MAX_SUB_STEPS + 1);
	/** Timestamp of the last frame rendered, in seconds (from the input). */
	private lastFrameTime = -1;

	// Framebuffers
	private depositFBO: FBOAttachment | null = null;
	private accumFBOs: DoubleFBO | null = null;
	/** The two staggered box-shutter accumulators. Camera mode only; allocated
	 *  with the rest so a shutter switch never stalls on a texture upload. */
	private boxFBOs: { a: FBOAttachment; b: FBOAttachment } | null = null;
	/** Seconds each box accumulator has been integrating. Seeded one exposure
	 *  apart on the first camera frame; see advanceBoxShutter. */
	private boxAgeA = 0;
	private boxAgeB = 0;
	private boxSeeded = false;
	private bloomMips: FBOAttachment[] = [];
	private bloomMipSizes: Array<{ w: number; h: number }> = [];

	// Display dimensions (physical pixels)
	private displayWidth = 0;
	private displayHeight = 0;

	// Reduced motion
	private reducedMotion = false;

	initialize(container: HTMLElement, width: number, height: number): boolean {
		this.canvas = document.createElement("canvas");
		this.canvas.style.position = "absolute";
		this.canvas.style.top = "0";
		this.canvas.style.left = "0";
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.canvas.style.pointerEvents = "none";
		this.canvas.style.zIndex = "3";
		this.canvas.style.background = "transparent";
		this.canvas.setAttribute("aria-hidden", "true");

		this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		this.displayWidth = Math.round(width * this.dpr);
		this.displayHeight = Math.round(height * this.dpr);
		this.canvas.width = this.displayWidth;
		this.canvas.height = this.displayHeight;

		container.appendChild(this.canvas);

		return this.initGLContext(width, height, true);
	}

	initializeHeadless(width: number, height: number): boolean {
		this.canvas = new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
		this.dpr = 1;
		this.displayWidth = width;
		this.displayHeight = height;
		return this.initGLContext(width, height, false);
	}

	private initGLContext(_width: number, _height: number, isDom: boolean): boolean {
		this.gl = this.canvas!.getContext("webgl2", {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true,
		}) as WebGL2RenderingContext | null;

		if (!this.gl) {
			console.warn("WebGL2 not available for LED overlay");
			this.cleanup();
			return false;
		}

		const gl = this.gl;

		const ext = gl.getExtension("EXT_color_buffer_float");
		if (!ext) {
			console.warn("EXT_color_buffer_float not available - LED overlay requires float FBOs");
			this.cleanup();
			return false;
		}
		gl.getExtension("OES_texture_float_linear");

		if (!this.compileAllPrograms()) {
			this.cleanup();
			return false;
		}

		this.createGeometry();
		this.createFramebuffers();
		this.clearAllFramebuffers();

		gl.disable(gl.DEPTH_TEST);

		if (isDom && typeof window !== "undefined" && window.matchMedia) {
			this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		}

		this.initialized = true;
		return true;
	}

	resize(width: number, height: number): void {
		if (!this.canvas || !this.gl) return;

		this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		this.displayWidth = Math.round(width * this.dpr);
		this.displayHeight = Math.round(height * this.dpr);
		this.canvas.width = this.displayWidth;
		this.canvas.height = this.displayHeight;

		// Recreate all framebuffers at new size
		this.destroyFramebuffers();
		this.createFramebuffers();
		this.clearAllFramebuffers();
	}

	private _diagFrameCount = 0;

	// Nuclear blast diagnostic flags — set from console:
	// window.__tka_led_blast = { noTrail: true }  etc.
	private getBlastFlags(): { noTrail: boolean; noBloom: boolean; noBloomUpsample: boolean; spritesOnly: boolean } {
		const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>).__tka_led_blast as Record<string, boolean> | undefined : undefined;
		return {
			noTrail: w?.noTrail === true,
			noBloom: w?.noBloom === true,
			noBloomUpsample: w?.noBloomUpsample === true,
			spritesOnly: w?.spritesOnly === true,
		};
	}

	renderLeds(input: LedFrameInput, config: LedOverlayConfig): void {
		if (!this.gl || !this.initialized) return;
		const gl = this.gl;

		if (this._diagFrameCount < 3) {
			this._diagFrameCount++;
		}

		const blast = this.getBlastFlags();

		if (input.leds.length === 0) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			return;
		}

		// Reset blend state to known baseline before each frame
		gl.disable(gl.BLEND);

		const currentTimeSec = input.currentTime / 1000;
		const rawDt = this.lastFrameTime >= 0 ? currentTimeSec - this.lastFrameTime : 0;
		const isDiscontinuity = rawDt <= 0 || rawDt > MAX_STREAK_DT;
		const dt = isDiscontinuity
			? FALLBACK_DT
			: Math.min(Math.max(rawDt, MIN_DT), MAX_STREAK_DT);
		this.lastFrameTime = currentTimeSec;

		const segmentCount = this.buildSegments(input, config, dt, isDiscontinuity);
		if (segmentCount === 0) return;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
		gl.bufferSubData(
			gl.ARRAY_BUFFER,
			0,
			this.instanceData.subarray(0, segmentCount * INSTANCE_STRIDE_FLOATS),
		);

		// 1. Deposit this frame's streaks into the HDR buffer. Additive, because
		//    two emitters lighting the same pixel deposit the sum of their energy.
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depositFBO!.fbo);
		gl.viewport(0, 0, this.displayWidth, this.displayHeight);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.useProgram(this.streakProgram!.program);
		gl.uniform2f(
			this.streakProgram!.uniforms.get("u_resolution")!,
			this.displayWidth,
			this.displayHeight,
		);
		gl.bindVertexArray(this.streakVAO);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, segmentCount);
		gl.bindVertexArray(null);

		// 2. Shutter accumulation
		const configured = config.look.shutter;
		// Reduced motion holds exactly one frame, so the box path's two-buffer
		// integration has nothing to integrate — take the eye path either way.
		const useBox =
			configured.mode === "camera" &&
			!this.reducedMotion &&
			!blast.noTrail &&
			!blast.spritesOnly &&
			this.boxFBOs !== null &&
			this.boxResolveProgram !== null;
		if (useBox) {
			this.accumulateBoxShutter(configured.exposureSeconds, dt);
		} else {
			// Whatever is in the box buffers is now stale by an unknown gap, so
			// re-entering camera mode starts from a clean, correctly staggered pair.
			this.boxSeeded = false;
		}
		const shutter = this.resolveShutter(configured);
		if (!useBox && !blast.noTrail && !blast.spritesOnly) {
			const tau = Math.max(shutter.timeConstantSeconds, 1e-6);
			// exp(-dt/tau), not a per-frame constant: the constant made the same
			// look decay differently at 30 and 60fps.
			const decay = this.reducedMotion ? 0 : Math.exp(-dt / tau);
			// Scales to a fixed detector gain, not to the persistence window — see
			// `shutterNormalization`. With persistence suppressed the accumulation
			// holds exactly one frame instead of integrating, so that branch is
			// scaled by the frame's own weight to land where a dwelling emitter
			// lands at the reference constant.
			const normalization = this.reducedMotion ? dt : shutterNormalization(shutter, dt);

			gl.disable(gl.BLEND);
			gl.useProgram(this.accumProgram!.program);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFBOs!.write.fbo);
			gl.viewport(0, 0, this.displayWidth, this.displayHeight);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.depositFBO!.texture);
			gl.uniform1i(this.accumProgram!.uniforms.get("u_deposit")!, 0);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.accumFBOs!.read.texture);
			gl.uniform1i(this.accumProgram!.uniforms.get("u_history")!, 1);
			gl.uniform1f(this.accumProgram!.uniforms.get("u_decay")!, decay);
			gl.uniform1f(
				this.accumProgram!.uniforms.get("u_depositScale")!,
				1 / Math.max(normalization, 1e-6),
			);
			gl.bindVertexArray(this.quadVAO);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindVertexArray(null);
			this.swapFBO(this.accumFBOs!);
		}

		const sceneTexture = (blast.noTrail || blast.spritesOnly)
			? this.depositFBO!.texture
			: this.accumFBOs!.read.texture;

		// 3-4. Glare pyramid
		if (!blast.noBloom && !blast.spritesOnly) {
			// 3. Downsample. No threshold and no knee: the buffer holds nothing
			//    but emitter light, so there is nothing to separate out.
			let srcTexture = sceneTexture;
			let srcWidth = this.displayWidth;
			let srcHeight = this.displayHeight;
			gl.disable(gl.BLEND);
			gl.useProgram(this.bloomDownProgram!.program);
			gl.bindVertexArray(this.quadVAO);

			for (let i = 0; i < this.bloomMips.length; i++) {
				const mip = this.bloomMips[i]!;
				const mipSize = this.bloomMipSizes[i]!;
				gl.bindFramebuffer(gl.FRAMEBUFFER, mip.fbo);
				gl.viewport(0, 0, mipSize.w, mipSize.h);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, srcTexture);
				gl.uniform1i(this.bloomDownProgram!.uniforms.get("u_source")!, 0);
				gl.uniform2f(
					this.bloomDownProgram!.uniforms.get("u_texelSize")!,
					1.0 / srcWidth,
					1.0 / srcHeight,
				);
				// Karis on the first level only. The LED cores are the fireflies;
				// suppressing them at every level averages the subject away.
				gl.uniform1f(this.bloomDownProgram!.uniforms.get("u_karis")!, i === 0 ? 1 : 0);
				gl.drawArrays(gl.TRIANGLES, 0, 6);

				srcTexture = mip.texture;
				srcWidth = mipSize.w;
				srcHeight = mipSize.h;
			}

			// 4. Upsample. Constant-alpha blending performs mix(up, tent, w) with
			//    w the per-mip glare weight, whose geometric progression is what
			//    sets the falloff exponent.
			if (!blast.noBloomUpsample) {
				const glare = Math.min(
					GLARE_WEIGHT_MAX,
					Math.max(GLARE_WEIGHT_MIN, config.look.glare),
				);
				const tentY = BLOOM_TENT_RADIUS_FRAME_FRACTION;
				const tentX = tentY * (this.displayHeight / Math.max(this.displayWidth, 1));

				gl.enable(gl.BLEND);
				gl.blendColor(0, 0, 0, glare);
				gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
				gl.useProgram(this.bloomUpProgram!.program);
				gl.uniform2f(this.bloomUpProgram!.uniforms.get("u_tentOffset")!, tentX, tentY);
				for (let i = this.bloomMips.length - 1; i > 0; i--) {
					const target = this.bloomMips[i - 1]!;
					const source = this.bloomMips[i]!;
					const targetSize = this.bloomMipSizes[i - 1]!;
					gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
					gl.viewport(0, 0, targetSize.w, targetSize.h);
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, source.texture);
					gl.uniform1i(this.bloomUpProgram!.uniforms.get("u_source")!, 0);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
				}
				gl.disable(gl.BLEND);
			}
			gl.bindVertexArray(null);
		}

		// 5. Composite and tone map, once, to the visible canvas.
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(
			gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
			gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
		);
		gl.useProgram(this.displayProgram!.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
		gl.uniform1i(this.displayProgram!.uniforms.get("u_scene")!, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.bloomMips[0]!.texture);
		gl.uniform1i(this.displayProgram!.uniforms.get("u_bloom")!, 1);
		gl.uniform1f(
			this.displayProgram!.uniforms.get("u_bloomStrength")!,
			(blast.noBloom || blast.spritesOnly)
				? 0.0
				: Math.min(BLOOM_COMPOSITE_STRENGTH, BLOOM_COMPOSITE_STRENGTH_MAX),
		);
		gl.uniform1f(
			this.displayProgram!.uniforms.get("u_exposure")!,
			DISPLAY_EXPOSURE_GAIN,
		);
		gl.bindVertexArray(this.quadVAO);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
	}

	// Photometry -> instance data

	/**
	 * Integrates this frame's deposit into the two staggered box accumulators and
	 * resolves them into the scene texture the rest of the pipeline reads.
	 *
	 * Each accumulator is a plain sum with no decay, cleared every two exposures;
	 * scaling by the fixed sensor gain turns that sum into radiance, which is what
	 * a camera integrating at constant gain measures. Staggering the pair one
	 * exposure apart and blending under complementary triangular weights hides the
	 * clears and pins the effective window to exactly one exposure. See
	 * `advanceBoxShutter` and `LED_BOX_RESOLVE_FRAG`.
	 */
	private accumulateBoxShutter(exposureSeconds: number, dt: number): void {
		const gl = this.gl!;
		const box = this.boxFBOs!;
		const resolve = this.boxResolveProgram!;
		const exposure = Math.min(
			CAMERA_EXPOSURE_MAX_S,
			Math.max(CAMERA_EXPOSURE_MIN_S, exposureSeconds),
		);

		if (!this.boxSeeded) {
			// One exposure of stagger across a two-exposure period: see
			// advanceBoxShutter for why that is what integrates over `exposure`.
			this.boxAgeA = 0;
			this.boxAgeB = exposure;
			this.boxSeeded = true;
			gl.disable(gl.BLEND);
			for (const target of [box.a, box.b]) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
				gl.viewport(0, 0, this.displayWidth, this.displayHeight);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
			}
		}

		const phase = advanceBoxShutter(this.boxAgeA, this.boxAgeB, exposure, dt);
		this.boxAgeA = phase.ageA;
		this.boxAgeB = phase.ageB;

		// Add this frame's deposit to both sums. The accumulate program doubles as
		// the blit — a decay of 0 discards its history sample — and ONE/ONE
		// blending is what performs the accumulation, so no target is ever also an
		// input.
		gl.useProgram(this.accumProgram!.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.depositFBO!.texture);
		gl.uniform1i(this.accumProgram!.uniforms.get("u_deposit")!, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.depositFBO!.texture);
		gl.uniform1i(this.accumProgram!.uniforms.get("u_history")!, 1);
		gl.uniform1f(this.accumProgram!.uniforms.get("u_decay")!, 0);
		gl.uniform1f(this.accumProgram!.uniforms.get("u_depositScale")!, 1);
		gl.bindVertexArray(this.quadVAO);

		for (const [target, reset] of [
			[box.a, phase.resetA],
			[box.b, phase.resetB],
		] as Array<[FBOAttachment, boolean]>) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			gl.viewport(0, 0, this.displayWidth, this.displayHeight);
			if (reset) {
				gl.disable(gl.BLEND);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
			}
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}
		gl.disable(gl.BLEND);

		// Resolve into the exponential path's own target, so both shutters hand the
		// same texture downstream and a mode switch inherits a valid history rather
		// than one black frame.
		gl.useProgram(resolve.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFBOs!.write.fbo);
		gl.viewport(0, 0, this.displayWidth, this.displayHeight);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, box.a.texture);
		gl.uniform1i(resolve.uniforms.get("u_boxA")!, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, box.b.texture);
		gl.uniform1i(resolve.uniforms.get("u_boxB")!, 1);
		gl.uniform1f(resolve.uniforms.get("u_weightA")!, phase.weightA);
		gl.uniform1f(resolve.uniforms.get("u_weightB")!, phase.weightB);
		gl.uniform1f(resolve.uniforms.get("u_invGain")!, 1 / SHUTTER_GAIN_REFERENCE_S);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
		this.swapFBO(this.accumFBOs!);
	}

	/**
	 * The eye shutter the exponential accumulation path runs on.
	 *
	 * A camera exposure only reaches here when the box path is unavailable —
	 * reduced motion, which holds a single frame anyway, or a perf blast that has
	 * already cut the trail. Both discard history, so the substituted time
	 * constant never actually integrates anything.
	 */
	private resolveShutter(shutter: LedShutter): Extract<LedShutter, { mode: "eye" }> {
		if (shutter.mode === "camera") {
			return { mode: "eye", timeConstantSeconds: EYE_TIME_CONSTANT_S };
		}
		return shutter;
	}

	/**
	 * Fills the instance buffer with one capsule per LED per sub-step and
	 * returns how many were written.
	 */
	private buildSegments(
		input: LedFrameInput,
		config: LedOverlayConfig,
		dt: number,
		timeDiscontinuity: boolean,
	): number {
		const frameChanged =
			input.canvasWidth !== this.inputFrame.width || input.canvasHeight !== this.inputFrame.height;
		this.inputFrame.width = input.canvasWidth;
		this.inputFrame.height = input.canvasHeight;
		const isDiscontinuity = timeDiscontinuity || frameChanged;

		const ledCount = Math.min(input.leds.length, MAX_LEDS);
		const scaleX = this.displayWidth / Math.max(input.canvasWidth, 1);
		const scaleY = this.displayHeight / Math.max(input.canvasHeight, 1);

		// Pass 1: resolve each LED's previous position and group by prop. Flux and
		// footprint are properties of a strip, so nothing can be computed per LED
		// until every LED on that strip is known.
		for (const group of this.propGroups.values()) {
			group.members.length = 0;
		}

		const seenKeys = new Set<number>();
		for (let i = 0; i < ledCount; i++) {
			const led = input.leds[i]!;
			// Stride 1000 so a 200-LED staff on any prop index keeps a unique key.
			const key = led.propIndex * 1000 + led.ledIndex;
			seenKeys.add(key);

			let prevX = led.x;
			let prevY = led.y;
			const stored = this.prevPositions.get(key);
			if (stored && !isDiscontinuity) {
				const ddx = led.x - stored.x;
				const ddy = led.y - stored.y;
				if (ddx * ddx + ddy * ddy <= MAX_STREAK_VIEWBOX * MAX_STREAK_VIEWBOX) {
					prevX = stored.x;
					prevY = stored.y;
				}
			}
			this.prevScratch[i * 2] = prevX;
			this.prevScratch[i * 2 + 1] = prevY;

			if (stored) {
				stored.x = led.x;
				stored.y = led.y;
			} else {
				this.prevPositions.set(key, { x: led.x, y: led.y });
			}

			let group = this.propGroups.get(led.propIndex);
			if (!group) {
				group = {
					members: [],
					firstLedIndex: led.ledIndex,
					lastLedIndex: led.ledIndex,
					firstMember: i,
					lastMember: i,
				};
				this.propGroups.set(led.propIndex, group);
			}
			if (group.members.length === 0) {
				group.firstLedIndex = led.ledIndex;
				group.lastLedIndex = led.ledIndex;
				group.firstMember = i;
				group.lastMember = i;
			} else if (led.ledIndex < group.firstLedIndex) {
				group.firstLedIndex = led.ledIndex;
				group.firstMember = i;
			} else if (led.ledIndex > group.lastLedIndex) {
				group.lastLedIndex = led.ledIndex;
				group.lastMember = i;
			}
			group.members.push(i);
		}

		// Drop state for LEDs that disappeared this frame so they start fresh
		// next time they reappear rather than streaking across the gap.
		for (const key of this.prevPositions.keys()) {
			if (!seenKeys.has(key)) this.prevPositions.delete(key);
		}

		const propFlux = PROP_REFERENCE_FLUX * ledBrightnessToFloat(config.look.brightness);
		let written = 0;

		for (const group of this.propGroups.values()) {
			const count = group.members.length;
			if (count === 0) continue;

			const firstLed = input.leds[group.firstMember]!;
			const lastLed = input.leds[group.lastMember]!;
			const currFirstX = firstLed.x * scaleX;
			const currFirstY = firstLed.y * scaleY;
			const currLastX = lastLed.x * scaleX;
			const currLastY = lastLed.y * scaleY;
			const prevFirstX = this.prevScratch[group.firstMember * 2]! * scaleX;
			const prevFirstY = this.prevScratch[group.firstMember * 2 + 1]! * scaleY;
			const prevLastX = this.prevScratch[group.lastMember * 2]! * scaleX;
			const prevLastY = this.prevScratch[group.lastMember * 2 + 1]! * scaleY;

			const stripLengthPx = Math.hypot(currLastX - currFirstX, currLastY - currFirstY);
			const sigmaEff = effectiveSigmaPx(emitterSigmaPx(stripLengthPx, count));
			const flux = perLedFlux(propFlux, count);

			// The strip is rigid, so its motion this frame is a rotation about its
			// own axis plus a translation of its midpoint. Recovering both is what
			// lets a sub-step follow the arc instead of chording it.
			const currAngle = Math.atan2(currLastY - currFirstY, currLastX - currFirstX);
			const prevAngle = Math.atan2(prevLastY - prevFirstY, prevLastX - prevFirstX);
			let deltaAngle = currAngle - prevAngle;
			if (!Number.isFinite(deltaAngle)) deltaAngle = 0;
			deltaAngle -= Math.round(deltaAngle / (Math.PI * 2)) * Math.PI * 2;

			const prevCx = (prevFirstX + prevLastX) * 0.5;
			const prevCy = (prevFirstY + prevLastY) * 0.5;
			const currCx = (currFirstX + currLastX) * 0.5;
			const currCy = (currFirstY + currLastY) * 0.5;

			const angularSpeed = Math.abs(deltaAngle) / dt;
			const subSteps = subStepCount(angularSpeed, dt, stripLengthPx * 0.5, sigmaEff);
			const subDt = dt / subSteps;

			for (let k = 0; k <= subSteps; k++) {
				const t = k / subSteps;
				const angle = deltaAngle * t;
				this.stepCos[k] = Math.cos(angle);
				this.stepSin[k] = Math.sin(angle);
				this.stepCx[k] = prevCx + (currCx - prevCx) * t;
				this.stepCy[k] = prevCy + (currCy - prevCy) * t;
			}
			const endCos = this.stepCos[subSteps]!;
			const endSin = this.stepSin[subSteps]!;

			for (const member of group.members) {
				const led = input.leds[member]!;
				const currX = led.x * scaleX;
				const currY = led.y * scaleY;
				const relX = this.prevScratch[member * 2]! * scaleX - prevCx;
				const relY = this.prevScratch[member * 2 + 1]! * scaleY - prevCy;

				// The sagitta the sub-step count answers to is this LED's own, and
				// an LED near the pivot has none: it needs one segment however
				// fast the tip is moving. Subdividing it anyway splits the splat
				// that surrounds it into wedges of dt/N and costs real energy,
				// which breaks the subdivision invariant. Steps merge in groups
				// rather than being recounted so the prop's rotation table stays
				// shared, and merged segments still tile the same path.
				const ledSteps = subStepCount(
					angularSpeed,
					dt,
					Math.hypot(relX, relY),
					sigmaEff,
				);
				const stepGroup = Math.max(1, Math.ceil(subSteps / ledSteps));

				// The rigid model lands close to the sampler's own end position but
				// not exactly on it. Distributing the residual linearly over the
				// path keeps the sub-steps continuous with the next frame.
				const modeledEndX = relX * endCos - relY * endSin + currCx;
				const modeledEndY = relX * endSin + relY * endCos + currCy;
				const correctX = currX - modeledEndX;
				const correctY = currY - modeledEndY;

				let ax = relX * this.stepCos[0]! - relY * this.stepSin[0]! + this.stepCx[0]!;
				let ay = relX * this.stepSin[0]! + relY * this.stepCos[0]! + this.stepCy[0]!;

				// The path continues across frames, so this frame's own ends are
				// joins as well. Rounding them deposits a half-Gaussian where one
				// frame hands off to the next AND another when the next frame starts
				// there, painting a bright dot at every frame boundary — an arc of
				// confetti rather than an arc. Round caps belong only to a genuinely
				// isolated splat: an emitter that barely moved this frame, or one
				// whose history was just discarded and so has no path to continue.
				const framePathPx = Math.hypot(currX - ax, currY - ay);
				const isolated = framePathPx < sigmaEff;
				const pathStartCap = isolated || isDiscontinuity ? 1 : 0;
				const pathEndCap = isolated ? 1 : 0;

				for (let k = 0; k < subSteps; k += stepGroup) {
					const kNext = Math.min(k + stepGroup, subSteps);
					const t = kNext / subSteps;
					const bx =
						relX * this.stepCos[kNext]! - relY * this.stepSin[kNext]! + this.stepCx[kNext]! + correctX * t;
					const by =
						relX * this.stepSin[kNext]! + relY * this.stepCos[kNext]! + this.stepCy[kNext]! + correctY * t;

					if (written >= MAX_SEGMENT_CAPACITY) break;
					this.ensureSegmentCapacity(written + 1);

					const chordPx = Math.hypot(bx - ax, by - ay);
					// Subdivision-invariant: dt/N over chord/N deposits the same
					// total energy as the single undivided segment.
					const density =
						streakDensity(flux, subDt * (kNext - k), chordPx, sigmaEff) * led.brightness;

					const offset = written * INSTANCE_STRIDE_FLOATS;
					this.instanceData[offset + 0] = ax;
					this.instanceData[offset + 1] = ay;
					this.instanceData[offset + 2] = bx;
					this.instanceData[offset + 3] = by;
					this.instanceData[offset + 4] = led.r;
					this.instanceData[offset + 5] = led.g;
					this.instanceData[offset + 6] = led.b;
					this.instanceData[offset + 7] = density;
					this.instanceData[offset + 8] = sigmaEff;
					// Round caps only where the path genuinely ends; a round cap at
					// any join, within a frame or between two, deposits that join's
					// half-Gaussian twice.
					this.instanceData[offset + 9] = k === 0 ? pathStartCap : 0;
					this.instanceData[offset + 10] = kNext === subSteps ? pathEndCap : 0;
					written++;

					ax = bx;
					ay = by;
				}
			}
		}

		return written;
	}

	private ensureSegmentCapacity(needed: number): void {
		if (needed <= this.segmentCapacity) return;

		let capacity = this.segmentCapacity;
		while (capacity < needed && capacity < MAX_SEGMENT_CAPACITY) capacity *= 2;
		capacity = Math.min(capacity, MAX_SEGMENT_CAPACITY);

		const grown = new Float32Array(capacity * INSTANCE_STRIDE_FLOATS);
		grown.set(this.instanceData);
		this.instanceData = grown;
		this.segmentCapacity = capacity;

		const gl = this.gl;
		if (gl && this.instanceBuffer) {
			// The VAO holds the buffer object, not its storage, so reallocating
			// here leaves every attribute pointer valid.
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
		}
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

	readPixelStats(): { maxR: number; maxG: number; maxB: number; maxA: number; nonZero: number; total: number } | null {
		if (!this.gl || !this.canvas) return null;
		const gl = this.gl;
		const w = gl.canvas.width;
		const h = gl.canvas.height;
		const pixels = new Uint8Array(w * h * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		let maxR = 0, maxG = 0, maxB = 0, maxA = 0, nonZero = 0;
		for (let i = 0; i < pixels.length; i += 4) {
			if (pixels[i]! > 0 || pixels[i + 1]! > 0 || pixels[i + 2]! > 0 || pixels[i + 3]! > 0) nonZero++;
			if (pixels[i]! > maxR) maxR = pixels[i]!;
			if (pixels[i + 1]! > maxG) maxG = pixels[i + 1]!;
			if (pixels[i + 2]! > maxB) maxB = pixels[i + 2]!;
			if (pixels[i + 3]! > maxA) maxA = pixels[i + 3]!;
		}
		return { maxR, maxG, maxB, maxA, nonZero, total: w * h };
	}

	readTrailFBOStats(): { maxR: number; maxG: number; maxB: number; maxA: number } | null {
		if (!this.gl || !this.accumFBOs) return null;
		const gl = this.gl;
		const w = this.displayWidth;
		const h = this.displayHeight;
		const pixels = new Float32Array(w * h * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFBOs.read.fbo);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		let maxR = 0, maxG = 0, maxB = 0, maxA = 0;
		for (let i = 0; i < pixels.length; i += 4) {
			if (pixels[i]! > maxR) maxR = pixels[i]!;
			if (pixels[i + 1]! > maxG) maxG = pixels[i + 1]!;
			if (pixels[i + 2]! > maxB) maxB = pixels[i + 2]!;
			if (pixels[i + 3]! > maxA) maxA = pixels[i + 3]!;
		}
		return { maxR, maxG, maxB, maxA };
	}

	readBloomFBOStats(): { maxR: number; maxG: number; maxB: number; maxA: number } | null {
		if (!this.gl || !this.bloomMips.length) return null;
		const gl = this.gl;
		const sz = this.bloomMipSizes[0]!;
		const pixels = new Float32Array(sz.w * sz.h * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomMips[0]!.fbo);
		gl.readPixels(0, 0, sz.w, sz.h, gl.RGBA, gl.FLOAT, pixels);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		let maxR = 0, maxG = 0, maxB = 0, maxA = 0;
		for (let i = 0; i < pixels.length; i += 4) {
			if (pixels[i]! > maxR) maxR = pixels[i]!;
			if (pixels[i + 1]! > maxG) maxG = pixels[i + 1]!;
			if (pixels[i + 2]! > maxB) maxB = pixels[i + 2]!;
			if (pixels[i + 3]! > maxA) maxA = pixels[i + 3]!;
		}
		return { maxR, maxG, maxB, maxA };
	}

	setCanvasZIndex(z: number): void {
		if (this.canvas) this.canvas.style.zIndex = String(z);
	}

	// Geometry creation

	private createGeometry(): void {
		const gl = this.gl!;

		// Quad vertices: two triangles forming a [-1,1] quad
		const quadVertices = new Float32Array([
			-1, -1, 1, -1, -1, 1,
			-1, 1, 1, -1, 1, 1,
		]);

		this.quadBuffer = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

		this.instanceBuffer = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

		// Fullscreen quad VAO (used by accumulate, bloom, display passes)
		this.quadVAO = gl.createVertexArray()!;
		gl.bindVertexArray(this.quadVAO);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);

		// Streak VAO with instanced attributes
		this.streakVAO = gl.createVertexArray()!;
		gl.bindVertexArray(this.streakVAO);

		// Attribute 0: quad vertices (per-vertex)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		// Instance attributes (per-instance, divisor 1).
		// Layout (11 floats, stride 44 bytes):
		//   1: a_segA     vec2   offset  0
		//   2: a_segB     vec2   offset  8
		//   3: a_color    vec3   offset 16
		//   4: a_density  float  offset 28
		//   5: a_sigma    float  offset 32
		//   6: a_capStart float  offset 36
		//   7: a_capEnd   float  offset 40
		gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
		const stride = INSTANCE_STRIDE_FLOATS * 4;

		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 8);
		gl.vertexAttribDivisor(2, 1);

		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 16);
		gl.vertexAttribDivisor(3, 1);

		gl.enableVertexAttribArray(4);
		gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 28);
		gl.vertexAttribDivisor(4, 1);

		gl.enableVertexAttribArray(5);
		gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 32);
		gl.vertexAttribDivisor(5, 1);

		gl.enableVertexAttribArray(6);
		gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 36);
		gl.vertexAttribDivisor(6, 1);

		gl.enableVertexAttribArray(7);
		gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 40);
		gl.vertexAttribDivisor(7, 1);

		gl.bindVertexArray(null);
	}

	// Framebuffer management

	private createFramebuffers(): void {
		const w = this.displayWidth;
		const h = this.displayHeight;

		this.depositFBO = this.createFBO(w, h);
		this.accumFBOs = {
			read: this.createFBO(w, h),
			write: this.createFBO(w, h),
		};
		this.boxFBOs = { a: this.createFBO(w, h), b: this.createFBO(w, h) };
		this.boxSeeded = false;

		// Bloom mip chain: each level is half the previous
		this.bloomMips = [];
		this.bloomMipSizes = [];
		let mipW = w;
		let mipH = h;
		for (let i = 0; i < BLOOM_MIP_COUNT; i++) {
			mipW = Math.max(1, Math.floor(mipW / 2));
			mipH = Math.max(1, Math.floor(mipH / 2));
			this.bloomMips.push(this.createFBO(mipW, mipH));
			this.bloomMipSizes.push({ w: mipW, h: mipH });
		}
	}

	private createFBO(w: number, h: number): FBOAttachment {
		const gl = this.gl!;

		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		// RGBA16F throughout: the chain is linear HDR, and an 8-bit stage
		// anywhere in it would clip the emitter cores before the tone map.
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);

		const fbo = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);

		return { fbo, texture };
	}

	private clearAllFramebuffers(): void {
		const gl = this.gl!;
		gl.clearColor(0, 0, 0, 0);
		const targets = [
			this.depositFBO!,
			this.accumFBOs!.read,
			this.accumFBOs!.write,
			...(this.boxFBOs ? [this.boxFBOs.a, this.boxFBOs.b] : []),
			...this.bloomMips,
		];
		for (const target of targets) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.boxSeeded = false;
	}

	resetExportState(): void {
		if (!this.gl) return;
		this.clearAllFramebuffers();
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
		this.gl.clearColor(0, 0, 0, 0);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
		this.prevPositions.clear();
		this.propGroups.clear();
		this.lastFrameTime = -1;
		this._diagFrameCount = 0;
	}

	/**
	 * Keep-warm clear. Blanks all FBOs + the visible default framebuffer and
	 * resets per-LED state so a parked LED can't flash its last frame or stale
	 * accumulated energy on re-show. preserveDrawingBuffer:true + persistent
	 * ping-pong accumulation FBOs would otherwise retain both across a
	 * display:none/'' toggle. Aliases resetExportState (which already does
	 * exactly this); the manager's parkLedWarm calls clearSimulation()
	 * generically across webgl renderers.
	 */
	clearSimulation(): void {
		this.resetExportState();
	}

	private swapFBO(fbo: DoubleFBO): void {
		const tmp = fbo.read;
		fbo.read = fbo.write;
		fbo.write = tmp;
	}

	private destroyFramebuffers(): void {
		const gl = this.gl;
		if (!gl) return;

		const destroySingle = (f: FBOAttachment | null) => {
			if (!f) return;
			gl.deleteTexture(f.texture);
			gl.deleteFramebuffer(f.fbo);
		};

		destroySingle(this.depositFBO);
		this.depositFBO = null;

		if (this.accumFBOs) {
			destroySingle(this.accumFBOs.read);
			destroySingle(this.accumFBOs.write);
			this.accumFBOs = null;
		}

		if (this.boxFBOs) {
			destroySingle(this.boxFBOs.a);
			destroySingle(this.boxFBOs.b);
			this.boxFBOs = null;
		}

		for (const mip of this.bloomMips) {
			destroySingle(mip);
		}
		this.bloomMips = [];
		this.bloomMipSizes = [];
	}

	// Shader compilation

	private compileAllPrograms(): boolean {
		// Streak program needs explicit attribute bindings before linking
		this.streakProgram = this.buildStreakProgram();

		// Fullscreen programs use FULLSCREEN_VERT with a_position at location 0
		this.accumProgram = this.buildFullscreenProgram(
			LED_ACCUMULATE_FRAG,
			["u_deposit", "u_history", "u_decay", "u_depositScale"],
		);
		this.bloomDownProgram = this.buildFullscreenProgram(
			BLOOM_DOWNSAMPLE_FRAG,
			["u_source", "u_texelSize", "u_karis"],
		);
		this.bloomUpProgram = this.buildFullscreenProgram(
			BLOOM_UPSAMPLE_FRAG,
			["u_source", "u_tentOffset"],
		);
		this.boxResolveProgram = this.buildFullscreenProgram(
			LED_BOX_RESOLVE_FRAG,
			["u_boxA", "u_boxB", "u_weightA", "u_weightB", "u_invGain"],
		);
		this.displayProgram = this.buildFullscreenProgram(
			LED_DISPLAY_FRAG,
			["u_scene", "u_bloom", "u_bloomStrength", "u_exposure"],
		);

		const all = [
			this.streakProgram,
			this.accumProgram,
			this.boxResolveProgram,
			this.bloomDownProgram,
			this.bloomUpProgram,
			this.displayProgram,
		];

		if (all.some(p => p === null)) {
			console.error("Failed to compile one or more LED shader programs");
			return false;
		}

		return true;
	}

	/**
	 * Builds the streak program with explicit attribute location bindings
	 * BEFORE linking, as required for instanced rendering.
	 */
	private buildStreakProgram(): ShaderProgram | null {
		const gl = this.gl!;

		const vertShader = this.compileShader(gl.VERTEX_SHADER, LED_STREAK_VERT);
		const fragShader = this.compileShader(gl.FRAGMENT_SHADER, LED_STREAK_FRAG);
		if (!vertShader || !fragShader) return null;

		const program = gl.createProgram()!;
		gl.attachShader(program, vertShader);
		gl.attachShader(program, fragShader);

		// Bind attribute locations BEFORE linking
		gl.bindAttribLocation(program, 0, "a_position");
		gl.bindAttribLocation(program, 1, "a_segA");
		gl.bindAttribLocation(program, 2, "a_segB");
		gl.bindAttribLocation(program, 3, "a_color");
		gl.bindAttribLocation(program, 4, "a_density");
		gl.bindAttribLocation(program, 5, "a_sigma");
		gl.bindAttribLocation(program, 6, "a_capStart");
		gl.bindAttribLocation(program, 7, "a_capEnd");

		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error("LED streak shader link error:", gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			gl.deleteShader(vertShader);
			gl.deleteShader(fragShader);
			return null;
		}

		gl.detachShader(program, vertShader);
		gl.detachShader(program, fragShader);
		gl.deleteShader(vertShader);
		gl.deleteShader(fragShader);

		const uniforms = new Map<string, WebGLUniformLocation>();
		const loc = gl.getUniformLocation(program, "u_resolution");
		if (loc !== null) uniforms.set("u_resolution", loc);

		return { program, uniforms };
	}

	/**
	 * Builds a fullscreen pass program using FULLSCREEN_VERT.
	 * Binds a_position at location 0 before linking.
	 */
	private buildFullscreenProgram(
		fragSource: string,
		uniformNames: string[],
	): ShaderProgram | null {
		const gl = this.gl!;

		const vertShader = this.compileShader(gl.VERTEX_SHADER, FULLSCREEN_VERT);
		const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);
		if (!vertShader || !fragShader) return null;

		const program = gl.createProgram()!;
		gl.attachShader(program, vertShader);
		gl.attachShader(program, fragShader);

		// Bind a_position at location 0 before linking
		gl.bindAttribLocation(program, 0, "a_position");

		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error("LED fullscreen shader link error:", gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			gl.deleteShader(vertShader);
			gl.deleteShader(fragShader);
			return null;
		}

		gl.detachShader(program, vertShader);
		gl.detachShader(program, fragShader);
		gl.deleteShader(vertShader);
		gl.deleteShader(fragShader);

		const uniforms = new Map<string, WebGLUniformLocation>();
		for (const name of uniformNames) {
			const loc = gl.getUniformLocation(program, name);
			if (loc !== null) {
				uniforms.set(name, loc);
			}
		}

		return { program, uniforms };
	}

	private compileShader(type: number, source: string): WebGLShader | null {
		const gl = this.gl!;
		const shader = gl.createShader(type);
		if (!shader) return null;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const typeName = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
			console.error(`LED ${typeName} shader error:`, gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}

		return shader;
	}

	// ============================================================
	// Cleanup
	// ============================================================

	private cleanup(): void {
		const gl = this.gl;

		this.destroyFramebuffers();

		if (gl) {
			// Delete shader programs
			const programs = [
				this.streakProgram,
				this.accumProgram,
				this.bloomDownProgram,
				this.bloomUpProgram,
				this.displayProgram,
			];
			for (const p of programs) {
				if (p) gl.deleteProgram(p.program);
			}

			// Delete VAOs
			if (this.streakVAO) gl.deleteVertexArray(this.streakVAO);
			if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);

			// Delete buffers
			if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
			if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);

			gl.getExtension("WEBGL_lose_context")?.loseContext();
		}

		this.streakProgram = null;
		this.accumProgram = null;
		this.bloomDownProgram = null;
		this.bloomUpProgram = null;
		this.displayProgram = null;

		this.quadVAO = null;
		this.streakVAO = null;
		this.quadBuffer = null;
		this.instanceBuffer = null;

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
import type { LedIntent } from "$lib/shared/effects/domain/effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";

export const ledEffectPlugin: EffectPlugin<LedIntent> = {
  id: "led",
  kind: "led",
  createRenderer: () => new WebGLLedRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.led,
  // RenderLoopConfig slot name for the LED renderer instance
  configKey: "ledRenderer",
};
