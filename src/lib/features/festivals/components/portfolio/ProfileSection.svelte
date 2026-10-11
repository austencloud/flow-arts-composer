<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";
  import type { TeachingPortfolio } from "../../domain/models/teaching-portfolio";

  const { state: festivalState } = getFestivalContext();

  let newCredit = $state("");

  function addCredit() {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio || !newCredit.trim()) return;
    const updated: TeachingPortfolio = {
      ...portfolio,
      performanceCredits: [...portfolio.performanceCredits, newCredit.trim()],
    };
    festivalState.savePortfolio(uid, updated);
    newCredit = "";
  }

  function removeCredit(index: number) {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio) return;
    const credits = portfolio.performanceCredits.filter((_, i) => i !== index);
    festivalState.savePortfolio(uid, { ...portfolio, performanceCredits: credits });
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function debounceSave(updater: () => TeachingPortfolio) {
    const uid = auth.currentUser?.uid;
    if (!uid || !festivalState.portfolio) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const portfolio = festivalState.portfolio;
      if (!uid || !portfolio) return;
      festivalState.savePortfolio(uid, updater());
    }, 600);
  }

  let slWebsite = $state("");
  let slInstagram = $state("");
  let slFacebook = $state("");
  let slYoutube = $state("");
  let slTiktok = $state("");

  let aHomeCity = $state("");
  let aHomeCountry = $state("");
  let aYearsTeaching = $state(0);
  let aYearsPerforming = $state(0);
  let aInsuranceProvider = $state("");

  $effect(() => {
    const p = festivalState.portfolio;
    if (!p) return;
    slWebsite = p.socialLinks.website ?? "";
    slInstagram = p.socialLinks.instagram ?? "";
    slFacebook = p.socialLinks.facebook ?? "";
    slYoutube = p.socialLinks.youtube ?? "";
    slTiktok = p.socialLinks.tiktok ?? "";
    aHomeCity = p.homeCity ?? "";
    aHomeCountry = p.homeCountry ?? "";
    aYearsTeaching = p.yearsTeaching ?? 0;
    aYearsPerforming = p.yearsPerforming ?? 0;
    aInsuranceProvider = p.insuranceInfo?.provider ?? "";
  });

  function handleSocialChange() {
    debounceSave(() => ({
      ...festivalState.portfolio!,
      socialLinks: {
        website: slWebsite || undefined,
        instagram: slInstagram || undefined,
        facebook: slFacebook || undefined,
        youtube: slYoutube || undefined,
        tiktok: slTiktok || undefined,
      },
    }));
  }

  function handleAboutChange() {
    debounceSave(() => ({
      ...festivalState.portfolio!,
      homeCity: aHomeCity,
      homeCountry: aHomeCountry,
      yearsTeaching: Number(aYearsTeaching) || 0,
      yearsPerforming: Number(aYearsPerforming) || 0,
      insuranceInfo: aInsuranceProvider
        ? { provider: aInsuranceProvider }
        : undefined,
    }));
  }

  let editingField = $state<string | null>(null);
  let editingFieldOriginal = $state<string | number>("");

  function startFieldEdit(field: string) {
    editingField = field;
    switch (field) {
      case "website": editingFieldOriginal = slWebsite; break;
      case "instagram": editingFieldOriginal = slInstagram; break;
      case "facebook": editingFieldOriginal = slFacebook; break;
      case "youtube": editingFieldOriginal = slYoutube; break;
      case "tiktok": editingFieldOriginal = slTiktok; break;
      case "homeCity": editingFieldOriginal = aHomeCity; break;
      case "homeCountry": editingFieldOriginal = aHomeCountry; break;
      case "yearsTeaching": editingFieldOriginal = aYearsTeaching; break;
      case "yearsPerforming": editingFieldOriginal = aYearsPerforming; break;
      case "insuranceProvider": editingFieldOriginal = aInsuranceProvider; break;
    }
  }

  function finishFieldEdit(field: string) {
    editingField = null;
    if (["website", "instagram", "facebook", "youtube", "tiktok"].includes(field)) {
      handleSocialChange();
    } else {
      handleAboutChange();
    }
  }

  function cancelFieldEdit(field: string) {
    switch (field) {
      case "website": slWebsite = editingFieldOriginal as string; break;
      case "instagram": slInstagram = editingFieldOriginal as string; break;
      case "facebook": slFacebook = editingFieldOriginal as string; break;
      case "youtube": slYoutube = editingFieldOriginal as string; break;
      case "tiktok": slTiktok = editingFieldOriginal as string; break;
      case "homeCity": aHomeCity = editingFieldOriginal as string; break;
      case "homeCountry": aHomeCountry = editingFieldOriginal as string; break;
      case "yearsTeaching": aYearsTeaching = editingFieldOriginal as number; break;
      case "yearsPerforming": aYearsPerforming = editingFieldOriginal as number; break;
      case "insuranceProvider": aInsuranceProvider = editingFieldOriginal as string; break;
    }
    editingField = null;
  }

  function handleFieldKeydown(e: KeyboardEvent, field: string) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      finishFieldEdit(field);
    } else if (e.key === "Escape") {
      cancelFieldEdit(field);
    }
  }

  function getSocialValue(key: string): string {
    switch (key) {
      case "website": return slWebsite;
      case "instagram": return slInstagram;
      case "facebook": return slFacebook;
      case "youtube": return slYoutube;
      case "tiktok": return slTiktok;
      default: return "";
    }
  }

  function setSocialValue(key: string, value: string) {
    switch (key) {
      case "website": slWebsite = value; break;
      case "instagram": slInstagram = value; break;
      case "facebook": slFacebook = value; break;
      case "youtube": slYoutube = value; break;
      case "tiktok": slTiktok = value; break;
    }
  }

  function getAboutValue(key: string): string | number {
    switch (key) {
      case "homeCity": return aHomeCity;
      case "homeCountry": return aHomeCountry;
      case "yearsTeaching": return aYearsTeaching;
      case "yearsPerforming": return aYearsPerforming;
      case "insuranceProvider": return aInsuranceProvider;
      default: return "";
    }
  }

  function setAboutValue(key: string, value: string) {
    switch (key) {
      case "homeCity": aHomeCity = value; break;
      case "homeCountry": aHomeCountry = value; break;
      case "yearsTeaching": aYearsTeaching = Number(value) || 0; break;
      case "yearsPerforming": aYearsPerforming = Number(value) || 0; break;
      case "insuranceProvider": aInsuranceProvider = value; break;
    }
  }
