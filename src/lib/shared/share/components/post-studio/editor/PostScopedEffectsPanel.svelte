<script lang="ts">
  import { onMount } from "svelte";
  import EffectsPanel from "$lib/shared/animation-engine/components/effects-panel/EffectsPanel.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { AnimationSettingsState } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { primaryControls } from "$lib/shared/effects/domain/effect-control-manifest";

  let {
    effects,
    animationSettingsState,
    onSettingChange,
    fill = false,
  }: {
    effects: EffectsConfigState;
    animationSettingsState: AnimationSettingsState;
    onSettingChange: (setting: string) => void;
    fill?: boolean;
  } = $props();

  setEffectsConfigContext(effects);
  let root: HTMLDivElement;
  let panelWidth = $state(0);
  let panelHeight = $state(0);
  let failedFit = $state<{
    effect: string;
    width: number;
    requiredHeight: number;
  } | null>(null);
  const overflowDetail = $derived(
    failedFit?.effect === effects.activeEffect &&
      Math.abs(failedFit.width - panelWidth) < 16 &&
      panelHeight < failedFit.requiredHeight
  );
  const richDetail = $derived(
    effects.activeEffect !== "none" &&
      primaryControls(effects.activeEffect, "2d").length === 0
  );
  const compactDetail = $derived(panelHeight < 440 || overflowDetail);
  const pagedRichDetail = $derived(richDetail && panelHeight < 1120);

  onMount(() => {
    let timer: number | undefined;
    const measure = () => {
      const panel = root.querySelector(".effects-panel");
      if (!panel?.querySelector(".inspector")) return;
      const bounds = root.getBoundingClientRect();
      const visible = panel.querySelectorAll(
        "button, input, select, [role='radio']"
      );
      let bottom =
        panel.querySelector(".sb-footer")?.getBoundingClientRect().bottom ?? 0;
      for (const control of visible) {
        const rect = control.getBoundingClientRect();
        if (rect.width > 0) bottom = Math.max(bottom, rect.bottom);
      }
      if (bottom > bounds.bottom + 1) {
        failedFit = {
          effect: effects.activeEffect,
          width: bounds.width,
          requiredHeight: Math.ceil(bottom - bounds.top + 8),
        };
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 350);
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    schedule();
    return () => {
      window.clearTimeout(timer);
      mutations.disconnect();
      resize.disconnect();
    };
  });
</script>

<div
  class="post-effects"
  class:fill
  bind:this={root}
  bind:clientWidth={panelWidth}
  bind:clientHeight={panelHeight}
>
  <EffectsPanel
    bpm={60}
    onBpmChange={() => {}}
    isPlaying={false}
    onPlaybackToggle={() => {}}
    showPlayback={false}
    showTransport={false}
    showExportControls={false}
    showHeading={false}
    layout={panelWidth >= 560 && !compactDetail ? "sidebar" : "strip"}
    wideWorkspace={false}
    preferSelectedDetail
    {pagedRichDetail}
    {fill}
    {animationSettingsState}
    onSettingChange={(setting) => onSettingChange(setting)}
  />
</div>

<style>
  .post-effects {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .post-effects.fill {
    flex: 1 1 0;
  }
</style>
