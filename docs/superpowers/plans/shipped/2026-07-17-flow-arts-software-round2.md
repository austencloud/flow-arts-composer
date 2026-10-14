# Flow Arts Software Page — Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Screenshots laid into the lineage page (responsive iPhone SE through 4K), Taylor Flows removed, Flow Arts Meet Up elevated, a "Paper Tools" section for Lorq Nichols' Spin Science systems, and a public no-auth "submit your software" form that pings Austen via the existing Pulse push path.

**Architecture:** Full rewrite of `/roots/software/+page.svelte` (galleries are fixed-aspect figures, zero layout shift). New form clones the `WaitlistForm`/`shop_waitlist` pattern: open-create Firestore collection `software_submissions` + a new `onDocumentCreated` Pulse trigger calling `notifyAdmins()`.

**Round 1 plan:** `docs/superpowers/plans/2026-07-16-flow-arts-software-seo.md` (its Global Constraints all still apply: no em dashes, scoped commits, verified facts only).

**Assets (already downloaded to `static/roots/software/`, committed by Task 6):** `vtg-1.webp`, `vtg-2.webp` (800x1600 phone), `poi-lab.webp`, `double-staff-lab.webp`, `hoop-twinz-lab.webp`, `tutting-lab.webp`, `ar-flow-arts.webp` (800x1600 phone, all from Google Play listings), `visualspinner3d.webp`, `flow-arts-meet-up.webp`, `spin-science.webp` (browser captures, ~1.88:1).

