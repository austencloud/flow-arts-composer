<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import LearnTab from "../LearnTab.svelte";
  import { getConceptById } from "../domain/concepts";
  import {
    getAvailableConcepts,
    getConceptExperience,
  } from "../domain/concept-experience-registry";
  import {
    buildConceptPath,
    CONCEPT_LIST_PATH,
  } from "../domain/concept-routes";
  import Seo from "$lib/shared/components/Seo.svelte";
  import { LANDING_DOMAIN } from "../../../../config/domains";

  const COURSE_NAME = "Interactive TKA Lessons";
  const COURSE_DESCRIPTION =
    "Learn The Kinetic Alphabet through the interactive lessons currently available in Flow Arts Composer.";

  const concept = $derived(
    page.params.conceptId ? getConceptById(page.params.conceptId) : undefined
  );

  // The server-rendered page is what search engines and no-JS readers get, so
  // it carries the course order and links the app itself renders client-side.
  const lessons = getAvailableConcepts();
  const lessonIndex = $derived(
    concept ? lessons.findIndex((lesson) => lesson.id === concept.id) : -1
  );
  const previousLesson = $derived(
    lessonIndex > 0 ? lessons[lessonIndex - 1] : undefined
  );
  const nextLesson = $derived(
    lessonIndex >= 0 ? lessons[lessonIndex + 1] : undefined
  );
  const experience = $derived(
    concept ? getConceptExperience(concept.id) : undefined
  );
  const title = $derived(
    concept ? `${concept.name} | Interactive TKA Lesson` : COURSE_NAME
  );
  // Every lesson already carries its own author-written blurb
  // (concepts.ts `description`) — reuse it verbatim instead of writing new
  // per-lesson copy. The course-level description stays the existing one.
  const description = $derived(concept?.description ?? COURSE_DESCRIPTION);
  // Same builder the router uses to resolve a lesson URL, so this page can
  // never advertise a canonical the app itself wouldn't route to.
  const canonicalPath = $derived(buildConceptPath(concept?.id));
  const canonical = $derived(`${LANDING_DOMAIN}${canonicalPath}`);

  const breadcrumbNames = $derived(
    concept
      ? [
          { name: "Home", path: "/" },
          { name: COURSE_NAME, path: CONCEPT_LIST_PATH },
          { name: concept.name, path: canonicalPath },
        ]
      : [
          { name: "Home", path: "/" },
          { name: COURSE_NAME, path: CONCEPT_LIST_PATH },
        ]
  );
  const breadcrumbJsonLd = $derived(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbNames.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: `${LANDING_DOMAIN}${crumb.path}`,
      })),
    }).replace(/</g, "\\u003c")
  );

  const mainJsonLd = $derived(
    JSON.stringify(
      concept
        ? {
            "@context": "https://schema.org",
            "@type": "LearningResource",
            name: concept.name,
            description: concept.description,
            url: canonical,
            learningResourceType: "Interactive lesson",
            educationalUse: "instruction",
            inLanguage: "en",
            isPartOf: {
              "@type": "Course",
              name: COURSE_NAME,
              url: `${LANDING_DOMAIN}${CONCEPT_LIST_PATH}`,
            },
          }
        : {
            "@context": "https://schema.org",
            "@type": "Course",
            name: COURSE_NAME,
            description: COURSE_DESCRIPTION,
            url: canonical,
            provider: {
              "@type": "Organization",
              name: "The Kinetic Alphabet",
              url: `${LANDING_DOMAIN}/`,
            },
            inLanguage: "en",
          }
    ).replace(/</g, "\\u003c")
  );
</script>

<Seo {title} {description} {canonical}>
  {@html `<script type="application/ld+json">${mainJsonLd}</script>`}
  {@html `<script type="application/ld+json">${breadcrumbJsonLd}</script>`}
</Seo>

<section class="public-course" aria-label="Interactive TKA lessons">
  {#if browser}
    <LearnTab publicCourse />
  {:else}
    <div class="course-prerender">
      <span>Learn by doing</span>
      {#if concept && experience}
        <h1>{concept.name}</h1>
        <p class="lesson-description">{concept.description}</p>
        <p>
          About {concept.estimatedMinutes} minutes. The interactive lesson starts
          when this page loads in your browser.
        </p>
        <nav class="lesson-links" aria-label="Lesson links">
          <a
            href={experience.reference?.href ??
              `/guide/level-1/${experience.guideSlug}`}
          >
            Read {experience.reference?.label ?? experience.guideLabel}
          </a>
          {#if previousLesson}
            <a href={buildConceptPath(previousLesson.id)}>
              Previous: {previousLesson.name}
            </a>
          {/if}
          {#if nextLesson}
            <a href={buildConceptPath(nextLesson.id)}>
              Next: {nextLesson.name}
            </a>
          {/if}
          <a href={CONCEPT_LIST_PATH}>All lessons</a>
        </nav>
      {:else}
        <h1>{concept?.name ?? "Interactive TKA lessons"}</h1>
        <p>
          Explore guided lessons from the grid through reading TKA words. The
          interactive course starts when this page loads in your browser.
        </p>
        <ol class="lesson-list">
          {#each lessons as lesson (lesson.id)}
            <li>
              <a href={buildConceptPath(lesson.id)}>{lesson.name}</a>
              <span>{lesson.description}</span>
            </li>
          {/each}
        </ol>
        <a href="/guide">Prefer to read? Open the Guide</a>
      {/if}
    </div>
  {/if}
</section>

<style>
  .public-course {
    width: 100%;
    min-height: calc(100dvh - 64px);
    margin-top: 64px;
  }

  .course-prerender {
    display: grid;
    width: min(100% - 2rem, 54rem);
    min-height: 32rem;
    margin: 0 auto;
    padding: clamp(3rem, 10vw, 8rem) 1rem;
    align-content: start;
  }

  .course-prerender > span {
    color: #8facff;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .course-prerender h1 {
    margin: 0.75rem 0 0;
    color: #fff;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-size: clamp(2.5rem, 8vw, 5rem);
    line-height: 1;
  }

  .course-prerender p {
    max-width: 38rem;
    margin: 1.25rem 0 0;
    color: rgba(236, 233, 245, 0.72);
    line-height: 1.65;
  }

  .course-prerender .lesson-description {
    color: #fff;
    font-size: 1.15rem;
  }

  .lesson-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .lesson-list {
    display: grid;
    gap: 0.9rem;
    margin: 1.75rem 0 0;
    padding-left: 1.5rem;
    color: rgba(236, 233, 245, 0.72);
  }

  .lesson-list span {
    display: block;
    margin-top: 0.2rem;
  }

  .course-prerender .lesson-list a {
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    color: #fff;
  }

  .course-prerender > a,
  .lesson-links a {
    width: fit-content;
    min-height: 44px;
    padding: 0.75rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    color: #fff;
    font-weight: 700;
    text-decoration: none;
  }

  .course-prerender > a {
    margin-top: 1.5rem;
  }
</style>
