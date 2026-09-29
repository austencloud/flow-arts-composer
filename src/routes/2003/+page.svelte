<script lang="ts">
	import { ERA_CONFIGS } from "$lib/features/retro/shared/domain/era-types";
	import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
	const era = ERA_CONFIGS.winxp;
</script>

<svelte:head>
	<title>{era.title}</title>
</svelte:head>

<div class="era-placeholder">
	<h1>{era.title}</h1>
	<p>{era.subtitle}</p>
	<p class="phase">Coming soon</p>
	<LinkChip class="era-link" href="/1995">Visit TKA-OS v1.0 (Win95)</LinkChip>
</div>

<style>
	.era-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: #003399;
		color: #fff;
		font-family: "Tahoma", "Trebuchet MS", sans-serif;
		text-align: center;
		gap: 12px;
	}
	h1 {
		font-size: 24px;
	}
	p {
		margin: 0;
	}
	.phase {
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}
	.era-placeholder :global(.era-link) {
		--theme-accent: #99ccff;
	}
</style>
