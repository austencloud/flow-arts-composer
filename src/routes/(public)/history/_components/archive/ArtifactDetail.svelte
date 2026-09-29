<!--
  The focused detail for one entry: the sourced prose, revealed because the
  visitor asked for it. Rendered inside the desktop overlay and inside the
  mobile Drawer — one content component, two hosts. Copy is the catalog's,
  verbatim; nothing is added.
-->
<script lang="ts">
	import type { CatalogEntry } from "$lib/shared/notation/notation-catalog";
	import SourceVideoCard from "$lib/shared/components/SourceVideoCard.svelte";
	import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
	import ArtifactVisual from "./ArtifactVisual.svelte";
	import { VTG_DECADE } from "./_lib/vtg-chronicle.svelte";

	let {
		entry,
		index,
		count,
		showVisual = true,
	}: {
		entry: CatalogEntry;
		index: number;
		count: number;
		showVisual?: boolean;
	} = $props();
</script>

<div class="detail" class:with-visual={showVisual}>
	{#if showVisual}
		<!-- The travelling element: this stage pairs with the tile's stage of
		     the same name, so the artifact itself flies from the tile into the
		     panel while the panel's chrome simply arrives. -->
		<div class="detail-stage" style:view-transition-name={`stage-${entry.id}`}>
			<ArtifactVisual {entry} active={true} />
		</div>
	{/if}

	<div class="detail-copy">
		<p class="detail-meta">
			<span class="detail-year">{entry.year}</span>
			<span class="detail-count">{index + 1} of {count}</span>
		</p>
		<h2 class="detail-title"><em>{entry.system}</em></h2>
		<p class="detail-people">{entry.people}</p>
		<p class="detail-records">{entry.records}</p>

		<!-- VTG is the only entry whose story is a decade rather than a document,
		     and the only one whose last chapter never arrived. The tile can't
		     carry that (2015 and 2019 have no plate), so it lives here. Quotes
		     and provenance: ../_lib/vtg-chronicle.ts -->
		{#if entry.id === "vtg"}
			<ol class="decade">
				{#each VTG_DECADE as event (event.when + event.what)}
					<li class:unshipped={event.unshipped}>
						<span class="when">{event.when}</span>
						<span class="what">{event.what}</span>
					</li>
				{/each}
			</ol>
		{/if}

		{#if entry.subWorks?.length}
			<ul class="subworks">
				{#each entry.subWorks as work (work.name)}
					<li><strong>{work.name}</strong> <span>{work.note}</span></li>
				{/each}
			</ul>
		{/if}

		<div class="detail-sources">
			{#if entry.explore}
				<LinkChip class="explore-btn" href={entry.explore.href}
					>{entry.explore.label}</LinkChip
				>
			{/if}
			{#each entry.sources as source (source.href)}
				<LinkChip href={source.href}>{source.label}</LinkChip>
			{/each}
		</div>

		{#if entry.videos?.length}
			<div class="detail-videos">
				{#each entry.videos as video (video.id)}
					<SourceVideoCard {...video} />
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.detail {
		display: grid;
		gap: clamp(1rem, 3cqi, 2.4rem);
		height: 100%;
		min-height: 0;
	}

	.detail.with-visual {
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		align-items: center;
	}

	.detail-stage {
		view-transition-class: notation-archive;
		container-type: size;
		/* Firm height: the panel is content-sized, so a percentage here would
		   resolve against nothing and let live visuals spill out of the panel. */
		height: min(56vh, 34rem);
		min-height: 14rem;
	}

	.detail-copy {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-width: 0;
		max-height: 100%;
		overflow-y: auto;
		padding-right: 0.4rem;
	}

	/* The kicker voice from the masthead: small caps, wide tracking. */
	.detail-meta {
		display: flex;
		justify-content: space-between;
		margin: 0;
		font-variant-numeric: tabular-nums;
		font-size: 0.75rem;
		font-weight: 650;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: oklch(0.6 0.03 270);
	}

	/* The masthead's editorial voice, carried into the plate. */
	.detail-title {
		margin: 0;
		font-family: "Fraunces", Georgia, serif;
		font-weight: 700;
		font-size: clamp(1.7rem, 3.4cqi, 3rem);
		line-height: 1.08;
		letter-spacing: -0.015em;
		color: oklch(0.93 0.02 270);
	}

	.detail-title em {
		font-style: italic;
	}

	.detail-people {
		margin: 0;
		font-size: clamp(0.9rem, 1.4cqi, 1.05rem);
		color: oklch(0.72 0.03 270);
	}

	.detail-records {
		margin: 0;
		font-size: clamp(0.95rem, 1.5cqi, 1.15rem);
		line-height: 1.6;
		color: oklch(0.85 0.02 270);
	}

	/* A ruled column rather than bullets: the rule reads as the same timeline
	   the rail and the tile's chapter stepper draw, turned vertical. */
	.decade {
		margin: 0;
		padding: 0 0 0 1.1rem;
		list-style: none;
		display: grid;
		gap: 0.7rem;
		border-left: 1px solid oklch(0.45 0.04 270 / 0.45);
	}

	.decade li {
		display: grid;
		grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr);
		gap: 0 0.9rem;
		align-items: baseline;
		font-size: 0.95rem;
		line-height: 1.5;
		color: oklch(0.78 0.02 270);
	}

	.decade .when {
		font-family: "Fraunces", Georgia, serif;
		font-style: italic;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--artifact-accent, oklch(0.75 0.13 40));
	}

	/* The one entry that never happened is the point of the list, so it is set
	   apart rather than styled as a peer of the seven that did. */
	.decade li.unshipped {
		margin-top: 0.35rem;
		padding-top: 0.7rem;
		border-top: 1px dashed oklch(0.5 0.04 270 / 0.5);
		color: oklch(0.68 0.02 270);
	}

	.decade li.unshipped .when {
		color: oklch(0.6 0.03 270);
	}

	@media (max-width: 620px) {
		.decade li {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.15rem;
		}
	}

	.subworks {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.45rem;
	}

	.subworks li {
		display: flex;
		gap: 0.55rem;
		align-items: baseline;
		font-size: 0.95rem;
		color: oklch(0.78 0.02 270);
	}

	.subworks strong {
		color: oklch(0.88 0.03 270);
		white-space: nowrap;
	}

	.detail-sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 0.3rem;
	}

	.detail-videos {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.8rem;
		margin-top: 0.4rem;
	}

	@media (max-width: 760px) {
		.detail.with-visual {
			grid-template-columns: 1fr;
		}
		.detail-stage {
			height: 13rem;
		}
	}

</style>
