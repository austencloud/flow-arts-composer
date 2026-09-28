<!--
  AuthModalHost - the site's usual sign-up window, for pages without the app.

  Inside the app, MainApplication shows this window whenever something asks for
  it (a guest reaching the three-save limit, for one). Pages without the app
  shell, such as the Shape Engine and the spinner page, had nothing listening,
  so a guest's fourth save did nothing visible. Mount this on such a page.

  The window's code loads only the first time something asks for it, so the
  page stays light for everyone who never hits a limit. Once loaded it stays
  mounted, so closing it plays its closing animation instead of vanishing.
-->
<script lang="ts">
  import { authDrawerState } from "../state/auth-drawer-state.svelte";

  let wanted = $state(false);

  $effect(() => {
    if (authDrawerState.open) wanted = true;
  });
</script>

{#if wanted}
  {#await import("./AuthModal.svelte") then mod}
    <mod.default
      open={authDrawerState.open}
      initialMode={authDrawerState.initialMode}
      reason={authDrawerState.reason}
      attempt={authDrawerState.stepCapAttempts}
      encore={authDrawerState.encorePrompt}
      onAcceptEncore={() => authDrawerState.claimEncore()}
      onClose={() => authDrawerState.hide()}
    />
  {/await}
{/if}
