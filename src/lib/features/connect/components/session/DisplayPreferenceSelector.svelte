<!--
  DisplayPreferenceSelector.svelte

  Allows user to choose how they want to view the sequence:
  - Animation only
  - Pictograph only
  - Split view (both)

  Single-select group → SegmentedControl per the chip-primitives rule.
-->
<script lang="ts">
	import type { DisplayPreference } from '../../domain/models/connect-models';
	import SegmentedControl from '#lib/shared/ui/components/SegmentedControl.svelte';

	interface Props {
		value: DisplayPreference;
		onChange: (pref: DisplayPreference) => void;
		disabled?: boolean;
	}

	let { value, onChange, disabled = false }: Props = $props();

	const options: { value: DisplayPreference; label: string; icon: string }[] = [
		{ value: 'animation', label: 'Animation', icon: 'fas fa-play-circle' },
		{ value: 'pictograph', label: 'Pictograph', icon: 'fas fa-image' },
		{ value: 'split', label: 'Split', icon: 'fas fa-columns' }
	];
</script>

<div class="display-selector" class:disabled aria-disabled={disabled}>
	<SegmentedControl
		{options}
		{value}
		onchange={onChange}
		color="accent"
		size="sm"
	/>
</div>

<style>
	.display-selector {
		width: 100%;
	}

	/* Disabled affordance — SegmentedControl has no disabled prop, so gate
	   interaction at the wrapper to preserve the original blocked behavior. */
	.display-selector.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
