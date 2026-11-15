<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    beatSeconds,
    hasGrid,
    postOutputSize,
    type PostCardItem,
    type PostItemPatch,
  } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import {
    CARD_QR_CAPTION_MAX_SIZE,
    CARD_QR_CAPTION_MIN_SIZE,
    CARD_QR_CAPTION_SIZE,
    CARD_QR_EXIT_SECONDS,
    CARD_QR_MAX_CAPTION_LENGTH,
    CARD_RING_LATE_SECONDS,
    qrLandingBox,
    type PostCardQrExit,
    type PostCardRing,
  } from "../card-ending";

  /**
   * A card's ending: how it arrives, the gold ring stepping on beats, the QR
   * flying out, and whether the titles clip draws its name. Times are
   * seconds from the card's start, as the titles' own spans are.
   */
  let {
    editor,
    item,
    locked,
    onpatch,
  }: {
    editor: VideoEditorState;
    item: PostCardItem;
    locked: boolean;
    onpatch: (patch: PostItemPatch) => void;
  } = $props();

  /** A ring's pace when the song has no beat grid to step on. */
  const RING_FALLBACK_EVERY_SECONDS = 0.5;
  const RING_MAX_EVERY_SECONDS = 3;
  const RING_MAX_LATE_SECONDS = 0.5;
  const QR_MIN_TAKES_SECONDS = 0.2;
  const QR_MAX_TAKES_SECONDS = 4;
  const QR_MIN_LANDING_WIDTH = 0.15;
  const SLIDER_STEP_SECONDS = 0.01;
  const SLIDER_STEP_SHARE = 0.01;

  const secondsText = (seconds: number) => `${seconds.toFixed(2)} s`;
  const percent = (share: number) => `${Math.round(share * 100)}%`;

  const songBeat = $derived.by(() => {
    const music = editor.project.music;
    return music && hasGrid(music) ? beatSeconds(music.grid) : null;
  });
  const frame = $derived(postOutputSize(editor.project.canvas));
  const aspect = $derived(frame.width / frame.height);

  /** The playhead as seconds into the card, kept inside it. */
  function playheadIn(): number {
    const into = editor.previewSeconds - item.start;
    return Math.min(item.duration, Math.max(0, into));
  }

  function patch(value: PostItemPatch): void {
    if (locked) return;
    onpatch(value);
  }

  function setRing(change: Partial<PostCardRing>): void {
    if (!item.ring) return;
    patch({ ring: { ...item.ring, ...change } });
  }

  function useSongBeat(): void {
    if (!item.ring || songBeat === null) return;
    const { every: _every, ...rest } = item.ring;
    patch({ ring: rest });
  }

  function setQr(change: Partial<PostCardQrExit>): void {
    if (!item.qrExit) return;
    patch({ qrExit: { ...item.qrExit, ...change } });
  }

  const landing = $derived(
    item.qrExit ? qrLandingBox(item.qrExit, aspect) : null
  );

  /** The landing kept square on the frame, moved or resized around its centre line. */
  function setLanding(change: {
    width?: number;
    x?: number;
    y?: number;
  }): void {
    if (!landing) return;
    const width = change.width ?? landing.width;
    const centre = landing.x + landing.width / 2;
    setQr({
      to: {
        x: change.x ?? centre - width / 2,
        y: change.y ?? landing.y,
        width,
        height: width * aspect,
      },
    });
  }
</script>

