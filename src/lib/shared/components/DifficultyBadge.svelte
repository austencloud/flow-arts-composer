<script lang="ts">
  import { onMount } from "svelte";
  import {
    DIFFICULTY_FONT_FAMILY,
    DIFFICULTY_LEVELS,
    DEFAULT_DIFFICULTY_STYLE,
  } from "$lib/shared/config/difficulty-styles";
  import { ensureCardFonts } from "$lib/shared/render/services/gelasio-fonts";

  interface Props {
    level: number;
    size?: string;
    fontSize?: string;
    class?: string;
  }

  let { level, size = "28px", fontSize, class: extraClass = "" }: Props = $props();

  const style = $derived(DIFFICULTY_LEVELS[level] ?? DEFAULT_DIFFICULTY_STYLE);
  const computedFontSize = $derived(fontSize ?? `calc(${size} * 0.6)`);

  onMount(() => {
    void ensureCardFonts().catch((error) => {
      console.error("Unable to load the difficulty badge font", error);
    });
  });
</script>

<span
  class="difficulty-badge {extraClass}"
  style="
    width: {size};
    height: {size};
    background: {style.cssBg};
    border-color: {style.border};
    color: {style.text};
    font-size: {computedFontSize};
    font-family: {DIFFICULTY_FONT_FAMILY};
  "
>
  {level}
</span>

<style>
  .difficulty-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
  }
</style>
