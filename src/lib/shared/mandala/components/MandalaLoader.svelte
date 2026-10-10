<script lang="ts">
	/**
	 * MandalaLoader — ambient loading visual. Renders a live, undulating mandala
	 * that crossfades through a small pool of locally-generated sequences.
	 * Falls back to a thin bar while the pool warms (first-ever run). Honors
	 * prefers-reduced-motion (static single mandala, no crossfade).
	 */
	import { onMount } from "svelte";
	import Crossfade from "#lib/shared/components/Crossfade.svelte";
	import SequenceMandala from "./SequenceMandala.svelte";
	import IndeterminateBar from "#lib/shared/components/loading/IndeterminateBar.svelte";
	import { mandalaPool } from "../services/mandala-pool.svelte";
	import { flowPalette, flowGradientColors, PRESET_COLORS } from "../domain/mandala-palette";
	import {
		MANDALA_LOADER_LOOK,
		MANDALA_DWELL_MS,
		MANDALA_CROSSFADE_MS,
	} from "../domain/mandala-loader-config";

	interface Props {
		/** Status line under the mandala. */
		message?: string;
		/** Mandala size in px. */
		size?: number;
	}
	let { message = "", size = 320 }: Props = $props();

	let current = $state<unknown>(null);
	let currentKey = $state(0);
	let preset = $state(MANDALA_LOADER_LOOK.presets[0] ?? "aurora");
	let phase = $state(0);
	let reducedMotion = $state(false);

	onMount(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		reducedMotion = mq.matches;
		const onMq = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener("change", onMq);

		let rafId = 0;
		let dwellId: ReturnType<typeof setInterval> | null = null;
		let disposed = false;

		function draw() {
			const next = mandalaPool.sample();
			if (next) {
				current = next;
				currentKey += 1;
				const presets = MANDALA_LOADER_LOOK.presets;
				preset = presets[Math.floor(Math.random() * presets.length)]!;
			}
		}

		void (async () => {
			await mandalaPool.ensureWarm();
			if (disposed) return;
			draw();
			if (!reducedMotion) {
				dwellId = setInterval(draw, MANDALA_DWELL_MS);
			}
			// After first paint, top up the pool for next time on idle.
			const idle =
				(window as unknown as { requestIdleCallback?: (cb: () => void) => void })
					.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
			idle(() => {
				void mandalaPool.topUp();
			});
		})();

		// Color-flow loop (skipped under reduced motion).
		let start: number | null = null;
		function tick(t: number) {
			if (start === null) start = t;
			phase =
				(((t - start) / 1000) % MANDALA_LOADER_LOOK.animatePeriod) /
				MANDALA_LOADER_LOOK.animatePeriod;
			rafId = requestAnimationFrame(tick);
		}
		if (!reducedMotion) rafId = requestAnimationFrame(tick);

		return () => {
			disposed = true;
			mq.removeEventListener("change", onMq);
			if (rafId) cancelAnimationFrame(rafId);
			if (dwellId) clearInterval(dwellId);
		};
	});

	const morph = $derived(PRESET_COLORS[preset].morph);
	const palette = $derived(flowPalette(morph, phase));
	const gradient = $derived(flowGradientColors(morph, phase));
</script>

<div class="mandala-loader" role="status" aria-label={message || "Loading"} aria-busy="true">
	{#if current}
		<div class="stage" style:width="{size}px" style:height="{size}px">
			<Crossfade key={currentKey} fill duration={MANDALA_CROSSFADE_MS}>
				<SequenceMandala
						sequence={current}
						{size}
						show="both"
						style="stroke"
						animate={!reducedMotion}
						animateEasing={MANDALA_LOADER_LOOK.animateEasing}
						animateRotation={reducedMotion ? 0 : MANDALA_LOADER_LOOK.animateRotation}
						animatePeriod={MANDALA_LOADER_LOOK.animatePeriod}
						animateMin={MANDALA_LOADER_LOOK.animateMin}
						animateMax={MANDALA_LOADER_LOOK.animateMax}
						strokeWidth={MANDALA_LOADER_LOOK.strokeWidth}
						{palette}
						{gradient}
					/>
			</Crossfade>
		</div>
	{:else}
		<!-- Pool still warming (first-ever run): calm bar, no jank. -->
		<IndeterminateBar position="top" />
	{/if}
	{#if message}
		<span class="message">{message}</span>
	{/if}
</div>

<style>
	.mandala-loader {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		background: var(--theme-panel-bg, rgba(10, 10, 16, 0.98));
	}
	.stage {
		position: relative;
	}
	.message {
		font-size: var(--font-size-sm, 14px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
		letter-spacing: 0.02em;
	}
</style>