<div class="card-ending">
  <span class="readout-name">{t("post_editor_card_arrive")}</span>
  <SegmentedControl
    color="accent"
    options={[
      {
        value: "fade",
        label: t("post_editor_card_arrive_fade"),
        disabled: locked,
      },
      {
        value: "cascade",
        label: t("post_editor_card_arrive_cascade"),
        disabled: locked,
      },
    ]}
    value={item.enter ? "cascade" : "fade"}
    onchange={(value) =>
      // The cascade is the card's whole arrival, so the clip's own fade-in
      // would only dim it; it goes when the cascade is chosen.
      patch(
        value === "cascade"
          ? { enter: { style: "cascade" }, fadeIn: 0 }
          : { enter: null }
      )}
    ariaLabel={t("post_editor_card_arrive")}
  />

  <span class="readout-name">{t("post_editor_card_ring")}</span>
  <SegmentedControl
    color="accent"
    options={[
      { value: "off", label: t("post_editor_card_off"), disabled: locked },
      { value: "on", label: t("post_editor_card_on"), disabled: locked },
    ]}
    value={item.ring ? "on" : "off"}
    onchange={(value) =>
      patch({
        ring:
          value === "on"
            ? {
                at: playheadIn(),
                ...(songBeat === null
                  ? { every: RING_FALLBACK_EVERY_SECONDS }
                  : {}),
              }
            : null,
      })}
    ariaLabel={t("post_editor_card_ring")}
  />
  {#if item.ring}
    {@const ring = item.ring}
    <div class="group" transition:growFade>
      <ValueSlider
        label={t("post_editor_card_ring_at")}
        value={ring.at}
        min={0}
        max={item.duration}
        step={SLIDER_STEP_SECONDS}
        format={secondsText}
        disabled={locked}
        onchange={(at) => setRing({ at })}
      />
      <PanelButton
        disabled={locked}
        onclick={() => setRing({ at: playheadIn() })}
      >
        {t("post_editor_card_set_to_playhead")}
      </PanelButton>
      <ValueSlider
        label={t("post_editor_card_ring_every")}
        value={ring.every ?? songBeat ?? RING_FALLBACK_EVERY_SECONDS}
        min={0.1}
        max={RING_MAX_EVERY_SECONDS}
        step={SLIDER_STEP_SECONDS}
        format={secondsText}
        disabled={locked}
        onchange={(every) => setRing({ every })}
      />
      {#if songBeat !== null}
        <PanelButton
          disabled={locked || ring.every === undefined}
          onclick={useSongBeat}
        >
          {t("post_editor_card_ring_song_beat")}
        </PanelButton>
      {:else}
        <p class="hint">{t("post_editor_card_ring_no_beat")}</p>
      {/if}
      <ValueSlider
        label={t("post_editor_card_ring_late")}
        value={ring.late ?? CARD_RING_LATE_SECONDS}
        min={0}
        max={RING_MAX_LATE_SECONDS}
        step={SLIDER_STEP_SECONDS}
        format={secondsText}
        disabled={locked}
        onchange={(late) => setRing({ late })}
      />
    </div>
  {/if}

  <span class="readout-name">{t("post_editor_card_qr_exit")}</span>
  <SegmentedControl
    color="accent"
    options={[
      { value: "off", label: t("post_editor_card_off"), disabled: locked },
      { value: "on", label: t("post_editor_card_on"), disabled: locked },
    ]}
    value={item.qrExit ? "on" : "off"}
    onchange={(value) =>
      patch({ qrExit: value === "on" ? { at: playheadIn() } : null })}
    ariaLabel={t("post_editor_card_qr_exit")}
  />
  {#if item.qrExit && landing}
    {@const qrExit = item.qrExit}
    <div class="group" transition:growFade>
      <p class="hint">{t("post_editor_card_qr_hint")}</p>
      <ValueSlider
        label={t("post_editor_card_qr_at")}
        value={qrExit.at}
        min={0}
        max={item.duration}
        step={SLIDER_STEP_SECONDS}
        format={secondsText}
        disabled={locked}
        onchange={(at) => setQr({ at })}
      />
      <PanelButton
        disabled={locked}
        onclick={() => setQr({ at: playheadIn() })}
      >
        {t("post_editor_card_set_to_playhead")}
      </PanelButton>
      <ValueSlider
        label={t("post_editor_card_qr_takes")}
        value={qrExit.seconds ?? CARD_QR_EXIT_SECONDS}
        min={QR_MIN_TAKES_SECONDS}
        max={QR_MAX_TAKES_SECONDS}
        step={SLIDER_STEP_SECONDS}
        format={secondsText}
        disabled={locked}
        onchange={(seconds) => setQr({ seconds })}
      />
      <ValueSlider
        label={t("post_editor_card_qr_size")}
        value={landing.width}
        min={QR_MIN_LANDING_WIDTH}
        max={1}
        step={SLIDER_STEP_SHARE}
        format={percent}
        disabled={locked}
        onchange={(width) => setLanding({ width })}
      />
      <ValueSlider
        label={t("post_editor_card_qr_left")}
        value={landing.x}
        min={0}
        max={Math.max(0, 1 - landing.width)}
        step={SLIDER_STEP_SHARE}
        format={percent}
        disabled={locked}
        onchange={(x) => setLanding({ x })}
      />
      <ValueSlider
        label={t("post_editor_card_qr_top")}
        value={landing.y}
        min={0}
        max={Math.max(0, 1 - landing.height)}
        step={SLIDER_STEP_SHARE}
        format={percent}
        disabled={locked}
        onchange={(y) => setLanding({ y })}
      />
      <span class="readout-name">{t("post_editor_card_qr_caption")}</span>
      {#key item.id}
        <input
          class="field"
          value={qrExit.caption ?? ""}
          placeholder={t("post_editor_card_qr_caption_placeholder")}
          maxlength={CARD_QR_MAX_CAPTION_LENGTH}
          aria-label={t("post_editor_card_qr_caption")}
          disabled={locked}
          onchange={(event) => {
            const caption = event.currentTarget.value.trim();
            const { caption: _old, ...rest } = qrExit;
            patch({ qrExit: caption ? { ...rest, caption } : rest });
          }}
        />
      {/key}
      {#if qrExit.caption}
        <span class="readout-name">{t("post_editor_card_qr_caption_face")}</span>
        <SegmentedControl
          color="accent"
          options={[
            {
              value: "serif",
              label: t("post_editor_card_qr_caption_serif"),
              disabled: locked,
            },
            {
              value: "sans",
              label: t("post_editor_card_qr_caption_sans"),
              disabled: locked,
            },
          ]}
          value={qrExit.captionFace ?? "serif"}
          onchange={(value) =>
            setQr({ captionFace: value === "sans" ? "sans" : "serif" })}
          ariaLabel={t("post_editor_card_qr_caption_face")}
        />
        <ValueSlider
          label={t("post_editor_card_qr_caption_size")}
          value={qrExit.captionSize ?? CARD_QR_CAPTION_SIZE}
          min={CARD_QR_CAPTION_MIN_SIZE}
          max={CARD_QR_CAPTION_MAX_SIZE}
          step={0.005}
          format={percent}
          disabled={locked}
          onchange={(captionSize) => setQr({ captionSize })}
        />
      {/if}
      <span class="readout-name">{t("post_editor_card_qr_plate")}</span>
      <SegmentedControl
        color="accent"
        options={[
          { value: "on", label: t("post_editor_card_on"), disabled: locked },
          { value: "off", label: t("post_editor_card_off"), disabled: locked },
        ]}
        value={qrExit.plate === false ? "off" : "on"}
        onchange={(value) => {
          const { plate: _plate, ...rest } = qrExit;
          patch({ qrExit: value === "off" ? { ...rest, plate: false } : rest });
        }}
        ariaLabel={t("post_editor_card_qr_plate")}
      />
      <span class="readout-name">{t("post_editor_card_qr_backdrop")}</span>
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "clear",
            label: t("post_editor_card_qr_backdrop_clear"),
            disabled: locked,
          },
          {
            value: "black",
            label: t("post_editor_card_qr_backdrop_black"),
            disabled: locked,
          },
        ]}
        value={qrExit.backdrop ?? "clear"}
        onchange={(value) => {
          const { backdrop: _backdrop, ...rest } = qrExit;
          patch({
            qrExit: value === "black" ? { ...rest, backdrop: "black" } : rest,
          });
        }}
        ariaLabel={t("post_editor_card_qr_backdrop")}
      />
    </div>
  {/if}

  <span class="readout-name">{t("post_editor_card_title")}</span>
  <SegmentedControl
    color="accent"
    options={[
      {
        value: "card",
        label: t("post_editor_card_title_card"),
        disabled: locked,
      },
      {
        value: "clip",
        label: t("post_editor_card_title_clip"),
        disabled: locked,
      },
    ]}
    value={item.headerTitle ?? "card"}
    onchange={(value) =>
      patch({ headerTitle: value === "clip" ? "clip" : "card" })}
    ariaLabel={t("post_editor_card_title")}
  />
</div>

<style>
  .card-ending,
  .group {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .readout-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
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
    font-size: var(--font-size-base);
  }

  .field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  .field:disabled {
    opacity: 0.5;
  }
</style>
