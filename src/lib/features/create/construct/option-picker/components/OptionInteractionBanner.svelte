<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  const { onDismiss } = $props<{ onDismiss: () => void }>();
</script>

<aside
  class="option-interaction-banner"
  aria-label={t("create_ui_option_controls")}
>
  <span class="banner-copy">
    <strong>{t("create_ui_tap_to_add")}</strong>
    <span>{t("create_ui_hold_to_preview")}</span>
  </span>
  <button
    type="button"
    onclick={onDismiss}
    aria-label={t("create_ui_dismiss_option_hint")}
  >
    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
  </button>
</aside>

<style>
  .option-interaction-banner {
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: calc((100% - var(--min-touch-target, 48px)) / 2);
    box-sizing: border-box;
    width: min(21rem, calc(100cqw - 7.5rem));
    min-height: var(--min-touch-target, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.45rem 3rem 0.45rem 0.8rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent) 58%, var(--theme-stroke));
    border-radius: 999px;
    background: var(--theme-card-bg, #10141d);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--theme-accent) 14%, transparent),
      0 0.65rem 1.6rem -0.65rem rgba(0, 0, 0, 0.78);
    color: var(--theme-text);
    pointer-events: none;
    transform: translateX(-50%);
    animation: banner-enter var(--duration-normal) var(--ease-out) both;
  }

  .banner-copy {
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    line-height: 1.15;
    white-space: nowrap;
  }

  .banner-copy strong {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
  }

  .banner-copy > span {
    color: color-mix(in srgb, var(--theme-text) 74%, var(--theme-panel-bg));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  button {
    position: absolute;
    top: 50%;
    right: 0.2rem;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--theme-text) 16%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-panel-bg) 76%, transparent);
    color: color-mix(in srgb, var(--theme-text) 74%, var(--theme-panel-bg));
    cursor: pointer;
    pointer-events: auto;
    transform: translateY(-50%);
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  button:hover {
    border-color: color-mix(in srgb, var(--theme-accent) 48%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 18%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @container button-panel (min-width: 480px) {
    .banner-copy {
      display: flex;
      align-items: baseline;
      gap: 0.55rem;
    }

    .banner-copy strong::after {
      margin-left: 0.55rem;
      color: color-mix(in srgb, var(--theme-text) 38%, transparent);
      content: "·";
    }

    .banner-copy > span {
      font-size: var(--font-size-min, 0.875rem);
    }
  }

  @keyframes banner-enter {
    from {
      opacity: 0;
      transform: translate(-50%, 0.75rem) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .option-interaction-banner {
      animation: none;
    }

    button {
      transition: none;
    }
  }
</style>
