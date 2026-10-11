<script lang="ts">
	import {
		REPORT_CATEGORIES,
		type ReportCategory
	} from '../domain/models/report-models';
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		selected: ReportCategory | null;
		onSelect: (category: ReportCategory) => void;
	}

	let { selected, onSelect }: Props = $props();

	const categories = Object.entries(REPORT_CATEGORIES) as [ReportCategory, (typeof REPORT_CATEGORIES)[ReportCategory]][];

	let focusedIndex = $state(-1);

	function handleKeydown(event: KeyboardEvent) {
		const len = categories.length;

		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowRight':
				event.preventDefault();
				focusedIndex = focusedIndex < len - 1 ? focusedIndex + 1 : 0;
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
				event.preventDefault();
				focusedIndex = focusedIndex > 0 ? focusedIndex - 1 : len - 1;
				break;
			case 'Home':
				event.preventDefault();
				focusedIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				focusedIndex = len - 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < len) {
					const category = categories[focusedIndex];
					if (category) {
						onSelect(category[0]);
					}
				}
				break;
		}
	}

	function handleFocus(index: number) {
		focusedIndex = index;
	}
</script>

<div class="category-selector" role="radiogroup" aria-label={t('moderation_report_category')}>
	<p class="label" id="category-label">{t('moderation_select_reason')}</p>

	<div class="categories" role="presentation" onkeydown={handleKeydown}>
		{#each categories as [key, config], index}
			<button
				type="button"
				class="category-option"
				class:selected={selected === key}
				class:focused={focusedIndex === index}
				onclick={() => onSelect(key)}
				onfocus={() => handleFocus(index)}
				role="radio"
				aria-checked={selected === key}
				aria-describedby="category-label"
				tabindex={selected === key || (selected === null && index === 0) ? 0 : -1}
			>
				<div class="category-icon">
					<i class="fa-solid {config.icon}" aria-hidden="true"></i>
				</div>
				<div class="category-content">
					<span class="category-label">{config.label}</span>
					<span class="category-description">{config.description}</span>
				</div>
				{#if selected === key}
					<div class="check-icon">
						<i class="fa-solid fa-check" aria-hidden="true"></i>
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.category-selector {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm, 8px);
	}

	.label {
		font-size: var(--font-size-min, 14px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		margin: 0;
	}

	.categories {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs, 4px);
	}

	.category-option {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--radius-md, 8px);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.category-option:hover {
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
		background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
	}

	.category-option:focus {
		outline: none;
	}

	.category-option:focus-visible,
	.category-option.focused {
		border-color: var(--theme-accent, #3b82f6);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent, #3b82f6) 30%, transparent);
	}

	.category-option.selected {
		border-color: var(--theme-accent, #3b82f6);
		background: color-mix(in srgb, var(--theme-accent, #3b82f6) 10%, transparent);
	}

	.category-icon {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
		border-radius: var(--radius-sm, 6px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
		font-size: var(--font-size-md, 16px);
		flex-shrink: 0;
	}

	.selected .category-icon {
		background: var(--theme-accent, #3b82f6);
		color: white;
	}

	.category-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.category-label {
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		color: var(--theme-text, #ffffff);
	}

	.category-description {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.check-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--theme-accent, #3b82f6);
		border-radius: 50%;
		color: white;
		font-size: 10px;
		flex-shrink: 0;
	}
</style>
