<script lang="ts">
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import LegalPageShell from "$lib/shared/legal/components/LegalPageShell.svelte";
  import Seo from "$lib/shared/components/Seo.svelte";

  const steps = [
    "Sign in to Flow Arts Composer",
    "Tap profile icon → Settings",
    "Account → Delete Account",
    "Confirm deletion",
  ];

  const deletedData = [
    "Profile & account info",
    "Library & collections",
    "Settings & preferences",
  ];

  const sequenceInfo = [
    "Sequences stay in the gallery",
    "Choose: Anonymize or keep your name",
    "Protects community references",
  ];
</script>

<Seo
  title="Delete Account - Flow Arts Composer"
  description="How to delete your Flow Arts Composer account and data"
  canonical="https://tkaflowarts.com/delete-account"
/>

<LegalPageShell variant="compact">
  <div class="header-content">
    <h1>Delete Your Account</h1>
    <p class="subtitle">Account deletion for Flow Arts Composer</p>
  </div>

  <div class="cards">
    <section class="card steps">
      <div class="card-icon">
        <i class="fas fa-list-check" aria-hidden="true"></i>
      </div>
      <h2>How to Delete</h2>
      <ol>
        {#each steps as step}
          <li>{step}</li>
        {/each}
      </ol>
    </section>

    <section class="card deleted">
      <div class="card-icon">
        <i class="fas fa-trash-can" aria-hidden="true"></i>
      </div>
      <h2>What's Deleted</h2>
      <ul>
        {#each deletedData as item}
          <li>{item}</li>
        {/each}
      </ul>
    </section>

    <section class="card sequences">
      <div class="card-icon">
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
      </div>
      <h2>Your Sequences</h2>
      <ul>
        {#each sequenceInfo as item}
          <li>{item}</li>
        {/each}
      </ul>
    </section>
  </div>

  <div class="warning-banner">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <span>
      <strong>This action is permanent</strong> and cannot be undone. You'll be
      signed out immediately.
    </span>
  </div>

  <footer>
    <a href="/" class="cta-button">
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
    <p class="help">
      Need help? <LinkChip size="inline" href="mailto:tkaflowarts@gmail.com"
        >tkaflowarts@gmail.com</LinkChip
      >
    </p>
  </footer>
</LegalPageShell>

<style>
  /* This page uses its own font stack, card grid, and warning banner — none
     of these are shared with terms/privacy, so they stay page-local. Scoped
     to the "compact" variant so it can't leak onto the other two pages. */
  :global(.legal-page.compact) {
    font-family: system-ui, -apple-system, sans-serif;
  }

  .header-content {
    margin-bottom: 2.5rem;
  }

  /* h1 here is smaller/lighter than the shell's document-page default */
  .header-content h1 {
    font-size: 2.5rem;
    font-weight: 600;
  }

  .subtitle {
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
    font-size: 1rem;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .card {
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    transition: all 0.25s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  .card-icon {
    font-size: 1.5rem;
    margin-bottom: 0.75rem;
    color: #818cf8;
  }

  .cards h2 {
    font-size: 1rem;
    margin: 0 0 1rem;
    color: #ffffff;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .cards ol,
  .cards ul {
    padding-left: 1.25rem;
    margin: 0;
  }

  .cards li {
    margin-bottom: 0.5rem;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.9rem;
    line-height: 1.7;
  }

  .cards li:last-child {
    margin-bottom: 0;
  }

  .steps li::marker {
    color: #6366f1;
    font-weight: 600;
  }

  .deleted {
    background: linear-gradient(
      135deg,
      rgba(239, 68, 68, 0.08) 0%,
      rgba(239, 68, 68, 0.03) 100%
    );
    border-color: rgba(239, 68, 68, 0.15);
  }

  .deleted:hover {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .deleted h2 {
    color: #f87171;
  }

  .deleted .card-icon {
    color: #f87171;
  }

  .deleted li::marker {
    color: #ef4444;
  }

  .sequences {
    background: color-mix(in srgb, #6366f1 8%, transparent);
    border-color: color-mix(in srgb, #6366f1 15%, transparent);
  }

  .sequences:hover {
    border-color: color-mix(in srgb, #6366f1 30%, transparent);
  }

  .sequences h2 {
    color: #a5b4fc;
  }

  .sequences .card-icon {
    color: #a5b4fc;
  }

  .sequences li::marker {
    color: #6366f1;
  }

  .warning-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: 12px;
    margin-bottom: 2rem;
    font-size: 0.9rem;
    color: #fcd34d;
  }

  .warning-banner i {
    font-size: 1.25rem;
  }

  .warning-banner strong {
    color: #fbbf24;
  }

  footer {
    text-align: center;
  }

  .cta-button {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    background: #6366f1;
    color: #ffffff;
    text-decoration: none;
    padding: 1rem 2rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 1.125rem;
    transition: all 0.2s ease;
  }

  .cta-button:hover {
    background: #818cf8;
    transform: translateY(-2px);
    box-shadow: 0 12px 32px color-mix(in srgb, #6366f1 40%, transparent);
    color: white;
  }

  .cta-button i {
    transition: transform 0.2s ease;
  }

  .cta-button:hover i {
    transform: translateX(4px);
  }

  .help {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);
  }

  @media (max-width: 768px) {
    .cards {
      grid-template-columns: 1fr;
    }

    .header-content h1 {
      font-size: 1.75rem;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .card,
    .cta-button {
      transition: none;
    }

    .card:hover,
    .cta-button:hover {
      transform: none;
    }

    .cta-button:hover i {
      transform: none;
    }
  }
</style>
