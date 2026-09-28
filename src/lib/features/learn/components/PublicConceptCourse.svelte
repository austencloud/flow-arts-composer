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
  import { getLocale, t, tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import { localizedConcept } from "../domain/localized-concept";

  const courseName = $derived(tDynamic("learn_public_course_name"));
  const courseDescription = $derived(tDynamic("learn_public_course_description"));

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
    concept
      ? tDynamic("learn_public_lesson_title", { name: localizedConcept(concept, "name") })
      : courseName
  );
  // Keep lesson blurbs aligned with the available concept definitions in each locale.
  const description = $derived(
    concept ? localizedConcept(concept, "description") : courseDescription
  );
  // Same builder the router uses to resolve a lesson URL, so this page can
  // never advertise a canonical the app itself wouldn't route to.
  const canonicalPath = $derived(buildConceptPath(concept?.id));
  const canonical = $derived(`${LANDING_DOMAIN}${canonicalPath}`);

  const breadcrumbNames = $derived(
    concept
      ? [
          { name: tDynamic("learn_public_home"), path: "/" },
          { name: courseName, path: CONCEPT_LIST_PATH },
          { name: localizedConcept(concept, "name"), path: canonicalPath },
        ]
      : [
          { name: tDynamic("learn_public_home"), path: "/" },
          { name: courseName, path: CONCEPT_LIST_PATH },
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
            name: localizedConcept(concept, "name"),
            description: localizedConcept(concept, "description"),
            url: canonical,
            learningResourceType: tDynamic("learn_public_resource_type"),
            educationalUse: "instruction",
            inLanguage: getLocale(),
            isPartOf: {
              "@type": "Course",
              name: courseName,
              url: `${LANDING_DOMAIN}${CONCEPT_LIST_PATH}`,
            },
          }
        : {
            "@context": "https://schema.org",
            "@type": "Course",
            name: courseName,
            description: courseDescription,
            url: canonical,
            provider: {
              "@type": "Organization",
              name: "The Kinetic Alphabet",
              url: `${LANDING_DOMAIN}/`,
            },
            inLanguage: getLocale(),
          }
    ).replace(/</g, "\\u003c")
  );
</script>

<Seo {title} {description} {canonical}>
  {@html `<script type="application/ld+json">${mainJsonLd}</script>`}
  {@html `<script type="application/ld+json">${breadcrumbJsonLd}</script>`}
</Seo>

<section class="public-course" aria-label={t("learn_ui_interactive_lessons")}>
  {#if browser}
    <LearnTab publicCourse />
  {:else}
    <div class="course-prerender">
      <span>{t("learn_ui_learn_by_doing")}</span>
      {#if concept && experience}
        <h1>{localizedConcept(concept, "name")}</h1>
        <p class="lesson-description">{localizedConcept(concept, "description")}</p>
        <p>
          {t("learn_ui_estimated_minutes", {
            minutes: concept.estimatedMinutes,
          })}
        </p>
        <nav class="lesson-links" aria-label={t("learn_ui_lesson_links")}>
          <a
            href={experience.reference?.href ??
              `/guide/level-1/${experience.guideSlug}`}
          >
            {t("learn_ui_read_named", {
              name: tDynamic(`learn_reference_${concept.id.replaceAll("-", "_")}`),
            })}
          </a>
          {#if previousLesson}
            <a href={buildConceptPath(previousLesson.id)}>
              {t("learn_ui_previous_named", { name: localizedConcept(previousLesson, "name") })}
            </a>
          {/if}
          {#if nextLesson}
            <a href={buildConceptPath(nextLesson.id)}>
              {t("learn_ui_next_named", { name: localizedConcept(nextLesson, "name") })}
            </a>
          {/if}
          <a href={CONCEPT_LIST_PATH}>{t("learn_ui_all_lessons")}</a>
        </nav>
      {:else}
        <h1>{concept ? localizedConcept(concept, "name") : t("learn_ui_interactive_lessons")}</h1>
        <p>{t("learn_ui_public_course_intro")}</p>
        <ol class="lesson-list">
          {#each lessons as lesson (lesson.id)}
            <li>
              <a href={buildConceptPath(lesson.id)}>{localizedConcept(lesson, "name")}</a>
              <span>{localizedConcept(lesson, "description")}</span>
            </li>
          {/each}
        </ol>
        <a href="/guide">{t("learn_ui_prefer_to_read")}</a>
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
