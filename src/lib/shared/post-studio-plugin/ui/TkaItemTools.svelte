<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    findItem,
    updateItem,
    type PostItemPatch,
  } from "@austencloud/video-editor/core";
  import type { ToolPanelProps } from "@austencloud/video-editor";
  import {
    POST_QR_URL_RULE,
    isPostCardQrUrl,
  } from "#lib/shared/post-studio-plugin/index.js";
  import {
    canReplaceOverlayVideoWithAnimation,
    replaceOverlayVideoWithAnimation,
  } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import {
    applyLook,
    lookOf,
    type PostLook,
  } from "#lib/shared/media-composition/domain/post-project-looks.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PostStaffEffectsTool from "#lib/shared/post-studio-plugin/ui/PostStaffEffectsTool.svelte";
  import PostCardAppearanceTool from "#lib/shared/post-studio-plugin/ui/PostCardAppearanceTool.svelte";
  import PostSequenceActionsTool from "#lib/shared/post-studio-plugin/ui/PostSequenceActionsTool.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * tka's panels on core kinds: replacing an overlay video with the live
   * animation (after Trim's own controls), a video's looks, its staff
   * effects (after Effects' own controls), a card's and a QR image's
   * appearance, and the sequence actions. Renders nothing for a tool none of
   * them owns.
   */
  let { editor, item, tool, locked }: ToolPanelProps = $props();
  const uid = $props.id();
  const tka = useTkaEditor();

  const trackIndex = $derived(
    item ? (findItem(editor.project, item.id)?.trackIndex ?? 0) : 0
  );
  const onMain = $derived(trackIndex === 0);

  function patchItem(patch: PostItemPatch): void {
    if (!item) return;
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }

  /** The Scan link field on screen; another card or tool makes a new one. */
  let cardLinkField = $state<HTMLInputElement | null>(null);
  /** The card the field belongs to and the saved link it shows. */
  const cardLinkShown = $derived(
    item?.kind === "card" ? `${item.id} ${item.qrUrl ?? ""}` : ""
  );
  /**
   * True while the field holds a typed link the rule refused; the field's
   * handler sets it. A new field, or a saved link put in this one by an undo
   * or a script's edit, makes it false again.
   */
  let cardLinkRefused = $derived.by(() => {
    void cardLinkField;
    void cardLinkShown;
    return false;
  });

  function changeCardLink(value: string): void {
    if (item?.kind !== "card") return;
    const link = value.trim();
    if (!link) {
      cardLinkRefused = false;
      patchItem({ qrUrl: null });
      return;
    }
    if (!isPostCardQrUrl(link)) {
      cardLinkRefused = true;
      return;
    }
    cardLinkRefused = false;
    // The link shows only in the QR cell, so setting one picks that cell.
    patchItem({
      qrUrl: link,
      cardAppearance: { ...item.cardAppearance, infoCellChoice: "qr" },
    });
  }

  function replaceWithLiveAnimation(): void {
    if (!item) return;
    if (locked) return;
    editor.pause();
    editor.edit((project, ctx) =>
      replaceOverlayVideoWithAnimation(project, item.id, ctx)
    );
  }

  function setLook(look: PostLook): void {
    if (!item) return;
    if (locked) return;
    editor.edit((project, ctx) => applyLook(project, item.id, look, ctx));
  }
</script>

{#if tool === "trim" && item?.kind === "video"}
  {#if !onMain && canReplaceOverlayVideoWithAnimation(editor.project, item.id)}
    <div class="actions">
      <PanelButton onclick={replaceWithLiveAnimation} disabled={locked}>
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        Replace with live sequence animation
      </PanelButton>
    </div>
    <p class="hint">
      Uses the camera video's beat map. Keeps this clip's timing and position.
      The original video stays available for undo; its audio, if any, leaves the
      mix.
    </p>
  {/if}
{:else if tool === "layout" && item?.kind === "video"}
  <SegmentedControl
    color="accent"
    options={[
      { value: "dual", label: t("post_editor_look_dual"), disabled: locked },
      {
        value: "breakdown",
        label: t("post_editor_look_breakdown"),
        disabled: locked,
      },
      { value: "full", label: t("post_editor_look_full"), disabled: locked },
    ]}
    value={lookOf(editor.project, item.id) ?? "custom"}
    onchange={(look) => {
      if (look !== "custom") setLook(look);
    }}
    ariaLabel={t("post_editor_look")}
  />
{:else if tool === "effects" && item?.kind === "video"}
  {#if tka.staffTips}
    {@const take = editor.takes.find((entry) => entry.id === item.takeId)}
    <PostStaffEffectsTool
      {item}
      takeKey={take?.takeKey ?? null}
      mediaUrl={editor.mediaUrl(item.takeId)}
      analysis={tka.staffTips}
      {locked}
      onPick={(effect) => patchItem({ staffEffect: effect })}
    />
  {/if}
{:else if tool === "appearance" && item?.kind === "card"}
  <PostCardAppearanceTool
    {item}
    options={tka.cardRenderOptions}
    stepCount={tka.stepCount}
    {locked}
    onchange={(value) => patchItem({ cardAppearance: value })}
  />
  {#if tka.featureMode}
    <!-- Keyed so text typed for one card never shows on the next. -->
    {#key item.id}
      <div class="card-link">
        <span class="readout-name">Scan link</span>
        <input
          class="field"
          type="url"
          value={item.qrUrl ?? ""}
          placeholder="https://tka.run/..."
          aria-label="Scan link"
          aria-invalid={cardLinkRefused}
          aria-describedby="{uid}-link-note"
          disabled={locked}
          bind:this={cardLinkField}
          onchange={(event) => changeCardLink(event.currentTarget.value)}
        />
        {#if cardLinkRefused}
          <p class="link-error" id="{uid}-link-note" role="alert">
            {POST_QR_URL_RULE}
          </p>
        {:else}
          <p class="hint" id="{uid}-link-note">
            The card's QR opens this link for anyone who scans it.
          </p>
        {/if}
      </div>
    {/key}
  {/if}
{:else if tool === "appearance" && item?.kind === "image"}
  <div class="qr-appearance">
    <strong>QR code</strong>
    <SegmentedControl
      color="accent"
      options={[
        { value: "poster", label: "Poster", disabled: locked },
        { value: "light", label: "Light", disabled: locked },
        { value: "dark", label: "Dark", disabled: locked },
      ]}
      value={item.qrAppearance ?? "poster"}
      onchange={(value) =>
        patchItem({
          qrAppearance: value === "poster" ? null : value,
        })}
      ariaLabel="QR code appearance"
    />
    <p>Poster follows the card's light or dark mode.</p>
  </div>
{:else if tool === "sequence" && (item?.kind === "animation" || item?.kind === "moves" || item?.kind === "card")}
  <PostSequenceActionsTool
    editor={tka.editor}
    {locked}
    busy={tka.sequenceBusy}
  />
{/if}

<style>
  .card-link {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .qr-appearance {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .qr-appearance p {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }

  .readout-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 1rem;
  }

  .field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  .field:disabled {
    opacity: 0.5;
  }

  .link-error {
    margin: 0;
    color: var(--semantic-error, #f87171);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
