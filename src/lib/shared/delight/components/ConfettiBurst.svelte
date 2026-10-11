<!--
  ConfettiBurst - Positioned confetti celebration component

  Wraps svelte-confetti and registers with the DelightOrchestrator.
  Place once in your app layout - it will respond to celebrate() calls.

  Uses CSS-only animations (no canvas), SSR-compatible.
-->
<script lang="ts">
	import { Confetti } from 'svelte-confetti';
	import { onMount, onDestroy } from 'svelte';
	import type { DelightOrchestrator } from '#lib/shared/delight/services/delight-orchestrator.js'

	interface Props {
		orchestrator?: DelightOrchestrator | null;
	}

	let { orchestrator = null }: Props = $props();

	// Reactive state for confetti bursts
	let bursts = $state<
		Array<{
			id: number;
			x: number;
			y: number;
			amount: number;
		}>
	>([]);

	let burstCounter = 0;

	// Trigger function that the orchestrator calls
	function triggerBurst(x: number, y: number, amount: number): void {
		const id = burstCounter++;

		bursts = [
			...bursts,
			{
				id,
				x: Math.max(0, Math.min(1, x)), // Clamp 0-1
				y: Math.max(0, Math.min(1, y)),
				amount: Math.max(5, Math.min(100, amount)) // Clamp 5-100
			}
		];

		// Auto-remove after animation completes
		setTimeout(() => {
			bursts = bursts.filter((b) => b.id !== id);
		}, 3000);
	}

	onMount(() => {
		if (orchestrator) {
			orchestrator.registerConfettiTrigger(triggerBurst);
		}
	});

	// Unregister on destroy (set to no-op)
	onDestroy(() => {
		if (orchestrator) {
			orchestrator.registerConfettiTrigger(() => {});
		}
	});

	// Derive confetti config based on amount
	function getConfettiConfig(amount: number) {
		// Scale the config based on intensity
		const baseCount = Math.round(amount * 0.5); // 15 amount = ~7 pieces

		return {
			amount: baseCount,
			size: amount > 50 ? 12 : 10,
			duration: amount > 50 ? 2500 : 2000,
			fallDistance: amount > 50 ? '120px' : '80px'
		};
	}
</script>

<!-- Render active bursts -->
{#each bursts as burst (burst.id)}
	{@const config = getConfettiConfig(burst.amount)}
	<div
		class="burst-container"
		style="
			left: {burst.x * 100}%;
			top: {burst.y * 100}%;
		"
	>
		<Confetti
			x={[-0.5, 0.5]}
			y={[0.25, 1]}
			amount={config.amount}
			size={config.size}
			duration={config.duration}
			fallDistance={config.fallDistance}
			cone
		/>
	</div>
{/each}

<style>
	.burst-container {
		position: fixed;
		pointer-events: none;
		z-index: var(--z-toast);
		transform: translate(-50%, -50%);
	}
</style>
