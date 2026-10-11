<script lang="ts">
  import { onDestroy } from "svelte";
  import { DropdownMenu } from "bits-ui";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { BackgroundType } from "@austencloud/backgrounds";
  import { getCardMetadata } from "@austencloud/backgrounds/card";
  import { ANIMATED_BACKGROUNDS } from "#lib/shared/settings/utils/public-page-backgrounds.js";
  import { marketingBackground } from "#lib/shared/landing/state/marketing-background-state.svelte.js";

  let open = $state(false);
  const active = $derived(marketingBackground.type);
  const backgrounds = ANIMATED_BACKGROUNDS.map((background) => ({
    ...background,
    card: getCardMetadata(background.type),
  }));
  const current = $derived(
    backgrounds.find((background) => background.type === active) ??
      backgrounds[0]
  );

  function asButtonAttributes(props: unknown): HTMLButtonAttributes {
    return props as HTMLButtonAttributes;
  }

  function select(type: BackgroundType): void {
    marketingBackground.set(type);
  }

  // This is a visit-local art direction choice. Leaving Composer restores the
  // default marketing environment and never writes a settings preference.
  onDestroy(() => marketingBackground.reset());
</script>

<div class="bg-cycle">
  <DropdownMenu.Root {open} onOpenChange={(nextOpen) => (open = nextOpen)}>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        {@const triggerProps = asButtonAttributes(props)}
        <button
          {...triggerProps}
          type="button"
          class="theme-trigger"
          title={`Theme: ${current.label}`}
        >
          <span class="theme-label">Theme:</span>
          <i class="fas {current.icon}" aria-hidden="true"></i>
          <span class="theme-value">{current.label}</span>
          <i class="fas fa-chevron-down theme-chevron" aria-hidden="true"></i>
        </button>
      {/snippet}
    </DropdownMenu.Trigger>

    <DropdownMenu.Portal>
      <DropdownMenu.Content
        side="bottom"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        class="composer-theme-menu"
        aria-label="Choose page theme"
      >
        {#each backgrounds as background (background.type)}
          <DropdownMenu.Item
            class={background.type === active
              ? "composer-theme-option active"
              : "composer-theme-option"}
            style={`--card-accent: ${background.card?.accentColor ?? "#8b8cff"}; --card-gradient: ${background.card?.gradient ?? "linear-gradient(145deg, #25253a, #101018)"};`}
            data-theme={background.type}
            textValue={background.label}
            onSelect={() => select(background.type)}
          >
            <span class="theme-name">
              <span class="theme-icon" aria-hidden="true">
                {@html background.card?.iconSvg ?? ""}
              </span>
              {background.label}
            </span>
            {#if background.type === active}
              <i class="fas fa-check" aria-hidden="true"></i>
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>

<style>
  .theme-trigger {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 48px);
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.05));
    color: var(--theme-text, #fff);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
  }

  .bg-cycle {
    display: flex;
    justify-content: center;
    min-height: var(--min-touch-target, 48px);
  }

  .theme-trigger:hover {
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.22));
    background: var(--theme-card-hover-bg, rgb(255 255 255 / 0.08));
  }

  .theme-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  .theme-label {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    font-weight: 500;
  }

  .theme-chevron {
    font-size: 0.7em;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
  }

  /* The hero toolbar (SequenceHeroDemo's .toolbar-row) is the hero-toolbar
     container. Where it is too narrow for Roll, the prop chooser and this
     chip with its words, the words leave the screen but stay in the
     accessible name, and the chip is its icon and chevron. */
  @container hero-toolbar (max-width: 27rem) {
    .theme-label,
    .theme-value {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  :global(.composer-theme-menu) {
    z-index: var(--z-dropdown, 1000);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: min(25rem, calc(100vw - 24px));
    box-sizing: border-box;
    max-height: min(
      31rem,
      calc(100dvh - 24px),
      var(--bits-dropdown-menu-content-available-height, 100dvh)
    );
    gap: 0.45rem;
    padding: 4px;
    border: 1px solid var(--theme-stroke-strong, rgb(255 255 255 / 0.2));
    border-radius: var(--settings-radius-lg, 0.85rem);
    overflow-y: auto;
    background: var(--theme-panel-bg, #12121a);
    outline: none;
  }

  :global(.composer-theme-option) {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1.25rem;
    align-items: center;
    min-height: 5.25rem;
    overflow: hidden;
    padding: 0.65rem;
    border-radius: 0.6rem;
    border: 1px solid rgb(255 255 255 / 0.08);
    background: var(--card-gradient);
    color: var(--theme-text, #fff);
    cursor: pointer;
    font-size: var(--font-size-min, 0.875rem);
    outline: none;
    user-select: none;
  }

  :global(.composer-theme-option[data-highlighted]),
  :global(.composer-theme-option.active) {
    border-color: color-mix(in srgb, var(--card-accent) 78%, white 10%);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--card-accent) 42%, transparent);
  }

  :global(.composer-theme-option > i:last-child) {
    z-index: 1;
    color: color-mix(in srgb, var(--card-accent) 78%, white);
    text-align: right;
  }

  :global(.theme-name) {
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 650;
    text-shadow: 0 1px 0.8rem rgb(0 0 0 / 0.8);
  }

  :global(.theme-icon) {
    display: grid;
    width: 1.2rem;
    place-items: center;
    color: color-mix(in srgb, var(--card-accent) 78%, white);
  }

  :global(.theme-icon svg) {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentcolor;
  }

  @media (max-width: 26rem) {
    :global(.composer-theme-menu) {
      grid-template-columns: 1fr;
    }
  }
</style>
