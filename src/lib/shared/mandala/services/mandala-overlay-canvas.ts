/**
 * Mandala Overlay Canvas
 *
 * Dedicated Canvas2D overlay for live mandala rendering. Draws pre-computed
 * bezier paths using setLineDash progressive reveal, so the mandala traces
 * out smoothly in sync with animation playback. After the first loop
 * completes, destination-out fade gradually erases old content so the
 * mandala stays fresh without unbounded accumulation.
 *
 * Follows the same overlay pattern as TrailOverlayCanvas:
 * position: absolute, pointer-events: none. Uses z-index: 0 so it renders
 * BEHIND trails (z-index 1).
 */

import type { MandalaOverlayRenderParams } from "../domain/mandala-overlay-types";
import {
	OVERLAY_WARMUP_FRAMES,
	OVERLAY_ALPHA_DECAY,
} from "../domain/mandala-constants";
import { Canvas2DFadeManager } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-fade-manager";
import { reducedMotion } from "$lib/shared/transitions/motion";
import { DURATION } from "$lib/shared/transitions/transitions";
import { MandalaOverlapMasks, paintMandalaGuide } from "./mandala-guide-painter";

export class MandalaOverlayCanvas {
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private bufferCanvas: OffscreenCanvas | null = null;
	private bufferCtx: OffscreenCanvasRenderingContext2D | null = null;
	private previousGuideCanvas: OffscreenCanvas | null = null;
	private previousGuideCtx: OffscreenCanvasRenderingContext2D | null = null;
	private hasPreviousGuideSnapshot = false;
	// A whole mandala dissolving into the next one is a major transition, not a
	// module switch — at `emphasis` the old shape was gone before the eye had
	// followed it across.
	private readonly guideFadeManager = new Canvas2DFadeManager(DURATION.dramatic);
	private readonly overlapMasks = new MandalaOverlapMasks();
	private width = 0;
	private height = 0;
	private dpr = 1;

	// After the first full loop, we start fading old content so the
	// mandala doesn't accumulate indefinitely
	private firstLoopComplete = false;

	// Smooth ramp-up: after first loop detected, gradually increase fade
	// intensity over ~3 seconds so the transition isn't jarring.
	// 0.0 = no fade, 1.0 = full fade rate.
	private fadeRampProgress = 0;
	private static readonly FADE_RAMP_DURATION_S = 3.0;

	// Track the current step to detect seeks/jumps. When the step changes
	// non-sequentially (user clicked to a different beat), clear the canvas
	// so we don't show stale content from a different part of the sequence.
	private lastStep = -1;

	// Let props settle before drawing - the first few frames often have
	// props at intermediate positions before the animation engine places
	// them, which produces artifact lines
	private warmupFramesRemaining = OVERLAY_WARMUP_FRAMES;
	private lastGuidePaths: MandalaOverlayRenderParams["preparedPaths"] = null;
	private lastGuideOpacity = -1;

	initialize(container: HTMLElement, width: number, height: number): void {
		this.dispose();

		const dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;
		this.dpr = dpr;

		const canvas = document.createElement("canvas");
		// Set canvas buffer to high-DPI resolution
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.setAttribute("aria-hidden", "true");

		// CSS size matches the logical container size
		canvas.style.position = "absolute";
		canvas.style.top = "0";
		canvas.style.left = "0";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.pointerEvents = "none";
		canvas.style.zIndex = "0";
		canvas.style.background = "transparent";
		canvas.setAttribute("data-animation-layer", "mandala");

		// This is the bottom visual layer. Insert it before the scene canvas so
		// DOM-order compositors (video/poster export) preserve the same stacking
		// order as the browser's z-index compositor.
		container.insertBefore(canvas, container.firstChild);

		this.canvas = canvas;
		this.ctx = canvas.getContext("2d", { willReadFrequently: true });
		// Scale the context so drawing commands use logical pixels
		this.ctx?.scale(dpr, dpr);

		this.bufferCanvas = new OffscreenCanvas(width * dpr, height * dpr);
		this.bufferCtx = this.bufferCanvas.getContext("2d");
		this.bufferCtx?.scale(dpr, dpr);

		this.width = width;
		this.height = height;
		this.warmupFramesRemaining = OVERLAY_WARMUP_FRAMES;
		this.lastGuidePaths = null;
		this.lastGuideOpacity = -1;
	}

