<script lang="ts" module>
  /** The line's height on a phone. The loading frames hold the same room. */
  export const COMPOSER_DOOR_LINE_HEIGHT = 38;
</script>

<script lang="ts">
  /**
   * The line under the viewer header that names what made this sequence and
   * opens it there: "Made with Flow Arts Composer · Make your own ›". Shown to
   * a visitor who arrived from outside the app (a card scan or a shared link),
   * whose only other door used to be a bare pencil icon. The whole line is
   * one control. "Flow Arts Composer" is the product name: never translated.
   */
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { growFade, reducedMotion } from "#lib/shared/transitions/motion.js";
  import { composerIntent } from "#lib/shared/landing/services/composer-prefetch.js";

  let { onOpen }: { onOpen: () => void } = $props();

  const PRODUCT = "Flow Arts Composer";
  // The catalog places the name (word order differs by language); split
  // around it so the name alone is set in bold.
  const MARK = "\u2063";
  const madeWith = $derived(
    t("viewer_door_made_with", { product: MARK }).split(MARK)
  );
</script>

<button
  type="button"
  class="composer-door-line"
  style:--composer-door-line-height="{COMPOSER_DOOR_LINE_HEIGHT}px"
  onclick={onOpen}
  use:composerIntent
  aria-label={t("viewer_door_aria", { product: PRODUCT })}
  data-testid="composer-door-line"
  transition:growFade|global={{
    duration: reducedMotion() ? 0 : DURATION.emphasis,
  }}
>
  <span class="made-with"
    >{madeWith[0]}<strong>{PRODUCT}</strong>{madeWith[1] ?? ""}</span
  >
  <span class="make-your-own"
    >{t("viewer_door_make_your_own")}<span class="chevron" aria-hidden="true">›</span></span
  >
</button>

<style>
  .composer-door-line {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    height: var(--composer-door-line-height);
    /* The global 44px button floor would make it taller than the room the
       loading frames hold; the full-width line is an easy target at 38. */
    min-height: var(--composer-door-line-height);
    padding: 0 12px;
    border: none;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 8%,
      var(--theme-panel-bg, rgba(8, 10, 16, 0.96))
    );
    color: var(--theme-text, #ffffff);
    font: inherit;
    font-size: var(--font-size-min);
    line-height: 1;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--duration-normal) var(--ease-standard);
  }

  .composer-door-line:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 16%,
      var(--theme-panel-bg, rgba(8, 10, 16, 0.96))
    );
  }

  .composer-door-line:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  .made-with {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }

  .made-with strong {
    color: var(--theme-text, #ffffff);
    font-weight: 600;
  }

  .chevron {
    margin-inline-start: 0.3em;
  }

  .make-your-own {
    flex-shrink: 0;
    color: color-mix(in srgb, var(--theme-accent, #8b5cf6) 55%, #ffffff);
    font-weight: 600;
  }
</style>
