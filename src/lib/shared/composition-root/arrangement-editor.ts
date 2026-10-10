/** Load Arrange only when Studio opens its source editor. */
export async function loadArrangementEditor() {
  return (await import("$lib/features/compose/studio/ArrangementEditor.svelte")).default;
}

export type ArrangementEditorComponent = Awaited<ReturnType<typeof loadArrangementEditor>>;
