<!--
  EffectPropTypeSelector.svelte

  Two-level prop selector: custom family dropdown + variant buttons.
  Family dropdown is a styled popover menu matching the app's design system.
-->
<script lang="ts">
	import { onDestroy } from "svelte";
	import type { EffectPointEditorState } from "../state/effect-point-editor-state.svelte";
	import { DEACTIVATED_PROP_TYPES } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
	import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

	interface Props {
		editorState: EffectPointEditorState;
	}

	let { editorState }: Props = $props();

	interface PropFamily {
		label: string;
		types: string[];
	}

	/** Filter out deactivated prop types (uses lowercase enum values for matching). */
	const deactivatedLower = new Set([...DEACTIVATED_PROP_TYPES].map(p => p.toLowerCase()));

	const PROP_FAMILIES: PropFamily[] = [
		{ label: "Staff", types: ["staff", "bigstaff", "simple_staff", "staff_v2"] },
		{ label: "Club", types: ["club", "bigclub"] },
		// Fan builds carry their own tip tables (PROP_RENDER_KEY_TIP_POINTS);
		// the plain "fan" entry is the notation glyph.
		{
			label: "Fan",
			types: [
				"fan",
				"fan__fire_bare",
				"fan__lotus",
				"fan__flat-grip",
				"fan__day_black_bare",
				"fan__moon",
				"bigfan",
				"bigfan__fire_bare",
			],
		},
		{ label: "Triad", types: ["triad", "bigtriad"] },
		{ label: "Hoop", types: ["minihoop", "bighoop", "triangle"] },
		{ label: "Buugeng", types: ["buugeng", "bigbuugeng", "trigeng"] },
		{ label: "Triquetra", types: ["triquetra", "triquetra2"] },
		{ label: "Sword", types: ["sword"] },
		{ label: "Chicken", types: ["chicken", "bigchicken"] },
		{ label: "Doublestar", types: ["doublestar", "bigdoublestar"] },
		{ label: "Eightrings", types: ["eightrings", "bigeightrings"] },
		{ label: "Double Contact Ball", types: ["doublecontactball"] },
		{ label: "Quiad", types: ["quiad"] },
		{ label: "Torch", types: ["torch", "bigtorch"] },
		{ label: "Poi", types: ["poi"] },
		{ label: "Hand", types: ["hand"] },
	].map(f => ({ ...f, types: f.types.filter(t => !deactivatedLower.has(t)) }))
	 .filter(f => f.types.length > 0);

	let menuOpen = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);

	let activeFamily: PropFamily = $derived.by(() => {
		const found = PROP_FAMILIES.find((f) =>
			f.types.includes(editorState.selectedPropType),
		);
		return found ?? PROP_FAMILIES[0]!;
	});

	let defaultTypes = $derived(editorState.getUserDefaultTypes());

	function selectFamily(family: PropFamily) {
		if (family.types[0]) {
			editorState.selectPropType(family.types[0]);
		}
		menuOpen = false;
	}

	function handleTriggerKeydown(e: KeyboardEvent) {
		if (e.key === "Escape" && menuOpen) {
			menuOpen = false;
			triggerEl?.focus();
		}
	}

	function handleMenuKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			menuOpen = false;
			triggerEl?.focus();
		}
	}

	function handleWindowClick(e: MouseEvent) {
		if (menuOpen) {
			const target = e.target as HTMLElement;
			if (!target.closest(".family-dropdown")) {
				menuOpen = false;
			}
		}
	}

	function displayName(propType: string): string {
		const [base, build] = propType.split("__");
		const name = (base ?? propType).replace(/_/g, " ");
		if (!build) return name;
		return `${name} · ${build.replace(/[_-]bare$/, "").replace(/[_-]/g, " ")}`;
	}

	// Track which families have any prop with a saved default
	let familiesWithDefaults = $derived.by(() => {
		const set = new Set<string>();
		for (const family of PROP_FAMILIES) {
			if (family.types.some((t) => defaultTypes.includes(t))) {
				set.add(family.label);
			}
		}
		return set;
	});

	onDestroy(() => {
		menuOpen = false;
	});
</script>

<svelte:window onclick={handleWindowClick} />

<div
	class="prop-selector"
	style="--effect-accent: var(--theme-accent, #8b5cf6); --effect-accent-mid: rgba(139, 92, 246, 0.15); --effect-accent-border: rgba(139, 92, 246, 0.3)"
