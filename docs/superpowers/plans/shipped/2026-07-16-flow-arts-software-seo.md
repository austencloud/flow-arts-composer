# Flow Arts Software SEO Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "flow arts software" lead to Flow Arts Composer: /composer owns the commercial phrase, a varied internal link web reinforces it, and a new fact-checked lineage page /roots/software takes the informational intent.

**Architecture:** Copy and metadata edits to existing public pages plus one new editorial page modeled exactly on `src/routes/(public)/roots/+page.svelte` (same CSS classes, same head pattern, same JSON-LD shapes). No new components, no new CSS.

**Tech Stack:** SvelteKit, `public-editorial.css` shared classes, schema.org JSON-LD via `{@html}` blocks.

**Spec:** `docs/superpowers/specs/2026-07-16-flow-arts-software-seo-design.md`
**Worktree:** `C:\worktrees\tka-platform\flow-arts-software-seo` (branch `feat/flow-arts-software-seo`)

## Global Constraints

- NO em dashes (U+2014) anywhere in user-visible text. Use colons, commas, or periods.
- No superlatives (revolutionary, seamless), no "Whether you're...", no hedging.
- Competitor brand names NEVER appear in our `<title>` or meta description. Body copy and H2s only.
- Only verified facts on the lineage page. The verified roster is embedded in Task 3; do not add tools or credits beyond it. "App of Poi" and the Kevin "NCK"/Alien Jon first-version credits are UNVERIFIED and must NOT appear.
- Every commit uses an explicit pathspec: `git commit -m "..." -- <paths>`. Never a bare `git commit`.
- All work happens in the worktree `C:\worktrees\tka-platform\flow-arts-software-seo`.

---

### Task 1: /composer owns the phrase + keyword configs

**Files:**
- Modify: `src/routes/(public)/composer/+page.svelte`
- Modify: `src/config/domains.ts`

**Steps:**

- [x] **Step 1.1: DESCRIPTION const** (line 11-12). Replace:

```
  const DESCRIPTION =
    "Flow Arts Composer is a free web app for building flow arts choreography. Construct sequences step by step, generate them from parameters, animate them, and share them. Supports staff, fans, clubs, hoops, buugeng, and more.";
```

with:

```
  const DESCRIPTION =
    "Flow Arts Composer is free flow arts software for building choreography in your browser. Construct sequences step by step, generate them from parameters, animate them, and share them. Supports staff, fans, clubs, hoops, buugeng, and more.";
```

- [x] **Step 1.2: Title** (line 60). Replace:

```
  <title>Flow Arts Composer | Choreography App for Staff, Fans, Clubs & More</title>
```

with:

```
  <title>Flow Arts Composer | Free Flow Arts Software for Choreography</title>
```

- [x] **Step 1.3: OG + Twitter titles** (lines 67 and 72). Replace BOTH occurrences of:

```
content="Flow Arts Composer | Choreography App for Flow Arts"
```

with:

```
content="Flow Arts Composer | Free Flow Arts Software for Choreography"
```

- [x] **Step 1.4: SoftwareApplication JSON-LD keywords.** In the first JSON-LD block, after the line `"applicationCategory": "EducationalApplication",` insert:

```
    "keywords": "flow arts software, flow arts choreography software, flow arts app",
```

- [x] **Step 1.5: Page subtitle** (line ~182). Replace:

```
      The flow arts choreography app built on <a href="/notation">The Kinetic Alphabet</a>
```

with:

```
      Free flow arts software for choreography, built on <a href="/notation">The Kinetic Alphabet</a>
```

- [x] **Step 1.6: Lede** (line ~188). Replace the first sentence:

```
      Flow Arts Composer is a free web app for building flow arts choreography. Construct
```

with:

```
      Flow Arts Composer is free flow arts software for building choreography in your
      browser. Construct
```

- [x] **Step 1.7: domains.ts keywords.** In `LANDING_SEO_CONFIG.keywords` (line ~117), change the string end `..., prop notation, movement notation"` to `..., prop notation, movement notation, flow arts software, flow arts choreography software"`. In `APP_SEO_CONFIG.keywords` (line ~136), change `..., buugeng patterns"` to `..., buugeng patterns, flow arts software, flow arts choreography software"`.

- [x] **Step 1.8: Commit**

```bash
git commit -m "feat(seo): /composer targets flow arts software + keyword configs" -- "src/routes/(public)/composer/+page.svelte" src/config/domains.ts
```

---

### Task 2: FAQ entry + notation link-web touches

**Files:**
- Modify: `src/lib/shared/landing/faq/faq-items.ts`
- Modify: `src/routes/(public)/notation/+page.svelte`
- Modify: `src/routes/(public)/notation/fans/+page.svelte`
- Modify: `src/routes/(public)/notation/clubs/+page.svelte`
- Modify: `src/routes/(public)/notation/buugeng/+page.svelte`

**Steps:**

- [x] **Step 2.1: New FAQ item.** In `faq-items.ts`, insert this item into `FAQ_ITEMS` immediately BEFORE the `"Is Flow Arts Composer free?"` item:

