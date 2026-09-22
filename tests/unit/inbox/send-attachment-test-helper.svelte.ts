import { createSendAttachmentState } from "$lib/shared/inbox/state/send-attachment-state.svelte";

type Inputs = Parameters<typeof createSendAttachmentState>[0];
type Dependencies = Parameters<typeof createSendAttachmentState>[1];

/** The send state owns an $effect, so it needs a root outside a component. */
export function createSendAttachmentStateForTest(
  inputs: Inputs,
  dependencies: Dependencies
): {
  state: ReturnType<typeof createSendAttachmentState>;
  dispose: () => void;
} {
  let state!: ReturnType<typeof createSendAttachmentState>;
  const dispose = $effect.root(() => {
    state = createSendAttachmentState(inputs, dependencies);
  });
  return { state, dispose };
}
