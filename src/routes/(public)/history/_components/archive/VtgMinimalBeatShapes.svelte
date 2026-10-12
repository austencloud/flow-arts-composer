<!--
  Vulcan Tech Gospel artifact: the notation as VTG actually wrote it.

  This tile used to draw TKA mandalas, which made the most important system on
  the page look like every other system on the page. It isn't. VTG wrote its
  1:1 set in a flat 2D language of overlaid ellipses — GREEN for spin, RED for
  antispin — and that language is the thing worth showing.

  The ten shapes here are lifted directly from Vulcan Tech Gospel V.1 page 2,
  "10 Minimal Beat Shapes" by Brian Thompson (the PDF Noel Yee publishes at
  noelyee.com). Each glyph was cropped from the page at 6x, keyed to
  transparency, and — critically — cropped to ONE shared box, so the printed
  size relationships survive: an isolation really is a dot next to a full-size
  extension. Normalising each glyph to fill its own tile would throw that away,
  and the size relationship is part of the notation.

  The page's own argument is the layout: four base shapes, and the six hybrids
  they stack into. Names and the header sentence are quoted verbatim.
-->
<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";

	let { active = false }: { active?: boolean } = $props();

	interface Shape {
		file: string;
		/** The name exactly as VTG V.1 page 2 prints it. */
		name: string;
	}

	// Reading order from the source page: the four pure shapes, then the six
	// hybrids. Order is not ours to choose — it is the page's.
	const BASE: Shape[] = [
		{ file: "isolation", name: "Isolation" },
		{ file: "extension", name: "Extension" },
		{ file: "vertical-antispin", name: "Vertical Antispin" },
		{ file: "horizontal-antispin", name: "Horizontal Antispin" },
	];

	const HYBRID: Shape[] = [
		{ file: "extension-vertical-antispin", name: "Extension / Vertical Antispin" },
		{ file: "extension-horizontal-antispin", name: "Extension / Horizontal Antispin" },
		{ file: "isolation-extension", name: "Isolation / Extension" },
		{ file: "vertical-antispin-isolation", name: "Vertical Antispin / Isolation" },
		{ file: "horizontal-antispin-isolation", name: "Horizontal Antispin / Isolation" },
		{
			file: "vertical-antispin-horizontal-antispin",
			name: "V. Antispin / H. Antispin",
		},
	];

	const ALL = [...BASE, ...HYBRID];

	/** The longest name, so the caption reserves its width and nothing shifts. */
	const WIDEST = ALL.reduce((a, s) => (s.name.length > a.length ? s.name : a), "").trim();

	const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
	let lit = $state(0);

	$effect(() => {
		if (!active || reduceMotion.current) return;
		const timer = setInterval(() => {
			lit = (lit + 1) % ALL.length;
		}, 1400);
		return () => clearInterval(timer);
	});

	const litName = $derived(ALL[lit]?.name ?? "");
</script>

