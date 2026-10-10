<!--
LetterConstraintsSection.svelte - Re-exports from shared for backwards compatibility
-->
<script lang="ts">
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import SharedLetterConstraintsSection from "#lib/shared/components/letter-constraints/LetterConstraintsSection.svelte";

  let {
    mustContainLetters,
    mustNotContainLetters,
    onMustContainChange,
    onMustNotContainChange,
  } = $props<{
    mustContainLetters: Letter[];
    mustNotContainLetters: Letter[];
    onMustContainChange: (letters: Letter[]) => void;
    onMustNotContainChange: (letters: Letter[]) => void;
  }>();
</script>

<SharedLetterConstraintsSection
  {mustContainLetters}
  {mustNotContainLetters}
  {onMustContainChange}
  {onMustNotContainChange}
/>
