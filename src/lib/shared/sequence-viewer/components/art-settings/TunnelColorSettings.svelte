<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import LabeledColorPairPicker from "$lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import {
    normalizePerformerColors,
    resolvePerformerColorPair,
    type TunnelPerformerColors,
  } from "../../tunnel/tunnel-prop-colors";
  import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
  import { changeArtSetting, reportArtSetting } from "./art-setting-change";
  import type {
    ArtSettingChangeHandler,
    ArtSettingValue,
  } from "./art-settings-types";

  interface Props {
    controller: TunnelViewController;
    dense: boolean;
    onArtSettingChange?: ArtSettingChangeHandler;
  }

  let { controller, dense, onArtSettingChange }: Props = $props();
  let selectedId = $state<string | null>(null);
  const selected = $derived(
    controller.colorPerformers.find((p) => p.id === selectedId) ??
      controller.colorPerformers[0]
  );
  const override = $derived(
    selected ? controller.performerColors[selected.id] : undefined
  );
  const editingColors = $derived(
    override ??
      normalizePerformerColors({ custom: controller.customPropColors })
  );
  const preview = $derived(resolvePerformerColorPair(editingColors));
  const performerOptions = $derived(
    controller.colorPerformers.map((p, index) => ({
      value: p.id,
      label: `${index + 1}`,
      ariaLabel: p.label,
    }))
  );
  const performerModes = [
    { value: "inherit", label: "Inherit" },
    { value: "custom", label: "Two colors" },
    { value: "hue", label: "Shared hue" },
  ];
  function updatePerformer(value: TunnelPerformerColors | null): void {
    if (!selected) return;
    changeSetting(
      `performer_colors:${selected.id}`,
      JSON.stringify(override ?? null),
      JSON.stringify(value),
      () => controller.setPerformerColors(selected.id, value)
    );
  }

  function reportSetting(
    setting: string,
    previousValue: ArtSettingValue,
    value: ArtSettingValue,
    coalesce = false
  ): void {
    reportArtSetting(
      onArtSettingChange,
      "art_tunnel",
      setting,
      previousValue,
      value,
      coalesce
    );
  }

  function changeSetting(
    setting: string,
    previousValue: ArtSettingValue,
    value: ArtSettingValue,
    mutate: () => void
  ): void {
    changeArtSetting(
      onArtSettingChange,
      "art_tunnel",
      setting,
      previousValue,
      value,
      mutate
    );
  }

  // Hand colors match the choreography cards. Spectrum remains an explicit
  // instance-coloring appearance for saved tunnels that already authored it.
  const colorOptions = [
    { value: "hands", label: "Hand colors" },
    { value: "spectrum", label: "Spectrum" },
    { value: "custom", label: "Custom pair" },
  ];
</script>

<div class="tunnel-colors">
  <span class="section-label">Tunnel colors</span>
  <SegmentedControl
    options={colorOptions}
    value={controller.colorMode}
    onchange={(value) =>
      changeSetting("colors", controller.colorMode, value, () => {
        controller.colorMode = value as "hands" | "spectrum" | "custom";
      })}
    color="accent"
    size="sm"
  />
  <Crossfade key={controller.colorMode} animateHeight>
    {#if controller.colorMode === "custom"}
      <LabeledColorPairPicker
        left={controller.customPropColors.left}
        right={controller.customPropColors.right}
        onchange={(hand, value) => {
          const previous = controller.customPropColors[hand];
          controller.setCustomPropColor(hand, value);
          reportSetting(
            hand === "left" ? "left_prop_color" : "right_prop_color",
            previous,
            value,
            true
          );
        }}
      />
    {:else if !dense}
      <p class="section-hint">
        {controller.colorMode === "spectrum"
          ? "Generated copies use distinct hues; Left and Right stay labeled throughout the editor."
          : "Stage props match the pictograph Left and Right hand colors."}
      </p>
    {/if}
  </Crossfade>
  {#if selected}
    <span class="section-label">Performer colors</span>
    <SegmentedControl
      options={performerOptions}
      value={selected.id}
      onchange={(id) => (selectedId = id)}
      columns={4}
      ariaLabel="Performer to color"
      size="sm"
    />
    <span class="performer-label">{selected.label}</span>
    <SegmentedControl
      options={performerModes}
      value={override?.mode ?? "inherit"}
      onchange={(mode) =>
        updatePerformer(
          mode === "inherit"
            ? null
            : {
                ...editingColors,
                mode: mode as "custom" | "hue",
                custom: preview,
              }
        )}
      ariaLabel="Performer color mode"
      size="sm"
    />
    <Crossfade
      key={`${selected.id}:${override?.mode ?? "inherit"}`}
      animateHeight
    >
      {#if override?.mode === "custom"}
        <LabeledColorPairPicker
          left={preview.left}
          right={preview.right}
          groupLabel={`${selected.label} prop colors`}
          onchange={(hand, value) =>
            updatePerformer({
              ...editingColors,
              custom: { ...editingColors.custom, [hand]: value },
            })}
        />
      {:else if override?.mode === "hue"}
        <div class="hue-controls">
          <ScrubbableNumber
            label="Shared hue"
            value={editingColors.hue}
            min={0}
            max={359}
            step={1}
            unit="°"
            onchange={(hue) => updatePerformer({ ...editingColors, hue })}
          />
          <ScrubbableNumber
            label="Saturation"
            value={editingColors.saturation}
            min={0}
            max={100}
            step={1}
            unit="%"
            onchange={(saturation) =>
              updatePerformer({ ...editingColors, saturation })}
          />
          <ScrubbableNumber
            label="Left lightness"
            value={editingColors.leftLightness}
            min={0}
            max={100}
            step={1}
            unit="%"
            onchange={(leftLightness) =>
              updatePerformer({ ...editingColors, leftLightness })}
          />
          <ScrubbableNumber
            label="Right lightness"
            value={editingColors.rightLightness}
            min={0}
            max={100}
            step={1}
            unit="%"
            onchange={(rightLightness) =>
              updatePerformer({ ...editingColors, rightLightness })}
          />
          <div class="shade-preview">
            <span
              ><i style:background={preview.left}></i>Left {preview.left.toUpperCase()}</span
            >
            <span
              ><i style:background={preview.right}></i>Right {preview.right.toUpperCase()}</span
            >
          </div>
        </div>
      {:else}
        <p class="section-hint">Uses the tunnel colors above.</p>
      {/if}
    </Crossfade>
  {/if}
</div>

<style>
  .performer-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }
  .hue-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .shade-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: var(--font-size-compact, 12px);
  }
  .shade-preview span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .shade-preview i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke);
  }
  .tunnel-colors {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .section-hint {
    margin: 0;
    padding: 0 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    text-align: center;
  }

  :global(.dock-dense) .tunnel-colors {
    padding-top: 8px;
  }
</style>
