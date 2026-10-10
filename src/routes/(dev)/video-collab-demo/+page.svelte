<!--
  VIDEO COLLABORATION DEMO PAGE

  This is a temporary demo page to preview the video-collaboration components
  that were built but never integrated into the app.

  DELETE THIS FILE after reviewing the components.
-->
<script lang="ts">
  import VideosPanel from "#lib/shared/video-collaboration/components/VideosPanel.svelte";
  import UserVideoLibraryView from "#lib/shared/video-collaboration/components/UserVideoLibraryView.svelte";
  import CollaborativeVideoCard from "#lib/shared/video-collaboration/components/CollaborativeVideoCard.svelte";
  import CollaboratorAvatars from "#lib/shared/video-collaboration/components/CollaboratorAvatars.svelte";
  import PendingInviteCard from "#lib/shared/video-collaboration/components/PendingInviteCard.svelte";
  import InviteCollaboratorsSheet from "#lib/shared/video-collaboration/components/InviteCollaboratorsSheet.svelte";
  import VideoUploadSheet from "#lib/shared/video-collaboration/components/VideoUploadSheet.svelte";
  import type { CollaborativeVideo, VideoCollaborator } from "#lib/shared/video-collaboration/domain/collaborative-video.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  // Demo data
  const mockCollaborators: VideoCollaborator[] = [
    {
      userId: "user1",
      displayName: "Austen Cloud",
      avatarUrl: undefined,
      role: "creator",
      joinedAt: new Date(),
    },
    {
      userId: "user2",
      displayName: "Jane Doe",
      avatarUrl: undefined,
      role: "collaborator",
      joinedAt: new Date(),
    },
    {
      userId: "user3",
      displayName: "Flow Master",
      avatarUrl: undefined,
      role: "collaborator",
      joinedAt: new Date(),
    },
  ];

  const mockVideo: CollaborativeVideo = {
    id: "demo-video-1",
    sequenceId: "seq-123",
    sequenceName: "Example Flow Sequence",
    videoUrl: "",
    storagePath: "/videos/demo-video-1.mp4",
    thumbnailUrl: undefined,
    duration: 125,
    fileSize: 15000000,
    mimeType: "video/mp4",
    visibility: "public",
    creatorId: "user1",
    collaborators: mockCollaborators,
    pendingInvites: [
      {
        userId: "user4",
        displayName: "New Collaborator",
        invitedBy: "user1",
        invitedAt: new Date(),
        status: "pending",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSequence: SequenceData = {
    id: "seq-123",
    word: "FLOW",
    name: "Example Flow Sequence",
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
  };

  // State
  let activeDemo = $state<string>("overview");
  let showVideosPanel = $state(false);
  let showInviteSheet = $state(false);
  let showUploadSheet = $state(false);
</script>

<svelte:head>
  <title>Video Collaboration Demo</title>
</svelte:head>

<div class="demo-page">
  <header class="demo-header">
    <h1>Video Collaboration Components</h1>
    <p class="subtitle">Preview of dead/unused UI components</p>
  </header>

  <!-- Navigation -->
  <nav class="demo-nav">
    <button
      class="nav-btn"
      class:active={activeDemo === "overview"}
      onclick={() => (activeDemo = "overview")}
    >
      Overview
    </button>
    <button
      class="nav-btn"
      class:active={activeDemo === "card"}
      onclick={() => (activeDemo = "card")}
    >
      Video Card
    </button>
    <button
      class="nav-btn"
      class:active={activeDemo === "avatars"}
      onclick={() => (activeDemo = "avatars")}
    >
      Avatars
    </button>
    <button
      class="nav-btn"
      class:active={activeDemo === "invite"}
      onclick={() => (activeDemo = "invite")}
    >
      Invite Card
    </button>
    <button
      class="nav-btn"
      class:active={activeDemo === "library"}
      onclick={() => (activeDemo = "library")}
    >
      Library View
    </button>
    <button
      class="nav-btn"
      class:active={activeDemo === "sheets"}
      onclick={() => (activeDemo = "sheets")}
    >
      Sheets
    </button>
  </nav>

  <!-- Demo Content -->
  <main class="demo-content">
    {#if activeDemo === "overview"}
      <section class="demo-section">
        <h2>What is this?</h2>
        <p>
          These are UI components for a <strong>collaborative video</strong> feature that was
          designed but never integrated into the app. The concept:
        </p>
        <ul>
          <li>Users can upload performance videos of sequences</li>
          <li>Creators can invite collaborators to be credited on videos</li>
          <li>Videos can have visibility settings (public, collaborators-only, private)</li>
          <li>Users get a "video library" showing their videos and collaborations</li>
          <li>Pending invites show up in a dedicated tab</li>
        </ul>
        <h3>Components Status</h3>
        <table class="status-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CollaborativeVideoCard</td>
              <td class="dead">Dead</td>
              <td>Card for video grids</td>
            </tr>
            <tr>
              <td>CollaboratorAvatars</td>
              <td class="dead">Dead</td>
              <td>Stacked avatar display</td>
            </tr>
            <tr>
              <td>InviteCollaboratorsPanel</td>
              <td class="alive">Alive</td>
              <td>Used somewhere</td>
            </tr>
            <tr>
              <td>InviteCollaboratorsSheet</td>
              <td class="dead">Dead</td>
              <td>Bottom sheet for invites</td>
            </tr>
            <tr>
              <td>PendingInviteCard</td>
              <td class="dead">Dead</td>
              <td>Accept/decline UI</td>
            </tr>
            <tr>
              <td>PendingInvitesList</td>
              <td class="dead">Dead</td>
              <td>List wrapper</td>
            </tr>
            <tr>
              <td>SequenceVideosSection</td>
              <td class="dead">Dead</td>
              <td>Section for sequence detail</td>
            </tr>
            <tr>
              <td>UserVideoLibraryView</td>
              <td class="dead">Dead</td>
              <td>Full library UI</td>
            </tr>
            <tr>
              <td>VideoCollaboratorsDetail</td>
              <td class="dead">Dead</td>
              <td>Collaborator details</td>
            </tr>
            <tr>
              <td>VideoUploadSheet</td>
              <td class="dead">Dead</td>
              <td>Upload flow</td>
            </tr>
            <tr>
              <td>VideosPanel</td>
              <td class="dead">Dead</td>
              <td>Full-screen video browser</td>
            </tr>
          </tbody>
        </table>
      </section>

    {:else if activeDemo === "card"}
      <section class="demo-section">
        <h2>CollaborativeVideoCard</h2>
        <p>A card component for displaying videos in grids/lists.</p>
        <div class="demo-box" style="max-width: 320px;">
          <CollaborativeVideoCard
            video={mockVideo}
            showSequenceName={true}
            onclick={() => alert("Video clicked!")}
          />
        </div>
      </section>

    {:else if activeDemo === "avatars"}
      <section class="demo-section">
        <h2>CollaboratorAvatars</h2>
        <p>Stacked avatar display with overflow indicator.</p>
        <div class="demo-row">
          <div class="demo-item">
            <h4>Small</h4>
            <CollaboratorAvatars collaborators={mockCollaborators} size="sm" maxVisible={3} />
          </div>
          <div class="demo-item">
            <h4>Medium</h4>
            <CollaboratorAvatars collaborators={mockCollaborators} size="md" maxVisible={3} />
          </div>
          <div class="demo-item">
            <h4>Large</h4>
            <CollaboratorAvatars collaborators={mockCollaborators} size="lg" maxVisible={3} />
          </div>
          <div class="demo-item">
            <h4>With overflow</h4>
            <CollaboratorAvatars collaborators={mockCollaborators} size="md" maxVisible={2} />
          </div>
        </div>
      </section>

    {:else if activeDemo === "invite"}
      <section class="demo-section">
        <h2>PendingInviteCard</h2>
        <p>Card showing a pending collaboration invite with accept/decline actions.</p>
        <div class="demo-box" style="max-width: 500px;">
          <PendingInviteCard
            video={mockVideo}
            onAccepted={() => alert("Accepted!")}
            onDeclined={() => alert("Declined!")}
          />
        </div>
      </section>

    {:else if activeDemo === "library"}
      <section class="demo-section">
        <h2>UserVideoLibraryView</h2>
        <p>Full library view with tabs for All/My Videos/Collaborations/Invites.</p>
        <p class="note">Note: This requires real Firebase data to show content.</p>
        <div class="demo-box library-demo">
          <UserVideoLibraryView onVideoClick={(v) => console.log("Video clicked:", v)} />
        </div>
      </section>

    {:else if activeDemo === "sheets"}
      <section class="demo-section">
        <h2>Bottom Sheets</h2>
        <p>Interactive bottom sheets for upload and invite flows.</p>
        <div class="demo-row">
          <button class="action-btn" onclick={() => (showUploadSheet = true)}>
            <i class="fas fa-upload" aria-hidden="true"></i>
            Open Upload Sheet
          </button>
          <button class="action-btn" onclick={() => (showInviteSheet = true)}>
            <i class="fas fa-user-plus" aria-hidden="true"></i>
            Open Invite Sheet
          </button>
          <button class="action-btn" onclick={() => (showVideosPanel = true)}>
            <i class="fas fa-video" aria-hidden="true"></i>
            Open Videos Panel
          </button>
        </div>
      </section>
    {/if}
  </main>
</div>

<!-- Bottom Sheets -->
<VideoUploadSheet
  show={showUploadSheet}
  sequence={mockSequence}
  onClose={() => (showUploadSheet = false)}
  onUploaded={() => {
    showUploadSheet = false;
    alert("Upload complete!");
  }}
/>

<InviteCollaboratorsSheet
  show={showInviteSheet}
  video={mockVideo}
  onClose={() => (showInviteSheet = false)}
  onInviteSent={() => alert("Invite sent!")}
/>

{#if showVideosPanel}
  <div class="panel-overlay">
    <VideosPanel
      sequence={mockSequence}
      onClose={() => (showVideosPanel = false)}
      onInviteCollaborators={(v) => {
        showVideosPanel = false;
        showInviteSheet = true;
      }}
    />
  </div>
{/if}

<style>
  .demo-page {
    min-height: 100vh;
    background: var(--theme-panel-bg, #0f0f1a);
    color: var(--theme-text, #fff);
    padding: 2rem;
  }

  .demo-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .demo-header h1 {
    margin: 0;
    font-size: 2rem;
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: var(--theme-text-dim, #888);
  }

  .demo-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .nav-btn {
    padding: 0.75rem 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, #888);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .nav-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--theme-text, #fff);
  }

  .nav-btn.active {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: var(--semantic-info, #3b82f6);
  }

  .demo-content {
    max-width: 900px;
    margin: 0 auto;
  }

  .demo-section h2 {
    margin: 0 0 1rem;
    font-size: 1.5rem;
  }

  .demo-section h3 {
    margin: 1.5rem 0 1rem;
    font-size: 1.1rem;
  }

  .demo-section p {
    margin: 0 0 1rem;
    color: var(--theme-text-dim, #aaa);
    line-height: 1.6;
  }

  .demo-section ul {
    margin: 0 0 1rem;
    padding-left: 1.5rem;
    color: var(--theme-text-dim, #aaa);
  }

  .demo-section li {
    margin-bottom: 0.5rem;
  }

  .demo-box {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 1.5rem;
  }

  .demo-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    align-items: flex-start;
  }

  .demo-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .demo-item h4 {
    margin: 0;
    font-size: 0.85rem;
    color: var(--theme-text-dim, #888);
  }

  .library-demo {
    height: 500px;
    overflow: hidden;
  }

  .status-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .status-table th,
  .status-table td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .status-table th {
    color: var(--theme-text-dim, #888);
    font-weight: 600;
  }

  .status-table .dead {
    color: var(--semantic-error, #ef4444);
  }

  .status-table .alive {
    color: var(--semantic-success, #10b981);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, var(--semantic-info, #3b82f6) 0%, #2563eb 100%);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }

  .note {
    font-style: italic;
    opacity: 0.7;
  }

  .panel-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--theme-panel-bg, #0f0f1a);
  }
</style>
