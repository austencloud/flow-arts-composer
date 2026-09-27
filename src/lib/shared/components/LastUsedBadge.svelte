<!--
  LastUsedBadge.svelte — device-local previous-choice marker.

  Pinned to the host control's top-right corner and taken out of flow, so
  showing it can never resize or shove the control it marks. The host sets
  `position: relative` and reserves the small top-edge overhang.

  Display-only, never interactive: this is a badge, not a chip, so it stays
  out of the FilterChipBase/SegmentedControl routing.

  aria-hidden because the same information belongs in the host control's
  accessible name (for example, "Generate, last used on this device").

  The `label` override lets the Create front door use the same corner mark
  for its "Free account" methods; that meaning also goes in the accessible
  name.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  interface Props {
    /** Override the label. Defaults to "Last used". */
    label?: string;
  }

  let { label }: Props = $props();
</script>

<span class="last-used-badge" aria-hidden="true"
  >{label ?? t("create_ui_last_used")}</span
>

<style>
  .last-used-badge {
    --badge-accent: var(--last-used-badge-accent, var(--theme-accent, #7c6af7));

    position: absolute;
    top: 0;
    right: 0.625rem;
    z-index: 1;
    pointer-events: none;

    padding: 0.0625rem 0.5rem;
    border-radius: 999px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;

    background: color-mix(
      in srgb,
      var(--badge-accent) 26%,
      var(--theme-panel-bg, #12121c)
    );
    color: color-mix(in srgb, var(--badge-accent) 25%, #fff);
    border: 1px solid color-mix(in srgb, var(--badge-accent) 55%, transparent);
    box-shadow:
      0 0 0 0.25rem
        color-mix(in srgb, var(--theme-panel-bg, #12121c) 70%, transparent),
      0 2px 8px color-mix(in srgb, var(--badge-accent) 28%, transparent);

    translate: 0 -50%;
    opacity: 1;
    transition:
      opacity var(--duration-normal, 200ms) ease,
      translate var(--duration-normal, 200ms) cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @starting-style {
    .last-used-badge {
      opacity: 0;
      translate: 0 -20%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .last-used-badge {
      transition: none;
    }
  }
</style>
