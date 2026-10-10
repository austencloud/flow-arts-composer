<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import { getLetterBorderColors } from "#lib/shared/pictograph/shared/utils/letter-border-utils.js";

  let {
    letter,
    children,
  }: {
    letter: Letter | null | undefined;
    children: Snippet;
  } = $props();

  const colors = $derived(getLetterBorderColors(letter));
</script>

<div class="type-frame">
  <div
    class="type-border"
    style:--type-border-primary={colors.primary}
    style:--type-border-secondary={colors.secondary}
  >
    {@render children()}
  </div>
</div>

<style>
  /* The desktop Codex used two nested full borders, each 1.6% of the
     pictograph width. Keep the geometry here so every Codex surface carries
     the same type identity without restating the type in prose. */
  .type-frame {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    container-type: inline-size;
    border-radius: var(--pictograph-type-frame-radius, 0);
    overflow: hidden;
  }

  .type-border {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border-radius: inherit;
    overflow: hidden;
  }

  .type-border::before,
  .type-border::after {
    position: absolute;
    z-index: 2;
    box-sizing: border-box;
    content: "";
    pointer-events: none;
  }

  .type-border::before {
    inset: 0;
    border: max(1px, 1.6cqi) solid var(--type-border-primary);
    border-radius: inherit;
  }

  .type-border::after {
    inset: max(1px, 1.6cqi);
    border: max(1px, 1.6cqi) solid var(--type-border-secondary);
    border-radius: inherit;
  }
</style>
