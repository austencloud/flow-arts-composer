<!--
LetterChip.svelte - Re-exports from shared for backwards compatibility
-->
<script lang="ts">
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import SharedLetterChip from "#lib/shared/components/letter-constraints/LetterChip.svelte";

  let {
    letter,
    isSelected = false,
    mode = "include",
    onClick,
  } = $props<{
    letter: Letter;
    isSelected?: boolean;
    mode?: "include" | "exclude";
    onClick: () => void;
  }>();
</script>

<SharedLetterChip {letter} {isSelected} {mode} {onClick} />
