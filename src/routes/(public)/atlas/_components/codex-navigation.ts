export function insertCodexGroup<Group extends { key: string }>(
  groups: readonly Group[],
  codexGroup: Group
): Group[] {
  const placementIndex = groups.findIndex((group) => group.key === "placement");
  const insertionIndex = placementIndex >= 0 ? placementIndex + 1 : 0;
  return [
    ...groups.slice(0, insertionIndex),
    codexGroup,
    ...groups.slice(insertionIndex),
  ];
}
