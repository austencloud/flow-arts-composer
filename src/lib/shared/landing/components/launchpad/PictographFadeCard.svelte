<!--
  PictographFadeCard.svelte

  Living media for the homepage's Staff Choreography tile: a card-shaped
  medium that cycles through real pictographs, crossfading between them.
  Reuses the exact PictographContainer usage the notation tile already has
  (LaunchpadTile.svelte's "pictograph" media), with `printMode` so it reads
  as card stock rather than a glyph floating on glass — the card framing
  (white panel, rounded corners, rotation, shadow) lives in the tile's own
  `.pictograph-fade-box` wrapper, matching how `.choreo-card-box` frames
  ChoreoCard.svelte elsewhere in this same file.

  Crossfade routing (crossfade-primitive.md): a pictograph is heavier content
  than a label, so the dual-source CellRenderer path was checked first. It
  doesn't fit — CellRenderer crossfades pre-rasterized `imageUrl`/`fadeOutUrl`
  blob images produced by ChoreoCard's export pipeline, not a live
  PictographContainer render. Using it here would mean pulling in that whole
  rasterization pipeline for a single tile glyph. Per the rule's own carve-out
  ("otherwise justify Crossfade with a cadence slow enough (6s+) that remount
  cost is irrelevant"), this uses the plain `Crossfade` primitive at a 7s+
  cadence, so the `{#key}` remount cost is a non-issue.

  Cycling is client-only progressive enhancement (the tile's real `<a>` +
  heading ship in SSR regardless of any of this) and freezes on the current
  frame under prefers-reduced-motion rather than merely losing its fade —
  Crossfade already makes the swap instant under reduced motion, but the
  interval driving *which* pictograph shows would otherwise keep silently
  swapping content underneath that instant cut. Stopping the interval keeps
  the card genuinely static.
-->
<script lang="ts">
	import Crossfade from "#lib/shared/components/Crossfade.svelte";
	import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
	import { DURATION } from "#lib/shared/transitions/transitions.js";
	import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

	let {
		steps,
		intervalMs = 7000,
		startDelayMs = 0,
	}: { steps: StepData[]; intervalMs?: number; startDelayMs?: number } = $props();

	let index = $state(0);
	const current = $derived(steps[index % steps.length]);

	$effect(() => {
		if (steps.length < 2) return;

		let timer: ReturnType<typeof setInterval> | undefined;
		let starter: ReturnType<typeof setTimeout> | undefined;
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

		function stop() {
			if (starter) clearTimeout(starter);
			if (timer) clearInterval(timer);
			starter = undefined;
			timer = undefined;
		}

		function start() {
			stop();
			// Reduced motion: hold on the current frame instead of continuing to
			// swap content behind an instant (non-animated) Crossfade cut.
			if (mql.matches) return;
			starter = setTimeout(() => {
				timer = setInterval(() => {
					index = (index + 1) % steps.length;
				}, intervalMs);
			}, startDelayMs);
		}

		start();
		mql.addEventListener("change", start);
		return () => {
			stop();
			mql.removeEventListener("change", start);
		};
	});
</script>

<div class="pictograph-fade-card">
	<Crossfade key={current?.id ?? index} duration={DURATION.dramatic} fill>
		{#if current}
			<PictographContainer pictographData={current} disableTransitions printMode />
		{/if}
	</Crossfade>
</div>

<style>
	.pictograph-fade-card {
		position: relative;
		width: 100%;
		height: 100%;
	}
</style>
