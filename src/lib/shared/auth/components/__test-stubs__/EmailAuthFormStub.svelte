<script lang="ts">
  // Stands in for EmailLinkAuth and EmailPasswordAuth inside EmailAuthTabs, so
  // its tests can see the shared email and the code hand-off without Firebase.
  let {
    mode = $bindable("signin"),
    email = $bindable(""),
    sendOnOpen = false,
    onUseCode,
  }: {
    mode?: "signin" | "signup";
    email?: string;
    sendOnOpen?: boolean;
    onUseCode?: () => void;
  } = $props();
</script>

<span data-testid="email-form" data-mode={mode} data-send-on-open={sendOnOpen}
  >Email form</span
>
<input aria-label="Stub email" bind:value={email} />
{#if onUseCode}
  <button type="button" onclick={onUseCode}>Use code</button>
{/if}
