<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    POST_STAFF_EFFECTS,
    type PostStaffEffectId,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { staffTipCoverage } from "$lib/shared/media-composition/domain/staff-tip-track";
  import type { StaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
  import {
    EFFECT_COLORS,
    EFFECT_LABELS,
  } from "$lib/shared/effects/domain/effect-meta";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import { fitEffectRoster } from "$lib/shared/animation-engine/domain/effect-catalog-fit";
  import EffectSelector from "$lib/shared/animation-engine/components/effects-panel/EffectSelector.svelte";
  import EffectPresetThumbnail from "$lib/shared/animation-engine/components/effects-panel/EffectPresetThumbnail.svelte";
  import { createEffectLookPreview } from "$lib/shared/animation-engine/components/effects-panel/effect-look-preview";
  import type { EffectPreset } from "$lib/shared/animation-engine/components/effects-panel/presets/types";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  /**
   * Effects that follow the LED staffs in a clip's own footage. Finding the
   * staffs is a one-time wait per video. Then an effect is one tap, and it
   * rides the clip through trims, speed changes and framing.
   */
  interface Props {
    item: PostVideoItem;
    /** The take's key, which its saved staff ends are filed under. */
    takeKey: string | null;
    /** The take's video, or null when a local file must be picked again. */
    mediaUrl: string | null;
    analysis: StaffTipAnalysis;
    locked: boolean;
    onPick: (effect: PostStaffEffectId | null) => void;
  }

  let { item, takeKey, mediaUrl, analysis, locked, onPick }: Props = $props();

  const status = $derived(takeKey ? analysis.status(takeKey) : "none");
  const track = $derived(takeKey ? analysis.track(takeKey) : null);
  const progress = $derived(takeKey ? analysis.progress(takeKey) : 0);
  const percent = (fraction: number) => Math.round(fraction * 100);
  const chosen = $derived(item.staffEffect?.effect ?? null);
  let rosterWidth = $state(0);
  const rosterFit = $derived(
    fitEffectRoster({
      width: rosterWidth,
      count: POST_STAFF_EFFECTS.length,
      columns: 3,
    })
  );

  // Staff effects use the shared default settings. Their pictures should show
  // those settings, rather than a named look this clip will not actually use.
  const looks = new Map(
    POST_STAFF_EFFECTS.map((effect) => {
      const preset: EffectPreset = {
        id: `${effect}-post-default`,
        name: EFFECT_LABELS[effect] ?? effect,
        previewColor: EFFECT_COLORS[effect] ?? "#60a5fa",
        patch: DEFAULT_EFFECTS_CONFIG[effect],
      };
      return [
        effect,
        { preset, model: createEffectLookPreview(effect, preset) },
      ];
    })
  );

  function pick(effect: string): void {
    const supported = POST_STAFF_EFFECTS.find(
      (candidate) => candidate === effect
    );
    if (supported) onPick(chosen === supported ? null : supported);
  }

  function find(): void {
    if (!takeKey || !mediaUrl) return;
    void analysis.find(takeKey, mediaUrl);
  }
</script>

<div class="staff-tool">
  {#if status === "finding"}
    <div class="finding">
      <div class="finding-head">
        <p class="line" aria-live="polite">
          {t("post_staff_finding", { percent: percent(progress) })}
        </p>
        <PanelButton onclick={() => takeKey && analysis.cancel(takeKey)}>
          {t("post_staff_stop")}
        </PanelButton>
      </div>
      <div
        class="bar"
        role="progressbar"
        aria-label={t("post_staff_find")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent(progress)}
      >
        <div class="fill" style:width={`${percent(progress)}%`}></div>
      </div>
    </div>
  {:else if status === "none" || (status === "failed" && !track)}
    <p class="hint">
      {status === "failed" ? t("post_staff_failed") : t("post_staff_intro")}
    </p>
    {#if mediaUrl}
      <div class="actions">
        <PanelButton onclick={find} disabled={!takeKey}>
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          {status === "failed"
            ? t("post_staff_try_again")
            : t("post_staff_find")}
        </PanelButton>
      </div>
    {:else}
      <p class="hint">{t("share_studio_repick_local")}</p>
    {/if}
  {/if}

  {#if track && status !== "finding"}
    <div class="actions">
      <PanelButton
        ariaPressed={chosen === null}
        disabled={locked}
        onclick={() => onPick(null)}
      >
        <i class="fa-solid fa-ban" aria-hidden="true"></i>
        {t("post_staff_effect_none")}
      </PanelButton>
    </div>
    <div class="roster" bind:clientWidth={rosterWidth}>
      <EffectSelector
        activeEffect={chosen ?? "none"}
        availableEffects={POST_STAFF_EFFECTS}
        catalog={rosterFit}
        portrait={effectPortrait}
        disabled={locked}
        onSelect={pick}
      />
    </div>
    {#snippet effectPortrait(effect: string)}
      {@const look = looks.get(effect as PostStaffEffectId)}
      {#if look}
        <EffectPresetThumbnail
          effectType={effect}
          preset={look.preset}
          legacyModel={look.model}
          active={chosen === effect}
        />
      {/if}
    {/snippet}
    <div class="found">
      <p class="hint">
        {status === "failed"
          ? t("post_staff_failed")
          : t("post_staff_found", {
              percent: percent(staffTipCoverage(track)),
            })}
      </p>
      {#if mediaUrl}
        <PanelButton onclick={find} disabled={!takeKey}>
          <i class="fa-solid fa-rotate" aria-hidden="true"></i>
          {t("post_staff_find_again")}
        </PanelButton>
      {/if}
    </div>
  {/if}
</div>

<style>
  .staff-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .hint,
  .line {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .hint {
    color: var(--theme-text-secondary, #aaa);
  }

  .line {
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .roster {
    min-width: 0;
  }

  .finding {
    display: grid;
    gap: 0.625rem;
  }

  .finding-head,
  .found {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
  }

  .bar {
    height: 0.375rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--theme-stroke, #484755);
  }

  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--theme-accent, #60a5fa);
    transition: width 200ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