<div class="vtg-plate">
	<div
		class="plate"
		class:on={active}
		role="img"
		aria-label="The ten minimal beat shapes of the Vulcan Tech Gospel: four base shapes, isolation, extension, vertical antispin, and horizontal antispin, plus the six hybrids they stack into. Green marks spin; red marks antispin."
	>
		<div class="col base">
			{#each BASE as s, i (s.file)}
				<figure class="cell" class:lit={active && lit === i}>
					<img src={`/images/notation/vtg/${s.file}.webp`} alt="" decoding="async" />
					<figcaption>{s.name}</figcaption>
				</figure>
			{/each}
		</div>

		<div class="rule" aria-hidden="true"></div>

		<div class="col hybrid">
			{#each HYBRID as s, i (s.file)}
				<figure class="cell" class:lit={active && lit === i + BASE.length}>
					<img src={`/images/notation/vtg/${s.file}.webp`} alt="" decoding="async" />
					<figcaption>{s.name}</figcaption>
				</figure>
			{/each}
		</div>
	</div>

	<!-- Ghost sizer holds the widest name so the travelling caption can never
	     resize the plate under it. -->
	<p class="caption">
		<span class="sizer" aria-hidden="true">{WIDEST}</span>
		<span class="live">{active ? litName : "10 Minimal Beat Shapes"}</span>
	</p>
</div>

<style>
	.vtg-plate {
		width: 100%;
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		display: grid;
		/* Definite column track: without it a percentage width inside has no
		   basis and the plate can grow past the tile. */
		grid-template-columns: minmax(0, 1fr);
		/* A definite row for the plate, so its six-deep column can resolve
		   against the tile's height instead of the images' intrinsic size. */
		grid-template-rows: minmax(0, 1fr) auto;
		justify-items: center;
		align-content: stretch;
		gap: clamp(0.4rem, 2cqi, 1rem);
		padding: clamp(0.6rem, 3cqi, 1.6rem);
		box-sizing: border-box;
	}

	/* The source page's own layout: two columns, the four base shapes beside the
	   six hybrids they stack into, EVERY cell the same size. Laying the four
	   across a row of 4 and the six across rows of 3 (the obvious grid) renders
	   them at two different scales and throws away the printed proportions the
	   crops were built to preserve. */
	/* Small stage: the page's two-column form collapses to a 94px sliver with
	   33px glyphs, which is unreadable. Below the threshold the ten shapes flow
	   into one 5x2 grid instead — every cell still shares a size, so the printed
	   proportions hold; only the base/hybrid split is dropped, and at thumbnail
	   scale that split couldn't be read anyway. */
	.plate {
		box-sizing: border-box;
		max-width: 100%;
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		grid-auto-rows: 1fr;
		align-items: center;
		gap: clamp(0.3rem, 1.6cqi, 0.9rem);
		padding: clamp(0.5rem, 2.4cqi, 1.2rem);
		border-radius: 14px;
		/* Paper, not ink: the shapes were drawn as black-on-white line art and
		   they need a light ground to read as the printed page they are. */
		background: oklch(0.96 0.008 90 / 0.93);
		border: 1px solid oklch(0.72 0.13 40 / 0.3);
		box-shadow: 0 0 40px oklch(0.72 0.14 40 / 0.09);
		transition: border-color var(--duration-dramatic) var(--ease-standard), box-shadow var(--duration-dramatic) var(--ease-standard);
	}

	.plate.on {
		border-color: oklch(0.78 0.15 40 / 0.55);
		box-shadow: 0 0 60px oklch(0.78 0.16 40 / 0.16);
	}

	/* BOTH columns are six rows deep — the hybrid column fills all six, the base
	   column takes the middle four. Sharing the row track is what makes a base
	   cell exactly as big as a hybrid cell; giving each column its own auto
	   rows would size them H/4 against H/6 and silently rescale the shapes. */
	/* Small stage: the columns dissolve so all ten cells flow into the plate's
	   own 5x2 grid. */
	.col {
		display: contents;
	}

	.rule {
		display: none;
	}

	.cell {
		margin: 0;
		display: grid;
		grid-template-columns: auto;
		place-items: center;
		min-width: 0;
		min-height: 0;
		border-radius: 8px;
		transition: background-color var(--duration-emphasis) var(--ease-standard), transform var(--duration-emphasis) var(--ease-spring);
	}

	/* Fill the cell and let `contain` do the scaling. `max-height: 100%` looks
	   safer but doesn't bind here — the glyph kept its intrinsic 300px and
	   overflowed a 104px track. Because every cell now sits on the SAME shared
	   row track, filling the cell renders all ten at one scale, which is what
	   keeps the printed proportions true. */
	.cell img {
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: contain;
		display: block;
	}

	/* The page prints each shape's name beside it. There is only room for that
	   on a wide plate (the detail panel); the tile carries the travelling
	   caption instead. */
	.cell figcaption {
		display: none;
		/* Scales with the plate: at 3840 a 1.3cqi cap put these at 10px, which
		   reads as texture rather than as the printed names they are. */
		font-size: clamp(0.62rem, 2.1cqi, 1.25rem);
		line-height: 1.15;
		letter-spacing: 0.01em;
		color: oklch(0.35 0.02 80);
		justify-self: start;
	}

	/* Wide enough for the page's own form: two columns — the four base shapes
	   beside the six hybrids they stack into — with each shape's name printed
	   next to it, exactly as VTG V.1 page 2 sets it. Both columns are six rows
	   deep and share the row track, so a base cell is exactly as big as a hybrid
	   cell; giving each column its own rows would size them H/4 against H/6 and
	   silently rescale the shapes. */
	@container (min-width: 420px) {
		.plate {
			grid-template-columns: auto auto auto;
			grid-auto-rows: auto;
		}

		.col {
			display: grid;
			grid-template-rows: repeat(6, minmax(0, 1fr));
			gap: clamp(0.15rem, 1cqi, 0.5rem);
			height: 100%;
			min-height: 0;
		}

		.base .cell:nth-child(1) { grid-row: 2; }
		.base .cell:nth-child(2) { grid-row: 3; }
		.base .cell:nth-child(3) { grid-row: 4; }
		.base .cell:nth-child(4) { grid-row: 5; }

		.rule {
			display: block;
			width: 1px;
			align-self: stretch;
			background: oklch(0.55 0.02 80 / 0.3);
		}

		.cell {
			grid-template-columns: auto minmax(0, 1fr);
			gap: clamp(0.3rem, 1.2cqi, 0.7rem);
		}

		.cell figcaption {
			display: block;
		}
	}

	/* Background only — a scale here pushes an edge cell past the plate border,
	   and a printed sheet shouldn't bulge. */
	.cell.lit {
		background: oklch(0.8 0.16 40 / 0.2);
	}

	.caption {
		margin: 0;
		display: inline-grid;
		font-size: clamp(0.55rem, 1.9cqi, 0.9rem);
		font-style: italic;
		letter-spacing: 0.01em;
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

	/* Once the names are printed beside the shapes, the travelling caption is
	   just repeating the plate — stand it down. (Declared after the base
	   `.caption` rule: same specificity, so source order decides.) */
	@container (min-width: 420px) {
		.caption {
			display: none;
		}
	}

	/* Short stage: the shapes are the artifact; the caption stands down rather
	   than squeezing the plate out of the tile. */
	@container (max-height: 260px) {
		.caption {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.plate,
		.cell {
			transition: none;
		}
		.cell.lit {
			transform: none;
		}
	}
</style>
