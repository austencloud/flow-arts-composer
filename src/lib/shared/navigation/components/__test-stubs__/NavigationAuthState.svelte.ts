export const authState = $state({
  user: null as null | { displayName: string },
  isFullAccount: false,
  signOut: async () => undefined,
});