	resize(width: number, height: number): void {
		if (!this.canvas) return;
		// The render loop sizes a freshly attached overlay to its frame; one that
		// was already allocated at that frame keeps its raster instead of
		// clearing to a blank canvas over the same pixels.
		if (width === this.width && height === this.height) return;

		const dpr = this.dpr;
		this.canvas.width = width * dpr;
		this.canvas.height = height * dpr;

		// Re-apply scale after dimension change (resets the transform)
		this.ctx?.scale(dpr, dpr);

		if (this.bufferCanvas) {
			this.bufferCanvas.width = width * dpr;
			this.bufferCanvas.height = height * dpr;
			this.bufferCtx?.scale(dpr, dpr);
		}

		this.width = width;
		this.height = height;

		this.warmupFramesRemaining = OVERLAY_WARMUP_FRAMES;
		this.resetGuideTransition();
		this.lastGuidePaths = null;
		this.lastGuideOpacity = -1;
	}

	renderFrame(params: MandalaOverlayRenderParams): void {
		const ctx = this.ctx;
		if (!ctx || !params.config.enabled || !params.preparedPaths) return;

		const {
			preparedPaths,
			progress,
			config,
			deltaTime,
			currentTime,
			currentStep,
		} = params;
		const guideMode = config.mode === "guide";
		const guidePathsChanged =
			guideMode && this.lastGuidePaths !== preparedPaths;
		const guideOpacityChanged =
			guideMode && this.lastGuideOpacity !== config.opacity;

		// A guide is immutable until its sequence, prop endpoints, colors, size,
		// or opacity changes. Avoid re-stroking identical paths on every RAF.
		if (
			guideMode &&
			!guidePathsChanged &&
			!guideOpacityChanged &&
			!this.guideFadeManager.isFadingInProgress()
		) {
			return;
		}

		// Let props settle before capturing - first frames often have
		// intermediate positions that produce artifact lines
		if (!guideMode && this.warmupFramesRemaining > 0) {
			this.warmupFramesRemaining--;
			this.lastStep = currentStep;
			return;
		}

		// Detect non-sequential step changes (user clicked/seeked to a new beat).
		// When this happens, clear the canvas to prevent stale content.
		if (!guideMode && this.lastStep >= 0) {
			const stepDiff = Math.abs(currentStep - this.lastStep);
			if (stepDiff > 1) {
				ctx.save();
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
				ctx.restore();
			}
		}
		this.lastStep = currentStep;

		// After the first loop completes, fade old content so the mandala
		// doesn't accumulate indefinitely. The fade ramps up gradually
		// over FADE_RAMP_DURATION_S seconds to avoid a jarring transition.
		if (!guideMode && this.firstLoopComplete) {
			this.fadeRampProgress = Math.min(
				1.0,
				this.fadeRampProgress + deltaTime / MandalaOverlayCanvas.FADE_RAMP_DURATION_S,
			);

			const easedRamp = this.fadeRampProgress * this.fadeRampProgress;

			// Use a long fade duration - about 1.5x the loop for gentle tail
			const fadeDurationMs = 12000 * (config.fadeDurationMultiplier ?? 1.0);
			const fadeAmount = this.computeFadeAmount(fadeDurationMs, deltaTime) * easedRamp;

			if (fadeAmount > 0.0001) {
				ctx.save();
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.globalCompositeOperation = "destination-out";
				ctx.globalAlpha = fadeAmount;
				ctx.fillStyle = "black";
				ctx.fillRect(0, 0, this.width * this.dpr, this.height * this.dpr);
				ctx.restore();

				if (easedRamp > 0.5) {
					this.smoothAlphaDecay(ctx);
				}
			}
		}

		// Draw pre-computed paths up to current progress
		const bCtx = this.bufferCtx;
		if (!bCtx) return;

		if (guidePathsChanged) {
			this.beginGuideTransition();
		}

		// The incoming guide is painted once, then the two retained canvases are
		// blended for the rest of the transition. This keeps a prop swap cheap
		// even when the mandala contains many paths.
		if (!guideMode || guidePathsChanged) {
			// One painter for every mandala the product shows: the live guide,
			// the progressive reveal, and the still images the Shape Matrix
			// paints through mandala-guide-image.ts.
			paintMandalaGuide(
				{
					context: bCtx,
					pixelWidth: this.width * this.dpr,
					pixelHeight: this.height * this.dpr,
					dpr: this.dpr,
				},
				{
					paths: preparedPaths.paths,
					scale: preparedPaths.scale,
					strokeWidth: config.strokeWidth,
					progress,
					reveal: !guideMode,
				},
				this.overlapMasks,
			);
		}

		// Composite buffer onto main canvas
		if (guideMode) {
			this.compositeGuideFrame(ctx, config.opacity, currentTime);
			this.lastGuidePaths = preparedPaths;
			this.lastGuideOpacity = config.opacity;
			return;
		}

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalCompositeOperation = "source-over";
		ctx.globalAlpha = config.opacity;
		ctx.drawImage(this.bufferCanvas!, 0, 0);
		ctx.restore();
	}

