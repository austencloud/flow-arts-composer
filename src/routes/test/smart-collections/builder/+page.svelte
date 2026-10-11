<script lang="ts">
	import { page } from "$app/state";
	import SmartCollectionBuilderSheet from "#lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte";
	import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
	import { COMMUNITY_RULE } from "../smart-collection-review-fixtures";

	const seeded = $derived(page.url.searchParams.get("seed") === "rule");
	let builderVisible = $state(true);
	let builderKey = $state(0);

	function reopenBuilder() {
		builderKey += 1;
		builderVisible = true;
	}
</script>

<svelte:head>
	<title>Smart Collection builder review frame</title>
</svelte:head>

<main class="frame-page">
	<div class="underlay" aria-hidden="true">
		<span>Library</span>
		<div class="underlay-line wide"></div>
		<div class="underlay-line"></div>
	</div>

	{#if builderVisible}
		{#key builderKey}
			<SmartCollectionBuilderSheet
				mode="create"
				initialSpec={seeded ? COMMUNITY_RULE : undefined}
				onClose={() => (builderVisible = false)}
			/>
		{/key}
	{:else}
		<div class="reopen-card">
			<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
			<p>The builder is closed.</p>
			<PanelButton variant="primary" onclick={reopenBuilder}>
				Reopen builder
			</PanelButton>
		</div>
	{/if}
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #0b0d13;
	}

	.frame-page {
		display: grid;
		min-height: 100dvh;
		place-items: center;
		overflow: hidden;
		background:
			radial-gradient(circle at 18% 12%, rgba(139, 108, 255, 0.13), transparent 32%),
			#0b0d13;
		color: var(--theme-text, #f7f8fb);
		font-family: system-ui, sans-serif;
	}

	.underlay {
		position: absolute;
		top: clamp(18px, 4vw, 48px);
		left: clamp(18px, 4vw, 48px);
		display: grid;
		width: min(320px, 52vw);
		gap: 12px;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.52));
		font-size: var(--font-size-lg, 18px);
		font-weight: 700;
	}

	.underlay-line {
		width: 68%;
		height: 12px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
	}

	.underlay-line.wide {
		width: 100%;
	}

	.reopen-card {
		display: flex;
		width: min(320px, calc(100vw - 32px));
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 24px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
		border-radius: 18px;
		background: var(--theme-panel-bg, #11131a);
		text-align: center;
	}

	.reopen-card > i {
		color: var(--theme-accent, #8b6cff);
		font-size: var(--font-size-xl, 22px);
	}

	.reopen-card p {
		margin: 0;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
		font-size: var(--font-size-sm, 14px);
	}
</style>
