<!--
  VillageLossCaption - The one quiet line the room shows when the last person
  who knew a founding sequence is gone, or when someone learns what the
  visitor brought. It hangs beside that sequence's stone, fades in, stays a
  few seconds, and fades out. Both read the same way on purpose.
-->
<script lang="ts">
	import { T, useTask } from "@threlte/core";
	import { HTML } from "@threlte/extras";
	import {
		CAPTION_SECONDS,
		type VillageCaption,
	} from "../state/village-visual-state.svelte";

	interface Props {
		caption: VillageCaption;
	}

	const { caption }: Props = $props();

	const FADE_IN_SECONDS = 1.2;
	const FADE_OUT_SECONDS = 2;

	let age = $state(0);
	let opacity = $derived(
		Math.max(
			0,
			Math.min(1, age / FADE_IN_SECONDS, (CAPTION_SECONDS - age) / FADE_OUT_SECONDS),
		),
	);

	useTask((delta) => {
		age += delta;
	});
</script>

<T.Group position.x={caption.x} position.y={2.1} position.z={caption.z}>
	<HTML center sprite>
		<p class="loss-caption" style:opacity>{caption.text}</p>
	</HTML>
</T.Group>

<style>
	.loss-caption {
		margin: 0;
		font-family: var(--font-family-serif, Georgia, serif);
		font-size: var(--font-size-sm, 14px);
		font-style: italic;
		letter-spacing: 0.01em;
		color: var(--theme-text, #f3efe6);
		text-shadow: 0 0 8px rgba(0, 0, 0, 0.9);
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
	}
</style>
