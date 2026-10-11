<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import ConflictWarning from "./settings/ConflictWarning.svelte";
  import KeyboardKeyDisplay from "./settings/KeyboardKeyDisplay.svelte";
  import { getKeyboardShortcutManager } from "../get-keyboard-shortcut-manager";
  import type { ShortcutWithBinding } from "../services/types";
  import type { ShortcutConflict } from "../domain/types/keyboard-types";
  import { keyComboFromEvent, parseKeyCombo } from "../utils/key-combo-utils";

  let {
    item,
    contextLabel,
    detectConflicts,
    onSave,
    onReplace,
    onSwap,
    onReset,
    onDisable,
    onEnable,
    onClose,
  }: {
    item: ShortcutWithBinding;
    contextLabel: string;
    detectConflicts: (keyCombo: string) => ShortcutConflict[];
    onSave: (keyCombo: string) => void;
    onReplace: (keyCombo: string) => void;
    onSwap: (keyCombo: string, conflictId: string) => boolean;
    onReset: () => void;
    onDisable: () => void;
    onEnable: () => void;
    onClose: () => void;
  } = $props();

  let pendingCombo = $state("");
  let conflicts = $state<ShortcutConflict[]>([]);
  let isCapturing = $state(false);
  let captureButton = $state<HTMLButtonElement | null>(null);

  const pendingBinding = $derived(
    pendingCombo ? parseKeyCombo(pendingCombo) : null
  );
  const errorConflicts = $derived(
    conflicts.filter(({ severity }) => severity === "error")
  );

  $effect(() => {
    item.shortcut.id;
    pendingCombo = "";
    conflicts = [];
    isCapturing = false;
  });

  onMount(() =>
    getKeyboardShortcutManager().addInputSuppressor(() => isCapturing)
  );

  function startCapture(): void {
    pendingCombo = "";
    conflicts = [];
    isCapturing = true;
    captureButton?.focus();
  }

  function handleCapture(event: KeyboardEvent): void {
    if (!isCapturing || event.key === "Tab") return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      isCapturing = false;
      return;
    }

    const combo = keyComboFromEvent(event);
    if (!combo) return;

    pendingCombo = combo;
    conflicts = detectConflicts(combo);
    isCapturing = false;
  }

  function save(): void {
    if (!pendingCombo || errorConflicts.length > 0) return;
    onSave(pendingCombo);
    pendingCombo = "";
    conflicts = [];
  }

  function replace(): void {
    if (!pendingCombo) return;
    onReplace(pendingCombo);
    pendingCombo = "";
    conflicts = [];
  }

  function swap(): void {
    const conflict = errorConflicts[0];
    if (!pendingCombo || !conflict || errorConflicts.length !== 1) return;
    if (onSwap(pendingCombo, conflict.existingShortcutId)) {
      pendingCombo = "";
      conflicts = [];
    }
  }
</script>

