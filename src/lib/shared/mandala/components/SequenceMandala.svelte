<script lang="ts">
	import {
		renderMandalaSVG,
		renderMandalaToCanvas,
		resolveMandalaRenderExtent,
	} from "$lib/shared/mandala/services/mandala-renderer";
	import { onMount, untrack } from "svelte";
	import {
		createRenderActivityGate,
		renderGateTarget
	} from "$lib/shared/render-gating/render-activity-gate";
	import { cubicInOut } from "svelte/easing";
	import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
	import { getSettings } from "$lib/shared/application/state/app-state.svelte";
	import { applyMandalaHandColors } from "../domain/mandala-palette";
	import type {
		MandalaHandVisibility,
		MandalaMode,
		MandalaRenderOptions,
		MandalaPaths,
		MandalaPalette,
		MandalaPathShape,
		UndulationEasing,
	} from "../domain/mandala-types";
	import { DEFAULT_OVERLAP_CONFIG } from "../domain/mandala-types";
	import {
		MANDALA_DEFAULT_SIZE,
		MANDALA_STANDARD_TIP_DX,
		DARK_MOTION_BLUE_STROKE,
		DARK_MOTION_RED_STROKE,
		DARK_MOTION_BLUE_FILL,
		DARK_MOTION_RED_FILL,
		DARK_MOTION_PURPLE_STROKE,
		DARK_MOTION_PURPLE_FILL,
		LIGHT_MOTION_BLUE_STROKE,
		LIGHT_MOTION_RED_STROKE,
		LIGHT_MOTION_BLUE_FILL,
		LIGHT_MOTION_RED_FILL,
		LIGHT_MOTION_PURPLE_STROKE,
		LIGHT_MOTION_PURPLE_FILL,
	} from "../domain/mandala-constants";
	import {
		calculate as calculateMandalaGeometry,
		calculateMorphed as calculateMandalaMorphed,
	} from "../services/mandala-geometry-calculator";
	import { getMandalaPathOptions } from "../services/mandala-path-options";
	import { resolveMandalaTipOffsets } from "../services/mandala-path-preparer";
	import { interpolateMandalaPaths, mandalaPathsEqual } from "../services/mandala-path-interpolator";
	import { TrackingMode } from "$lib/shared/animation-engine/domain/types/trail-types";
	import { pairTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
	import { DURATION } from "$lib/shared/transitions/transitions";

	export type { MandalaPathShape, UndulationEasing } from "../domain/mandala-types";

	function softElasticEase(t: number): number {
		if (t === 0 || t === 1) return t;
		const base = (1 - Math.cos(t * Math.PI)) / 2;
		const wobble = Math.sin(t * Math.PI * 3) * t * (1 - t) * 0.35;
		return base + wobble;
	}

	function breatheEase(t: number): number {
		return Math.pow(Math.sin((t * Math.PI) / 2), 1.6);
	}

	function heartbeatEase(t: number): number {
		if (t < 0.3) return Math.pow(t / 0.3, 2) * 1.08;
		if (t < 0.45) return 1.08 - 0.18 * ((t - 0.3) / 0.15);
		return 0.9 + 0.1 * (1 - Math.pow(1 - (t - 0.45) / 0.55, 2));
	}

	function driftEase(t: number): number {
		const base = (1 - Math.cos(t * Math.PI)) / 2;
		const wander = Math.sin(t * Math.PI * 5) * Math.pow(t * (1 - t), 1.5) * 0.18;
		return base + wander;
	}

	function bloomEase(t: number): number {
		return 1 - Math.pow(1 - t, 3.5);
	}

	function tidalEase(t: number): number {
		const primary = (1 - Math.cos(t * Math.PI)) / 2;
		const secondary = Math.sin(t * Math.PI * 2) * 0.1 * (1 - Math.abs(2 * t - 1));
		return primary + secondary;
	}

	const EASING_FNS: Record<UndulationEasing, (t: number) => number> = {
		sine: (t: number) => (1 - Math.cos(t * Math.PI)) / 2,
		ease: cubicInOut,
		"soft-elastic": softElasticEase,
		breathe: breatheEase,
		heartbeat: heartbeatEase,
		drift: driftEase,
		bloom: bloomEase,
		tidal: tidalEase,
	};

	interface Props {
		/** Explicit card/sequence palette; null retains the canonical theme colors. */
		primaryPropColors?: { left: string; right: string } | null;
		sequence: any;
		mode?: MandalaMode;
		style?: "stroke" | "filled";
		show?: MandalaHandVisibility;
		size?: number;
		currentStep?: number;
		darkMode?: boolean;
		leftPropType?: string;
		rightPropType?: string;
		/** Animate the mandala by oscillating tip point distance */
		animate?: boolean;
		/** Min dx for animation oscillation (default 80) */
		animateMin?: number;
		/** Max dx for animation oscillation (default 170) */
		animateMax?: number;
		/** Seconds per full oscillation cycle (default 4) */
		animatePeriod?: number;
		/** Easing curve: "sine" (natural), "ease" (cubicInOut), "elastic" (overshoot), "linear" (constant speed) */
		animateEasing?: UndulationEasing;
		/** Degrees to rotate the whole mandala per undulation cycle (0 = no rotation) */
		animateRotation?: number;
		/** Path interpolation shape for hand movement */
		pathShape?: MandalaPathShape;
		/** Morph calculated geometry whenever the sequence changes */
		morphChanges?: boolean;
		/** Fixed tip dx override (bypasses standard and animation) */
		tipDx?: number;
		/** Override palette colors */
		palette?: MandalaPalette;
		/** Override stroke width (default 2.5) */
		strokeWidth?: number;
		/** Per-path gradient colors for gradient color mode */
		gradient?: {
			left: [string, string];
			right: [string, string];
			purple: [string, string];
		};
		/**
		 * Prop ends traced: 2 = staff (both tips), 1 = club (one tip). Optional —
		 * when omitted, derived from leftPropType/rightPropType via pairTipEnds. Set
		 * explicitly only to force a count regardless of prop (labs/explorers).
		 */
		tipEnds?: 1 | 2;
	}

	let {
		sequence,
		mode = "gallery",
		style = "stroke",
		show = "both",
		size = MANDALA_DEFAULT_SIZE,
		currentStep,
		darkMode,
		leftPropType,
		rightPropType,
		animate = false,
		animateMin = 0,
		animateMax = 250,
		animatePeriod = 5,
		animateEasing = "sine",
		animateRotation = 90,
		pathShape = "arc",
		morphChanges = false,
		tipDx,
		palette: paletteOverride,
		primaryPropColors,
		strokeWidth,
		gradient,
		tipEnds,
	}: Props = $props();

	// Prop-aware tip count: an explicit `tipEnds` prop wins (labs / overrides);
	// otherwise derive from the prop the mandala is rendered with — a single-ended
	// prop (club/fan/triad) traces ONE staff end, a two-ended prop (staff/buugeng)
	// traces both. This is what makes a club sequence's mandala drop the inner
	// (pinky) locus instead of always drawing the double-staff figure.
	const effectiveTipEnds = $derived(tipEnds ?? pairTipEnds(leftPropType, rightPropType));
	const tipOverrides = $derived.by(() => {
		if (!leftPropType && !rightPropType) return undefined;
		return {
			left: resolveMandalaTipOffsets(
				leftPropType,
				TrackingMode.BOTH_ENDS,
				"baseline"
			),
			right: resolveMandalaTipOffsets(
				rightPropType,
				TrackingMode.BOTH_ENDS,
				"baseline"
			),
		};
	});

	const DARK_MOTION_PALETTE: MandalaPalette = {
		leftStroke: DARK_MOTION_BLUE_STROKE,
		leftFill: DARK_MOTION_BLUE_FILL,
		rightStroke: DARK_MOTION_RED_STROKE,
		rightFill: DARK_MOTION_RED_FILL,
		purpleStroke: DARK_MOTION_PURPLE_STROKE,
		purpleFill: DARK_MOTION_PURPLE_FILL,
	};

	const LIGHT_MOTION_PALETTE: MandalaPalette = {
		leftStroke: LIGHT_MOTION_BLUE_STROKE,
		leftFill: LIGHT_MOTION_BLUE_FILL,
		rightStroke: LIGHT_MOTION_RED_STROKE,
		rightFill: LIGHT_MOTION_RED_FILL,
		purpleStroke: LIGHT_MOTION_PURPLE_STROKE,
		purpleFill: LIGHT_MOTION_PURPLE_FILL,
	};

	let calcReady: boolean = $state(false);
	let animatedDx: number = $state(MANDALA_STANDARD_TIP_DX);
	let rotationDeg: number = $state(0);
	let rafId: number = 0;

	// Live render target. While animating (undulation or shape-morph) the mandala
	// is painted to a persistent <canvas> via renderMandalaToCanvas — the same
	// Path2D + single-shadow-blur renderer the MP4 export uses — instead of
	// re-serializing the full SVG string and re-parsing it through {@html} every
	// frame. {@html} tore down and rebuilt the entire filtered SVG subtree (three
	// feGaussianBlur filters + mask + bloom) 60×/sec, which is what made the
	// animation stutter. Static consumers (gallery, card back, guide) never set
	// `animate`, so they keep the unchanged SVG-string path.
	const GLOW_STDDEV = 3;
	// Backing-store scale over the canvas's true displayed CSS size. 1.0 = native
	// device pixels (sharp as the display allows). The prior bug rendered from the
	// `size` prop, which is smaller than the stretched canvas in fill/framed
	// layouts, so the backing fell BELOW native and was upscaled → "low res".
	// Driving it from clientWidth fixes that. Raise SUPERSAMPLE >1 for extra
	// edge AA at quadratic cost; MAX_BACKING caps pixel count on huge panes.
	const SUPERSAMPLE = 1;
	const MAX_BACKING = 2160;
	let canvasEl: HTMLCanvasElement | undefined = $state();
	// Reused offscreen scratch for the glow + purple-overlap mask passes, sized to
	// the device-pixel backing store, so the hot loop allocates nothing per frame.
	let scratch: { a: OffscreenCanvas; b: OffscreenCanvas } | null = null;

	// Fixed reference period (seconds) for rotation. animateRotation is "degrees
	// per this many seconds" — independent of the undulation period. Matches the
	// default animatePeriod (5) so existing default speed is unchanged.
	const ROTATION_REF_PERIOD = 5;

	// Shape-morph state: when pathShape changes, geometry lerps from the old shape
	// to the new one over MORPH_MS instead of snapping, while the breathing/rotation
	// animation keeps running.
	const MORPH_MS = 1200;
	let morphRafId: number = 0;
	let lastShape: MandalaPathShape = pathShape;
	let activeMorph: { from: MandalaPathShape; t: number } | null = $state(null);
	const CHANGE_MORPH_MS = DURATION.dramatic;
	let changeMorphRafId = 0;
	let changeMorphPaths: MandalaPaths | null = $state(null);
	let changeMorphActive = $state(false);
	let lastChangeTarget: MandalaPaths | null = null;

	onMount(() => {
		calcReady = true;
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
			if (morphRafId) cancelAnimationFrame(morphRafId);
			if (changeMorphRafId) cancelAnimationFrame(changeMorphRafId);
		};
	});

	// Drive a morph whenever pathShape changes. Reads pathShape (tracked); lastShape
	// is non-reactive so reassigning it doesn't retrigger. activeMorph is set inside
	// the rAF (outside tracking), so updating progress never re-runs this effect.
	$effect(() => {
		const target = pathShape;
		if (target === lastShape) return;
		if (morphChanges) {
			lastShape = target;
			return;
		}
		const from = lastShape;
		lastShape = target;

		if (morphRafId) cancelAnimationFrame(morphRafId);
		let start: number | null = null;
		const stepMorph = (ts: number) => {
			if (start === null) start = ts;
			const lin = Math.min(1, (ts - start) / MORPH_MS);
			activeMorph = { from, t: EASING_FNS.bloom(lin) };
			// When animating, the undulation rAF already draws every frame; only
			// paint from here for a morph that runs while otherwise static.
			if (!animate) draw();
			if (lin < 1) {
				morphRafId = requestAnimationFrame(stepMorph);
			} else {
				activeMorph = null;
				morphRafId = 0;
			}
		};
		morphRafId = requestAnimationFrame(stepMorph);
	});

	// Off-screen / hidden-tab gating. A mandala that has scrolled away keeps its
	// last painted frame instead of repainting the canvas every frame. Phase is
	// accumulated from frame deltas inside the tick, so a resume restarts from a
	// fresh `lastTime` and continues from where it stopped — no jump.
	const activityGate = createRenderActivityGate({ name: "sequence-mandala" });
	let gateActive = $state(activityGate.active);
	$effect(() => {
		const unsubscribe = activityGate.subscribe((next) => {
			gateActive = next;
		});
		return () => {
			unsubscribe();
			activityGate.dispose();
		};
	});

	// Animation loop depends ONLY on `animate`. Every tunable (min/max dx, period,
	// rotation, easing) is read live inside the rAF tick — which runs outside the
	// reactive tracking context — so adjusting speed/spin/depth retunes the motion
	// in place without re-running the effect or restarting the cycle. Phase is
	// accumulated from frame deltas, so changing the period only changes the rate,
	// never the position (no jump, fully continuous).
	$effect(() => {
		if (!animate || !gateActive) {
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = 0;
			}
			return;
		}

		let lastTime: number | null = null;
		let phaseAccum = 0;

		function tick(time: number) {
			if (lastTime === null) lastTime = time;
			const dtSec = (time - lastTime) / 1000;
			lastTime = time;

			const period = animatePeriod > 0 ? animatePeriod : 5;
			const cyclesElapsed = dtSec / period;
			phaseAccum = (phaseAccum + cyclesElapsed) % 1;

			const triangle = phaseAccum < 0.5 ? phaseAccum * 2 : 2 - phaseAccum * 2;
			const eased = EASING_FNS[animateEasing](triangle);
			animatedDx = animateMin + (animateMax - animateMin) * eased;

			if (animateRotation !== 0) {
				// Rotation runs on its own fixed-rate clock (ROTATION_REF_PERIOD),
				// fully decoupled from animatePeriod so the undulation-speed slider
				// never changes how fast the mandala spins.
				rotationDeg += (dtSec / ROTATION_REF_PERIOD) * animateRotation;
			}

			// Single per-frame canvas paint (also covers an in-flight shape morph,
			// which the morph rAF therefore skips while we're animating).
			draw();

			rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
		return () => {
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = 0;
			}
		};
	});

	const effectiveDx = $derived(tipDx ?? (animate ? animatedDx : MANDALA_STANDARD_TIP_DX));

	const animatedTipOverrides = $derived.by(() => {
		const baseline = tipOverrides;
		if (!baseline || !animate) return baseline;

		// Each prop keeps its real silhouette, but the distance of every tracked
		// point must still breathe with the Depth control. Passing the fixed
		// baseline through unchanged leaves the picture frozen while its wrapper
		// spins, because animatedDx never reaches the geometry calculator.
		const scale = effectiveDx / MANDALA_STANDARD_TIP_DX;
		return {
			left: baseline.left.map(({ dx, dy }) => ({
				dx: dx * scale,
				dy: dy * scale,
			})),
			right: baseline.right.map(({ dx, dy }) => ({
				dx: dx * scale,
				dy: dy * scale,
			})),
		};
	});

	const pathOptions = $derived(getMandalaPathOptions(pathShape, effectiveTipEnds));

	const calculatedPaths = $derived.by((): MandalaPaths | null => {
		if (!calcReady || !sequence?.steps) return null;
		const overrides = tipDx === undefined ? animatedTipOverrides : { dx: effectiveDx, dy: 0 };
		const morph = activeMorph;
		if (morph) {
			return calculateMandalaMorphed(
				sequence.steps,
				leftPropType,
				rightPropType,
				getMandalaPathOptions(morph.from, effectiveTipEnds),
				pathOptions,
				morph.t,
				overrides
			);
		}
		return calculateMandalaGeometry(sequence.steps, leftPropType, rightPropType, pathOptions, overrides);
	});

	// The workspace changes a whole sequence at once. Holding the currently
	// painted geometry here lets every edit flow into the next result, even when
	// a second change arrives before the first morph has finished.
	$effect(() => {
		const target = calculatedPaths;
		if (!target) {
			lastChangeTarget = null;
			return;
		}

		const reducedMotion =
			typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const canMorph = morphChanges && !animate && activeMorph === null && !reducedMotion;

		if (!lastChangeTarget || !canMorph) {
			if (changeMorphRafId) cancelAnimationFrame(changeMorphRafId);
			changeMorphRafId = 0;
			changeMorphPaths = null;
			changeMorphActive = false;
			lastChangeTarget = target;
			return;
		}

		if (mandalaPathsEqual(lastChangeTarget, target)) {
			lastChangeTarget = target;
			return;
		}

		const from = untrack(() => changeMorphPaths ?? lastChangeTarget)!;
		lastChangeTarget = target;
		if (changeMorphRafId) cancelAnimationFrame(changeMorphRafId);
		changeMorphPaths = from;
		changeMorphActive = true;

		let start: number | null = null;
		const stepChangeMorph = (timestamp: number) => {
			if (start === null) start = timestamp;
			const linearProgress = Math.min(1, (timestamp - start) / CHANGE_MORPH_MS);
			const progress = EASING_FNS.bloom(linearProgress);
			changeMorphPaths = interpolateMandalaPaths(from, target, progress);
			draw();

			if (linearProgress < 1) {
				changeMorphRafId = requestAnimationFrame(stepChangeMorph);
			} else {
				changeMorphRafId = 0;
				changeMorphActive = false;
				changeMorphPaths = null;
			}
		};

		changeMorphRafId = requestAnimationFrame(stepChangeMorph);
	});

	const paths = $derived(changeMorphPaths ?? calculatedPaths);

	const effectiveDarkMode = $derived(darkMode ?? settingsService.settings.darkMode);

	const renderOptions = $derived.by((): MandalaRenderOptions => {
		return {
			size,
			style,
			show,
			palette: paletteOverride ?? applyMandalaHandColors(
				effectiveDarkMode ? DARK_MOTION_PALETTE : LIGHT_MOTION_PALETTE,
				primaryPropColors === undefined ? getSettings().primaryPropColors : primaryPropColors,
			),
			tipDx: effectiveDx,
			strokeWidth,
			gradient,
		};
	});

	// Canvas while motion is live (undulation or shape-morph), SVG when fully
	// static. `svgString` is lazy — it isn't read in the canvas branch, so the
	// expensive SVG-string build is skipped entirely during animation.
	const useCanvas = $derived(animate || activeMorph !== null || changeMorphActive);

	const svgString = $derived.by((): string => {
		if (useCanvas || !paths) return "";
		return renderMandalaSVG(paths, renderOptions);
	});

	// Paint the canvas ONCE for the current state. Called exactly once per frame
	// from the single animation rAF (and once from the morph rAF when not
	// otherwise animating), so the canvas redraws at the display refresh rate,
	// vsync-aligned — never from a reactive effect, which fired separately for the
	// undulation loop AND the controller's color loop and double-drew the canvas
	// off-vsync (the residual judder). Rotation is intentionally NOT painted here;
	// it stays a CSS transform on the wrapper (compositor-cheap, no repaint).
	function draw(): void {
		const canvas = canvasEl;
		if (!canvas) return;
		const p = paths;
		if (!p) return;
		const opts = renderOptions;

		// Resolution: derive the backing store from the canvas's ACTUAL displayed
		// box (clientWidth), not the `size` prop. In layouts that CSS-stretch the
		// canvas past `size` (device frames, flex fills), `size * dpr` under-resolves
		// — backing fell below native and the raster was upscaled, which read as
		// "low res". `logicalSize` is the true on-screen size; SUPERSAMPLE renders
		// above native so raster edges approach the old SVG's vector crispness.
		// MAX_BACKING caps the pixel count so the per-frame raster (glow is the
		// expensive part) stays within the 60fps budget on the largest panes.
		const dpr = typeof window !== "undefined" ? Math.min(3, Math.max(1, window.devicePixelRatio || 1)) : 1;
		// True rendered size in CSS px — getBoundingClientRect reflects any CSS
		// transform/zoom on an ancestor (e.g. a scaled device frame), so the backing
		// matches what's actually on screen even there. Falls back to the prop.
		const logicalSize = Math.max(1, Math.round(canvas.getBoundingClientRect().width) || size);
		const device = Math.min(MAX_BACKING, Math.max(1, Math.round(logicalSize * dpr * SUPERSAMPLE)));
		// Logical→device scale (folds in dpr + supersample + any CSS stretch).
		const ratio = device / logicalSize;
		if (canvas.width !== device || canvas.height !== device) {
			canvas.width = device;
			canvas.height = device;
		}

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Persistent device-sized scratch for the glow/mask passes (allocate only
		// on first paint or size change).
		if (typeof OffscreenCanvas !== "undefined") {
			if (!scratch || scratch.a.width !== device || scratch.a.height !== device) {
				scratch = {
					a: new OffscreenCanvas(device, device),
					b: new OffscreenCanvas(device, device),
				};
			}
		}

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, device, device);
		ctx.scale(ratio, ratio);

		// Device-space glow blur that matches the SVG `#glow` feGaussianBlur, whose
		// stdDeviation lives inside the scaled <g> (so its device size is
		// stdDeviation × renderScale × ratio). Mirrors mandala-frame-renderer.
		const renderExtent = resolveMandalaRenderExtent(p, opts);
		const renderScale = logicalSize / 2 / (renderExtent * 1.05);

		renderMandalaToCanvas(ctx, p, {
			...opts,
			size: logicalSize,
			glow: {
				blur: GLOW_STDDEV * renderScale * ratio,
				bloomBlur: DEFAULT_OVERLAP_CONFIG.bloomBlur * renderScale * ratio,
			},
			offsetX: 0,
			offsetY: 0,
			maskScratch: scratch ?? undefined,
		});
	}

	// First paint + resize for the canvas. Tracks ONLY useCanvas/canvasEl/size;
	// the actual draw() reads (paths/palette/…) are untracked so this never
	// re-fires per frame — the rAF loops own per-frame redraws.
	$effect(() => {
		if (!useCanvas) return;
		void canvasEl;
		void size;
		untrack(() => draw());
	});
</script>

{#if useCanvas}
	<div
		class="mandala-container"
		style="width: {size}px; height: {size}px; transform: rotate({rotationDeg}deg);"
		use:renderGateTarget={activityGate}
	>
		<canvas bind:this={canvasEl} class="mandala-canvas"></canvas>
	</div>
{:else if svgString}
	<div
		class="mandala-container"
		style="width: {size}px; height: {size}px; transform: rotate({rotationDeg}deg);"
		use:renderGateTarget={activityGate}
	>
		{@html svgString}
	</div>
{/if}

<style>
	.mandala-container {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.mandala-container :global(svg) {
		width: 100%;
		height: 100%;
	}

	.mandala-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
