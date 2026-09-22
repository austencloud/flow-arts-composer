/**
 * The one canonical FAQ for the whole public site.
 *
 * Before this, the same questions lived in three drifting copies: the about
 * page's visible markup, the about page's FAQPage JSON-LD, and an orphaned
 * 9-item FAQPage schema on the landing route that had NO visible counterpart
 * (a Google policy violation: schema must match on-page content). A fourth,
 * divergent 4-item list sat dead in routes/landing/components/FAQSection.svelte.
 *
 * The FAQ now lives on its own page (/faq, linked from the header's Learn
 * menu) rendered by `FaqInterview`, which draws its visible list AND its
 * JSON-LD from this single array. Edit copy here once.
 *
 * Answers are prose in the visitor's register; a `cta` routes the reader to
 * the next step where the answer genuinely hands off somewhere. One door per
 * destination across the whole list, so the page doesn't read as a wall of
 * buttons. The JSON-LD serializes question + answer prose only, so the schema
 * always matches the visible text; CTAs are extra on-page content, which the
 * FAQ rich-result policy allows.
 * Design: docs/superpowers/specs/2026-07-16-interactive-faq-design.md
 */

export type FaqCta = { label: string; href: string };

export type FaqItem = {
  question: string;
  answer: string;
  cta?: FaqCta;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is The Kinetic Alphabet?",
    answer:
      "Notation for flow arts: a way to write prop movement down instead of relying on video alone. Each step becomes one pictograph showing hand positions on a grid, the motion each hand makes, and the prop's orientation. String them together and you have choreography you can read, edit, and hand to another spinner.",
    // The hero + launchpad homepage (81b18e05d8) dropped the old marketing
    // sections, so section anchors on "/" no longer exist — prerender's
    // missing-id check fails the whole build on a dangling one. Link to pages,
    // not homepage anchors.
    cta: { label: "Read the history", href: "/history" },
  },
  {
    question: "Do I have to memorize letters and symbols first?",
    answer:
      "No. Pictographs read visually: the grid shows where your hands can be, the arrows show where they go. The letters are names for patterns, useful once you want to compare and remix sequences. Nothing needs to be memorized before you can follow along.",
  },
  {
    question: "I learn moves from videos. Why would I need notation?",
    answer:
      "Video shows one performance from one angle. Notation shows the structure underneath it. Once a sequence is written down you can change one step and see exactly what follows, trade it with someone who has never seen the original, or come back in a year and read it cold. A recording and sheet music do different jobs. Musicians keep both.",
  },
  {
    question: "I've never spun a prop. Where do I start?",
    answer:
      "Double staves. TKA was designed around them: each staff has two ends, one is your thumb reference and one is your pinky reference, and with proper technique those references never change. That is what makes prop orientation readable while you learn. Grab a pair of staves and start with the Level 1 guide.",
    cta: { label: "Follow the Level 1 guide", href: "/learn/guide" },
  },
  {
    question: "Does it work with my prop?",
    answer:
      "Double staves are the canonical prop. TKA also applies to dual-wielded static props such as fans, clubs, and buugeng. Momentum-based props, tosses, contact rolling, and grip changes are not covered as equals. Composer includes additional prop visuals, but a visual option does not mean every movement applies to that prop.",
    cta: { label: "Try props in the spinner", href: "/endless-spinner" },
  },
  {
    question: "Is there software for flow arts choreography?",
    answer:
      "Yes. Flow Arts Composer is free flow arts software that runs in your browser. Build sequences step by step, generate them from parameters, animate the result, save it, and share it. Each sequence keeps its Kinetic Alphabet notation, so the structure remains visible beside the animation.",
    cta: { label: "Open Flow Arts Composer", href: "/composer" },
  },
  {
    question: "Is Flow Arts Composer free?",
    answer:
      "Yes. Flow Arts Composer is currently free to use. Premium is not live. You can build sequences, animate them, save your work, and browse the community library without paying.",
  },
  {
    question: "Can I share what I make?",
    answer:
      "Yes. Export a sequence as a PNG or video. On supported phones, the system share sheet can send the file to another app. You can also share a sequence link, and eligible saved sequences can be published to the community gallery.",
  },
];

/**
 * Serialize the same items as schema.org FAQPage JSON-LD. Kept here (not in the
 * component) so the data and its structured-data shape never drift apart.
 */
export function faqPageJsonLd(items: FaqItem[] = FAQ_ITEMS): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  });
}
