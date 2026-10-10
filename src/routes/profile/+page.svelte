<script lang="ts">
  /**
   * User Profile Page
   *
   * Displays user profile information and provides account management options
   */

  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { goto } from "$app/navigation";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  let copying = $state(false);

  // Redirect if not authenticated
  $effect(() => {
    if (!authState.isAuthenticated && !authState.loading) {
      goto("/");
    }
  });

  async function copyUserId() {
    if (!authState.user?.uid) return;

    try {
      await navigator.clipboard.writeText(authState.user.uid);
      copying = true;
      setTimeout(() => (copying = false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  const providerName = $derived.by(() => {
    const providerId = authState.user?.providerData?.[0]?.providerId;
    if (providerId === "facebook.com") return "Facebook";
    if (providerId === "google.com") return "Google";
    if (providerId === "github.com") return "GitHub";
    if (providerId === "twitter.com") return "Twitter";
    return providerId || "Email";
  });

  const avatarUrl = $derived(authState.user?.photoURL);

  const displayName = $derived(
    authState.user?.displayName || authState.user?.email || "User"
  );

  const joinedDate = $derived.by(() => {
    if (!authState.user?.metadata?.creationTime) return "Unknown";
    return new Date(authState.user.metadata.creationTime).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );
  });
</script>

<svelte:head>
  <title>Profile - TKA</title>
</svelte:head>

{#if authState.loading}
  <div class="loading-container">
    <ProgressRing percent={-1} size={32} strokeWidth={3} />
    <p>Loading profile...</p>
  </div>
{:else if authState.user}
  <div class="profile-container">
    <div class="profile-card">
      <div class="profile-header">
        {#if avatarUrl}
          <img src={avatarUrl} alt={displayName} class="profile-avatar" />
        {:else}
          <div class="profile-avatar-fallback">
            {displayName.charAt(0).toUpperCase()}
          </div>
        {/if}

        <h1 class="profile-name">{displayName}</h1>
        <p class="profile-email">{authState.user.email}</p>

        <div class="profile-badge">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Connected via {providerName}
        </div>
      </div>

      <div class="profile-details">
        <h2>Account Information</h2>

        <div class="detail-row">
          <span class="detail-label">User ID</span>
          <div class="detail-value">
            <code class="user-id">{authState.user.uid.slice(0, 20)}...</code>
            <button
              onclick={copyUserId}
              class="copy-button"
              aria-label="Copy user ID"
            >
              {#if copying}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  ></path>
                </svg>
              {/if}
            </button>
          </div>
        </div>

        <div class="detail-row">
          <span class="detail-label">Member since</span>
          <span class="detail-value">{joinedDate}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Last sign in</span>
          <span class="detail-value">
            {authState.user.metadata?.lastSignInTime
              ? new Date(
                  authState.user.metadata.lastSignInTime
                ).toLocaleString()
              : "Unknown"}
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Email verified</span>
          <span class="detail-value">
            {#if authState.user.emailVerified}
              <span class="verified">✓ Verified</span>
            {:else}
              <span class="unverified">Not verified</span>
            {/if}
          </span>
        </div>
      </div>

      <div class="profile-actions">
        <a href="/" class="button button-secondary">Back to Home</a>
      </div>
    </div>
  </div>
{/if}

<style>
  .loading-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .profile-container {
    min-height: 100vh;
    padding: 2rem 1rem;
    background: var(
      --gradient-cosmic,
      linear-gradient(135deg, #667eea 0%, #764ba2 100%)
    );
  }

  .profile-card {
    max-width: 600px;
    margin: 0 auto;
    background: var(--theme-panel-elevated-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 1rem;
    box-shadow: var(--theme-panel-shadow, none);
    overflow: hidden;
  }

  .profile-header {
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      var(--theme-accent-strong) 100%
    );
    padding: 3rem 2rem 2rem;
    text-align: center;
    color: white;
  }

  .profile-avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 4px solid
      color-mix(in srgb, var(--theme-text, white) 90%, transparent);
    object-fit: cover;
    margin-bottom: 1rem;
  }

  .profile-avatar-fallback {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 4px solid
      color-mix(in srgb, var(--theme-text, white) 90%, transparent);
    background: color-mix(in srgb, var(--theme-text, white) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 auto 1rem;
  }

  .profile-name {
    font-size: 1.875rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
  }

  .profile-email {
    opacity: 0.9;
    margin: 0 0 1rem 0;
    font-size: 1rem;
  }

  .profile-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: color-mix(in srgb, var(--theme-text, white) 20%, transparent);
    padding: 0.5rem 1rem;
    border-radius: 2rem;
    font-size: 0.875rem;
    backdrop-filter: blur(10px);
  }

  .profile-details {
    padding: 2rem;
  }

  .profile-details h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text);
    margin: 0 0 1.5rem 0;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-bottom: 1px solid var(--theme-stroke);
    gap: 1rem;
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-weight: 500;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 0.875rem;
  }

  .detail-value {
    color: var(--theme-text);
    font-size: 0.875rem;
    text-align: right;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .user-id {
    font-family: monospace;
    background: var(--theme-card-bg);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .copy-button {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
  }

  .copy-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-accent, var(--semantic-info));
  }

  .verified {
    color: var(--semantic-success, var(--semantic-success));
    font-weight: 600;
  }

  .unverified {
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .profile-actions {
    padding: 1.5rem 2rem;
    background: var(--theme-panel-bg);
    display: flex;
    gap: 1rem;
  }

  .button {
    flex: 1;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    transition: all var(--duration-normal) ease;
    border: none;
    cursor: pointer;
    font-size: 1rem;
  }

  .button-secondary {
    background: var(--theme-card-bg);
    color: var(--theme-text, var(--theme-text));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .button-secondary:hover {
    background: var(--theme-card-hover-bg);
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .profile-container {
      padding: 1rem 0.5rem;
    }

    .profile-header {
      padding: 2rem 1rem 1.5rem;
    }

    .profile-details {
      padding: 1.5rem;
    }

    .detail-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .detail-value {
      text-align: left;
    }
  }

</style>
