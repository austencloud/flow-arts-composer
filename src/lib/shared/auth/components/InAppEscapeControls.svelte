<script lang="ts">
  /**
   * The escape machinery, target-driven and inline.
   *
   * Extracted from the old InAppBrowserPrompt full-screen sheet so it has one
   * home instead of two. Given an EscapeTarget (from the detector's resolver),
   * it renders the right button/guide/copy for this platform and launch state,
   * fires the scheme or intent, watches for the hand-off, and falls back to a
   * pointed guide plus a copy control that reports its real outcome.
   *
   * Design: docs/superpowers/specs/2026-07-22-kill-the-bar-app-forward-design.md
   */
  import { onDestroy } from "svelte";
  import type { EscapeTarget } from "../services/escape-target";
  import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
  import { stripEscapeTestParams } from "../config/app-availability";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  /** Immutable attempt context, so every escape event carries the same segmenting
   *  properties (platform / ios_major / app_launched) instead of just `method`. */
  interface EscapeContext {
    platform: string;
    ios_major: number | null;
    app_launched: boolean;
  }

  let {
    target,
    route,
    context,
  }: { target: EscapeTarget; route: string; context: EscapeContext } = $props();

  const eventBase = $derived({ ...context, method: target.method, route });

  /**
   * "waiting" is the 1500ms window after firing; "stayed" means it closed with
   * the page still visible, so nothing handled the scheme and the guide + copy
   * are the way out.
   */
  let escapeState = $state<"idle" | "waiting" | "stayed">("idle");
  let copied = $state(false);
  let copyFailed = $state(false);

  // The link to copy — test params stripped so a shared link never carries
  // ?forceIAB / ?appLaunched to another browser.
  const currentUrl =
    typeof window !== "undefined"
      ? stripEscapeTestParams(window.location.href)
      : "";

  // Nothing is removed mid-flow — that collapse-then-re-expand was the double
  // layout shift. The primary button stays put (relabeled "Opening…" while
  // waiting); the guide is present for instruction targets and expands BELOW the
  // buttons on a scheme/intent attempt, so the controls above it never move; and
  // copy is always available.
  const showPrimary = $derived(target.url !== null);
  const primaryDisabled = $derived(escapeState === "waiting");
  const targetLabel = $derived(
    target.label === "Open in Safari"
      ? t("auth_open_safari")
      : target.label === "Open in your browser"
        ? t("auth_open_your_browser")
        : target.label === "Open in the app"
          ? t("auth_open_app")
          : target.label === "Open in browser"
            ? t("auth_open_browser")
            : target.label
  );
  const primaryLabel = $derived(
    escapeState === "waiting" ? t("auth_opening") : targetLabel
  );
  // Instruction targets show the guide immediately; scheme/intent targets show
  // it only once the hand-off is confirmed failed (stayed). Either way copy is
  // always present, and the primary button stays put, so nothing collapses.
  const showGuide = $derived(target.url === null || escapeState === "stayed");
  const showCopy = true;

  //
  // This records a hand-off SIGNAL, not a success rate. Document visibility is
  // not the same as the browser opening: Home pressed mid-attempt looks like a
  // hand-off, and a slow hand-off looks like a stay. So we log the raw signal
  // plus elapsed time and let analysis infer success — and we keep listening
  // after the timeout in case the hand-off simply lands late.

  let escapeTimer: ReturnType<typeof setTimeout> | null = null;
  let watching = false;
  let attemptStartedAt = 0;

  function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : 0;
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") recordSignal("hidden");
  }
  function onPageHide() {
    recordSignal("pagehide");
  }

  function clearEscapeWatch() {
    if (escapeTimer !== null) {
      clearTimeout(escapeTimer);
      escapeTimer = null;
    }
    if (watching) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      watching = false;
    }
  }

  function recordSignal(signal: "hidden" | "pagehide" | "timeout") {
    const elapsed = Math.round(nowMs() - attemptStartedAt);

    if (signal === "timeout") {
      if (escapeState !== "waiting") return;
      // Reveal the fallback but keep listening — a hand-off can still land late.
      escapeState = "stayed";
      captureEvent("inapp_browser_escape_signal", {
        ...eventBase,
        signal: "timeout",
        phase: "timeout",
        elapsed_ms: elapsed,
      });
      return;
    }

    // A visibility/pagehide signal. If it lands after the timeout already
    // flipped us to "stayed", it still proves the escape eventually worked —
    // record it as a late hand-off. sendBeacon so a teardown during pagehide
    // (the success branch, most likely to be lost to normal batching) survives.
    const phase = escapeState === "waiting" ? "handoff" : "late";
    if (escapeState === "waiting") escapeState = "idle";
    clearEscapeWatch();
    captureEvent(
      "inapp_browser_escape_signal",
      { ...eventBase, signal, phase, elapsed_ms: elapsed },
      { transport: "sendBeacon" }
    );
  }

  function handleEscape() {
    copyFailed = false;
    captureEvent("inapp_browser_escape_attempted", eventBase);
    if (target.isAppTarget) {
      captureEvent("inapp_get_app_clicked", eventBase);
    }

    if (target.url === null) return; // guide-only methods have nothing to fire

    attemptStartedAt = nowMs();
    escapeState = "waiting";
    clearEscapeWatch();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    watching = true;
    escapeTimer = setTimeout(() => recordSignal("timeout"), 1500);

    window.location.href = target.url;
  }

  onDestroy(clearEscapeWatch);

  // --- Copy (reports its real outcome; see the design's "button that lied") --

  async function handleCopyUrl() {
    const viaApi = await copyViaClipboardApi();
    const viaSelection = viaApi ? false : copyViaSelection();
    const ok = viaApi || viaSelection;

    copied = ok;
    copyFailed = !ok;

    captureEvent("inapp_browser_link_copied", {
      path: viaApi ? "clipboard_api" : viaSelection ? "selection" : "manual",
      success: ok,
      route,
    });

    if (ok) setTimeout(() => (copied = false), 2000);
  }

  async function copyViaClipboardApi(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(currentUrl);
      return true;
    } catch {
      return false;
    }
  }

  // Focus + select the manual field the moment it's revealed, so a long-press
  // "Copy" callout is one tap away instead of requiring the user to tap in first.
  function autoselect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function copyViaSelection(): boolean {
    const field = document.createElement("textarea");
    field.value = currentUrl;
    field.setAttribute("readonly", "");
    field.style.cssText =
      "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none;";
    document.body.appendChild(field);
    try {
      field.select();
      field.setSelectionRange(0, currentUrl.length);
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(field);
    }
  }
