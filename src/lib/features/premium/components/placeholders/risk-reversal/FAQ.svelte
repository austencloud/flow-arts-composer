<!-- FAQ - Frequently Asked Questions to address objections -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface FAQItem {
    id: string;
    question: string;
    answer: string;
    category?: "billing" | "features" | "support" | "technical";
  }

  interface Props {
    items?: FAQItem[];
    defaultExpanded?: boolean;
  }

  let { items = [], defaultExpanded = false }: Props = $props();

  const defaultFAQs: FAQItem[] = $derived([
    {
      id: "what-included",
      question: t('premium_faq_q_included'),
      answer: t('premium_faq_a_included'),
      category: "features" as const,
    },
    {
      id: "cancel",
      question: t('premium_faq_q_cancel'),
      answer: t('premium_faq_a_cancel'),
      category: "billing" as const,
    },
    {
      id: "secure",
      question: t('premium_faq_q_secure'),
      answer: t('premium_faq_a_secure'),
      category: "billing" as const,
    },
    {
      id: "refund",
      question: t('premium_faq_q_refund'),
      answer: t('premium_faq_a_refund'),
      category: "billing" as const,
    },
  ]);

  const displayItems = $derived(items.length > 0 ? items : defaultFAQs);

  let openItems = $state<Set<string>>(new Set());

  // Sync open items when defaultExpanded or items change
  $effect(() => {
    const currentItems = items.length > 0 ? items : defaultFAQs;
    openItems = defaultExpanded
      ? new Set(currentItems.map((i) => i.id))
      : new Set();
  });

  function toggle(id: string) {
    const newOpen = new Set(openItems);
    if (newOpen.has(id)) {
      newOpen.delete(id);
    } else {
      newOpen.add(id);
    }
    openItems = newOpen;
  }
</script>

<div class="faq">
  <h3>{t('premium_faq_heading')}</h3>
  <div class="faq-list">
    {#each displayItems as item (item.id)}
      <div class="faq-item">
        <button
          class="faq-question"
          onclick={() => toggle(item.id)}
          aria-expanded={openItems.has(item.id)}
          aria-controls="faq-answer-{item.id}"
        >
          <span>{item.question}</span>
          <i
            class="fas fa-chevron-{openItems.has(item.id) ? 'up' : 'down'}"
            aria-hidden="true"
          ></i>
        </button>
        {#if openItems.has(item.id)}
          <div class="faq-answer" id="faq-answer-{item.id}" role="region">
            {item.answer}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .faq {
    margin: var(--spacing-lg, 24px) 0;
  }

  h3 {
    font-size: clamp(20px, 3vw, 28px);
    font-weight: 600;
    text-align: center;
    margin: 0 0 var(--spacing-md, 16px);
    color: var(--theme-text);
  }

  .faq-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  .faq-item {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    overflow: hidden;
  }

  .faq-question {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md, 16px);
    background: transparent;
    border: none;
    color: var(--theme-text);
    font-size: var(--font-size-min);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast, var(--duration-fast) ease);
  }

  .faq-question:hover {
    background: var(--theme-card-hover-bg);
  }

  .faq-question i {
    flex-shrink: 0;
    color: var(--theme-accent, var(--theme-accent));
    transition: transform var(--transition-fast, var(--duration-fast) ease);
  }

  .faq-answer {
    padding: 0 var(--spacing-md, 16px) var(--spacing-md, 16px);
    font-size: var(--font-size-min);
    color: var(--theme-text-dim);
    line-height: 1.6;
    animation: slideDown var(--duration-normal) ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .faq-answer {
      animation: none;
    }
  }
</style>
