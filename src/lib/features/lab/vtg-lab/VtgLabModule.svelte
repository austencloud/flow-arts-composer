<script lang="ts">
	/**
	 * VTG Lab Module
	 *
	 * Exhaustive reference mapping VTG (Vulcan Tech Gospel) modes to TKA letters.
	 * Two tabs:
	 * - Explorer: Browse all 6 VTG modes and their TKA letter mappings
	 * - Rosetta: Side-by-side terminology comparison between the two systems
	 */

	import { browser } from "$app/env";
	import type { VtgLabTab } from "./domain/vtg-lab-types";
	import RotationStyleExplorer from "./components/RotationStyleExplorer.svelte";
	import RosettaPanel from "./components/RosettaPanel.svelte";

	const TAB_STORAGE_KEY = "vtg-lab-active-tab";

	function getInitialTab(): VtgLabTab {
		if (browser) {
			const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
			if (stored === "explorer" || stored === "rosetta") return stored;
		}
		return "explorer";
	}

	let activeTab = $state<VtgLabTab>(getInitialTab());

	$effect(() => {
		if (browser) sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
	});
</script>

<div class="vtg-lab">
	<header class="header">
		<div class="title-row">
			<h1>VTG Lab</h1>
			<span class="badge">Admin</span>
		</div>
		<p class="subtitle">Map VTG modes to TKA letters and terminology</p>
		<nav class="tabs">
			<button
				class="tab"
				class:active={activeTab === "explorer"}
				onclick={() => (activeTab = "explorer")}
			>
				<i class="fas fa-compass" aria-hidden="true"></i>
				Explorer
			</button>
			<button
				class="tab"
				class:active={activeTab === "rosetta"}
				onclick={() => (activeTab = "rosetta")}
			>
				<i class="fas fa-language" aria-hidden="true"></i>
				Rosetta
			</button>
		</nav>
	</header>

	<div class="content themed-scrollbar">
		{#if activeTab === "explorer"}
			<RotationStyleExplorer />
		{:else if activeTab === "rosetta"}
			<RosettaPanel />
		{/if}
	</div>
</div>

<style>
	.vtg-lab {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.header {
		padding: 1.5rem 1.5rem 1rem;
		flex-shrink: 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--theme-text, #fff);
	}

	.badge {
		font-size: var(--font-size-compact, 12px);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		background: var(--theme-accent-bg);
		color: var(--theme-accent);
	}

	.subtitle {
		margin: 0.5rem 0 0;
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
		margin-top: 1rem;
		background: var(--theme-card-bg);
		padding: 0.25rem;
		border-radius: 10px;
		width: fit-content;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		min-height: 44px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--duration-fast, 150ms) ease;
	}

	@media (pointer: coarse) {
		.tab {
			min-height: var(--min-touch-target);
		}
	}

	.tab:hover {
		color: var(--theme-text, #fff);
	}

	.tab.active {
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
		color: var(--theme-text, #fff);
	}

	.tab:focus-visible {
		outline: 2px solid var(--theme-accent, #22d3ee);
		outline-offset: 2px;
	}

	.tab i {
		font-size: 0.875rem;
	}

	.content {
		flex: 1;
		overflow-y: auto;
		padding: 0 1.5rem 1.5rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.tab {
			transition: none;
		}
	}
</style>
