/**
 * Caption presets for the post-handoff share sheet.
 *
 * The composer's textarea is always the source of truth — presets only FILL
 * it. This store owns the three things worth persisting across sessions: the
 * hashtag set (edited once, applied forever), any captions saved as custom
 * presets, and the last artifact the user shared.
 *
 * Saved captions are stored as TEMPLATES ({word} / {link}), not as literals.
 * A literal saved against one sequence reappeared verbatim on every other one,
 * which is how a DΨ caption ended up offered under ΔOZ-Φ. Entries persisted
 * before templating stay literal and are removable from the chip's X.
 *
 * Deliberately excluded: generated/humor-profile taglines. Generated voice
 * posting as Austen was rejected during the ghost-presenter work, and that
 * judgment carries here — every preset in this file is either a literal fact
 * about the sequence or text the user typed themselves.
 */

import { browser } from "$app/env";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

const STORAGE_KEY = "tka-caption-presets-v1";
const MAX_CUSTOM_PRESETS = 8;

export const DEFAULT_HASHTAGS = "#flowarts #flowart #spinning #tka";

/**
 * A saved caption is a TEMPLATE, not a literal.
 *
 * Saving "DΨ — https://tka.run/abc #flowarts" while looking at DΨ stores
 * "{word} — {link} #flowarts", so the same preset reads correctly on ΔOZ-Φ.
 * Storing the literal is what made every saved caption follow the user onto
 * every unrelated sequence.
 */
export const WORD_TOKEN = "{word}";
export const LINK_TOKEN = "{link}";

export interface CaptionPreset {
  id: string;
  /** Chip label. Short — the full text lands in the textarea. */
  label: string;
  text: string;
  /**
   * The stored template, present only on user-saved presets. Carrying it here
   * is what lets the chip's X remove the right entry — the filled `text` has
   * had its tokens substituted and no longer matches what is persisted.
   */
  template?: string;
}

interface PersistedCaptions {
  hashtags: string;
  /** Templates, with {word} / {link} tokens. Legacy entries may be literal. */
  custom: string[];
}

/**
 * Short codes are minted as HTTPS://TKA.RUN/CODE — uppercase, because that is
 * what QR alphanumeric mode encodes most densely and what gets set on printed
 * cards. Under a post it reads as shouting, so a caption lowercases the scheme
 * and host. The URL parser does exactly that and leaves the path alone, which
 * matters: the code's own case is left untouched.
 */
