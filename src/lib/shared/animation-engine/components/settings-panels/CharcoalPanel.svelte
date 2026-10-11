<script lang="ts">
	import { t } from "#lib/shared/i18n/i18n.svelte.js";
	import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
	import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

	const effectsConfig = getEffectsConfigContext();

	function resetDefaults(): void {
		effectsConfig?.updateEffect("charcoal", DEFAULT_EFFECTS_CONFIG.charcoal);
	}

	const isDefault = $derived(
		effectsConfig != null &&
		Math.abs(effectsConfig.charcoal.intensity - DEFAULT_EFFECTS_CONFIG.charcoal.intensity) < 0.02 &&
		Math.abs(effectsConfig.charcoal.spread - DEFAULT_EFFECTS_CONFIG.charcoal.spread) < 0.02 &&
		Math.abs(effectsConfig.charcoal.glow - DEFAULT_EFFECTS_CONFIG.charcoal.glow) < 0.02
	);
</script>

<div class="charcoal-controls">
	<div class="slider-row">
		<label for="ctx-charcoal-intensity">{t("effect_deep_intensity")}</label>
		<input
			id="ctx-charcoal-intensity"
			type="range"
			min="0"
			max="1"
			step="0.02"
			value={effectsConfig?.charcoal.intensity ?? DEFAULT_EFFECTS_CONFIG.charcoal.intensity}
			oninput={(e) => effectsConfig?.updateEffect("charcoal", { intensity: Number((e.target as HTMLInputElement).value) })}
		/>
		<span class="slider-value">{Math.round((effectsConfig?.charcoal.intensity ?? DEFAULT_EFFECTS_CONFIG.charcoal.intensity) * 100)}%</span>
	</div>

	<div class="slider-row">
		<label for="ctx-charcoal-spread">{t("effect_deep_spread")}</label>
		<input
			id="ctx-charcoal-spread"
			type="range"
			min="0"
			max="1"
			step="0.02"
			value={effectsConfig?.charcoal.spread ?? DEFAULT_EFFECTS_CONFIG.charcoal.spread}
			oninput={(e) => effectsConfig?.updateEffect("charcoal", { spread: Number((e.target as HTMLInputElement).value) })}
		/>
		<span class="slider-value">{Math.round((effectsConfig?.charcoal.spread ?? DEFAULT_EFFECTS_CONFIG.charcoal.spread) * 100)}%</span>
	</div>

	<div class="slider-row">
		<label for="ctx-charcoal-glow">{t("effect_deep_glow")}</label>
		<input
			id="ctx-charcoal-glow"
			type="range"
			min="0"
			max="1"
			step="0.02"
			value={effectsConfig?.charcoal.glow ?? DEFAULT_EFFECTS_CONFIG.charcoal.glow}
			oninput={(e) => effectsConfig?.updateEffect("charcoal", { glow: Number((e.target as HTMLInputElement).value) })}
		/>
		<span class="slider-value">{Math.round((effectsConfig?.charcoal.glow ?? DEFAULT_EFFECTS_CONFIG.charcoal.glow) * 100)}%</span>
	</div>

	<button
		class="reset-btn"
		type="button"
		disabled={isDefault}
		onclick={resetDefaults}
	>
		{t("viewer_ui_reset")}
	</button>
</div>

<style>
	.charcoal-controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.slider-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: var(--min-touch-target, 44px);
	}

	.slider-row label {
		min-width: 70px;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
	}

	.slider-row input[type="range"] {
		flex: 1;
		accent-color: var(--theme-accent, #8b5cf6);
	}

	.slider-value {
		min-width: 40px;
		text-align: right;
		font-family: var(--font-mono, monospace);
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text, white);
	}

	.reset-btn {
		align-self: flex-end;
		padding: 4px 12px;
		min-height: 32px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
		font-size: var(--font-size-compact, 12px);
		cursor: pointer;
		transition: all var(--duration-fast, 100ms) ease;
	}

	.reset-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--theme-text) 8%, transparent);
		color: var(--theme-text, white);
	}

	.reset-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.reset-btn:focus-visible {
		outline: 2px solid var(--theme-accent, #8b5cf6);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.reset-btn {
			transition: none;
		}
	}
</style>
