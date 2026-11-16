<script lang="ts">
  // Stands in for EmailLinkAuth inside SignInContent, so its tests can see the
  // shared email and the code hand-off without Firebase.
  let {
    email = $bindable(""),
    sendOnOpen = false,
  }: { email?: string; sendOnOpen?: boolean } = $props();
</script>

<span data-testid="code-form" data-send-on-open={sendOnOpen}>Code form</span>
<input aria-label="Stub email" bind:value={email} />