<aside class="binding-editor" aria-labelledby="shortcut-editor-title">
  <header>
    <div class="title-copy">
      <span class="eyebrow">{t("keyboard_ui_edit_shortcut")}</span>
      <h3 id="shortcut-editor-title">{item.shortcut.label}</h3>
      <p>{contextLabel}</p>
    </div>
    <button
      type="button"
      class="icon-button"
      onclick={onClose}
      aria-label={t("keyboard_ui_close_editor")}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </header>

  {#if item.shortcut.description}
    <p class="description">{item.shortcut.description}</p>
  {/if}

  <dl class="binding-summary">
    <div>
      <dt>{t("keyboard_ui_current")}</dt>
      <dd class:muted={item.isDisabled}>
        <KeyboardKeyDisplay parsed={item.effectiveBinding} />
        {#if item.isDisabled}<span class="off-label">{t("keyboard_ui_off")}</span>{/if}
      </dd>
    </div>
    <div>
      <dt>{t("keyboard_ui_default")}</dt>
      <dd><KeyboardKeyDisplay parsed={item.defaultBinding} size="small" /></dd>
    </div>
  </dl>

  <div class="recorder">
    <span class="field-label">{t("keyboard_ui_new_shortcut")}</span>
    <button
      bind:this={captureButton}
      type="button"
      class="capture-button"
      class:capturing={isCapturing}
      class:has-value={pendingBinding}
      onclick={startCapture}
      onkeydown={handleCapture}
      onblur={() => (isCapturing = false)}
      aria-describedby="shortcut-capture-help"
    >
      {#if isCapturing}
        <span>{t("keyboard_ui_press_keys")}</span>
      {:else if pendingBinding}
        <KeyboardKeyDisplay parsed={pendingBinding} size="large" />
        <span class="record-again">{t("keyboard_ui_record_again")}</span>
      {:else}
        <i class="fas fa-keyboard" aria-hidden="true"></i>
        <span>{t("keyboard_ui_record_shortcut")}</span>
      {/if}
    </button>
    <p id="shortcut-capture-help" class="help-text">
      {t("keyboard_ui_record_help")}
    </p>
  </div>

  {#if conflicts.length > 0}
    <ConflictWarning
      {conflicts}
      onReplace={errorConflicts.length > 0 ? replace : undefined}
      onSwap={errorConflicts.length === 1 ? swap : undefined}
    />
  {/if}

  {#if pendingCombo && errorConflicts.length === 0}
    <button type="button" class="primary-button" onclick={save}>
      {t("keyboard_ui_save_shortcut")}
    </button>
  {/if}

  <div class="management-actions">
    {#if item.isDisabled}
      <button type="button" class="secondary-button" onclick={onEnable}>
        {t("keyboard_ui_turn_on")}
      </button>
    {:else}
      <button type="button" class="secondary-button" onclick={onDisable}>
        {t("keyboard_ui_turn_off")}
      </button>
    {/if}
    {#if item.isCustomized}
      <button type="button" class="secondary-button" onclick={onReset}>
        {t("keyboard_ui_restore_default")}
      </button>
    {/if}
  </div>

  <p class="device-note">
    <i class="fas fa-laptop" aria-hidden="true"></i>
    {t("keyboard_ui_saved_on_device")}
  </p>
</aside>

<style>
  .binding-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .title-copy {
    min-width: 0;
  }

  .eyebrow,
  .field-label,
  dt {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 650;
    letter-spacing: 0.035em;
    text-transform: uppercase;
  }

  h3,
  p,
  dl,
  dd {
    margin: 0;
  }

  h3 {
    margin-top: 0.15rem;
    font-size: var(--font-size-lg);
    line-height: 1.25;
  }

  .title-copy p,
  .description,
  .help-text,
  .device-note {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.45;
  }

  .description {
    padding-bottom: 0.2rem;
  }

  .icon-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex: 0 0 auto;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.7rem;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .binding-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .binding-summary > div {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
  }

  dd {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-height: 1.75rem;
  }

  dd.muted {
    opacity: 0.55;
  }

  .off-label {
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
    font-weight: 650;
  }

  .recorder {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .capture-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: 7rem;
    padding: 1rem;
    border: 2px dashed color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 0.85rem;
    background: color-mix(
      in srgb,
      var(--theme-accent) 6%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
    font-weight: 600;
    cursor: pointer;
  }

  .capture-button.capturing {
    border-style: solid;
    border-color: var(--theme-accent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 18%, transparent);
  }

  .capture-button.has-value {
    border-style: solid;
  }

  .record-again {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .primary-button,
  .secondary-button {
    min-height: var(--min-touch-target);
    padding: 0.6rem 0.9rem;
    border-radius: 0.65rem;
    font-size: var(--font-size-sm);
    font-weight: 650;
    cursor: pointer;
  }

  .primary-button {
    border: 1px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    background: var(--theme-accent);
    color: var(--theme-on-accent, white);
  }

  .management-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 0.25rem;
  }

  .secondary-button {
    flex: 1 1 9rem;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .primary-button:hover,
  .secondary-button:hover,
  .icon-button:hover {
    filter: brightness(1.1);
  }

  .primary-button:focus-visible,
  .secondary-button:focus-visible,
  .icon-button:focus-visible,
  .capture-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .device-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .capture-button {
      transition: none;
    }
  }
</style>