function forCaption(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the word only where it stands on its own.
 *
 * TKA words are short — a single letter is normal — so a plain substring
 * replace eats them out of the middle of ordinary prose: saving "Amazing A run"
 * against the sequence A stored "{word}m{word}zing {word} run". The word has to
 * be bounded by something that is not a letter or a digit on both sides.
 *
 * `\b` is no good here: it is defined on ASCII word characters, so it fires in
 * the middle of Ψ and every other Greek letter in the alphabet. The Unicode
 * property escapes below are the equivalent that actually covers the alphabet.
 * The leading boundary is captured and put back rather than looked behind,
 * because lookbehind is the one piece of this that older Safari does not have.
 */
function templatizeWord(haystack: string, word: string): string {
  if (!word) return haystack;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(?:${escapeRegExp(word)})(?=[^\\p{L}\\p{N}]|$)`,
    "gu"
  );
  return haystack.replace(pattern, (_match, before: string) => before + WORD_TOKEN);
}

/**
 * Turn a caption written against one sequence into a reusable template.
 *
 * The link goes first: a short code can contain the word, and substituting the
 * word first would corrupt the URL it sits inside. Case matters on both — a
 * caption reproduces the word as it is displayed, and lowercasing the match
 * would turn every indefinite article into the sequence A.
 */
export function toTemplate(
  text: string,
  context: { word: string; url: string }
): string {
  let template = text;
  if (context.url) template = template.split(context.url).join(LINK_TOKEN);
  return templatizeWord(template, context.word);
}

/**
 * Fill a template for the sequence in view. A legacy literal has no tokens and
 * passes through unchanged — it stays wrong until the user deletes it, which
 * the chip's X now allows.
 */
export function fillTemplate(
  template: string,
  context: { word: string; url: string }
): string {
  return template
    .split(LINK_TOKEN)
    .join(context.url)
    .split(WORD_TOKEN)
    .join(context.word);
}

function loadPersisted(): PersistedCaptions {
  if (!browser) return { hashtags: DEFAULT_HASHTAGS, custom: [] };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hashtags: DEFAULT_HASHTAGS, custom: [] };

    const parsed = JSON.parse(raw) as Partial<PersistedCaptions>;
    return {
      hashtags:
        typeof parsed.hashtags === "string" ? parsed.hashtags : DEFAULT_HASHTAGS,
      custom: Array.isArray(parsed.custom)
        ? parsed.custom.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch {
    // A corrupt entry must never block sharing — fall back to defaults.
    return { hashtags: DEFAULT_HASHTAGS, custom: [] };
  }
}

class CaptionPresetManager {
  #persisted = $state<PersistedCaptions>(loadPersisted());

  get hashtags(): string {
    return this.#persisted.hashtags;
  }

  get customPresets(): string[] {
    return this.#persisted.custom;
  }

  setHashtags(value: string): void {
    this.#persisted = { ...this.#persisted, hashtags: value };
    this.#save();
  }

  /**
   * `context` is the sequence the caption was written against. Its word and
   * link become tokens so the preset travels to other sequences intact.
   */
  saveCustomPreset(text: string, context: { word: string; url: string }): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const template = toTemplate(trimmed, {
      word: simplifyRepeatedWord(context.word || "").trim(),
      url: forCaption(context.url),
    });
    if (this.#persisted.custom.includes(template)) return;

    const custom = [template, ...this.#persisted.custom].slice(
      0,
      MAX_CUSTOM_PRESETS
    );
    this.#persisted = { ...this.#persisted, custom };
    this.#save();
  }

  /** Takes the stored TEMPLATE, which is what `CaptionPreset.template` carries. */
  removeCustomPreset(template: string): void {
    const custom = this.#persisted.custom.filter((entry) => entry !== template);
    this.#persisted = { ...this.#persisted, custom };
    this.#save();
  }

  /**
   * Presets offered for a specific sequence, in tap order.
   *
   * `word` MUST arrive raw — this simplifies it. A LOOP caption reads FΨ,
   * never FΨFΨFΨFΨ (.claude/rules/simplified-word-display.md).
   *
   * `url` is a tka.run short link or nothing. The viewer's own share URL
   * carries the whole sequence inline and runs past 200 characters — pasted
   * under a post it reads as spam, so a caption never carries one. An empty
   * url is a normal state (a guest, or a code still minting), not an error.
   */
  buildPresets(input: { word: string; url: string }): CaptionPreset[] {
    const word = simplifyRepeatedWord(input.word || "").trim();
    const url = forCaption(input.url);

    const base = [word, url].filter(Boolean).join(" — ");
    const presets: CaptionPreset[] = [];

    if (base) {
      presets.push({
        id: "word-link",
        label: url ? "Word + link" : "Word",
        text: base,
      });
    }

    const hashtags = this.hashtags.trim();
    if (base && hashtags) {
      presets.push({
        id: "word-link-tags",
        label: "+ hashtags",
        text: `${base}\n\n${hashtags}`,
      });
    }

    for (const [index, template] of this.#persisted.custom.entries()) {
      const text = fillTemplate(template, { word, url });
      presets.push({
        id: `custom-${index}`,
        label: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        text,
        template,
      });
    }

    return presets;
  }

  #save(): void {
    if (!browser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#persisted));
    } catch {
      // Private-mode / quota. Presets degrade to session-only rather than
      // failing the share.
    }
  }
}

let instance: CaptionPresetManager | null = null;

export function getCaptionPresetManager(): CaptionPresetManager {
  return (instance ??= new CaptionPresetManager());
}

export type { CaptionPresetManager };