</script>

<section class="section-card">
  <div class="section-header">
    <h3 class="section-title">
      <i class="fas fa-user" aria-hidden="true" style="margin-right: 6px; opacity: 0.5;"></i>
      Profile
    </h3>
  </div>

  <div class="profile-layout">
    <!-- Social Links column -->
    <div class="profile-column">
      <div class="profile-column-title">Social Links</div>
      {#each [
        { key: "website", icon: "fa-globe", iconClass: "fas", placeholder: "yourwebsite.com" },
        { key: "instagram", icon: "fa-instagram", iconClass: "fab", placeholder: "@handle" },
        { key: "facebook", icon: "fa-facebook", iconClass: "fab", placeholder: "facebook.com/page" },
        { key: "youtube", icon: "fa-youtube", iconClass: "fab", placeholder: "youtube.com/@channel" },
        { key: "tiktok", icon: "fa-tiktok", iconClass: "fab", placeholder: "@handle" },
      ] as link (link.key)}
        <div
          class="social-row"
          onclick={() => editingField !== link.key && startFieldEdit(link.key)}
          onkeydown={(e) => e.key === "Enter" && editingField !== link.key && startFieldEdit(link.key)}
          role="button"
          tabindex="0"
        >
          <i
            class="{link.iconClass} {link.icon} social-icon"
            aria-hidden="true"
          ></i>
          {#if editingField === link.key}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="social-edit-input"
              type="text"
              value={getSocialValue(link.key)}
              oninput={(e) => setSocialValue(link.key, (e.target as HTMLInputElement).value)}
              placeholder={link.placeholder}
              onblur={() => finishFieldEdit(link.key)}
              onkeydown={(e) => handleFieldKeydown(e, link.key)}
              aria-label={link.key}
              autofocus
            />
          {:else}
            {@const val = getSocialValue(link.key)}
            <span class="social-value" class:empty={!val}>
              {val || "Not set"}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- About column -->
    <div class="profile-column">
      <div class="profile-column-title">About</div>
      {#each [
        { key: "homeCity", label: "City", type: "text", placeholder: "Chicago" },
        { key: "homeCountry", label: "Country", type: "text", placeholder: "USA" },
        { key: "yearsTeaching", label: "Years Teaching", type: "number", placeholder: "" },
        { key: "yearsPerforming", label: "Years Performing", type: "number", placeholder: "" },
        { key: "insuranceProvider", label: "Insurance", type: "text", placeholder: "e.g. Specialty Insurance" },
      ] as field (field.key)}
        <div
          class="about-row"
          onclick={() => editingField !== field.key && startFieldEdit(field.key)}
          onkeydown={(e) => e.key === "Enter" && editingField !== field.key && startFieldEdit(field.key)}
          role="button"
          tabindex="0"
        >
          <span class="about-label">{field.label}</span>
          {#if editingField === field.key}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="social-edit-input"
              type={field.type}
              value={getAboutValue(field.key)}
              oninput={(e) => setAboutValue(field.key, (e.target as HTMLInputElement).value)}
              placeholder={field.placeholder}
              min={field.type === "number" ? "0" : undefined}
              onblur={() => finishFieldEdit(field.key)}
              onkeydown={(e) => handleFieldKeydown(e, field.key)}
              aria-label={field.label}
              autofocus
            />
          {:else}
            {@const val = getAboutValue(field.key)}
            <span
              class="about-value"
              class:empty={!val && val !== 0}
            >
              {#if val || val === 0}
                {val}
              {:else}
                Not set
              {/if}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Performance Credits -->
    <div class="profile-column profile-credits-column">
      <div class="profile-column-title">Credits</div>
      <div class="credits-flow">
        {#each festivalState.portfolio!.performanceCredits as credit, i (i)}
          <div class="credit-pill">
            <span>{credit}</span>
            <button
              class="credit-remove"
              onclick={() => removeCredit(i)}
              aria-label="Remove {credit}"
              tabindex="0"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        {/each}
        <input
          class="credit-add-input"
          type="text"
          bind:value={newCredit}
          placeholder="Add credit..."
          onkeydown={(e) => e.key === "Enter" && addCredit()}
        />
      </div>
    </div>
  </div>
</section>

<style>
  .section-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 14px;
    grid-column: 1 / -1;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }


  .profile-layout {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
  }

  @media (max-width: 900px) {
    .profile-layout {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 600px) {
    .profile-layout {
      grid-template-columns: 1fr;
    }
  }

  .profile-column-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }

  .profile-credits-column {
    min-width: 0;
    overflow: hidden;
  }


  .social-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    cursor: pointer;
  }

  .social-row:last-child {
    border-bottom: none;
  }

  .social-icon {
    width: 20px;
    text-align: center;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 14px);
    flex-shrink: 0;
  }

  .social-value {
    flex: 1;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #ffffff);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .social-value.empty {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.3));
    font-style: italic;
  }

  .social-edit-input {
    flex: 1;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-accent, #6366f1);
    border-radius: 5px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    padding: 4px 8px;
  }

  .social-edit-input:focus {
    outline: none;
  }


  .about-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    cursor: pointer;
  }

  .about-row:last-child {
    border-bottom: none;
  }

  .about-label {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    flex-shrink: 0;
    min-width: 0;
  }

  .about-value {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #ffffff);
    font-weight: 500;
    word-break: break-word;
    text-align: right;
  }

  .about-value.empty {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.3));
    font-style: italic;
    font-weight: 400;
  }


  .credits-flow {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .credit-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    border-radius: 16px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #ffffff);
    max-width: 100%;
  }

  .credit-pill span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .credit-remove {
    opacity: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    border-radius: 50%;
    font-size: 10px;
    transition: opacity 0.15s, color 0.15s;
  }

  .credit-pill:hover .credit-remove,
  .credit-pill:focus-within .credit-remove {
    opacity: 1;
  }

  .credit-remove:hover {
    color: var(--semantic-error, #ef4444);
  }

  .credit-add-input {
    background: none;
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 16px;
    padding: 4px 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #ffffff);
    min-width: 0;
    width: 100%;
    max-width: 160px;
  }

  .credit-add-input::placeholder {
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.4));
  }

  .credit-add-input:focus {
    outline: none;
    border-color: var(--theme-accent, #6366f1);
    border-style: solid;
  }

  @media (max-width: 768px) {
    .credit-remove {
      opacity: 1;
      min-width: 44px;
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .credit-remove {
      transition: none;
    }
  }
</style>
