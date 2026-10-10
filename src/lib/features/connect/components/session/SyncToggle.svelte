<!--
  SyncToggle.svelte

  Toggle between synced playback and solo practice mode.
  Shows clear visual state and disables when not in session.
-->
<script lang="ts">
	import { t } from '#lib/shared/i18n/i18n.svelte.js';

	interface Props {
		isSolo: boolean;
		onToggle: () => void;
		disabled?: boolean;
	}

	let { isSolo, onToggle, disabled = false }: Props = $props();
</script>

<button
	class="sync-toggle"
	class:solo={isSolo}
	class:synced={!isSolo}
	onclick={onToggle}
	{disabled}
	aria-pressed={!isSolo}
	aria-label={isSolo ? 'Switch to synced mode' : 'Switch to solo mode'}
>
	<div class="toggle-track">
		<div class="toggle-thumb"></div>
	</div>
	<span class="toggle-label">
		{#if isSolo}
			<i class="fas fa-user" aria-hidden="true"></i>
			Solo
		{:else}
			<i class="fas fa-link" aria-hidden="true"></i>
			Synced
		{/if}
	</span>
</button>

<style>
	.sync-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 24px;
		color: var(--theme-text, white);
		cursor: pointer;
		transition: all 0.2s ease;
		min-width: 120px;
	}

	.sync-toggle:hover:not(:disabled) {
		background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.sync-toggle:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Toggle track */
	.toggle-track {
		position: relative;
		width: 40px;
		height: 22px;
		background: var(--theme-stroke, rgba(255, 255, 255, 0.2));
		border-radius: 11px;
		transition: background 0.2s ease;
	}

	.sync-toggle.synced .toggle-track {
		background: var(--theme-accent, #6366f1);
	}

	/* Toggle thumb */
	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		background: var(--theme-text, white);
		border-radius: 50%;
		transition: transform 0.2s ease;
		box-shadow: 0 2px 4px var(--theme-shadow-color, rgba(0, 0, 0, 0.2));
	}

	.sync-toggle.synced .toggle-thumb {
		transform: translateX(18px);
	}

	/* Label */
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-size-sm, 14px);
		font-weight: 500;
		min-width: 60px;
	}

	.toggle-label i {
		font-size: 12px;
		opacity: 0.8;
	}

	/* State colors */
	.sync-toggle.solo .toggle-label {
		color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.sync-toggle.synced .toggle-label {
		color: var(--theme-accent, #6366f1);
	}

	/* Focus state */
	.sync-toggle:focus-visible {
		outline: 2px solid var(--theme-accent, #6366f1);
		outline-offset: 2px;
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.toggle-thumb,
		.toggle-track,
		.sync-toggle {
			transition: none;
		}
	}
</style>
