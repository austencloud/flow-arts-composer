<!--
  9-Square Theory artifact: a stack of Charlie Cushing's own video frames
  (the verified IDs from the catalog), fanned when active. Poster thumbnails
  only — the site CSP blocks YouTube frames, so watching happens externally
  from the detail view's SourceVideoCard strip.
-->
<script lang="ts">
	import type { CatalogVideo } from "#lib/shared/notation/notation-catalog.js";

	let { videos = [], active = false }: { videos?: CatalogVideo[]; active?: boolean } = $props();

	const stack = $derived(videos.slice(0, 4));
</script>

<div class="nine-square" class:active role="img" aria-label="A stack of frames from Charlie Cushing's 9-Square Theory video series">
	{#each stack as video, i (video.id)}
		<div class="frame" style={`--i: ${i}; --n: ${stack.length}`}>
			<img
				src={`https://img.youtube.com/vi/${video.id}/hqdefault.jpg`}
				alt=""
				loading="lazy"
			/>
		</div>
	{/each}
</div>

<style>
	.nine-square {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
	}

	.frame {
		grid-area: 1 / 1;
		width: min(72%, 30rem);
		aspect-ratio: 4 / 3;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid oklch(0.6 0.03 270 / 0.4);
		box-shadow: 0 12px 30px oklch(0 0 0 / 0.45);
		/* Resting: a tight deck with corners peeking. */
		transform: translate(calc(var(--i) * 2.5%), calc(var(--i) * -2.5%))
			rotate(calc(var(--i) * 1.4deg - 2deg));
		transition: transform 420ms cubic-bezier(0.3, 1.2, 0.4, 1);
	}

	/* Active: the deck fans so every frame shows an edge. */
	.nine-square.active .frame {
		transform: translate(
				calc((var(--i) - (var(--n) - 1) / 2) * 13%),
				calc(var(--i) * -3%)
			)
			rotate(calc((var(--i) - (var(--n) - 1) / 2) * 5deg));
	}

	.frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	@media (prefers-reduced-motion: reduce) {
		.frame {
			transition: none;
		}
	}
</style>
