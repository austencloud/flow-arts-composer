<!--
  One VTG artifact treatment, rendered from figures lifted off the source PDFs.

  Every candidate on the options page is the same machine: a list of figures
  cropped out of Vulcan Tech Gospel V.1 or VTG #2, cycled with the shared
  Crossfade primitive on a paper ground. What differs between candidates is
  WHICH figures and what the caption claims — so the comparison is about the
  source material, not about five different bits of layout code.

  `fill` mode is mandatory here: the figures have different aspect ratios, and
  content-sized crossfade would resize the plate mid-transition and shove the
  caption (see .claude/rules/crossfade-primitive.md, "The First-Time Failure").
-->
<script lang="ts" module>
	export interface Figure {
		/** Basename under /images/notation/vtg/figures/ */
		file: string;
		/** Caption shown while this figure is up. */
		label: string;
	}
</script>

<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import Crossfade from "#lib/shared/components/Crossfade.svelte";
	import { DURATION } from "#lib/shared/transitions/transitions.js";

	let {
		figures,
		active = true,
		interval = 2600,
		perView = 1,
		alt,
	}: {
		figures: Figure[];
		active?: boolean;
		interval?: number;
		/** How many plates share one slide. The source figures are landscape and
		    the archive tile is portrait — showing two stacked fills the tile
		    instead of floating one small card in a tall box. Use 1 only when the
		    slides are a SEQUENCE, where pairing would break the argument. */
		perView?: 1 | 2;
		alt: string;
	} = $props();

	/** Figures grouped into slides of `perView`. */
	const slides = $derived.by(() => {
		const out: Figure[][] = [];
		for (let n = 0; n < figures.length; n += perView) {
			out.push(figures.slice(n, n + perView));
		}
		return out;
	});

	const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
	let i = $state(0);

	$effect(() => {
		if (!active || reduceMotion.current || slides.length < 2) return;
		const timer = setInterval(() => {
			i = (i + 1) % slides.length;
		}, interval);
		return () => clearInterval(timer);
	});

	const current = $derived(slides[i % slides.length] ?? []);
	const slideKey = $derived(current.map((f) => f.file).join("+"));
	const slideLabel = $derived(current.map((f) => f.label).join(" · "));

	/** Longest label, so the caption reserves its width and never shifts. */
	const widest = $derived(
		slides
			.map((s) => s.map((f) => f.label).join(" · "))
			.reduce((a, l) => (l.length > a.length ? l : a), "")
	);
</script>

<div class="wrap">
	<div class="stage" role="img" aria-label={alt}>
<!-- `swap`, not `crossfade`: these are dense black line lattices, and
		     overlapping two of them mid-transition produces moiré and double
		     glyphs that read as a rendering fault rather than a transition.
		     Running the old plate out before the new one enters keeps every
		     frame legible. -->
		<Crossfade key={slideKey} fill mode="swap" duration={DURATION.normal}>
			<div class="center" style={`--per:${perView}`}>
				{#each current as f (f.file)}
					<img
						src={`/images/notation/vtg/figures/${f.file}.webp`}
						alt=""
						decoding="async"
					/>
				{/each}
			</div>
		</Crossfade>
	</div>

	<p class="caption">
		<span class="sizer" aria-hidden="true">{widest}</span>
		<span class="live">{slideLabel}</span>
	</p>

	{#if slides.length > 1}
		<div class="dots" aria-hidden="true">
			{#each slides as s, n (s[0]?.file ?? n)}
				<span class="dot" class:on={n === i % slides.length}></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto auto;
		justify-items: center;
		gap: clamp(0.35rem, 1.6cqi, 0.8rem);
		padding: clamp(0.5rem, 2.5cqi, 1.4rem);
		box-sizing: border-box;
	}

	.stage {
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	/* One row per plate, each an equal share of the stage. `minmax(0, 1fr)` is
	   load-bearing: `1fr` floors at the image's intrinsic content size, so a
	   1500px-wide source would blow the row out instead of shrinking. */
	.center {
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-rows: repeat(var(--per, 1), minmax(0, 1fr));
		place-items: center;
		gap: clamp(0.3rem, 1.6cqi, 0.8rem);
	}

	/* The paper is the FIGURE's own rectangle, not the tile's.
	   These plates are landscape and the archive tile is portrait (0.7), so a
	   paper ground stretched to fill the tile is ~40% blank page above and
	   below the drawing — it reads as a printing error. Sizing the paper to the
	   image turns that emptiness into tile background, where it belongs, and
	   the card floats. No layout shift: the .center box is fixed by the stage,
	   so a taller or shorter figure moves nothing around it.

	   Paper, not ink: these are black/green/red line drawings keyed to
	   transparency, so they need a light ground to read as the printed pages
	   they are. */
	.center img {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		display: block;
		box-sizing: border-box;
		padding: clamp(0.4rem, 2cqi, 1rem);
		border-radius: 12px;
		background: oklch(0.96 0.008 90 / 0.95);
		border: 1px solid oklch(0.72 0.13 40 / 0.3);
		box-shadow: 0 10px 34px oklch(0.1 0.02 275 / 0.45),
			0 0 40px oklch(0.72 0.14 40 / 0.1);
	}

	.caption {
		margin: 0;
		display: inline-grid;
		font-size: clamp(0.55rem, 1.9cqi, 0.9rem);
		font-style: italic;
		text-align: center;
		color: oklch(0.72 0.04 70);
	}

	.sizer,
	.live {
		grid-area: 1 / 1;
	}

	.sizer {
		visibility: hidden;
		white-space: nowrap;
	}

	.dots {
		display: flex;
		gap: 0.35rem;
	}

	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: oklch(0.5 0.03 70 / 0.5);
		transition: background-color 300ms ease;
	}

	.dot.on {
		background: oklch(0.78 0.16 40 / 0.9);
	}

	@container (max-height: 260px) {
		.caption,
		.dots {
			display: none;
		}
	}
</style>
