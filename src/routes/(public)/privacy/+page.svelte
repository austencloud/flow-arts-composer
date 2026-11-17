<script lang="ts">
  import LegalPageShell from "#lib/shared/legal/components/LegalPageShell.svelte";
  import PrivacyPolicyContent from "#lib/shared/legal/components/PrivacyPolicyContent.svelte";
  import { PRIVACY_LAST_UPDATED } from "#lib/shared/legal/components/legal-dates.js";
  import Seo from "#lib/shared/components/Seo.svelte";
</script>

<Seo
  title="Privacy Policy | Flow Arts Composer"
  description="Privacy Policy for the Flow Arts Composer application."
  canonical="https://tkaflowarts.com/privacy"
/>

<LegalPageShell>
  <div class="header-content">
    <h1>Privacy Policy</h1>
    <p class="last-updated">Last Updated: {PRIVACY_LAST_UPDATED}</p>
  </div>

  <div class="legal-card">
    <PrivacyPolicyContent />
  </div>
</LegalPageShell>

<style>
  .header-content {
    margin-bottom: 2rem;
  }
</style>
