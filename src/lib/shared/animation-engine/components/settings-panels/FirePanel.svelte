<script lang="ts">
	import { t } from "#lib/shared/i18n/i18n.svelte.js";
	import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
	import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
	import {
		hexToFlameColor,
		flameColorToHex,
		DEFAULT_PROP_FLAME_COLORS,
	} from "#lib/shared/animation-engine/domain/types/fire-types.js";

	const effectsConfig = getEffectsConfigContext();

	// Prop colours (the "custom fire colour" controls — replaces the old fire
	// Custom preset chip). Picking a colour sets propColors and forces full
	// colour blend so the flames actually take the chosen hue.
	const leftFireColor = $derived(
		effectsConfig?.fire.propColors?.[0]
			? flameColorToHex(effectsConfig.fire.propColors[0])
			: flameColorToHex(DEFAULT_PROP_FLAME_COLORS[0]),
	);
	const rightFireColor = $derived(
		effectsConfig?.fire.propColors?.[1]
			? flameColorToHex(effectsConfig.fire.propColors[1])
			: flameColorToHex(DEFAULT_PROP_FLAME_COLORS[1]),
	);

	function setFireColor(which: "left" | "right", hex: string): void {
		const left = which === "left" ? hex : leftFireColor;
		const right = which === "right" ? hex : rightFireColor;
		effectsConfig?.updateEffect("fire", {
			colorBlend: 1.0,
			propColors: [hexToFlameColor(left), hexToFlameColor(right)],
		});
	}

	function formatIntensity(v: number): string {
		const pct = Math.round(((v - 0.45) / (1 - 0.45)) * 100);
		return `${pct}%`;
	}

	function formatColorBlend(v: number): string {
		if (v < 0.1) return t("animation_fire_natural");
		if (v > 0.9) return t("animation_fire_colored");
		return `${Math.round(v * 100)}%`;
	}

	function formatTurbulence(v: number): string {
		if (v < 0.05) return t("effect_deep_off");
		if (v > 0.95) return t("animation_fire_max");
		return `${Math.round(v * 100)}%`;
	}

	function resetDefaults(): void {
		effectsConfig?.updateEffect("fire", DEFAULT_EFFECTS_CONFIG.fire);
	}

	const isDefault = $derived(
		effectsConfig != null &&
		Math.abs(effectsConfig.fire.intensity - DEFAULT_EFFECTS_CONFIG.fire.intensity) < 0.03 &&
		Math.abs(effectsConfig.fire.colorBlend - DEFAULT_EFFECTS_CONFIG.fire.colorBlend) < 0.03 &&
		Math.abs(effectsConfig.fire.turbulence - DEFAULT_EFFECTS_CONFIG.fire.turbulence) < 0.03
	);
</script>

<div class="fire-controls">
	<div class="slider-row">
		<label for="ctx-fire-intensity">{t("effect_deep_intensity")}</label>
		<input
			id="ctx-fire-intensity"
			type="range"
			min="0.45"
			max="1"
			step="0.05"
			value={effectsConfig?.fire.intensity ?? DEFAULT_EFFECTS_CONFIG.fire.intensity}
			oninput={(e) => effectsConfig?.updateEffect("fire", { intensity: Number((e.target as HTMLInputElement).value) })}
		/>
		<span class="slider-value">{formatIntensity(effectsConfig?.fire.intensity ?? DEFAULT_EFFECTS_CONFIG.fire.intensity)}</span>
	</div>

	<div class="slider-row">
		<label for="ctx-fire-color-blend">{t("effect_deep_color")}</label>
		<input
			id="ctx-fire-color-blend"
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={effectsConfig?.fire.colorBlend ?? DEFAULT_EFFECTS_CONFIG.fire.colorBlend}
			oninput={(e) => effectsConfig?.updateEffect("fire", { colorBlend: Number((e.target as HTMLInputElement).value) })}
		/>
		<span class="slider-value">{formatColorBlend(effectsConfig?.fire.colorBlend ?? DEFAULT_EFFECTS_CONFIG.fire.colorBlend)}</span>
	</div>

	<div class="slider-row">
		<label for="ctx-fire-turbulence">{t("animation_fire_turbulence")}</label>
		<input
			id="ctx-fire-turbulence"
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={effectsConfig?.fire.turbulence ?? DEFAULT_EFFECTS_CONFIG.fire.turbulence}
			oninput={(e) => effectsConfig?.updateEffect("fire", { turbulence: Number((e.target as HTMLInputElement).value) })}
		/>
		<span class="slider-value">{formatTurbulence(effectsConfig?.fire.turbulence ?? DEFAULT_EFFECTS_CONFIG.fire.turbulence)}</span>
	</div>

	<div class="color-row">
		<span class="color-label">{t("viewer_ui_colors")}</span>
		<div class="color-pickers">
			<label class="color-picker">
				<input
					type="color"
					value={leftFireColor}
					oninput={(e) => setFireColor("left", (e.target as HTMLInputElement).value)}
				/>
				<span class="color-hand blue">{t("viewer_ui_left")}</span>
			</label>
			<label class="color-picker">
				<input
					type="color"
					value={rightFireColor}
					oninput={(e) => setFireColor("right", (e.target as HTMLInputElement).value)}
				/>
				<span class="color-hand red">{t("viewer_ui_right")}</span>
			</label>
		</div>
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
	.fire-controls {
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
		min-width: 52px;
		text-align: right;
		font-family: var(--font-mono, monospace);
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text, white);
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: var(--min-touch-target, 44px);
	}

	.color-label {
		min-width: 70px;
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
	}

	.color-pickers {
		display: flex;
		gap: 12px;
		flex: 1;
	}

	.color-picker {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.color-picker input[type="color"] {
		-webkit-appearance: none;
		appearance: none;
		width: 32px;
		height: 32px;
		border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
		border-radius: 50%;
		background: none;
		cursor: pointer;
		padding: 0;
	}

	.color-picker input[type="color"]::-webkit-color-swatch-wrapper {
		padding: 2px;
	}

	.color-picker input[type="color"]::-webkit-color-swatch {
		border: none;
		border-radius: 50%;
	}

	.color-picker input[type="color"]::-moz-color-swatch {
		border: none;
		border-radius: 50%;
	}

	.color-hand {
		font-size: var(--font-size-compact, 12px);
	}

	.color-hand.blue {
		color: var(--prop-blue, #3b82f6);
	}

	.color-hand.red {
		color: var(--prop-red, #ef4444);
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
