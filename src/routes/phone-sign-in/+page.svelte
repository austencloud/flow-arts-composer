<!--
  /phone-sign-in: the computer's side of "Sign in with your phone" as a page of
  its own, for the live site, where the sign-in sheet does not offer it and
  Austen opens this from a bookmark. His own copies of the app do the same
  thing inside the sign-in sheet.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { pathAfterPhoneSignIn } from "#lib/shared/auth/phone-sign-in/where.js";
  import PhoneNotice from "#lib/shared/auth/phone-sign-in/PhoneNotice.svelte";
  import PhoneSignInPanel from "#lib/shared/auth/phone-sign-in/PhoneSignInPanel.svelte";
  import { createPhoneSignInSession } from "#lib/shared/auth/phone-sign-in/phone-sign-in-session.svelte.js";
  import { finishBootScreen } from "#lib/shared/auth/phone-sign-in/boot-screen.js";

  const next = $derived(pathAfterPhoneSignIn(page.url.searchParams));
  const session = createPhoneSignInSession({
    onSignedIn: () => goto(next, { replaceState: true }),
  });

  // Decided once, when the page first knows who is here: a computer that is
  // already signed in has nothing to scan; anyone else gets a code at once.
  let opening = $state<
    { kind: "loading" } | { kind: "signed-in"; who: string } | { kind: "scan" }
  >({ kind: "loading" });

  $effect(() => {
    if (opening.kind !== "loading" || !authState.initialized) return;
    const user = authState.user;
    if (user && !user.isAnonymous) {
      opening = { kind: "signed-in", who: user.email ?? "your account" };
    } else {
      opening = { kind: "scan" };
      untrack(() => void session.start());
    }
  });

  onMount(finishBootScreen);
  onDestroy(session.dispose);
</script>

<svelte:head>
  <title>Sign in with your phone - Flow Arts Composer</title>
</svelte:head>

<main class="page">
  <section class="panel" aria-labelledby="phone-sign-in-title">
    <h1 id="phone-sign-in-title">Sign in with your phone</h1>
    <Crossfade key={opening.kind} animateHeight>
      {#if opening.kind === "signed-in"}
        <div class="stack">
          <PhoneNotice tone="good" icon="fa-check">
            <p>This computer is already signed in as {opening.who}.</p>
          </PhoneNotice>
          <div class="actions">
            <PanelButton variant="primary" href={next}>Continue</PanelButton>
          </div>
        </div>
      {:else}
        <PhoneSignInPanel {session} />
      {/if}
    </Crossfade>
  </section>
</main>

<style>
  .page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
  }

  .panel {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 28px 24px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    box-sizing: border-box;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    line-height: 1.25;
    color: var(--theme-text);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .actions {
    display: flex;
  }
</style>
