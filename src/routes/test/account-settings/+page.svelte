<!--
  Account settings layout harness.

  Renders the real ProfileTab and MyPropsCard without a signed-in session, so
  the Account workspace can be inspected at every viewport. The signed-in user
  is a stand-in object for layout only; nothing here writes to Firestore unless
  a control is used. The Flow identity specimens below use fixed prop lists,
  because the stand-in user has no saved props.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { User } from "firebase/auth";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import ProfileTab from "#lib/shared/settings/components/tabs/ProfileTab.svelte";
  import MyPropsCard from "#lib/shared/navigation/components/account/MyPropsCard.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PropPreferenceState } from "#lib/shared/community/state/prop-preference-state.svelte.js";

  const provider = (providerId: string) => ({
    providerId,
    uid: "layout-harness",
    displayName: "Layout Harness",
    email: "layout-harness@example.invalid",
    phoneNumber: null,
    photoURL: null,
  });

  const harnessUser = {
    uid: "layout-harness-user",
    email: "layout-harness@example.invalid",
    displayName: "Layout Harness",
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [provider("google.com"), provider("password")],
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

  // Test-only: point the auth handle's getters at the stand-in user.
  const overridden = ["user", "isFullAccount", "isAuthenticated"] as const;
  const originals = overridden.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(authState, key),
  ]);
  Object.defineProperty(authState, "user", {
    get: () => harnessUser,
    configurable: true,
  });
  Object.defineProperty(authState, "isFullAccount", {
    get: () => true,
    configurable: true,
  });
  Object.defineProperty(authState, "isAuthenticated", {
    get: () => true,
    configurable: true,
  });

  onDestroy(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(authState, key as string, descriptor as PropertyDescriptor);
      }
    }
  });

  function specimen(
    props: PropType[],
    favoriteProp: PropType | null
  ): PropPreferenceState {
    return {
      propsISpinWith: props,
      favoriteProp,
      favoriteCatdog: null,
      loading: false,
      saving: false,
      error: null,
    } as unknown as PropPreferenceState;
  }

  const specimens = [
    {
      label: "Four props, Staff profile prop",
      state: specimen(
        [PropType.STAFF, PropType.DOUBLESTAR, PropType.CLUB, PropType.TRIAD],
        PropType.STAFF
      ),
    },
    {
      label: "Ten props, no preference",
      state: specimen(
        [
          PropType.STAFF,
          PropType.DOUBLESTAR,
          PropType.CLUB,
          PropType.TRIAD,
          PropType.FAN,
          PropType.MINIHOOP,
          PropType.BUUGENG,
          PropType.SWORD,
          PropType.EIGHTRINGS,
          PropType.BIGHOOP,
          PropType.TRIQUETRA,
        ],
        null
      ),
    },
    { label: "One prop", state: specimen([PropType.CLUB], null) },
    { label: "Nothing chosen", state: specimen([], null) },
  ];

  let specimenWidth = $state(300);
</script>

<main class="harness">
  <section class="tab-frame">
    <ProfileTab />
  </section>

  <section class="specimens" aria-label="Flow identity specimens">
    <label class="width-control">
      Column width {specimenWidth}px
      <input type="range" min="260" max="640" bind:value={specimenWidth} />
    </label>
    <div class="specimen-row">
      {#each specimens as { label, state } (label)}
        <figure style:width="{specimenWidth}px">
          <figcaption>{label}</figcaption>
          <MyPropsCard propState={state} onOpenPropEditor={() => {}} />
        </figure>
      {/each}
    </div>
  </section>
</main>

<style>
  .harness {
    display: flex;
    min-height: 100dvh;
    flex-direction: column;
    gap: 2rem;
    padding-bottom: 3rem;
    background: #10141c;
  }

  .tab-frame {
    display: flex;
    min-height: 100dvh;
  }

  .specimens {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-inline: 1.5rem;
    color: #e5e7eb;
  }

  .specimen-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1.5rem;
  }

  figure {
    margin: 0;
    padding: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1rem;
    background: #0b0f15;
  }

  figcaption {
    margin-bottom: 1rem;
    color: #9ca3af;
    font-size: 0.875rem;
  }
</style>