	clear(): void {
		if (this.ctx) {
			this.ctx.save();
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
			this.ctx.restore();
		}
		this.firstLoopComplete = false;
		this.fadeRampProgress = 0;
		this.lastStep = -1;
		this.warmupFramesRemaining = OVERLAY_WARMUP_FRAMES;
		this.resetGuideTransition();
		this.lastGuidePaths = null;
		this.lastGuideOpacity = -1;
	}

	onLoopDetected(): void {
		if (!this.firstLoopComplete) {
			this.firstLoopComplete = true;
			this.fadeRampProgress = 0; // Start the ramp from zero
		}
	}

	setVisible(visible: boolean): void {
		if (!this.canvas) return;
		if (!visible && this.guideFadeManager.isFadingInProgress()) {
			this.resetGuideTransition();
			this.lastGuidePaths = null;
			this.lastGuideOpacity = -1;
		}
		this.canvas.style.display = visible ? "block" : "none";
	}

	isTransitioning(): boolean {
		return this.guideFadeManager.isFadingInProgress();
	}

	dispose(): void {
		if (this.canvas?.parentElement) {
			this.canvas.parentElement.removeChild(this.canvas);
		}
		this.canvas = null;
		this.ctx = null;
		this.bufferCanvas = null;
		this.bufferCtx = null;
		this.previousGuideCanvas = null;
		this.previousGuideCtx = null;
		this.hasPreviousGuideSnapshot = false;
		this.guideFadeManager.reset();
		this.overlapMasks.release();
		this.width = 0;
		this.height = 0;
		this.firstLoopComplete = false;
		this.fadeRampProgress = 0;
		this.lastGuidePaths = null;
		this.lastGuideOpacity = -1;
	}

	// Internal helpers

	private beginGuideTransition(): void {
		if (
			!this.lastGuidePaths ||
			reducedMotion() ||
			!this.captureVisibleGuide()
		) {
			this.resetGuideTransition();
			return;
		}

		this.guideFadeManager.startFadeTransition();
	}