```ts
  {
    question: "Is there software for flow arts choreography?",
    answer:
      "Yes. Flow Arts Composer is free flow arts software that runs in your browser. Build sequences step by step, generate them from parameters, animate them with any supported prop, and share the results. Everything you make is written in The Kinetic Alphabet, so it stays readable and editable instead of trapped in a video.",
    cta: { label: "Open Flow Arts Composer", href: "/composer" },
  },
```

- [x] **Step 2.2: /notation wording** (line ~173). Replace:

```
        concepts. Then <a href="/composer">Flow Arts Composer</a>: everything else you
```

with:

```
        concepts. Then <a href="/composer">Flow Arts Composer</a>, the software side of
        the system: everything else you
```

- [x] **Step 2.3: /notation/fans wording** (line ~54-56). Replace:

```
        as letters is prop-agnostic, and the animator in
        <a href="/composer">Flow Arts Composer</a> can render it with fans instead of
        staves.
```

with:

```
        as letters is prop-agnostic, and the animator in
        <a href="/composer">Flow Arts Composer</a>, TKA's choreography software, can
        render it with fans instead of staves.
```

- [x] **Step 2.4: /notation/clubs wording** (line ~55). Replace:

```
        <a href="/composer">Flow Arts Composer</a> can render a sequence with clubs.
```

with:

```
        the <a href="/composer">Flow Arts Composer</a> software can render a sequence
        with clubs.
```

- [x] **Step 2.5: /notation/buugeng wording** (line ~54-55). Replace:

```
        <a href="/composer">Flow Arts Composer</a> can render a written sequence with
        buugeng.
```

with:

```
        <a href="/composer">Flow Arts Composer</a>, free software for flow arts
        choreography, can render a written sequence with buugeng.
```

- [x] **Step 2.6: Commit**

```bash
git commit -m "feat(seo): flow arts software FAQ entry + notation link-web anchors" -- src/lib/shared/landing/faq/faq-items.ts "src/routes/(public)/notation/+page.svelte" "src/routes/(public)/notation/fans/+page.svelte" "src/routes/(public)/notation/clubs/+page.svelte" "src/routes/(public)/notation/buugeng/+page.svelte"
```

---

### Task 3: /roots/software lineage page + roots cross-link + sitemap

**Files:**
- Create: `src/routes/(public)/roots/software/+page.svelte`
- Modify: `src/routes/(public)/roots/+page.svelte`
- Modify: `src/routes/sitemap.xml/+server.ts`

**Steps:**

- [x] **Step 3.1: Create the page.** Full contents of `src/routes/(public)/roots/software/+page.svelte`:

```svelte
<script lang="ts">
  import "$lib/shared/landing/styles/public-editorial.css";

  // Every URL verified live 2026-07-16 (research pass, spec
  // 2026-07-16-flow-arts-software-seo-design.md). Statuses noted in copy.
  const links = {
    vtgPlay: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.VTGv3",
    vtgIos: "https://apps.apple.com/us/app/vtg-full-flow-arts-resource/id1468743063",
    poiLab: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.poilab.full",
    doubleStaffLab:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.doublestafflab.full",
    hoopLab: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.hooplab.full",
    tuttingLab: "https://play.google.com/store/apps/details?id=net.firestaff.mcp.armcontrollab",
    visualSpinner: "https://infiniteperplexity.github.io/visual-spinner-3d/",
    visualSpinnerGithub: "https://github.com/infiniteperplexity/visual-spinner-3d",
    arFlowArtsPlay: "https://play.google.com/store/apps/details?id=com.arflowartsreact",
    arFlowArtsIos: "https://apps.apple.com/us/app/arflowarts/id1517940593",
    taylorFlows: "https://app.taylorflows.com/",
    fam: "https://www.flowartsmeetup.com/",
  };

  const TITLE = "The History of Flow Arts Software | The Kinetic Alphabet";
  const DESCRIPTION =
    "Flow artists have been building software for over a decade: reference apps, spinning simulators, AR effects, and training platforms. Who built the tools, what they do, and where they are now.";
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
        with your phone. <strong>Flows!</strong> by Taylor Flows is a training platform
        with structured video courses for hoop and fan technique. <strong>Flow Arts Meet
        Up</strong> by Ty Roachford covers the social side: finding jams, festivals, and
        other spinners near you.
      </p>
      <div class="resource-row">
        <a href={links.arFlowArtsPlay} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>AR Flow Arts (Android)</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.arFlowArtsIos} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>AR Flow Arts (iOS)</span>
          <i class="fas fa-external-link-alt ext" aria-hidden="true"></i>
        </a>
        <a href={links.taylorFlows} target="_blank" rel="noopener noreferrer" class="resource-chip">
          <span>Flows! by Taylor Flows</span>
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
        Look at the list again: a reference app, four simulators, an effects camera, a
        course library, a social network. The one thing missing is notation. A 2016 design
        exercise called PoiNotation sketched a text language for poi moves, but it never
        shipped. Writing choreography down, the way musicians write music, stayed an open
        problem.
      </p>
      <p>
        That is the problem The Kinetic Alphabet solves. Flow Arts Composer is the
        <a href="/composer">flow arts software</a> built on it: sequences written as
        notation, composed step by step, animated with any supported prop, and shared as
        something another artist can read.
      </p>
      <p>
        Statuses on this page were last checked in July 2026. If you built one of these
        tools and a detail is wrong, or a link has died,
        <a href="/about">get in touch</a> and it will be fixed.
      </p>
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
```

