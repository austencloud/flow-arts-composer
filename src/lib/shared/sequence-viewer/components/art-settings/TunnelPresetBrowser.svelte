<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PerformerRing from "../../tunnel/PerformerRing.svelte";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
  import {
    TUNNEL_PRESETS,
    configKey,
    imageCount,
  } from "../../tunnel/tunnel-config";
  import { tunnelUserPresets } from "../../tunnel/tunnel-user-presets.svelte";
  import { changeArtSetting, reportArtSetting } from "./art-setting-change";
  import type {
    ArtSettingChangeHandler,
    ArtSettingValue,
  } from "./art-settings-types";

  interface Props {
    controller: TunnelViewController;
    dense: boolean;
    onSaveTunnel?: () => void;
    saveTunnelLabel?: string;
    onCustomize?: (source: "custom_card" | "customize_button") => void;
    minimumInstances?: number;
    maximumInstances?: number;
    showCustomCard?: boolean;
    showCustomizeButton?: boolean;
    presetLabel?: string;
    selectionMode?: "recipe" | "config";
    formationOnly?: boolean;
    showUserPresets?: boolean;
    showcase?: boolean;
    showGridControl?: boolean;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let {
    controller,
    dense,
    onSaveTunnel,
    saveTunnelLabel,
    onCustomize,
    minimumInstances = 1,
    maximumInstances = Infinity,
    showCustomCard = true,
    showCustomizeButton = true,
    presetLabel,
    selectionMode = "recipe",
    formationOnly = false,
    showUserPresets = true,
    showcase = false,
    showGridControl = true,
    onArtSettingChange,
  }: Props = $props();

  const effectiveSaveTunnelLabel = $derived(
    saveTunnelLabel ?? t("viewer_ui_save_tunnel")
  );
  const effectivePresetLabel = $derived(
    presetLabel ?? t("viewer_ui_choose_a_tunnel_preset")
  );

  function reportSetting(
    group: string,
    setting: string,
    previousValue: ArtSettingValue,
    value: ArtSettingValue,
    coalesce = false
  ): void {
    reportArtSetting(
      onArtSettingChange,
      group,
      setting,
      previousValue,
      value,
      coalesce
    );
  }

  function changeSetting(
    group: string,
    setting: string,
    previousValue: ArtSettingValue,
    value: ArtSettingValue,
    mutate: () => void,
    coalesce = false
  ): void {
    changeArtSetting(
      onArtSettingChange,
      group,
      setting,
      previousValue,
      value,
      mutate,
      coalesce
    );
  }

  const formationKey = (config: typeof controller.config): string =>
    `${config.fold}:${Number(config.mirror)}:${Number(config.flip)}`;
  const builtInPresets = $derived(
    formationOnly
      ? TUNNEL_PRESETS.filter(
          (preset, index, presets) =>
            presets.findIndex(
              (candidate) =>
                formationKey(candidate.config) === formationKey(preset.config)
            ) === index
        )
      : TUNNEL_PRESETS
  );

  function applyBuiltInPreset(id: string): void {
    const preset = TUNNEL_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    if (!formationOnly) {
      controller.applyPreset(id);
      return;
    }
    controller.applyConfig(
      {
        ...controller.config,
        fold: preset.config.fold,
        mirror: preset.config.mirror,
        flip: preset.config.flip,
      },
      null
    );
  }

  const selectedBuiltInId = $derived(
    formationOnly
      ? (builtInPresets.find(
          (preset) =>
            formationKey(preset.config) === formationKey(controller.config)
        )?.id ?? null)
      : selectionMode === "config"
        ? controller.activePresetId
        : controller.presetRecipe?.kind === "built-in"
          ? controller.presetRecipe.id
          : null
  );
  const selectedUserId = $derived(
    selectionMode === "config"
      ? (tunnelUserPresets.presets.find(
          (preset) => configKey(preset.config) === controller.configKey
        )?.id ?? null)
      : controller.presetRecipe?.kind === "saved"
        ? controller.presetRecipe.id
        : null
  );
  const isCustom = $derived(
    selectionMode === "config"
      ? selectedBuiltInId === null && selectedUserId === null
      : controller.presetRecipe === null
  );
</script>

{#if !dense}<span class="rt-section-label">{effectivePresetLabel}</span>{/if}
<div
  class="preset-grid"
  class:showcase
  role="radiogroup"
  aria-label={t("viewer_ui_tunnel_preset")}
>
  {#each builtInPresets as p (p.id)}
    <button
      class="preset-card"
      class:active={selectedBuiltInId === p.id}
      type="button"
      role="radio"
      aria-checked={selectedBuiltInId === p.id}
      disabled={imageCount(p.config) < minimumInstances ||
        imageCount(p.config) > maximumInstances}
      title={imageCount(p.config) < minimumInstances
        ? t("viewer_ui_needs_stage_positions", { count: minimumInstances })
        : imageCount(p.config) > maximumInstances
          ? `Unavailable with reduced motion: maximum ${maximumInstances} performers`
          : undefined}
      onclick={() =>
        changeSetting(
          "art_tunnel",
          "preset",
          controller.presetRecipe?.id ?? "custom",
          p.id,
          () => applyBuiltInPreset(p.id)
        )}
    >
      <PerformerRing
        config={p.config}
        size={showcase ? 48 : 30}
        animate={false}
      />
      <span>{p.name}</span>
      {#if showcase}<i class="fas fa-check preset-check" aria-hidden="true"
        ></i>{/if}
    </button>
  {/each}
  <!-- Saved user presets: your personal library, each deletable. -->
  {#if showUserPresets}
    {#each tunnelUserPresets.presets as up (up.id)}
      <div class="preset-card-wrap">
        <button
          class="preset-card user"
          class:active={selectedUserId === up.id}
          type="button"
          role="radio"
          aria-checked={selectedUserId === up.id}
          disabled={imageCount(up.config) < minimumInstances ||
            imageCount(up.config) > maximumInstances}
          title={imageCount(up.config) < minimumInstances
            ? t("viewer_ui_needs_stage_positions", { count: minimumInstances })
            : imageCount(up.config) > maximumInstances
              ? `Unavailable with reduced motion: maximum ${maximumInstances} performers`
              : undefined}
          onclick={() =>
            changeSetting(
              "art_tunnel",
              "preset_source",
              controller.presetRecipe?.kind ?? "custom",
              "saved",
              () => controller.applyUserPreset(up.id, up.name, up.config)
            )}
        >
          <PerformerRing config={up.config} size={30} animate={false} />
          <span>{up.name}</span>
        </button>
        <button
          class="preset-del"
          type="button"
          aria-label={t("viewer_ui_delete_named_preset", { name: up.name })}
          title={t("viewer_ui_delete_preset")}
          onclick={() => {
            const previousCount = tunnelUserPresets.presets.length;
            tunnelUserPresets.remove(up.id);
            reportSetting(
              "art_tunnel",
              "saved_preset_count",
              previousCount,
              Math.max(0, previousCount - 1)
            );
          }}
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    {/each}
  {/if}
  <!-- Custom card: lit when the config matches no preset; opens the tuner. -->
  {#if showCustomCard}
    <button
      class="preset-card"
      class:active={isCustom}
      type="button"
      role="radio"
      aria-checked={isCustom}
      onclick={() => onCustomize?.("custom_card")}
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span>{t("compose_custom")}</span>
    </button>
  {/if}
</div>

{#if showGridControl}
  <div class="prim-row">
    <span class="row-lbl">{t("generator_grid")}</span>
    <button
      class="grid-toggle"
      class:active={controller.gridVisible}
      type="button"
      aria-pressed={controller.gridVisible}
      aria-label={t("viewer_ui_toggle_grid")}
      data-ghost="safe"
      data-ghost-kind="view-toggle"
      data-ghost-label={t("viewer_ui_toggle_grid")}
      title={t("generator_grid")}
      onclick={() =>
        changeSetting(
          "art_tunnel",
          "grid_visible",
          controller.gridVisible,
          !controller.gridVisible,
          () => (controller.gridVisible = !controller.gridVisible)
        )}
    >
      <i class="fas fa-border-all" aria-hidden="true"></i>
    </button>
    <span class="prim-count"
      >{t("viewer_ui_prop_count", { count: controller.propCount })}</span
    >
  </div>
{/if}

{#if showCustomizeButton}
  <button
    class="customize-btn"
    type="button"
    onclick={() => onCustomize?.("customize_button")}
  >
    <i class="fas fa-sliders" aria-hidden="true"></i>
    {controller.presetRecipe
      ? t("viewer_ui_edit_named", { name: controller.presetRecipe.name })
      : t("viewer_ui_edit_configuration")}
  </button>
{/if}
{#if onSaveTunnel}
  <button
    data-save-shortcut
    class="customize-btn"
    type="button"
    onclick={() => onSaveTunnel?.()}
  >
    <i class="fas fa-bookmark" aria-hidden="true"></i>
    {effectiveSaveTunnelLabel}
  </button>
{/if}

<style>
  .rt-section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.75);
  }

  .prim-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }
  .prim-row .row-lbl {
    flex: 0 0 52px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 6px;
  }
  .preset-grid.showcase {
    container-type: inline-size;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }
  .showcase .preset-card {
    position: relative;
    min-width: 0;
    min-height: 4.5rem;
    padding: 0.55rem 0.7rem;
    font-size: var(--font-size-sm, 0.875rem);
  }
  .showcase .preset-card > span {
    font-size: inherit;
    font-weight: 600;
  }
  .showcase .preset-card.active {
    box-shadow: inset 0 0 0 1px var(--theme-accent, #8b5cf6);
  }
  .showcase .preset-check {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    font-size: 0.8rem;
    opacity: 0;
  }
  .showcase .preset-card.active .preset-check {
    opacity: 1;
  }
  @container (max-width: 22rem) {
    .showcase .preset-card {
      flex-direction: column;
      justify-content: center;
      gap: 0.1rem;
      padding: 0.25rem;
    }
    .showcase .preset-card :global(svg) {
      width: 2.25rem;
      height: 2.25rem;
    }
    .showcase .preset-card > span {
      max-width: 100%;
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      text-align: center;
    }
  }
  .preset-card {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 12px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    cursor: pointer;
    transition:
      border-color 0.12s ease,
      background 0.12s ease;
  }
  .preset-card i {
    font-size: 14px;
    width: 1.1em;
    text-align: center;
    flex-shrink: 0;
  }
  .preset-card > span {
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preset-card.active {
    border-color: var(--theme-accent, #8b5cf6);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-text, #fff);
  }
  .preset-card:disabled {
    opacity: 0.34;
    cursor: not-allowed;
  }
  .preset-card:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }
  /* Preset-card mini performer-ring keeps its intrinsic size in the flex row. */
  .preset-card :global(svg) {
    flex-shrink: 0;
  }

  .customize-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    padding: 10px 16px;
    border: 1.5px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.12s ease,
      border-color 0.12s ease;
  }
  .customize-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
  }
  .customize-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Saved user preset: the select card + a full-height delete column on the
     right (44px tall touch target). */
  .preset-card-wrap {
    position: relative;
    display: flex;
  }
  .preset-card-wrap .preset-card {
    flex: 1;
    min-width: 0;
    padding-right: 34px;
  }
  .preset-del {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0 10px 10px 0;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .preset-del:hover,
  .preset-del:focus-visible {
    background: color-mix(
      in srgb,
      var(--semantic-danger, #ef4444) 18%,
      transparent
    );
    color: var(--semantic-danger, #ef4444);
  }
  .preset-del:focus-visible {
    outline: 2px solid var(--semantic-danger, #ef4444);
    outline-offset: -2px;
  }
  .preset-del i {
    font-size: 11px;
  }

  /* Compact icon toggle for the grid — a small square, keeping the 44px floor. */
  .grid-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 9px;
    color: inherit;
    cursor: pointer;
    transition:
      background 0.12s,
      border-color 0.12s;
  }
  .grid-toggle.active {
    background: var(--theme-accent, #8b5cf6);
    border-color: transparent;
    color: #fff;
  }

  .prim-count {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-variant-numeric: tabular-nums;
  }

  /* Dock composition preserves the shared touch floor while tightening gaps. */
  :global(.dock-dense) .preset-grid {
    gap: 4px;
  }
  :global(.dock-dense) .prim-row {
    min-height: 40px;
    gap: 6px;
  }
</style>
