<!--
  SpinnerModeToggle.svelte

  Single-select control for switching between Library and Infinite modes in the
  endless spinner. Exactly one mode is active at a time, so this routes through
  the shared SegmentedControl primitive for its sliding indicator and
  single-select semantics.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SpinnerMode } from "../domain/models/spinner-models";

  let {
    mode = "library",
    onModeChange,
  }: {
    mode?: SpinnerMode;
    onModeChange?: (mode: SpinnerMode) => void;
  } = $props();

  const options = $derived<{ value: SpinnerMode; label: string }[]>([
    { value: "library", label: t("landing_spinner_mode_library") },
    { value: "infinite", label: t("landing_spinner_mode_infinite") },
  ]);

  function handleChange(value: SpinnerMode) {
    onModeChange?.(value);
  }
</script>

<div class="mode-toggle">
  <SegmentedControl
    {options}
    value={mode}
    onchange={handleChange}
    color="accent"
    semantics="radiogroup"
    ariaLabel={t("landing_spinner_mode_source")}
  />
</div>

<style>
  /* rem width: the route's continuous 4K root ramp grows it — no step tier. */
  .mode-toggle {
    width: min(100%, 28rem);
    margin: 0 auto;
  }
</style>
