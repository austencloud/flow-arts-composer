<!--
  Notification settings layout harness.

  Renders the real NotificationPreferencesPanel without a signed-in session,
  so the Notifications workspace can be inspected at every viewport. The
  stand-in user has no saved preferences, so the panel shows the defaults.
  Add ?admin to the address to include the admin alert group. Nothing here
  writes to Firestore unless a switch is used.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import type { User } from "firebase/auth";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import NotificationPreferencesPanel from "#lib/features/feedback/components/NotificationPreferencesPanel.svelte";

  const harnessUser = {
    uid: "layout-harness-user",
    email: "layout-harness@example.invalid",
    displayName: "Layout Harness",
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: "",
    tenantId: null,
    phoneNumber: null,
    providerId: "firebase",
    delete: async () => {},
    getIdToken: async () => "",
    getIdTokenResult: async () => ({}) as never,
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;

  // Test-only: point the auth handle's getters at the stand-in user, and the
  // role at admin when ?admin is present.
  const overrides: [object, string, () => unknown][] = [
    [authState, "user", () => harnessUser],
    [authState, "isFullAccount", () => true],
    [authState, "isAuthenticated", () => true],
  ];
  if (page.url.searchParams.has("admin")) {
    overrides.push([featureFlagService, "effectiveRole", () => "admin"]);
  }

  const originals = overrides.map(
    ([target, key]) =>
      [target, key, Object.getOwnPropertyDescriptor(target, key)] as const
  );
  for (const [target, key, get] of overrides) {
    Object.defineProperty(target, key, { get, configurable: true });
  }

  onDestroy(() => {
    for (const [target, key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    }
  });
</script>

<main class="harness">
  <NotificationPreferencesPanel />
</main>

<style>
  .harness {
    display: flex;
    min-height: 100dvh;
    background: #10141c;
  }
</style>