>
	<!-- Custom family dropdown -->
	<div class="family-dropdown">
		<button
			bind:this={triggerEl}
			class="family-trigger"
			class:open={menuOpen}
			onclick={() => { menuOpen = !menuOpen; }}
			onkeydown={handleTriggerKeydown}
			aria-haspopup="listbox"
			aria-expanded={menuOpen}
			aria-label="Select prop family: {activeFamily.label}"
		>
			<span class="trigger-label">{activeFamily.label}</span>
			<i class="fas fa-chevron-down trigger-chevron" aria-hidden="true"></i>
		</button>

		{#if menuOpen}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				class="family-menu themed-scrollbar"
				role="listbox"
				aria-label="Prop families"
				onkeydown={handleMenuKeydown}
			>
				{#each PROP_FAMILIES as family (family.label)}
					<button
						class="family-item"
						class:active={family.label === activeFamily.label}
						role="option"
						aria-selected={family.label === activeFamily.label}
						onclick={() => selectFamily(family)}
					>
						<span class="family-item-label">{family.label}</span>
						<span class="family-item-meta">
							{#if familiesWithDefaults.has(family.label)}
								<i class="fas fa-bookmark family-default-icon" aria-label="Has saved defaults"></i>
							{/if}
							<span class="family-item-count">{family.types.length}</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Variant buttons for the selected family -->
	<div class="variant-buttons">
		{#each activeFamily.types as propType (propType)}
			<button
				class="variant-btn"
				class:active={editorState.selectedPropType === propType}
				class:has-default={defaultTypes.includes(propType)}
				onclick={() => editorState.selectPropType(propType)}
				aria-pressed={editorState.selectedPropType === propType}
				aria-label={defaultTypes.includes(propType)
					? `Select ${displayName(propType)} (has saved default)`
					: `Select ${displayName(propType)}`}
			>
				<span class="variant-name">{displayName(propType)}</span>
				{#if defaultTypes.includes(propType)}
					<i class="fas fa-bookmark default-icon" aria-hidden="true"></i>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	.prop-selector {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm, 8px);
		padding: 8px var(--spacing-md, 16px);
		flex-shrink: 0;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
	}

	.family-dropdown {
		position: relative;
		flex-shrink: 0;
	}

	.family-trigger {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 8px 14px;
		border: 1.5px solid var(--effect-accent-border, rgba(255, 255, 255, 0.15));
		border-radius: var(--border-radius-md, 8px);
		background: color-mix(in srgb, var(--effect-accent) 6%, transparent);
		color: var(--theme-text, white);
		font-size: var(--font-size-min, 14px);
		font-weight: 600;
		cursor: pointer;
		transition: border-color 100ms ease, background 100ms ease;
	}

	.family-trigger:hover {
		border-color: var(--effect-accent, rgba(255, 255, 255, 0.3));
		background: color-mix(in srgb, var(--effect-accent) 12%, transparent);
	}

	.family-trigger.open {
		border-color: var(--effect-accent);
		background: color-mix(in srgb, var(--effect-accent) 15%, transparent);
	}

	.family-trigger:focus-visible {
		outline: 2px solid var(--theme-accent, #8b5cf6);
		outline-offset: 1px;
	}

	.trigger-chevron {
		font-size: 10px;
		color: var(--effect-accent, rgba(255, 255, 255, 0.5));
		transition: transform 150ms ease;
	}

	.family-trigger.open .trigger-chevron {
		transform: rotate(180deg);
	}

	.family-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		min-width: 200px;
		max-height: 360px;
		overflow-y: auto;
		background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
		border: 1.5px solid var(--effect-accent-border, rgba(255, 255, 255, 0.12));
		border-radius: var(--border-radius-lg, 12px);
		padding: 6px;
		z-index: 20;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.family-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: 40px;
		padding: 8px 12px;
		border: none;
		border-radius: var(--border-radius-sm, 6px);
		background: transparent;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
		font-size: var(--font-size-min, 14px);
		font-weight: 500;
		cursor: pointer;
		transition: background 80ms ease, color 80ms ease;
		text-align: left;
	}

	.family-item:hover {
		background: color-mix(in srgb, var(--effect-accent) 10%, transparent);
		color: var(--theme-text, white);
	}

	.family-item.active {
		background: color-mix(in srgb, var(--effect-accent) 18%, transparent);
		color: var(--effect-accent);
		font-weight: 600;
	}

	.family-item:focus-visible {
		outline: 2px solid var(--theme-accent, #8b5cf6);
		outline-offset: -2px;
	}

	.family-item-meta {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.family-default-icon {
		font-size: 10px;
		color: var(--semantic-success, #22c55e);
	}

	.family-item-count {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
		min-width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.06);
	}

	.variant-buttons {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.variant-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 6px 14px;
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: var(--border-radius-md, 8px);
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
		font-size: var(--font-size-min, 14px);
		cursor: pointer;
		transition: all 100ms ease;
		white-space: nowrap;
	}

	.variant-btn:hover {
		background: color-mix(in srgb, var(--theme-text) 8%, transparent);
		color: var(--theme-text, white);
		border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
	}

	.variant-btn.active {
		background: color-mix(in srgb, var(--effect-accent) 15%, transparent);
		border-color: color-mix(in srgb, var(--effect-accent) 50%, transparent);
		color: var(--effect-accent);
	}

	.variant-btn:focus-visible {
		outline: 2px solid var(--theme-accent, #8b5cf6);
		outline-offset: 1px;
	}

	.variant-name {
		text-transform: capitalize;
	}

	.default-icon {
		font-size: var(--font-size-compact, 12px);
		color: var(--semantic-success, #22c55e);
		flex-shrink: 0;
	}

	.variant-btn.has-default {
		border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 25%, transparent);
	}

	.variant-btn.has-default:not(.active):hover {
		border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.family-trigger,
		.trigger-chevron,
		.family-item,
		.variant-btn {
			transition: none;
		}
	}
</style>
