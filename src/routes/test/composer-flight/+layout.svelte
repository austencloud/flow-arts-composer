<script lang="ts">
  /**
   * Dev-only harness for the Composer fly-through prototypes. Each version
   * stages the unchanged /composer page inside the real marketing chrome, and
   * the switcher moves between them and the current page for comparison.
   */
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import MarketingChrome from "$lib/shared/landing/components/MarketingChrome.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { harness } from "./_flight/harness.svelte";

  let { children }: { children: Snippet } = $props();

  type Version = "stops" | "flow" | "current";

  const VERSIONS: { value: Version; label: string }[] = [
    { value: "stops", label: "Stops" },
    { value: "flow", label: "Flow" },
    { value: "current", label: "Current" },
  ];

  const version = $derived<Version>(
    VERSIONS.find((option) => page.url.pathname.endsWith(`/${option.value}`))
      ?.value ?? "stops"
  );
</script>

<MarketingChrome>
  {@render children()}
</MarketingChrome>

<aside class="flight-harness" aria-label="Fly-through test">
  <SegmentedControl
    options={VERSIONS}
    value={version}
    onchange={(next) => goto(`/test/composer-flight/${next}`)}
    size="sm"
    ariaLabel="Page version"
  />
  {#if harness.note}
    <p class="harness-note">{harness.note}</p>
  {/if}
</aside>

<style>
  .flight-harness {
    position: fixed;
    bottom: max(1rem, env(safe-area-inset-bottom));
    left: max(1rem, env(safe-area-inset-left));
    z-index: 150;
    display: grid;
    gap: 0.4rem;
    max-width: min(20rem, calc(100vw - 9.5rem));
    padding: 0.4rem;
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: 0.9rem;
    background: color-mix(
      in oklab,
      var(--theme-panel-bg, oklch(0.13 0.025 270)) 90%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .harness-note {
    margin: 0;
    padding: 0 0.35rem 0.2rem;
    color: var(--theme-text-secondary, oklch(0.74 0.018 270));
    font-size: var(--font-size-xs, 0.75rem);
    line-height: 1.35;
  }
</style>
