<!--
  QFT artifact: the numbered field with a traced prop path, driven live from
  the shared QFT model. Active = the cursor advances around the eight-step
  cycle on its own rAF; inactive = the same stage frozen at step 0, which
  doubles as the poster (the SVG is cheap either way, only the loop stops).
-->
<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import {
		buildIncrements,
		type QftKnobs,
	} from "#lib/shared/notation/qft/qft-model.js";
	import QftStage from "#lib/shared/notation/qft/components/QftStage.svelte";

	let { active = false }: { active?: boolean } = $props();

	// The qft-notation lab's default knobs — a sourced, nameable pattern.
	const knobs: QftKnobs = { radius: 1, downbeats: 3, spin: "antispin", phase: 0 };
	const increments = buildIncrements(knobs, "charlie");

	const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

	let cursor = $state(0);

	$effect(() => {
		if (!active || reduceMotion.current) return;
		let raf = 0;
		let last = performance.now();
		const frame = (now: number) => {
			cursor = (cursor + (now - last) / 1400) % 8;
			last = now;
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="qft-artifact">
	<!-- This is one fixed, named pattern, so fit its all-frames reach once.
	     The shared stage keeps that scale stable through the animation. -->
	<QftStage {knobs} {increments} {cursor} fit />
</div>

<style>
	.qft-artifact {
		width: 100%;
		height: 100%;
	}
</style>
