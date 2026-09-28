<!--
  LinkChip is the one way a link looks on this site: a pill with an arrow that
  says where it goes. Austen scans a page for things that look pressable, so a
  link is never underlined or colored text.

  `size="md"` is a standalone link (reading lists, sources, "open this" beside
  a figure) with a full touch target. `size="inline"` is a mention inside a
  sentence; it keeps the line's height and reads as a small pill in the text.

  The arrow follows the destination: right for another page, down for a place
  further down this page (`#...`), and out of the box for another site, which
  also opens in a new tab and names that to screen readers.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";

  type Props = Omit<HTMLAnchorAttributes, "href" | "children"> & {
    href: string;
    children: Snippet;
    size?: "md" | "inline";
    /** Screen-reader phrase for a link that opens a new tab. */
    newTabLabel?: string;
    class?: string;
  };

  let {
    href,
    children,
    size = "md",
    newTabLabel = "(opens in a new tab)",
    class: className = "",
    ...rest
  }: Props = $props();

  const external = $derived(/^https?:\/\//.test(href));
  const icon = $derived(
    external
      ? "fa-arrow-up-right-from-square"
      : href.startsWith("#")
        ? "fa-arrow-down"
        : "fa-arrow-right"
  );
</script>

<a
  {href}
  class="link-chip {size} {className}"
  target={external ? "_blank" : undefined}
  rel={external ? "noopener noreferrer" : undefined}
  {...rest}
  >{@render children()}<i class="fa-solid {icon}" aria-hidden="true"
  ></i>{#if external}<span class="sr-only"> {newTabLabel}</span>{/if}</a
>

<style>
  .link-chip {
    --chip-accent: var(--theme-accent, oklch(0.74 0.11 265));
    display: inline-flex;
    align-items: center;
    gap: 0.55em;
    border: 1px solid color-mix(in oklab, var(--chip-accent) 38%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--chip-accent) 12%, transparent);
    color: var(--theme-text, #ececf2);
    font-weight: 600;
    text-decoration: none;
    text-align: left;
    transition:
      border-color 140ms ease,
      background-color 140ms ease;
  }

  .link-chip i {
    flex: none;
    font-size: 0.78em;
    color: var(--chip-accent);
  }

  .link-chip:hover {
    border-color: color-mix(in oklab, var(--chip-accent) 70%, transparent);
    background: color-mix(in oklab, var(--chip-accent) 22%, transparent);
  }

  .link-chip:focus-visible {
    outline: 2px solid var(--chip-accent);
    outline-offset: 3px;
  }

  .md {
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 1.1rem;
    font-size: 0.95rem;
    line-height: 1.3;
  }

  /* A mention keeps its sentence's line height: no touch-target floor, and
     the pill's padding sits outside the text box so lines do not spread. */
  .inline {
    display: inline;
    padding: 0.08em 0.6em;
    font-size: 0.94em;
    line-height: inherit;
    white-space: nowrap;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .inline i {
    margin-left: 0.4em;
  }
</style>
