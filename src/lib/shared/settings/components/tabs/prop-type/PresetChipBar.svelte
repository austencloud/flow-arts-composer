<!--
  PresetChipBar.svelte - The ten prop preset slots and their controls.

  Two modes, so a tap never has two meanings:
  - Normal: a filled slot applies its props, an empty slot saves the current
    props into it. Changing props after applying a preset never rewrites the
    preset; the shelf offers "Update preset N" instead.
  - Manage: a tap picks a slot, and the bar below saves over it or clears it.

  The shelf only decides what was asked for. The owning tab writes the
  settings and offers undo.
-->
<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PropPreset } from "../../../domain/app-settings";
  import {
    presetLabel,
    presetShortcutKey,
    presetsMatch,
  } from "../../../domain/prop-presets";
  import PresetChip from "./PresetChip.svelte";

  let {
    slots,
    current,
    selectedIndex,
    colors,
    darkMode = true,
    showShortcuts = false,
    onApply,
    onSave,
    onClear,
    onResetAll,
  }: {
    /** Exactly ten slots; null is empty. */
    slots: (PropPreset | null)[];
    /** The props in use right now, in preset shape. */
    current: PropPreset;
    /** The slot last applied or saved, from settings. */
    selectedIndex: number;
    colors?: ViewerCustomColorPair | null;
    darkMode?: boolean;
    /** Show Alt-key slot marks and the shortcut hint. */
    showShortcuts?: boolean;
    onApply: (index: number) => void;
    onSave: (index: number) => void;
    onClear: (index: number) => void;
    onResetAll: () => void;
  } = $props();

  const uid = $props.id();

  let managing = $state(false);
  let target = $state<number | null>(null);

  const selected = $derived(slots[selectedIndex] ?? null);

  // The slot that is exactly the current props. The remembered slot wins
  // when two slots hold the same setup.
  const activeIndex = $derived.by(() => {
    if (selected && presetsMatch(selected, current)) return selectedIndex;
    return slots.findIndex((slot) => slot !== null && presetsMatch(slot, current));
  });

  // The remembered preset no longer matches the props in use.
  const modifiedIndex = $derived(
    !managing && selected && activeIndex === -1 ? selectedIndex : -1
  );

  const targetPreset = $derived(target === null ? null : (slots[target] ?? null));

  function slotNumber(index: number): number {
    return index + 1;
  }

  function chipLabel(index: number, preset: PropPreset | null): string {
    const n = slotNumber(index);
    const name = preset ? presetLabel(preset) : t("settings_preset_empty");
    if (managing) return t("settings_preset_slot", { n, name });
    return preset
      ? t("settings_preset_apply", { n, name })
      : t("settings_preset_save_empty", { n });
  }

  function handleChip(index: number) {
    if (managing) {
      target = target === index ? null : index;
      return;
    }
    if (slots[index]) onApply(index);
    else onSave(index);
  }

  function toggleManaging() {
    managing = !managing;
    target = null;
  }

  let shelf = $state<HTMLElement>();

  // The row leaves once the preset matches again, so focus moves to the
  // preset it just updated instead of falling back to the page.
  function updateModified(event: MouseEvent) {
    const index = modifiedIndex;
    const hadFocus = (event.currentTarget as HTMLElement | null)?.contains(
      document.activeElement
    );
    onSave(index);
    if (hadFocus) {
      shelf
        ?.querySelectorAll<HTMLButtonElement>(".slots button")
        [index]?.focus();
    }
  }
</script>

<section class="preset-shelf" aria-labelledby="{uid}-title" bind:this={shelf}>
  <header class="shelf-head">
    <div class="shelf-title">
      <h4 id="{uid}-title">{t("settings_presets")}</h4>
      {#if showShortcuts}
        <span class="shortcut-hint">{t("settings_presets_shortcut_hint")}</span>
      {/if}
    </div>
    <span class="manage-toggle">
      <PanelButton ariaPressed={managing} onclick={toggleManaging}>
        {managing ? t("settings_presets_done") : t("settings_presets_manage")}
      </PanelButton>
    </span>
  </header>

  <div class="slots">
    {#each slots as preset, index (index)}
      <PresetChip
        {preset}
        label={chipLabel(index, preset)}
        slotLabel={showShortcuts
          ? presetShortcutKey(index)
          : String(slotNumber(index))}
        active={index === activeIndex}
        target={managing && index === target}
        {managing}
        {colors}
        {darkMode}
        onclick={() => handleChip(index)}
      />
    {/each}
  </div>

  {#if modifiedIndex >= 0}
    <div class="shelf-row" transition:growFade>
      <p class="row-text">
        {t("settings_preset_modified", { n: slotNumber(modifiedIndex) })}
      </p>
      <PanelButton onclick={updateModified}>
        {t("settings_preset_update", { n: slotNumber(modifiedIndex) })}
      </PanelButton>
    </div>
  {/if}

  {#if managing}
    <div class="shelf-row manage-bar" transition:growFade>
      <p class="row-text" aria-live="polite">
        {target === null
          ? t("settings_preset_manage_prompt")
          : t("settings_preset_slot", {
              n: slotNumber(target),
              name: targetPreset
                ? presetLabel(targetPreset)
                : t("settings_preset_empty"),
            })}
      </p>
      <div class="manage-actions">
        <PanelButton
          disabled={target === null}
          onclick={() => target !== null && onSave(target)}
        >
          {t("settings_preset_save_here")}
        </PanelButton>
        <PanelButton
          disabled={targetPreset === null}
          onclick={() => {
            if (target === null) return;
            onClear(target);
          }}
        >
          {t("settings_preset_clear")}
        </PanelButton>
        <PanelButton onclick={onResetAll}>
          {t("settings_preset_reset_all")}
        </PanelButton>
      </div>
    </div>
  {/if}
</section>

<style>
  .preset-shelf {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    container: preset-shelf / inline-size;
  }

  .shelf-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .shelf-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.125rem 0.75rem;
    min-width: 0;
  }

  h4 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
  }

  .shortcut-hint {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }

  /* "Manage" and "Done" share one width so the header never shifts. */
  .manage-toggle :global(.panel-btn) {
    min-width: 6.5rem;
  }

  /* Five by two where the shelf is narrow, one row of ten (the order of the
     Alt keys) once each slot keeps a readable size. Slots stop growing at
     5.5rem so a wide rail does not turn presets into posters. */
  .slots {
    --cols: 5;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 5.5rem));
    gap: 0.5rem;
  }

  @container preset-shelf (min-width: 36rem) {
    .slots {
      --cols: 10;
    }
  }

  .shelf-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
  }

  .row-text {
    flex: 1 1 12rem;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .manage-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
