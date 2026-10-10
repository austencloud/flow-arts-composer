<!--
  Profile-as-stage harness.

  This page is now THIN on purpose. The bands, the data loading, the liveness
  budgeting and all the layout live in ProfileStage, which the live profile
  (/creators/[id], via UserProfilePanel) renders too — so the harness and the
  real surface cannot drift. What is left here is the ability to look at the
  stage on a bare page, without the app shell's sidebar, header and animated
  background competing for the frame.

  The `?solo` rig that lived here has been removed: it existed to isolate the
  mandala/animation registration bug, which is fixed (engineAlignScale pins the
  overlay to the engine's hand orbit). Reach for git history if that class of
  bug returns rather than keeping a dead harness alive.

  Design: docs/superpowers/specs/2026-07-26-profile-as-stage-design.md
-->
<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getUserProfile } from "#lib/shared/community/services/user-repository.js";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import ProfileHeroSection from "#lib/features/creators/components/profile/ProfileHeroSection.svelte";
  import ProfileStage from "#lib/features/creators/components/profile/stage/ProfileStage.svelte";
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";
  import ProfileWorkEmpty from "#lib/features/creators/components/profile/ProfileWorkEmpty.svelte";

  const uid = $derived(authState.user?.uid ?? null);

  let userProfile = $state<EnhancedUserProfile | null>(null);
  $effect(() => {
    const id = uid;
    if (!id) return;
    void getUserProfile(id)
      .then((p) => (userProfile = p))
      .catch(() => (userProfile = null));
  });
</script>

<svelte:head>
  <title>Profile as a stage — test</title>
</svelte:head>

<div class="page">
  <header class="page-head">
    <h1>Profile as a stage</h1>
    <p class="sub">
      The same ProfileStage the live profile renders, on a bare page.
    </p>
  </header>

  <!-- Both empty-work states, unconditionally. They are what the live profile's
       second column holds when a person has made nothing, and the own-profile
       variant is otherwise only reachable by being signed in as an account with
       an empty library — which makes it the one part of this surface that cannot
       be checked on the real page. Cheap to render, so it is always here. -->
  <section class="empty-rig">
    <h2>Empty work column — own profile</h2>
    <div class="empty-slot">
      <ProfileWorkEmpty isOwnProfile={true} />
    </div>

    <h2>Empty work column — someone else's profile</h2>
    <div class="empty-slot">
      <ProfileWorkEmpty isOwnProfile={false} displayName="Nicholas Leonardi" />
    </div>
  </section>

  {#if !uid}
    <PanelState
      type="empty"
      icon="fa-user"
      title="Sign in to load your profile"
      message="This harness reads your own library and collections from Firestore."
    />
  {:else}
    <!-- ProfileHeroSection sets `container-type: inline-size`, which makes it
         size to its CONTENT inside a flex column and collapse. It needs a plain
         block wrapper — the same trap waits when a band wrapper is introduced
         around it elsewhere. -->
    {#if userProfile}
      <div class="hero-slot">
        <ProfileHeroSection
          {userProfile}
          currentUserId={uid}
          isOwnProfile={true}
          followInProgress={false}
          onFollowToggle={() => {}}
        />
      </div>
    {/if}

    <ProfileStage userId={uid} />
  {/if}
</div>

<style>
  .page {
    /* NO max-width, deliberately. A hard cap left 620px of dead rail on each
       side at 3840 — the failure 4k-native-layout.md forbids. Fluid padding
       above a floor instead, the way CreatorsPanel sizes its own band. */
    width: 100%;
    padding: clamp(1rem, 2.2vw, 3.5rem) clamp(1rem, 2.2vw, 3.5rem) 6rem;
    display: flex;
    flex-direction: column;
    gap: clamp(1.5rem, 3vw, 3rem);
  }

  .page-head {
    display: flex;
    flex-direction: column;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 2.4vw, 2.25rem);
    font-weight: 700;
    color: var(--theme-text);
  }

  .sub {
    margin: 0.35rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.9375rem;
  }

  .hero-slot {
    display: block;
    width: 100%;
  }

  .empty-rig {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 3rem;
  }

  .empty-rig h2 {
    margin: 0;
    font-size: var(--font-size-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
  }

  /* Approximates the live work column: a frosted panel the empty state fills.
     Fixed height so the vertical centring is visible here the same way it is on
     the real page, where the column stretches to match the identity rail. */
  .empty-slot {
    height: 30rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    padding: clamp(16px, 2cqi, 28px);
    background: color-mix(in srgb, var(--theme-panel-bg, rgba(18, 20, 30, 0.98)) 90%, transparent);
  }
</style>
