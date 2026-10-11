<!--
  ExportTakeover.svelte — the ONE blocking overlay for every export/recording.

  Owner of the "an export is running, the app is unavailable" capability.
  Composed on top of `BaseModal` (native <dialog>.showModal()), which supplies
  the modality guarantees this overlay used to lack:

  - top-layer rendering, so pointer events cannot reach the app underneath
    (previously `position: absolute; inset: 0` only covered the host pane)
  - native focus containment plus BaseModal's FocusRestore on close
  - `data-keyboard-shortcuts-ignore` on the dialog root, which the app's
    keyboard registry honours — so app shortcuts stop firing during an export
  - modal-stack registration and reduced-motion handling from modal-tokens.css

  The dialog itself is styled transparent + full-viewport here so the existing
  scrim / centerpiece / panel composition is preserved exactly.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import type { ExportPhase } from "#lib/shared/compose/domain/video-export-types.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";

  interface Props {
    phase: ExportPhase;
    /** 0..1 */
    progress: number;
    phaseLabel: string;
    error?: string | null;
    onCancel?: () => void;
    onRetry?: () => void;
    /**
     * Some surfaces genuinely cannot abort mid-flight (a single synchronous
     * canvas encode, a browser-owned save dialog). Pass the reason and the
     * Cancel affordance renders disabled with an explanation instead of a
     * button that lies about what it will do.
     */
    cancelDisabledReason?: string | null;
    /** Accessible name for the modal. Defaults to a generic export label. */
    label?: string;
    /** Opaque background (Mandala) vs dim scrim over the live canvas (animation). */
    opaque?: boolean;
    /** Optional hero behind the panel (Mandala passes its SequenceMandala). */
    centerpiece?: Snippet;
    /** Optional header inside the panel, above the ring — e.g. the sequence word.
     *  The live canvas (and its own word header) is hidden behind the scrim during
     *  export, so consumers can surface the word here next to the progress ring. */
    title?: Snippet;
  }

  let {
    phase,
    progress,
    phaseLabel,
    error = null,
    onCancel,
    onRetry,
    cancelDisabledReason = null,
    label,
    opaque = false,
    centerpiece,
    title,
  }: Props = $props();

  const pct = $derived(Math.round(Math.max(0, Math.min(1, progress)) * 100));

  const isOpen = $derived(phase !== "idle");

  /** Cancel is offered only while work is actually in flight AND abortable. */
  const canCancel = $derived(
    !!onCancel && phase !== "complete" && phase !== "error" && !cancelDisabledReason,
  );

  // beforeunload guard — block accidental navigation while exporting.
  $effect(() => {
    if (phase === "idle" || phase === "complete") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  });

  // Escape maps to Cancel when the surface can actually abort. BaseModal is told
  // `closeOnEscape={false}` so it never self-closes behind the export's back —
  // the export state owns `phase`, and only a real cancel may change it.
  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen || event.key !== "Escape" || event.defaultPrevented) return;
    if (!canCancel) return;
    event.preventDefault();
    onCancel?.();
  }

  const headingId = `export-takeover-title-${Math.random().toString(36).slice(2, 9)}`;
  const dialogLabel = $derived(
    label ?? (phase === "error" ? t('export_failed') : t('export_app_locked')),
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<BaseModal
  open={isOpen}
  closeOnBackdrop={false}
  closeOnEscape={false}
  restoreFocus={true}
  animation="none"
  size="full"
  class="export-takeover-modal"
  labelledBy={headingId}
>
  <div class="export-takeover" class:opaque>
    <h2 id={headingId} class="sr-only">{dialogLabel}</h2>

    {#if centerpiece}
      <div class="takeover-stage">{@render centerpiece()}</div>
    {/if}

    <div class="takeover-panel">
      {#if title}
        <div class="takeover-title">{@render title()}</div>
      {/if}
      {#if phase === "error"}
        <p class="takeover-msg error" role="alert">
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> {t('export_failed')}
        </p>
        <p class="takeover-sub">{error}</p>
        <div class="takeover-actions">
          {#if onCancel}<button class="takeover-btn ghost" onclick={onCancel}>{t('action_close')}</button>{/if}
          {#if onRetry}<button class="takeover-btn primary" onclick={onRetry}>{t('action_retry')}</button>{/if}
        </div>
      {:else}
        <div
          class="ring"
          style={`background: conic-gradient(from -90deg, #3575E2 0%, #ED1C24 ${pct}%, var(--theme-stroke, rgba(255,255,255,0.12)) ${pct}%);`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="{t('viewer_ui_export_progress')}"
        >
          <div class="ring-hole">
            <span class="ring-pct">{pct}<small>%</small></span>
          </div>
        </div>
        <p class="takeover-phase" aria-live="polite" aria-atomic="true">{phaseLabel}</p>
        <p class="takeover-msg">{t('export_stay_here')}</p>
        {#if phase !== "complete" && onCancel}
          <button
            class="takeover-btn ghost"
            data-testid="export-takeover-cancel"
            disabled={!canCancel}
            aria-describedby={cancelDisabledReason ? `${headingId}-cancel-note` : undefined}
            onclick={onCancel}>{t('action_cancel')}</button
          >
          {#if cancelDisabledReason}
            <p class="takeover-sub" id={`${headingId}-cancel-note`}>{cancelDisabledReason}</p>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
</BaseModal>

<style>
  /* The dialog is only a modality shell here — the scrim below is the visual. */
  :global(dialog.base-modal.export-takeover-modal) {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    background: transparent;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  :global(dialog.base-modal.export-takeover-modal::backdrop) {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  :global(dialog.base-modal.export-takeover-modal .modal-body) {
    overflow: hidden;
    height: 100%;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .export-takeover {
    /* The dialog is already modal the instant it opens — blocking never waits
       on a transition. Only the scrim's paint eases in, and only when the
       viewer has not asked for reduced motion. */
    opacity: 0;
    transition: opacity 200ms ease;
    position: absolute;
    inset: 0;
    z-index: var(--z-overlay, 500);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 24px;
    /* Dim scrim by default — the live canvas keeps playing underneath. */
    background: rgba(7, 7, 15, 0.78);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  :global(dialog.base-modal.export-takeover-modal[data-entered="true"]) .export-takeover {
    opacity: 1;
  }

  .export-takeover.opaque {
    background: #07070f;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  /* The hero (Mandala) fills the takeover and is taken out of flow so the
     progress panel centers over it — no column-stack that would crop the
     mandala at the top. */
  .takeover-stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 0;
  }
  .takeover-title {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-bottom: 2px;
  }
  .takeover-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: 100%;
    max-width: 320px;
    text-align: center;
    padding: 24px;
    border-radius: var(--modal-border-radius, 20px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    box-shadow:
      0 25px 80px rgba(0, 0, 0, 0.5),
      0 10px 30px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 var(--theme-stroke-strong, rgba(255, 255, 255, 0.1)),
      0 0 48px var(--theme-accent-glow, color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent));
  }
  .ring {
    width: 104px;
    height: 104px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    transition: background 180ms ease;
  }
  .ring-hole {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    display: grid;
    place-items: center;
  }
  .ring-pct {
    font-size: 26px;
    font-weight: 800;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .ring-pct small { font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.65); margin-left: 1px; }
  .takeover-phase {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
    /* Reserve width for the widest phase so the box never reflows neighbors. */
    min-width: 11ch;
  }
  .takeover-msg {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }
  .takeover-msg.error { color: #fca5a5; font-weight: 600; font-size: 15px; }
  .takeover-sub {
    margin: 0;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    word-break: break-word;
  }
  .takeover-actions { display: flex; gap: 10px; }
  .takeover-btn {
    min-height: 44px;
    min-width: 48px;
    padding: 8px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), background 200ms ease, border-color 200ms ease;
  }
  .takeover-btn:active { transform: scale(0.95); }
  .takeover-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .takeover-btn:disabled:active { transform: none; }
  .takeover-btn.ghost {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }
  .takeover-btn.primary {
    border: 1px solid color-mix(in srgb, var(--theme-accent, #6366f1) 70%, transparent);
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 35%, var(--theme-card-bg, rgba(0, 0, 0, 0.4)));
    color: white;
  }
  @media (hover: hover) {
    .takeover-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 6px 18px color-mix(in srgb, var(--theme-accent, #6366f1) 35%, transparent); }
    .takeover-btn.ghost:not(:disabled):hover { border-color: var(--theme-text-dim, rgba(255, 255, 255, 0.4)); color: var(--theme-text, #fff); }
  }
  @media (prefers-reduced-motion: reduce) {
    .export-takeover { transition: none; }
    .ring { transition: none; }
    .takeover-btn:active { transform: none; }
  }
</style>