</script>

<div class="escape-controls">
  {#if showPrimary}
    <button
      class="primary-button"
      onclick={handleEscape}
      disabled={primaryDisabled}
    >
      <i class="fas fa-external-link-alt" aria-hidden="true"></i>
      {primaryLabel}
    </button>
  {/if}

  {#if showGuide}
    {#if target.method === "android_intent"}
      <p class="status">
        {t("auth_escape_chrome_fallback")}
      </p>
    {:else if target.method === "ios_scheme" || target.method === "ios_instructions"}
      <ol class="guide">
        <li>
          {t("auth_escape_tap_menu")} <strong>•••</strong>
          {t("auth_escape_menu_location")}
        </li>
        <li>
          {t("auth_escape_choose")} <strong>{t("auth_open_safari")}</strong>
          {t("auth_escape_or")} <strong>{t("auth_open_browser")}</strong>
        </li>
      </ol>
    {:else}
      <ol class="guide">
        <li>{t("auth_escape_open_app_menu")}</li>
        <li>
          {t("auth_escape_choose")} <strong>{t("auth_open_browser")}</strong>{t(
            "auth_escape_or_copy"
          )}
        </li>
      </ol>
    {/if}
  {/if}

  {#if showCopy}
    <button class="copy-button" onclick={handleCopyUrl}>
      <i
        class="fas fa-{copied ? 'check' : copyFailed ? 'hand-pointer' : 'copy'}"
        aria-hidden="true"
      ></i>
      {copied
        ? t("auth_link_copied")
        : copyFailed
          ? t("auth_copy_manually")
          : t("auth_copy_link")}
    </button>
  {/if}

  {#if copyFailed}
    <!-- Every programmatic path is blocked in this webview; hand over a field to
         long-press. use:autoselect focuses AND selects it on reveal so the copy
         callout is one tap away (the onfocus select is the fallback). -->
    <input
      class="manual-copy"
      type="text"
      readonly
      value={currentUrl}
      aria-label={t("auth_link_hold_to_copy")}
      use:autoselect
      onfocus={(e) => e.currentTarget.select()}
    />
    <p class="status" aria-live="polite">{t("auth_copy_failed_hold")}</p>
  {/if}
</div>

<style>
  .escape-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .primary-button,
  .copy-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
    transition:
      transform 0.1s,
      opacity 0.15s;
  }

  .primary-button:active,
  .copy-button:active {
    transform: scale(0.98);
  }

  .primary-button:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .primary-button {
    border: none;
    /* Darker stops than the brand blue/green: white text needs 4.5:1 (WCAG AA)
       and #4285f4/#34a853 measured ~3.1–3.6:1. These pass across the gradient. */
    background: linear-gradient(135deg, #1a56db, #177245);
    color: white;
  }

  .primary-button:hover {
    opacity: 0.9;
  }

  .copy-button {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .copy-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
  }

  .status {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .guide {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    text-align: left;
  }

  .manual-copy {
    width: 100%;
    padding: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-accent, #6366f1);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    text-align: center;
    /* 16px floor stops iOS zooming the viewport when the field takes focus. */
    font-size: max(0.875rem, 16px);
  }

  @media (prefers-reduced-motion: reduce) {
    .primary-button:active,
    .copy-button:active {
      transform: none;
    }
  }
</style>
