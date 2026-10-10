<!--
LengthCardClampHarness - reproduces the generator's spell-mode parent wiring.

Mirrors CardBasedSettingsContainer + generate-config:
  - `updateConfig` merges into a fresh config object, so downstream `$derived`
    values rebuild (generate-config.svelte.ts).
  - the card list is a `$derived.by` over that config, so every handler closure
    is rebuilt with a new identity on each update
    (CardBasedSettingsContainer: `withFavoriteDeselect(handleSpellLengthChange)`).
  - in spell mode `currentLength` is the WORD-derived length, so a clamp pushed
    back through `onLengthChange` can never lower it.

`bumpOnCall` forces the config to actually change on every call, so the handler
identity churns even with the no-op short-circuit in `updateConfig`. That
isolates the second half of the fix: LengthCard must not treat its callback as
a reactive dependency.
-->
<script lang="ts">
  import { GenerationMode } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import LengthCard from "../LengthCard.svelte";

  let {
    naturalDisplayLength,
    maxOverride,
    clampToMax = true,
    onCall,
    onCapExceeded,
  }: {
    naturalDisplayLength: number;
    maxOverride: number;
    clampToMax?: boolean;
    onCall: (length: number) => void;
    onCapExceeded?: () => void;
  } = $props();

  let config = $state<{ writes: number }>({ writes: 0 });

  const handleSpellLengthChange = $derived.by(() => {
    // Read the config so this rebuilds (new closure identity) on every update.
    void config.writes;
    return (length: number) => {
      onCall(length);
      // The word-derived display length is untouched by this write, exactly as
      // handleSpellLengthChange clearing spellTargetLength leaves it untouched.
      config = { writes: config.writes + 1 };
    };
  });
</script>

<LengthCard
  currentLength={naturalDisplayLength}
  currentMode={GenerationMode.CIRCULAR}
  {maxOverride}
  {clampToMax}
  minOverride={naturalDisplayLength}
  onLengthChange={handleSpellLengthChange}
  onStepCapExceeded={onCapExceeded}
/>