**New verified facts allowed on the page (from the 2026-07-16/17 research passes; nothing beyond these):**
- Lorq Nichols runs Spin Science (spinscience.xyz, sirlorq.wordpress.com); systems: Shape Matrix, 324 Patterns, 144 Atomic Hybrids, 9 Flower Families, Book of P.H.A.T. (with contributions from Brian Thompson, David "Tankboy" Cantor, and Noel Yee). These are charts/printed systems, not software.
- Flow Arts Meet Up: by Ty Roachford, iOS + Android + web, community app: events, festivals, finding spinners, vendor marketplace.
- Taylor Flows is REMOVED from the page entirely (Austen's call: not part of the historical software lineage).

---

### Task 6: Rewrite the lineage page with galleries + new sections

**Files:**
- Rewrite: `src/routes/(public)/roots/software/+page.svelte` (complete replacement below)
- Add (already on disk, just commit): `static/roots/software/*.webp` (10 files)

- [x] **Step 6.1:** Replace the ENTIRE contents of `src/routes/(public)/roots/software/+page.svelte` with:

```svelte
<script lang="ts">
  import "$lib/shared/landing/styles/public-editorial.css";
  import SoftwareSubmitForm from "$lib/shared/landing/components/SoftwareSubmitForm.svelte";

  // Every URL verified live 2026-07-16/17 (research passes, spec
  // 2026-07-16-flow-arts-software-seo-design.md). Statuses noted in copy.
  const links = {
    vtgPlay: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.VTGv3",
    vtgIos: "https://apps.apple.com/us/app/vtg-full-flow-arts-resource/id1468743063",
    poiLab: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.poilab.full",
    doubleStaffLab:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.doublestafflab.full",
    hoopLab: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.hooplab.full",
    tuttingLab: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.armcontrollab",
    spinScience: "http://spinscience.xyz/",
    sirLorq: "https://sirlorq.wordpress.com/tech-tiles/",
    visualSpinner: "https://infiniteperplexity.github.io/visual-spinner-3d/",
    visualSpinnerGithub: "https://github.com/infiniteperplexity/visual-spinner-3d",
    arFlowArtsPlay: "https://play.google.com/store/apps/details?id=com.arflowartsreact",
    arFlowArtsIos: "https://apps.apple.com/us/app/arflowarts/id1517940593",
    fam: "https://www.flowartsmeetup.com/",
  };

  const TITLE = "The History of Flow Arts Software | The Kinetic Alphabet";
  const DESCRIPTION =
    "Flow artists have been building software for over a decade: reference apps, spinning simulators, AR effects, and community platforms. Who built the tools, what they do, and where they are now.";
</script>

<svelte:head>
  <title>{TITLE}</title>
  <meta name="description" content={DESCRIPTION} />
  <link rel="canonical" href="https://tkaflowarts.com/roots/software" />

  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://tkaflowarts.com/roots/software" />
  <meta property="og:title" content={TITLE} />
  <meta property="og:description" content={DESCRIPTION} />
  <meta property="og:image" content="https://tkaflowarts.com/branding/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={TITLE} />
  <meta name="twitter:description" content={DESCRIPTION} />
  <meta name="twitter:image" content="https://tkaflowarts.com/branding/og-image.png" />

  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "The History of Flow Arts Software",
    "url": "https://tkaflowarts.com/roots/software",
    "description": "${DESCRIPTION}",
    "inLanguage": "en-US",
    "author": { "@type": "Person", "name": "Austen Cloud", "url": "https://tkaflowarts.com/about" },
    "publisher": {
      "@type": "Organization",
      "name": "The Kinetic Alphabet",
      "url": "https://tkaflowarts.com/"
    }
  }
  </script>`}

  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://tkaflowarts.com/" },
      { "@type": "ListItem", "position": 2, "name": "Roots", "item": "https://tkaflowarts.com/roots" },
      { "@type": "ListItem", "position": 3, "name": "Software History", "item": "https://tkaflowarts.com/roots/software" }
    ]
  }
  </script>`}
</svelte:head>

<div class="editorial">
  <header class="editorial-header">
    <h1 class="page-title">The History of Flow Arts Software</h1>
    <p class="page-subtitle">The tools that came before, and the people who built them</p>
  </header>

  <div class="lede">
    <p>
      Flow arts is a niche discipline. No software company was ever going to serve it, so
      the artists who could code built the tools themselves. This page documents that
      lineage: the reference apps, the simulators, and the platforms the community made,
      with working links to everything that still runs.
    </p>
  </div>

  <!-- VTG app -->
  <section class="editorial-section" style="--accent: #f59e0b">
    <h2 class="section-title">The VTG App</h2>
    <div class="prose">
      <p>
        Vulcan Tech Gospel gave flow artists a shared vocabulary for timing, direction,
        and motion type. The <strong>VTG app</strong> turned that framework into a pocket
        reference: animations, quizzes, and pattern layouts covering staff, poi, clubs,
        hoops, fans, buugeng, and triads. The app has gone through multiple versions with
        different developers over the years. The current release comes from Michael Caden
        Pike and Noel Yee, and it is still available on both stores.
      </p>
      <div class="shot-strip phones two">
        <figure class="shot">
          <img
            src="/roots/software/vtg-1.webp"
            alt="Screenshot of the VTG app rendering a two-petal in-spin pattern"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>VTG app, Google Play listing</figcaption>
        </figure>
        <figure class="shot">
          <img
            src="/roots/software/vtg-2.webp"
            alt="Screenshot of the VTG app's timing and direction reference screen"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>Timing and direction reference</figcaption>
        </figure>
      </div>
      <div class="resource-row">
        <a href={links.vtgPlay} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>VTG on Google Play</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.vtgIos} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>VTG on the App Store</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
      </div>
      <p>
        For what VTG contributed to The Kinetic Alphabet itself, read the
        <a href="/roots">roots page</a>.
      </p>
    </div>
  </section>

  <!-- Paper tools -->
  <section class="editorial-section" style="--accent: #a855f7">
    <h2 class="section-title">The Paper Tools</h2>
    <div class="prose">
      <p>
        Not every tool was software. <strong>Lorq Nichols</strong> spent years mapping poi
        movement into printed systems through Spin Science: the Shape Matrix, 324
        Patterns, the 144 Atomic Hybrids, the 9 Flower Families, and the Book of
        P.H.A.T., built with contributions from Brian Thompson, David "Tankboy" Cantor,
        and Noel Yee. Charts and posters rather than apps, but they do the same job a
        simulator does: show you the pattern space so you can navigate it.
      </p>
      <div class="shot-strip web">
        <figure class="shot">
          <img
            src="/roots/software/spin-science.webp"
            alt="Screenshot of the Spin Science website by Lorq Nichols"
            loading="lazy"
            width="1600"
            height="850"
          />
          <figcaption>spinscience.xyz</figcaption>
        </figure>
      </div>
      <div class="resource-row">
        <a href={links.spinScience} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Spin Science</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.sirLorq} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Book of P.H.A.T. at Sir Lorq</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- LAB simulators -->
  <section class="editorial-section" style="--accent: #ec4899">
    <h2 class="section-title">The LAB Simulators</h2>
    <div class="prose">
      <p>
        Michael Caden Pike kept going. Over the years he shipped a whole family of
        simulators: <strong>Poi LAB</strong>, <strong>Double Staff LAB</strong>,
        <strong>Hoop Twinz LAB</strong>, and the <strong>Arm Control (Tutting) Lab</strong>.
        Each one lets you program a move, watch it animate as 2D trails, slow it down, and
        share the pattern. Double Staff LAB alone ships more than a hundred patterns,
        labeled in VTG terms or old-school names. The family last saw updates in early
        2024, and every app is still downloadable.
      </p>
      <div class="shot-strip phones">
        <figure class="shot">
          <img
            src="/roots/software/poi-lab.webp"
            alt="Screenshot of the Poi LAB Android app, from its Google Play listing"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>Poi LAB</figcaption>
        </figure>
        <figure class="shot">
          <img
            src="/roots/software/double-staff-lab.webp"
            alt="Screenshot of the Double Staff LAB Android app's pattern picker"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>Double Staff LAB</figcaption>
        </figure>
        <figure class="shot">
          <img
            src="/roots/software/hoop-twinz-lab.webp"
            alt="Screenshot of the Hoop Twinz LAB Android app, from its Google Play listing"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>Hoop Twinz LAB</figcaption>
        </figure>
        <figure class="shot">
          <img
            src="/roots/software/tutting-lab.webp"
            alt="Screenshot of the Arm Control Tutting Lab Android app, from its Google Play listing"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>Arm Control (Tutting) Lab</figcaption>
        </figure>
      </div>
      <div class="resource-row">
        <a href={links.poiLab} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Poi LAB</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.doubleStaffLab} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Double Staff LAB</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.hoopLab} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Hoop Twinz LAB</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.tuttingLab} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Arm Control (Tutting) Lab</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- VisualSpinner3D -->
  <section class="editorial-section" style="--accent: #818cf8">
    <h2 class="section-title">The Browser Simulator</h2>
    <div class="prose">
      <p>
        <strong>VisualSpinner3D</strong> took a different route: no install, just a web
        page. Glenn Wright, a fire spinner and programmer, built an open source simulator
        that renders flowers, pendulums, and hybrids for poi, staff, hoop, and fans right
        in the browser. It went up around 2014 and it still runs today, with the source
        on GitHub.
      </p>
      <div class="shot-strip web">
        <figure class="shot">
          <img
            src="/roots/software/visualspinner3d.webp"
            alt="Screenshot of the VisualSpinner3D browser simulator by Glenn Wright"
            loading="lazy"
            width="1600"
            height="850"
          />
          <figcaption>VisualSpinner3D running in the browser</figcaption>
        </figure>
      </div>
      <div class="resource-row">
        <a href={links.visualSpinner} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>VisualSpinner3D (live demo)</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.visualSpinnerGithub} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Source on GitHub</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- Today -->
  <section class="editorial-section" style="--accent: #22c55e">
    <h2 class="section-title">Today</h2>
    <div class="prose">
      <p>
        The current generation splits by purpose. <strong>AR Flow Arts</strong> by Ian
        Borukhovich overlays glowing trails and particle effects onto flow footage shot
        with your phone. <strong>Flow Arts Meet Up</strong> by Ty Roachford found real
        traction in the community: an app for finding jams, festivals, and other spinners
        near you, with event listings and a vendor marketplace along the way.
      </p>
      <div class="shot-strip mixed">
        <figure class="shot phone">
          <img
            src="/roots/software/ar-flow-arts.webp"
            alt="Screenshot of the AR Flow Arts app, from its Google Play listing"
            loading="lazy"
            width="800"
            height="1600"
          />
          <figcaption>AR Flow Arts</figcaption>
        </figure>
        <figure class="shot web-shot">
          <img
            src="/roots/software/flow-arts-meet-up.webp"
            alt="Screenshot of the Flow Arts Meet Up website by Ty Roachford"
            loading="lazy"
            width="1600"
            height="850"
          />
          <figcaption>flowartsmeetup.com</figcaption>
        </figure>
      </div>
      <div class="resource-row">
        <a href={links.arFlowArtsPlay} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>AR Flow Arts (Android)</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.arFlowArtsIos} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>AR Flow Arts (iOS)</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.fam} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Flow Arts Meet Up</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- Where TKA fits -->
  <section class="editorial-section panel" style="--accent: #06b6d4">
    <h2 class="section-title">Where The Kinetic Alphabet Fits</h2>
    <div class="prose">
      <p>
        Look at the list again: a reference app, a shelf of printed pattern systems, four
        simulators plus a browser one, an effects camera, a social network. The one thing
        missing is notation. A 2016 design exercise called PoiNotation sketched a text
        language for poi moves, but it never shipped. Writing choreography down, the way
        musicians write music, stayed an open problem.
      </p>
      <p>
        That is the problem The Kinetic Alphabet solves. Flow Arts Composer is the
        <a href="/composer">flow arts software</a> built on it: sequences written as
        notation, composed step by step, animated with any supported prop, and shared as
        something another artist can read.
      </p>
    </div>
  </section>

  <!-- Submit -->
  <section class="editorial-section" style="--accent: #f59e0b" id="submit">
    <h2 class="section-title">Add to This List</h2>
    <div class="prose">
      <p>
        Built flow arts software? Remember a tool this page is missing, or spotted a
        detail that is wrong? Submit it below. Every submission gets reviewed, and
        anything that belongs here gets added with credit. Statuses on this page were
        last checked in July 2026.
      </p>
      <SoftwareSubmitForm source="roots-software" />
    </div>
  </section>

  <!-- CTA -->
  <div class="cta-card">
    <h3>Try the current chapter</h3>
    <p>Flow Arts Composer runs in your browser and costs nothing.</p>
    <a href="/composer" class="cta-button">
      <span>Open Flow Arts Composer</span>
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </a>
  </div>
</div>

<style>
  /* Screenshot galleries. Fixed aspect boxes (no layout shift on load), fluid
     from iPhone SE (375px: phones 2-up) to 4K (the editorial column caps at
     46rem; 800px-wide sources keep phone shots crisp at 2x). */
  .shot-strip {
    display: grid;
    gap: 0.9rem;
    margin: 1.5rem 0 1.1rem;
  }
  .shot-strip.phones {
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  }
  .shot-strip.phones.two {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    max-width: 26rem;
  }
  .shot-strip.web {
    grid-template-columns: 1fr;
  }
  .shot-strip.mixed {
    grid-template-columns: minmax(130px, 1fr) minmax(200px, 2.4fr);
    align-items: start;
  }

  .shot {
    margin: 0;
  }
  .shot img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 2;
    object-fit: cover;
    border-radius: 12px;
    border: 1px solid oklch(0.45 0.04 270 / 0.25);
    background: oklch(0.22 0.03 270);
  }
  .shot-strip.web .shot img,
  .shot.web-shot img {
    aspect-ratio: 16 / 9;
  }
  .shot figcaption {
    margin-top: 0.45rem;
    font-size: 0.8rem;
    line-height: 1.35;
    color: oklch(0.62 0.02 270);
    text-align: center;
  }

  @media (max-width: 480px) {
    .shot-strip.phones {
      grid-template-columns: repeat(2, 1fr);
    }
    .shot-strip.mixed {
      grid-template-columns: 1fr;
    }
    /* A stacked phone shot must not become a full-width 750px-tall tower. */
    .shot-strip.mixed .shot.phone {
      width: 100%;
      max-width: 200px;
      margin: 0 auto;
    }
  }
</style>
```