- [x] **Step 3.2: Roots cross-link.** In `src/routes/(public)/roots/+page.svelte`, insert a new section between the closing `</section>` of "The Synthesis" and the `<!-- CTA -->` comment:

```svelte
    <!-- Software lineage -->
    <section class="editorial-section" style="--accent: #06b6d4">
      <h2 class="section-title">The Software Lineage</h2>
      <div class="prose">
        <p>
          TKA is also not the first software built for flow artists. The
          <a href="/roots/software">history of flow arts software</a> covers the
          reference apps and simulators that came before Flow Arts Composer, who built
          them, and where they are now.
        </p>
      </div>
    </section>
```

- [x] **Step 3.3: Sitemap entry.** In `src/routes/sitemap.xml/+server.ts`, after the line `{ url: "roots", priority: "0.8", changefreq: "monthly" },` insert:

```ts
  { url: "roots/software", priority: "0.7", changefreq: "monthly" },
```

- [x] **Step 3.4: Commit**

```bash
git commit -m "feat(seo): /roots/software flow arts software lineage page + sitemap + roots cross-link" -- "src/routes/(public)/roots/software/+page.svelte" "src/routes/(public)/roots/+page.svelte" src/routes/sitemap.xml/+server.ts
```

---

### Task 4: Strategy docs

**Files:**
- Modify: `docs/reference/seo-winning-strategy.md` (append at end of file)
- Modify: `docs/superpowers/specs/2026-07-16-seo-a-plus-plan.md` (Wave 2 ledger)

**Steps:**

- [x] **Step 4.1: Strategy addendum.** Append to the END of `docs/reference/seo-winning-strategy.md`:

```markdown

## Addendum (2026-07-16): the software cluster

The sweep above never examined "flow arts software", and the term turned out to
be an unowned commercial-intent SERP: page one is a video-effects app (AR Flow
Arts), a hoop tutorial platform (Taylor Flows), and flowchart-software noise.
No choreography tool targets it. Shipped response (branch
feat/flow-arts-software-seo, spec 2026-07-16-flow-arts-software-seo-design.md):

- /composer owns the bare phrase: title "Flow Arts Composer | Free Flow Arts
  Software for Choreography"; description, lede, and subtitle lead with it;
  the SoftwareApplication JSON-LD gains a keywords property.
- Internal link web: varied anchors pointing at /composer (new FAQ entry "Is
  there software for flow arts choreography?" on / and /about, wording touches
  on /notation and the per-prop pages). Exactly one exact-match anchor
  site-wide, on /roots/software.
- /roots/software takes the informational intent ("history of flow arts
  software"): a fact-checked lineage page covering the VTG app, the LAB
  simulators, VisualSpinner3D, and today's tools, with every living project
  linked out. Competitor brand names never appear in our title/meta. This is
  also the site's most link-worthy page for community backlinks (Layer 3
  adjacent).
```

- [x] **Step 4.2: A+ plan ledger.** In `docs/superpowers/specs/2026-07-16-seo-a-plus-plan.md`, after the `- [ ] W2-4: ...` line, add:

```markdown
- [x] W2-5: "flow arts software" commercial cluster: /composer retitle + description + JSON-LD keywords, keyword configs, FAQ entry, varied link web (2026-07-16, feat/flow-arts-software-seo)
- [x] W2-6: /roots/software lineage page: fact-verified roster (VTG app, LAB simulators, VisualSpinner3D, today's tools), sitemap entry, /roots cross-link (2026-07-16, feat/flow-arts-software-seo)
```

- [x] **Step 4.3: Commit**

```bash
git commit -m "docs(seo): software cluster addendum + A+ ledger entries" -- docs/reference/seo-winning-strategy.md docs/superpowers/specs/2026-07-16-seo-a-plus-plan.md
```

---

### Task 5: Verification (run by the orchestrator, main loop)

- [ ] **Step 5.1:** `npm run check > /tmp/check-fas.log 2>&1` in the worktree; grep the log for `error` (expect zero new errors vs main; if pre-existing errors exist, diff against a baseline).
- [ ] **Step 5.2:** Em-dash grep over the diff: `git diff main...HEAD -- src | grep -P '\x{2014}'` expecting zero matches in added lines.
- [ ] **Step 5.3:** Phrase-placement grep: `grep -rn "flow arts software" src/ -il` — title/meta usage only in composer page; body-copy anchors in the planned files only.
- [ ] **Step 5.4:** Sitemap grep: `grep "roots/software" src/routes/sitemap.xml/+server.ts`.
- [ ] **Step 5.5:** Mark the spec ledger complete.
