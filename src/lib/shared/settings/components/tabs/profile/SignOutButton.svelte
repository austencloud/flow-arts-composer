<!-- Account settings' Sign out button. The wide hero puts it beside the
     signed-in status; the phone frame gives it a full-width row of its own at
     the bottom of the landing (`block`). -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    onSignOut: () => void;
    /** Full width, 48 px tall: the phone frame's own bottom row. */
    block?: boolean;
  }

  let { onSignOut, block = false }: Props = $props();
</script>

<button type="button" class="sign-out-btn" class:block onclick={onSignOut}>
  <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
  <span>{t("settings_sign_out")}</span>
</button>

<style>
  .sign-out-btn {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.55em;
    padding: 0.7em 1em;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 0.7em;
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .sign-out-btn.block {
    width: 100%;
    height: 48px;
    min-height: 48px;
    padding-block: 0;
  }

  .sign-out-btn:hover {
    border-color: color-mix(in srgb, var(--semantic-error) 45%, transparent);
    color: color-mix(in srgb, var(--semantic-error) 85%, var(--theme-text));
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    transform: translateY(-1px);
  }

  .sign-out-btn:active {
    transform: scale(0.98);
  }

  .sign-out-btn:focus-visible {
    outline: 3px solid var(--theme-accent-text, var(--theme-accent));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .sign-out-btn {
      transition: none;
    }

    .sign-out-btn:hover,
    .sign-out-btn:active {
      transform: none;
    }
  }
</style>