- [x] **Step 6.2: Commit** (assets + page):

```bash
git add static/roots/software "src/routes/(public)/roots/software/+page.svelte"
git commit -m "feat(seo): lineage page round 2: screenshots, Paper Tools, FAM elevated, Taylor Flows cut" -- static/roots/software "src/routes/(public)/roots/software/+page.svelte"
```

NOTE: this commit will fail to build until Task 7 creates `SoftwareSubmitForm.svelte`. Execute Task 7 FIRST, then commit Task 6 and Task 7 together is NOT allowed (scoped commits) — instead: do Task 7's file creation, then Task 6's rewrite, then commit Task 7, then commit Task 6. Order of commits: form first, page second.

---

### Task 7: Submission service + form component

**Files:**
- Create: `src/lib/shared/landing/services/software-submissions.ts`
- Create: `src/lib/shared/landing/components/SoftwareSubmitForm.svelte`

- [x] **Step 7.1:** Create `src/lib/shared/landing/services/software-submissions.ts`:

```ts
// Public "submit your flow arts software" capture for /roots/software. A
// signed-out visitor names a tool; it lands in software_submissions for review.
// Clones the shop_waitlist pattern (waitlist.ts): anyone create, admin read
// (firestore.rules) — needs a rules deploy before it persists. A Pulse trigger
// (pulseSoftwareSubmission) pings the admin on each new doc.
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";

export async function submitSoftware(
  name: string,
  url: string,
  notes: string,
  source = "roots-software"
): Promise<void> {
  const firestore = await getFirestoreInstance();
  await addDoc(collection(firestore, "software_submissions"), {
    name: name.trim(),
    url: url.trim(),
    notes: notes.trim(),
    createdAt: serverTimestamp(),
    source,
  });
}
```

