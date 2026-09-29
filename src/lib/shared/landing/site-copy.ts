import { t } from "$lib/shared/i18n/i18n.svelte";
import type { TranslationKey } from "$lib/shared/i18n/i18n-types";

// The public navigation and FAQ keep English source copy for their route data
// and structured data. Resolve visible copy when rendered so locale changes
// also update an open menu or FAQ without rebuilding the page.
const keys: Record<string, string> = {
  History: "site_history",
  Notation: "site_notation",
  "Shape Engine": "site_shape_engine",
  Composer: "site_composer",
  Learn: "site_learn",
  "Interactive lessons": "site_interactive_lessons",
  "Timing & Direction": "site_timing_direction",
  "Trick names": "site_trick_names",
  "Read the Guide": "site_read_guide",
  "Kinetic Atlas": "site_kinetic_atlas",
  Shop: "site_shop",
  About: "site_about",
  "LOOP Deck": "site_loop_deck",
  "Starter Pack": "site_starter_pack",
  "Browse the Shop": "site_browse_shop",
  Explore: "site_explore",
  Support: "site_support",
  You: "site_you",
  Back: "site_back",
  "Back to the launchpad": "site_back_to_launchpad",
  "TKA, The Kinetic Alphabet, Home": "site_home_accessible",
  "Main navigation": "site_main_navigation",
  "Mobile navigation": "site_mobile_navigation",
  "Account menu": "site_account_menu",
  "Close menu": "site_close_menu",
  "Open menu": "site_open_menu",
  "Start here": "site_start_here",
  "TKA destinations": "site_destinations",
  links: "site_links",
  "Support and legal links": "site_support_legal_links",
  "Flow Arts Composer and The Kinetic Alphabet are operated by Austen Cloud.":
    "site_operated_by",
  "Sign in": "auth_sign_in",
  "Sign out": "site_sign_out",
  Terms: "site_terms",
  Privacy: "site_privacy",
  "Open Flow Arts Composer": "site_open_composer",
  "Open Composer": "site_open_composer_short",
  "What is TKA?": "site_what_is_tka",
  "Notation for flow arts": "site_notation_for_flow_arts",
  "Notation for flow arts.": "site_notation_for_flow_arts_period",
  "Write and animate sequences. Save and share them.":
    "site_tile_composer_desc",
  "Choreo Cards": "site_choreo_cards",
  "Printed decks of TKA sequences. Scan a card and it plays.":
    "site_tile_cards_desc",
  "Learn TKA": "site_learn_tka",
  "Interactive lessons, one concept at a time.": "site_tile_learn_desc",
  "How flow arts notation developed, 2009 to 2022.": "site_tile_history_desc",
  "Getting started, props, and cost.": "site_tile_faq_desc",
  "Getting started, props, and cost": "site_faq_subtitle",
  "Explore letters, motion, notation, and technique.": "site_tile_atlas_desc",
  "Generate exact flowers from level and ratio matrices":
    "site_shape_engine_desc",
  "The poi community's parallel discovery, 2009": "site_caps_desc",
  "Learn TKA one concept at a time": "site_interactive_lessons_desc",
  "The six ways two props share phase and direction":
    "site_timing_direction_desc",
  "Written reference, Codex, and PDFs": "site_read_guide_desc",
  "Letters, motion, notation, and technique": "site_atlas_desc",
  "Common questions, answered": "site_faq_desc",
  "New here? Start with ": "site_new_here_prefix",
  "Out of questions?": "site_faq_out_of_questions",
  "Ten minutes in the composer answers more than this page can. Free, in your browser.":
    "site_faq_closing_desc",
  "Common questions": "site_faq_common_questions",
  "Frequently asked questions": "site_faq_common_questions",
  "What is The Kinetic Alphabet?": "site_faq_q_what_is_tka",
  "Notation for flow arts: a way to write prop movement down instead of relying on video alone. Each step becomes one pictograph showing hand positions on a grid, the motion each hand makes, and the prop's orientation. String them together and you have choreography you can read, edit, and hand to another spinner.":
    "site_faq_a_what_is_tka",
  "Read the history": "site_faq_read_history",
  "Do I have to memorize letters and symbols first?": "site_faq_q_memorize",
  "No. Pictographs read visually: the grid shows where your hands can be, the arrows show where they go. The letters are names for patterns, useful once you want to compare and remix sequences. Nothing needs to be memorized before you can follow along.":
    "site_faq_a_memorize",
  "I learn moves from videos. Why would I need notation?": "site_faq_q_video",
  "Video shows one performance from one angle. Notation shows the structure underneath it. Once a sequence is written down you can change one step and see exactly what follows, trade it with someone who has never seen the original, or come back in a year and read it cold. A recording and sheet music do different jobs. Musicians keep both.":
    "site_faq_a_video",
  "I've never spun a prop. Where do I start?": "site_faq_q_first_prop",
  "Double staves. TKA was designed around them: each staff has two ends, one is your thumb reference and one is your pinky reference, and with proper technique those references never change. That is what makes prop orientation readable while you learn. Grab a pair of staves and start with the Level 1 guide.":
    "site_faq_a_first_prop",
  "Follow the Level 1 guide": "site_faq_level_1",
  "Does it work with my prop?": "site_faq_q_props",
  "Double staves are the canonical prop. TKA also applies to dual-wielded static props such as fans, clubs, and buugeng. Momentum-based props, tosses, contact rolling, and grip changes are not covered as equals. Composer includes additional prop visuals, but a visual option does not mean every movement applies to that prop.":
    "site_faq_a_props",
  "Try props in the spinner": "site_faq_try_props",
  "Is there software for flow arts choreography?": "site_faq_q_software",
  "Yes. Flow Arts Composer is free flow arts software that runs in your browser. Build sequences step by step, generate them from parameters, animate the result, save it, and share it. Each sequence keeps its Kinetic Alphabet notation, so the structure remains visible beside the animation.":
    "site_faq_a_software",
  "Is Flow Arts Composer free?": "site_faq_q_free",
  "Yes. Flow Arts Composer is currently free to use. Premium is not live. You can build sequences, animate them, save your work, and browse the community library without paying.":
    "site_faq_a_free",
  "Can I share what I make?": "site_faq_q_share",
  "Yes. Export a sequence as a PNG or video. On supported phones, the system share sheet can send the file to another app. You can also share a sequence link, and eligible saved sequences can be published to the community gallery.":
    "site_faq_a_share",
};

export function siteCopy(source: string): string {
  const key = keys[source];
  return key ? t(key as TranslationKey) : source;
}
