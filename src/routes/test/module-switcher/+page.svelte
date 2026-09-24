<script lang="ts">
  // Dev harness for the module navigation sheet. Renders the real
  // ModuleSwitcher with a chosen number of modules, so the admin-sized list
  // can be checked while signed out. ?count=3|5|7|13 sets the starting size.
  import { page } from "$app/state";
  import ModuleSwitcher from "$lib/shared/navigation/components/ModuleSwitcher.svelte";
  import { MODULE_DEFINITIONS } from "$lib/shared/navigation/config/module-definitions";
  import type { ModuleId } from "$lib/shared/navigation/domain/types";

  const COUNTS = [3, 5, 7, 13];
  const candidates = MODULE_DEFINITIONS.filter(
    (module) => module.isMain && !module.linkHref
  );
  const requested = Number(page.url.searchParams.get("count"));

  let count = $state(COUNTS.includes(requested) ? requested : 13);
  let currentModule = $state<ModuleId>("create");
  const modules = $derived(candidates.slice(0, count));
  const currentModuleName = $derived(
    modules.find((module) => module.id === currentModule)?.label ?? "Create"
  );

  function toggleSheet() {
    window.dispatchEvent(new Event("module-switcher-toggle"));
  }
</script>

<main class="harness">
  <h1>Module switcher</h1>
  <div class="counts" role="group" aria-label="Module count">
    {#each COUNTS as option}
      <button
        type="button"
        aria-pressed={count === option}
        onclick={() => (count = option)}>{option}</button
      >
    {/each}
  </div>
  <button type="button" class="open" onclick={toggleSheet}
    >Open navigation</button
  >
</main>

<ModuleSwitcher
  {currentModule}
  {currentModuleName}
  {modules}
  onModuleChange={(moduleId) => {
    currentModule = moduleId;
  }}
/>

<style>
  .harness {
    box-sizing: border-box;
    min-height: 100dvh;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
    background: var(--theme-bg, #0b0d14);
    color: var(--theme-text);
  }

  .counts {
    display: flex;
    gap: 8px;
  }

  button {
    min-height: var(--min-touch-target);
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }

  button[aria-pressed="true"] {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  }
</style>
