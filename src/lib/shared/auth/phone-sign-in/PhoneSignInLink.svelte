<!--
  "Sign in with your phone" under the sign-in choices. Only Austen's own copies
  of the app show it (offersPhoneSignIn); it opens /phone-sign-in set to come
  back to this page.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
  import { isNative } from "#lib/shared/platform/services/platform-detector.js";
  import { offersPhoneSignIn, phoneSignInHref } from "./where.js";

  const shown = $derived(browser && offersPhoneSignIn(page.url, isNative()));
</script>

{#if shown}
  <div class="phone-sign-in">
    <LinkChip
      href={phoneSignInHref(page.url)}
      onclick={() => authDrawerState.hide()}>Sign in with your phone</LinkChip
    >
  </div>
{/if}

<style>
  .phone-sign-in {
    display: flex;
    justify-content: center;
    margin-top: 0.75rem;
  }
</style>