	private captureVisibleGuide(): boolean {
		const canvas = this.canvas;
		const snapshot = this.ensurePreviousGuideCanvas();
		if (!canvas || !snapshot) return false;

		snapshot.context.setTransform(1, 0, 0, 1, 0, 0);
		snapshot.context.clearRect(
			0,
			0,
			snapshot.canvas.width,
			snapshot.canvas.height,
		);
		snapshot.context.globalCompositeOperation = "source-over";
		snapshot.context.globalAlpha = 1;
		snapshot.context.drawImage(canvas, 0, 0);
		this.hasPreviousGuideSnapshot = true;
		return true;
	}

	private compositeGuideFrame(
		context: CanvasRenderingContext2D,
		opacity: number,
		currentTime: number,
	): void {
		const currentGuide = this.bufferCanvas;
		if (!currentGuide) return;

		const fade = this.guideFadeManager.updateFadeProgress(currentTime);
		context.save();
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
		context.globalCompositeOperation = "source-over";

		if (
			this.hasPreviousGuideSnapshot &&
			this.previousGuideCanvas &&
			!fade.isComplete
		) {
			context.globalAlpha = fade.previousAlpha;
			context.drawImage(this.previousGuideCanvas, 0, 0);
		}

		context.globalAlpha =
			opacity * (fade.isComplete ? 1 : fade.currentAlpha);
		context.drawImage(currentGuide, 0, 0);
		context.restore();

		if (fade.isComplete) {
			this.hasPreviousGuideSnapshot = false;
		}
	}

	private ensurePreviousGuideCanvas(): {
		canvas: OffscreenCanvas;
		context: OffscreenCanvasRenderingContext2D;
	} | null {
		const width = this.bufferCanvas?.width ?? 0;
		const height = this.bufferCanvas?.height ?? 0;
		if (width === 0 || height === 0) return null;

		if (
			this.previousGuideCanvas?.width !== width ||
			this.previousGuideCanvas?.height !== height
		) {
			this.previousGuideCanvas = new OffscreenCanvas(width, height);
			this.previousGuideCtx = this.previousGuideCanvas.getContext("2d");
		}

		if (!this.previousGuideCanvas || !this.previousGuideCtx) return null;
		return {
			canvas: this.previousGuideCanvas,
			context: this.previousGuideCtx,
		};
	}

	private resetGuideTransition(): void {
		this.guideFadeManager.reset();
		this.hasPreviousGuideSnapshot = false;
	}

	/**
	 * Compute fade amount per frame. Same formula as TrailOverlayCanvas:
	 * converts a duration in ms to a per-frame fade multiplier using the
	 * exponential decay model.
	 */
	private computeFadeAmount(fadeDurationMs: number, deltaTime: number): number {
		const safeDuration = Math.max(fadeDurationMs, 16.67);
		const framesForFullFade = safeDuration / 16.67;
		const baseFade = 3.5 / framesForFullFade;
		return 1 - Math.pow(1 - baseFade, deltaTime * 60);
	}

	/**
	 * Subtract a constant from every low-alpha pixel. Destination-out's
	 * multiplicative fade can never reach 0 due to 8-bit integer rounding.
	 * Constant subtraction guarantees every pixel eventually reaches 0.
	 */
	private smoothAlphaDecay(ctx: CanvasRenderingContext2D): void {
		// getImageData operates on actual pixel buffer, not logical coords
		const w = this.width * this.dpr;
		const h = this.height * this.dpr;
		if (w === 0 || h === 0) return;

		// Save/restore to avoid the DPR scale affecting getImageData coordinates
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		const imageData = ctx.getImageData(0, 0, w, h);
		const data = imageData.data;
		let dirty = false;

		for (let i = 3; i < data.length; i += 4) {
			const a = data[i]!;
			if (a > 0 && a <= 28) {
				data[i] = Math.max(0, a - OVERLAY_ALPHA_DECAY);
				dirty = true;
			}
		}

		if (dirty) {
			ctx.putImageData(imageData, 0, 0);
		}
		ctx.restore();
	}
}
