/** Independent Studio posts use their own source snapshot and account-scoped draft. */
export function isIndependentStudioProjectId(id: string): boolean {
  return (
    id.startsWith("studio-arrangement:") || id.startsWith("studio-project:")
  );
}

export function studioProjectKindFromId(
  id: string
): "arrangement" | "tutorial" | "showcase" | null {
  if (id.startsWith("studio-arrangement:")) return "arrangement";
  if (id.startsWith("studio-project:tutorial:")) return "tutorial";
  if (id.startsWith("studio-project:showcase:")) return "showcase";
  return null;
}
