<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
  import {
    SPEED_FILLS,
    SPEED_LADDER,
    type SpeedFill,
  } from "../../tunnel/tunnel-config";
  import { changeArtSetting } from "./art-setting-change";
  import type {
    ArtSettingChangeHandler,
    ArtSettingValue,
  } from "./art-settings-types";

  interface Props {
    controller: TunnelViewController;
    dense: boolean;
    stageAware?: boolean;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let {
    controller,
    dense,
    stageAware = false,
    onArtSettingChange,
  }: Props = $props();

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

  // Speed section (own rail destination): per-performer playback rate. "Speed"
  // (not "Tempo") — Playback › Tempo already owns BPM and Effort owns per-beat
  // dynamics; this is each copy's rate. Fills are one-tap shortcuts that write the
  // per-performer rows (the single source of truth); selecting a row spotlights
  // that performer in the tunnel.
  const speedLabel = (r: number): string =>
    r === 0.25 ? "¼×" : r === 0.5 ? "½×" : `${r}×`;
  const speedLadderOptions = SPEED_LADDER.map((r) => ({
    value: String(r),
    label: speedLabel(r),
  }));
  const SPEED_FILL_META = $derived<
    Record<SpeedFill, { label: string; icon: string }>
  >({
    alternating: { label: t("viewer_ui_alternating"), icon: "fas fa-shuffle" },
    accelerando: { label: t("viewer_ui_accelerando"), icon: "fas fa-forward" },
  });
  const speedFillButtons = $derived(
    SPEED_FILLS.map((kind) => ({
      kind,
      ...SPEED_FILL_META[kind],
    }))
  );
</script>

<div class="section-pad">
  {#if controller.performerCount > 1}
    <!-- One-tap fills write the rows below; Reset clears. Rows are the truth. -->
    <div class="fill-row">
      {#if !dense}<span class="fill-lbl">{t("viewer_detail_fill")}</span>{/if}
      {#each speedFillButtons as f (f.kind)}
        <FilterChipBase
          mode="action"
          size="sm"
          label={f.label}
          icon={f.icon}
          onclick={() =>
            changeSetting(
              "art_tunnel",
              "speed_fill",
              controller.hasSpeedOverrides ? "custom" : "uniform",
              f.kind,
              () => controller.applySpeedFill(f.kind)
            )}
        />
      {/each}
      <FilterChipBase
        mode="action"
        size="sm"
        label={t("viewer_ui_reset")}
        icon="fas fa-rotate-left"
        disabled={!controller.hasSpeedOverrides}
        onclick={() =>
          changeSetting("art_tunnel", "speed_fill", "custom", "uniform", () =>
            controller.resetSpeed()
          )}
      />
    </div>

    <!-- Per performer: two-tone swatch identity + rate. Click a row to
             spotlight that performer in the tunnel (others dim). "You" (the base)
             is the fixed 1× reference. -->
    <div
      class="perf-list"
      role="listbox"
      aria-label={t("viewer_ui_performers")}
    >
      {#each controller.speedPerformers as perf (perf.arm)}
        <div
          class="perf-row"
          class:selected={controller.selectedArm === perf.arm}
        >
          <button
            type="button"
            class="perf-pick"
            role="option"
            aria-selected={controller.selectedArm === perf.arm}
            aria-label={`Spotlight ${perf.label}`}
            onclick={() =>
              changeSetting(
                "art_tunnel",
                "spotlight_performer",
                controller.selectedArm,
                controller.selectedArm === perf.arm ? null : perf.arm,
                () => controller.selectPerformer(perf.arm)
              )}
          >
            <span class="perf-swatch">
              <span style="background:{perf.leftHex}"></span>
              <span style="background:{perf.rightHex}"></span>
            </span>
            <span class="perf-lbl">{perf.label}</span>
          </button>
          <div class="seg-wrap">
            <SegmentedControl
              options={speedLadderOptions}
              value={String(perf.rate)}
              onchange={(v) =>
                changeSetting(
                  "art_tunnel",
                  "performer_speed",
                  perf.rate,
                  Number(v),
                  () => controller.setPerformerSpeed(perf.arm, Number(v))
                )}
              color="accent"
              size="sm"
            />
          </div>
        </div>
      {/each}
    </div>
    {#if !dense && controller.selectedArm !== null}
      <p class="section-hint">
        {t("viewer_detail_spotlighting")} {controller.speedPerformers[controller.selectedArm]
          ?.label ?? "a performer"} {t("viewer_detail__tap_again_to_clear")}
      </p>
    {/if}
  {:else if !dense}
    <p class="section-hint">
      {stageAware
        ? t("viewer_ui_add_another_stage_appearance")
        : t("viewer_ui_add_copies_to_set_speed")}
    </p>
  {/if}
</div>

<style>
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }
  .section-hint {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    line-height: 1.4;
    margin: 0;
    padding: 0 8px;
  }
  .seg-wrap {
    flex: 1;
    min-width: 0;
  }

  /* Speed section: one-tap fills + a per-performer list (swatch identity + rate).
     Clicking a row spotlights that performer in the tunnel. */
  .fill-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .fill-lbl {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    margin-right: 2px;
  }
  .perf-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .perf-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 2px 4px;
    border-radius: 10px;
    border: 1px solid transparent;
  }
  .perf-row.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #c79bff) 14%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #c79bff) 45%,
      transparent
    );
  }
  .perf-pick {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    min-width: 96px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 4px;
    background: none;
    border: none;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    text-align: left;
  }
  /* Two-tone identity chip: the performer's blue + red end colors. */
  .perf-swatch {
    display: inline-flex;
    width: 22px;
    height: 14px;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    flex: 0 0 auto;
  }
  .perf-swatch span {
    display: block;
    width: 50%;
    height: 100%;
  }
  .perf-lbl {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  /* Mobile dock tray: tighten the shared section bodies. Buttons/inputs keep
     their var(--min-touch-target) floor — only gaps and outer paddings collapse
     so the tray stays compact floating over the art. */
  :global(.dock-dense) .section-pad {
    gap: 8px;
    padding: 2px 2px 6px;
  }
</style>
