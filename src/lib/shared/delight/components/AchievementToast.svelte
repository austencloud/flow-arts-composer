<!--
  AchievementToast - Elegant notification for major achievements

  Slides in from top, displays message briefly, slides out.
  Designed to be understated but celebratory - not overwhelming.

  Place once in your app layout alongside ConfettiBurst.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { DelightOrchestrator } from '#lib/shared/delight/services/delight-orchestrator.js'

	interface Props {
		orchestrator?: DelightOrchestrator | null;
	}

	let { orchestrator = null }: Props = $props();

	// Active toasts
	let toasts = $state<
		Array<{
			id: number;
			message: string;
			duration: number;
		}>
	>([]);

	let toastCounter = 0;

	// Trigger function that the orchestrator calls
	function showToast(message: string, duration: number): void {
		const id = toastCounter++;

		toasts = [
			...toasts,
			{
				id,
				message,
				duration
			}
		];

		// Auto-remove after duration
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, duration);
	}

	onMount(() => {
		if (orchestrator) {
			orchestrator.registerToastTrigger(showToast);
		}
	});

	onDestroy(() => {
		if (orchestrator) {
			orchestrator.registerToastTrigger(() => {});
		}
	});
</script>

<!-- Toast container -->
<div class="toast-container" aria-live="polite" aria-atomic="true">
	{#each toasts as toast (toast.id)}
		<div
			class="toast"
			in:fly={{ y: -50, duration: 400, easing: cubicOut }}
			out:fade={{ duration: 200 }}
		>
			<span class="toast-icon">✨</span>
			<span class="toast-message">{toast.message}</span>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
		pointer-events: none;
		z-index: var(--z-toast);
		gap: 8px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 20px;
		background: var(--theme-card-bg, rgba(30, 30, 40, 0.95));
		border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
		border-radius: 24px;
		box-shadow:
			0 4px 20px rgba(0, 0, 0, 0.3),
			0 0 40px rgba(34, 211, 238, 0.1);
		pointer-events: auto;
		max-width: 90vw;
	}

	.toast-icon {
		font-size: 18px;
		line-height: 1;
	}

	.toast-message {
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		color: var(--theme-text, #ffffff);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Subtle glow animation */
	.toast {
		animation: toastGlow 2s ease-in-out infinite alternate;
	}

	@keyframes toastGlow {
		0% {
			box-shadow:
				0 4px 20px rgba(0, 0, 0, 0.3),
				0 0 30px rgba(34, 211, 238, 0.05);
		}
		100% {
			box-shadow:
				0 4px 20px rgba(0, 0, 0, 0.3),
				0 0 40px rgba(34, 211, 238, 0.15);
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
