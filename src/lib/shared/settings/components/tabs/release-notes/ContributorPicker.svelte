<!-- ContributorPicker - Search existing user accounts to tag as contributors on changelog entries -->
<script lang="ts">
	import { t } from '$lib/shared/i18n/i18n.svelte';
	import { onDestroy } from 'svelte';
	import type { Contributor } from '$lib/shared/versioning/domain/models/contributor-models';
	import ContributorBadge from './ContributorBadge.svelte';

	let {
		allContributors,
		selectedIds = [],
		onUpdate
	}: {
		allContributors: Contributor[];
		selectedIds: string[];
		onUpdate: (ids: string[]) => void;
	} = $props();

	let searchText = $state('');
	let isOpen = $state(false);
	let inputElement = $state<HTMLInputElement | null>(null);

	const selectedContributors = $derived(allContributors.filter((c) => selectedIds.includes(c.id)));

	const filteredOptions = $derived.by(() => {
		const available = allContributors.filter((c) => !selectedIds.includes(c.id));
		if (!searchText.trim()) return available;
		const lower = searchText.toLowerCase();
		return available.filter((c) => c.displayName.toLowerCase().includes(lower));
	});

	function addContributor(id: string) {
		onUpdate([...selectedIds, id]);
		searchText = '';
		isOpen = false;
	}

	function removeContributor(id: string) {
		onUpdate(selectedIds.filter((sid) => sid !== id));
	}

	function handleInputFocus() {
		isOpen = true;
	}

	let blurTimer: ReturnType<typeof setTimeout> | null = null;

	function handleInputBlur() {
		if (blurTimer !== null) clearTimeout(blurTimer);
		blurTimer = setTimeout(() => (isOpen = false), 200);
	}

	onDestroy(() => {
		if (blurTimer !== null) clearTimeout(blurTimer);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
			inputElement?.blur();
		}
	}
</script>

<div class="contributor-picker">
	{#if selectedContributors.length > 0}
		<div class="selected-list">
			{#each selectedContributors as contributor (contributor.id)}
				<span class="removable-badge">
					<ContributorBadge {contributor} />
					<button
						type="button"
						class="remove-btn"
						onclick={() => removeContributor(contributor.id)}
						aria-label={t('settings_remove_contributor', { name: contributor.displayName })}
					>
						<i class="fas fa-times" aria-hidden="true"></i>
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="search-wrapper">
		<input
			bind:this={inputElement}
			bind:value={searchText}
			onfocus={handleInputFocus}
			onblur={handleInputBlur}
			onkeydown={handleKeydown}
			placeholder={t('settings_tag_contributor')}
			type="text"
		/>

		{#if isOpen && filteredOptions.length > 0}
			<div class="dropdown">
				{#each filteredOptions as option (option.id)}
					<button
						type="button"
						class="dropdown-item"
						onmousedown={(e) => {
							e.preventDefault();
							addContributor(option.id);
						}}
					>
						<ContributorBadge contributor={option} />
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.contributor-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.selected-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.removable-badge {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		padding: 0;
		background: none;
		border: none;
		color: var(--theme-text-dim);
		font-size: 10px;
		cursor: pointer;
		border-radius: 50%;
		transition: all var(--duration-fast, 0.15s);
	}

	.remove-btn:hover {
		background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
		color: var(--semantic-error);
	}

	.search-wrapper {
		position: relative;
	}

	input {
		width: 100%;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--theme-stroke);
		border-radius: 6px;
		color: var(--theme-text);
		font-size: var(--font-size-compact);
		font-family: inherit;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		max-height: 160px;
		overflow-y: auto;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border: 1px solid var(--theme-stroke);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 10;
	}

	.dropdown-item {
		display: flex;
		width: 100%;
		padding: 8px 10px;
		background: none;
		border: none;
		cursor: pointer;
		transition: background var(--duration-fast, 0.15s);
	}

	.dropdown-item:hover {
		background: var(--theme-card-hover-bg);
	}
</style>
