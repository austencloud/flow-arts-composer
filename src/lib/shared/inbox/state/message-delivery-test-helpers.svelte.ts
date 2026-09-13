/**
 * Hands `value` back the way a `$state` field does: wrapped in Svelte's deep
 * proxy. `inboxState.shareAttachment` and a composer's `pendingAttachment` are
 * such fields, so this is what the delivery state actually receives from them.
 */
export function asReactiveInput<T extends object>(value: T): T {
  const reactive = $state(value);
  return reactive;
}
