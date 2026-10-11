<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import {
    CARD_PRESENTATION_SCHEMA_VERSION,
    CARD_FOOTER_TEXT_MAX_LENGTH,
    normalizeCardPresentation,
    type CardFooterMode,
    type CardPresentation,
  } from "#lib/shared/share/domain/models/card-presentation.js";

  interface Props {
    value: CardPresentation;
    onchange: (value: CardPresentation) => void;
    description?: string;
    onSave?: () => void | Promise<void>;
    dirty?: boolean;
    saving?: boolean;
    saveLabel?: string;
    idBase?: string;
  }

  let {
    value,
    onchange,
    description,
    onSave,
    dirty = false,
    saving = false,
    saveLabel,
    idBase = "card-footer",
  }: Props = $props();

  const options: { value: CardFooterMode; label: string }[] = $derived([
    { value: "off", label: t("share_footer_off") },
    { value: "credit", label: t("share_footer_credit") },
    { value: "custom", label: t("share_footer_custom") },
  ]);

  const normalized = $derived(normalizeCardPresentation(value));
  const mode = $derived(normalized.footer.mode);
  let lastCustomText = $state("");

  $effect(() => {
    if (normalized.footer.mode === "custom") {
      lastCustomText = normalized.footer.text ?? "";
    }
  });

  function selectMode(nextMode: CardFooterMode): void {
    onchange({
      schemaVersion: CARD_PRESENTATION_SCHEMA_VERSION,
      footer:
        nextMode === "custom"
          ? { mode: "custom", text: lastCustomText }
          : { mode: nextMode },
    });
  }

  function updateCustomText(event: Event): void {
    const text = (event.currentTarget as HTMLInputElement).value;
    lastCustomText = text;
    onchange({
      schemaVersion: CARD_PRESENTATION_SCHEMA_VERSION,
      footer: { mode: "custom", text },
    });
  }
</script>

<div class="card-footer-editor" data-card-footer-editor>
  <div class="editor-heading">
    <div>
      <div class="editor-label" id="{idBase}-label">
        {t("share_card_footer")}
      </div>
      <p class="editor-description">
        {description ?? t("share_footer_description")}
      </p>
    </div>
    {#if onSave}
      <span class="save-status" aria-live="polite">
        {saving
          ? t("share_saving")
          : dirty
            ? t("share_not_saved")
            : t("share_saved")}
      </span>
    {/if}
  </div>

  <SegmentedControl
    {options}
    value={mode}
    onchange={selectMode}
    ariaLabelledby="{idBase}-label"
    semantics="radiogroup"
    size="sm"
    color="accent"
  />

  {#if mode === "custom"}
    <div class="custom-field" transition:growFade={{ axis: "y" }}>
      <label for="{idBase}-text">{t("share_footer_text")}</label>
      <input
        id="{idBase}-text"
        type="text"
        value={normalized.footer.text ?? ""}
        maxlength={CARD_FOOTER_TEXT_MAX_LENGTH}
        placeholder={t("share_footer_placeholder")}
        oninput={updateCustomText}
      />
      <span class="character-count">
        {(normalized.footer.text ?? "").length}/{CARD_FOOTER_TEXT_MAX_LENGTH}
      </span>
    </div>
  {/if}

  {#if onSave}
    <PanelButton
      variant="secondary"
      fullWidth
      disabled={!dirty || saving}
      ariaBusy={saving}
      onclick={() => void onSave?.()}
    >
      <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
      {saving
        ? t("share_saving")
        : dirty
          ? (saveLabel ?? t("share_save_to_card"))
          : t("share_saved_to_card")}
    </PanelButton>
  {/if}
</div>

<style>
  .card-footer-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .editor-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .editor-label {
    display: block;
    color: var(--theme-text);
    font-size: var(--font-size-min);
    font-weight: 650;
    line-height: 1.25;
  }

  .editor-description {
    margin: 3px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.35;
  }

  .save-status {
    flex: 0 0 auto;
    min-width: 68px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
    text-align: right;
  }

  .custom-field {
    position: relative;
    display: grid;
    gap: 6px;
  }

  .custom-field label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 600;
  }

  .custom-field input {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 10px 54px 10px 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min);
  }

  .custom-field input:hover {
    border-color: var(--theme-stroke-strong);
  }

  .custom-field input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .custom-field input::placeholder {
    color: var(--theme-text-dim);
  }

  .character-count {
    position: absolute;
    right: 10px;
    bottom: 13px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  @media (max-width: 420px) {
    .editor-heading {
      gap: 8px;
    }
  }
</style>