- [x] **Step 7.2:** Create `src/lib/shared/landing/components/SoftwareSubmitForm.svelte`:

```svelte
<!--
  SoftwareSubmitForm — public "add your tool to the list" capture into
  software_submissions, modeled on the store's WaitlistForm (same reserved-slot
  layout so form -> confirmation never shifts the page; no-layout-shift rule).
-->
<script lang="ts">
  import { submitSoftware } from "../services/software-submissions";

  interface Props {
    /** Tags which surface captured the submission. */
    source?: string;
  }
  let { source = "roots-software" }: Props = $props();

  let name = $state("");
  let url = $state("");
  let notes = $state("");
  let status = $state<"idle" | "submitting" | "done" | "error">("idle");
  let errorMessage = $state("");

  const canSubmit = $derived(name.trim().length > 1 && status !== "submitting");

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (name.trim().length < 2) {
      status = "error";
      errorMessage = "Give the tool a name.";
      return;
    }
    status = "submitting";
    errorMessage = "";
    try {
      await submitSoftware(name, url, notes, source);
      status = "done";
    } catch (err) {
      console.error("[SoftwareSubmitForm] submission write failed:", err);
      status = "error";
      errorMessage = "Couldn't save that just now. Try again in a moment.";
    }
  }
</script>

<div class="submit-slot">
  {#if status === "done"}
    <div class="confirmed" role="status">
      <i class="fas fa-circle-check" aria-hidden="true"></i>
      <span>Got it. Every submission gets reviewed, and additions are credited.</span>
    </div>
  {:else}
    <form class="submit-form" onsubmit={handleSubmit}>
      <label class="field">
        <span class="field-label">Tool name</span>
        <input
          class="text-input"
          type="text"
          bind:value={name}
          maxlength="120"
          placeholder="What is it called?"
          aria-invalid={status === "error" && name.trim().length < 2}
        />
      </label>
      <label class="field">
        <span class="field-label">Link (optional)</span>
        <input
          class="text-input"
          type="url"
          inputmode="url"
          autocapitalize="off"
          spellcheck="false"
          bind:value={url}
          maxlength="500"
          placeholder="https://"
        />
      </label>
      <label class="field">
        <span class="field-label">Anything we should know (optional)</span>
        <textarea
          class="text-input"
          rows="3"
          bind:value={notes}
          maxlength="2000"
          placeholder="Who built it, what it does, where it lives now"
        ></textarea>
      </label>
      <button class="submit-btn" type="submit" disabled={!canSubmit}>
        {#if status === "submitting"}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-paper-plane" aria-hidden="true"></i>
        {/if}
        <span>Submit it</span>
      </button>
      <p class="error-line" class:visible={status === "error"} aria-live="polite">
        {errorMessage}
      </p>
    </form>
  {/if}
</div>

<style>
  .submit-slot {
    /* Reserves the form's height; the confirmation renders in the same box. */
    min-height: 400px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    margin-top: 1.2rem;
  }

  .submit-form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-width: 30rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: oklch(0.72 0.02 270);
  }

  .text-input {
    width: 100%;
    padding: 12px 16px;
    min-height: var(--min-touch-target, 44px);
    background: rgba(255, 255, 255, 0.06);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.95rem);
    font-family: inherit;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;
  }
  textarea.text-input {
    resize: vertical;
    min-height: 84px;
  }
  .text-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
  .text-input:focus {
    outline: none;
    border-color: #8b6cff;
    background: rgba(255, 255, 255, 0.09);
  }
  .text-input[aria-invalid="true"] {
    border-color: var(--semantic-error, #ef4444);
  }

  .submit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    align-self: flex-start;
    padding: 0 22px;
    min-height: var(--min-touch-target, 44px);
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    color: #fff;
    font-size: var(--font-size-sm, 0.95rem);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition:
      filter 0.18s ease,
      transform 0.18s ease;
  }
  .submit-btn:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-line {
    margin: 0;
    min-height: 1.2em; /* reserved so the page never jumps */
    font-size: var(--font-size-sm, 0.85rem);
    color: var(--semantic-error, #ff8a8a);
    opacity: 0;
  }
  .error-line.visible {
    opacity: 1;
  }

  .confirmed {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 16px 22px;
    border-radius: 14px;
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.4);
    color: #a7f3d0;
    font-size: var(--font-size-sm, 0.95rem);
    font-weight: 600;
    align-self: flex-start;
  }
  .confirmed i {
    font-size: 1.2rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .text-input,
    .submit-btn {
      transition: none;
    }
  }
</style>
```

- [x] **Step 7.3: Commit** (BEFORE Task 6's commit, see ordering note):

```bash
git add src/lib/shared/landing/services/software-submissions.ts src/lib/shared/landing/components/SoftwareSubmitForm.svelte
git commit -m "feat(landing): public software-submission form + service (waitlist pattern)" -- src/lib/shared/landing/services/software-submissions.ts src/lib/shared/landing/components/SoftwareSubmitForm.svelte
```

---

### Task 8: Firestore rule + Pulse trigger + registrations

**Files:**
- Modify: `firestore.rules` (after the `shop_waitlist` block that starts at line ~1352)
- Modify: `firebase-functions/src/pulse/pulseTriggers.ts` (append after `pulseCollectionCreated`)
- Modify: `firebase-functions/src/pulse/notifyAdmins.ts` (`PULSE_PREF_KEYS`, line ~36)
- Modify: `firebase-functions/src/push/pushDispatcher.ts` (`PREF_KEY_MAP`, line ~53)
- Modify: `firebase-functions/src/push/onNewNotification.ts` (`PULSE_TITLES`, line ~80)
- Modify: `firebase-functions/src/index.ts` (export the new trigger next to `pulseCollectionCreated`, line ~22)

- [x] **Step 8.1:** In `firestore.rules`, insert AFTER the closing brace of the `shop_waitlist` match block:

```
    // Public "submit your flow arts software" capture (/roots/software).
    // Mirrors shop_waitlist: anyone may create a shape-valid doc, only the
    // admin reads, nothing is ever updated or deleted from the client.
    match /software_submissions/{entryId} {
      allow read: if isAdmin();
      allow create: if request.resource.data.name is string
        && request.resource.data.name.size() > 1
        && request.resource.data.name.size() < 120
        && request.resource.data.url is string
        && request.resource.data.url.size() < 500
        && request.resource.data.notes is string
        && request.resource.data.notes.size() < 2000;
      allow update, delete: if false;
    }
```

- [x] **Step 8.2:** Append to `firebase-functions/src/pulse/pulseTriggers.ts` after `pulseCollectionCreated`:

```ts
/** A visitor submitted a tool for the /roots/software lineage list. */
export const pulseSoftwareSubmission = onDocumentCreated(
  "software_submissions/{submissionId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const sub = snap.data();
    const name = (sub.name as string) || "an unnamed tool";
    const url = (sub.url as string) || "";

    await notifyAdmins({
      type: "admin-software-submission",
      message: `Software list submission: "${name}"${url ? ` (${url})` : ""}`,
      data: {
        submissionId: event.params.submissionId,
        toolName: name,
        toolUrl: url,
      },
    });
  }
);
```

- [x] **Step 8.3:** In `notifyAdmins.ts` add to `PULSE_PREF_KEYS`:

```ts
  "admin-software-submission": "adminSoftwareSubmission",
```

- [x] **Step 8.4:** In `pushDispatcher.ts` add to `PREF_KEY_MAP` (same key style as the other admin-* entries there):

```ts
  "admin-software-submission": "adminSoftwareSubmission",
```

- [x] **Step 8.5:** In `onNewNotification.ts` add to `PULSE_TITLES`:

```ts
  "admin-software-submission": "Software submission",
```

- [x] **Step 8.6:** In `firebase-functions/src/index.ts`, add `pulseSoftwareSubmission,` to the import/export list next to `pulseCollectionCreated`.

- [x] **Step 8.7:** Typecheck the functions package: run `npx tsc --noEmit -p firebase-functions/tsconfig.json` from the worktree root (or `npm run build` inside `firebase-functions/` if that script exists — check its package.json). Report the output.

- [x] **Step 8.8: Commit:**

```bash
git commit -m "feat(pulse): software_submissions collection rule + admin ping trigger" -- firestore.rules firebase-functions/src/pulse/pulseTriggers.ts firebase-functions/src/pulse/notifyAdmins.ts firebase-functions/src/push/pushDispatcher.ts firebase-functions/src/push/onNewNotification.ts firebase-functions/src/index.ts
```

---

### Task 9: Spec addendum

- [x] **Step 9.1:** Append to `docs/superpowers/specs/2026-07-16-flow-arts-software-seo-design.md`:

```markdown

## Round 2 (2026-07-17, Austen's review)

- Screenshots added: app promo images pulled from each tool's own Google Play
  listing (clean app UI, credited and linked in captions/chips), plus browser
  captures of the web tools. Assets in `static/roots/software/`. Galleries are
  fixed-aspect (no layout shift), 2-up phones on iPhone SE, crisp at 4K.
- Taylor Flows REMOVED: Austen judged it not part of the historical software
  lineage (recent platform-built tutorial app, no notation/simulation lineage).
- Flow Arts Meet Up elevated: Ty Roachford's community app got real traction;
  now a named entry in Today with its screenshot.
- New "Paper Tools" section: Lorq Nichols' Spin Science systems (Shape Matrix,
  324 Patterns, 144 Atomic Hybrids, 9 Flower Families, Book of P.H.A.T.).
  Not software, and the page says so; they earn their place as the printed
  generation of pattern tools.
- "Add to This List" section: public no-auth submission form
  (SoftwareSubmitForm -> software_submissions collection, cloned from the
  shop_waitlist pattern) + pulseSoftwareSubmission trigger pinging Austen via
  the existing notifyAdmins/FCM path. NEEDS DEPLOY: firestore.rules and
  firebase-functions must be deployed before submissions persist and ping.
```

- [x] **Step 9.2: Commit:**

```bash
git commit -m "docs(spec): round 2 addendum (screenshots, roster changes, submission form)" -- docs/superpowers/specs/2026-07-16-flow-arts-software-seo-design.md
```

---

### Task 10: Verification (orchestrator, main loop)

- [ ] `npm run check` in the worktree (one cold run, grep for errors)
- [ ] Em-dash sweep of new/changed user-visible files
- [ ] Browser screenshots of localhost:5180/roots/software at 375px (iPhone SE) and wide desktop; visual pass on galleries and the form
- [ ] Grep diff for `type="checkbox"` (must be zero)
