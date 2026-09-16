/**
 * App Capabilities Manifest
 *
 * Static catalog of what users can do in Flow Arts Composer.
 * Used by TIKA's find_app_feature tool to answer "How do I...?" questions.
 *
 * Each entry maps a user action to where it lives in the app
 * and step-by-step instructions for performing it.
 */

export interface AppCapability {
  id: string;
  action: string;
  module: string;
  tab?: string;
  keywords: string[];
  instructions: string;
  prerequisites?: string[];
}

export const APP_CAPABILITIES: AppCapability[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "create-construct",
    action: "Build a sequence beat by beat",
    module: "Create",
    tab: "Constructor",
    keywords: ["build", "construct", "manual", "beat", "add beat", "create sequence", "builder"],
    instructions:
      "Go to Create > Constructor tab. Pick a start placement, then add beats one at a time by selecting hand motions for each step.",
  },
  {
    id: "create-assemble",
    action: "Assemble a sequence by selecting letters",
    module: "Create",
    tab: "Assembler",
    keywords: ["assemble", "letters", "pick letters", "per-hand", "letter picker"],
    instructions:
      "Go to Create > Assembler tab. Choose letters from the alphabet grid. The assembler shows valid next letters based on position chaining rules.",
  },
  {
    id: "create-generate",
    action: "Generate a random sequence",
    module: "Create",
    tab: "Generator",
    keywords: ["generate", "random", "auto", "surprise", "make random"],
    instructions:
      "Go to Create > Generator tab. Set your constraints (length, turns, types) and tap Generate. You can keep generating until you find one you like.",
  },
  {
    id: "create-spell",
    action: "Spell a word as a sequence",
    module: "Create",
    tab: "Generator",
    keywords: ["spell", "word", "name", "type word", "spell word"],
    instructions:
      "Go to Create > Generator tab and enter a word. The generator maps each letter of the word to a TKA letter and chains them together with bridge letters where needed.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BROWSE MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "browse-gallery",
    action: "Browse and search sequences",
    module: "Browse",
    tab: "Gallery",
    keywords: ["browse", "search", "find", "gallery", "explore", "look for"],
    instructions:
      "Go to Browse > Gallery. Use the search bar to filter by word, creator, or tags. Toggle between 'My Library' and 'Community' scopes.",
  },
  {
    id: "browse-save",
    action: "Save a sequence to your library",
    module: "Browse",
    tab: "Gallery",
    keywords: ["save", "library", "bookmark", "keep", "favorite", "add to library"],
    instructions:
      "Open any sequence in the viewer, then tap the save/bookmark icon. The sequence will appear in your library under Browse > Gallery with 'My Library' scope.",
  },
  {
    id: "browse-delete",
    action: "Delete a sequence from your library",
    module: "Browse",
    tab: "Gallery",
    keywords: ["delete", "remove", "unsave", "trash"],
    instructions:
      "Open the sequence in your library, open its menu (three dots), and choose Delete. This only removes it from your library; community copies remain.",
  },
  {
    id: "browse-collections",
    action: "Organize sequences into collections",
    module: "Browse",
    tab: "Library",
    keywords: ["collection", "folder", "organize", "group", "playlist", "library"],
    instructions:
      "Go to Browse > Library. Create a new collection, then add sequences to it from the gallery by long-pressing or using the sequence menu. The All shelf at the top shows everything you've saved.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOSE MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "compose-export-image",
    action: "Export a sequence as an image",
    module: "Compose",
    tab: "Arrange",
    keywords: ["export", "image", "download", "picture", "png", "save image", "screenshot"],
    instructions:
      "Go to Compose > Arrange. Load your sequence, then tap the export button and choose 'Image'. Select your format and resolution.",
  },
  {
    id: "compose-export-video",
    action: "Export a sequence as a video",
    module: "Compose",
    tab: "Arrange",
    keywords: ["Download Animation", "animation", "mp4", "record", "render animation"],
    instructions:
      "Go to Compose > Arrange. Load your sequence, tap the export button and choose 'Video'. The app renders each beat as an animated frame and combines them into a video.",
  },
  {
    id: "compose-browse",
    action: "Browse sequences to compose",
    module: "Compose",
    tab: "Browse",
    keywords: ["compose browse", "pick sequence to compose", "select for compose"],
    instructions:
      "Go to Compose > Browse to find sequences from your library or the community. Tap a sequence to load it into the Arrange tab for export.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEARN MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "learn-concepts",
    action: "Learn TKA concepts step by step",
    module: "Learn",
    tab: "Concepts",
    keywords: ["learn", "tutorial", "lesson", "concepts", "study", "course", "education"],
    instructions:
      "Go to Learn > Concepts. Topics are ordered from basic to advanced. Complete each concept by reading the material and passing the quiz.",
  },
  {
    id: "learn-quiz",
    action: "Take a quiz to test your knowledge",
    module: "Learn",
    tab: "Concepts",
    keywords: ["quiz", "test", "practice", "assess", "check knowledge", "exam"],
    instructions:
      "Go to Learn > Concepts, open any completed concept, and tap 'Take Quiz'. You can also ask TIKA to quiz you on any topic.",
  },
  {
    id: "learn-codex",
    action: "Look up TKA terms and definitions",
    module: "Learn",
    tab: "Guide",
    keywords: ["codex", "dictionary", "glossary", "reference", "lookup", "definition"],
    instructions:
      "Go to Learn > Guide and open the Codex section (deep link /learn/guide/codex). Browse the interactive letter catalog with live pictograph variations.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAIN MODULE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "train-practice",
    action: "Practice spinning with camera feedback",
    module: "Train",
    tab: "Practice",
    keywords: ["train", "practice", "camera", "video", "spin", "rehearse", "mirror"],
    instructions:
      "Go to Train > Practice. Allow camera access when prompted. The camera shows your movements alongside the sequence pictographs so you can compare.",
  },
  {
    id: "train-challenges",
    action: "Take on practice challenges",
    module: "Train",
    tab: "Challenges",
    keywords: ["challenge", "drill", "workout", "exercise"],
    instructions:
      "Go to Train > Challenges. Choose a challenge based on your skill level. Complete the required sequences to earn progress.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "settings-prop",
    action: "Change your prop type",
    module: "Settings",
    tab: "Props",
    keywords: ["prop", "staff", "fan", "club", "buugeng", "change prop", "prop type"],
    instructions:
      "Go to Settings > Props. Choose from Staff, Fans, Clubs, Buugeng, or other prop types. This affects how pictographs render throughout the app.",
  },
  {
    id: "settings-background",
    action: "Change the app background",
    module: "Settings",
    tab: "Background",
    keywords: ["background", "theme", "wallpaper", "dark", "light", "color", "appearance"],
    instructions:
      "Go to Settings > Background. Choose from solid colors, gradients, or animated backgrounds (aurora, galaxy, forest, fish). The entire app theme adapts to your choice.",
  },
  {
    id: "settings-display-name",
    action: "Change your display name",
    module: "Settings",
    tab: "Profile",
    keywords: ["name", "display name", "username", "profile", "account"],
    instructions:
      "Go to Settings > Profile. Tap your display name to edit it. This name appears on sequences you share with the community.",
  },
  {
    id: "settings-pictograph-mode",
    action: "Change pictograph display mode",
    module: "Settings",
    tab: "Visibility",
    keywords: ["pictograph mode", "display mode", "visibility", "show hide", "what shows"],
    instructions:
      "Go to Settings > Visibility. Toggle which elements appear on pictographs: arrows, letters, turns, grid, and more.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARING
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "share-sequence",
    action: "Share a sequence with others",
    module: "Browse",
    keywords: ["share", "send", "link", "qr", "publish"],
    instructions:
      "Open any sequence in the viewer, tap the share icon. You can share via link, QR code, or publish to the community gallery.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIKA
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "tika-ask",
    action: "Ask TIKA a question about TKA",
    module: "TIKA",
    keywords: ["ask", "question", "help", "tika", "ai", "chat", "assistant"],
    instructions:
      "You're already here! Type any question about TKA in the chat box below. I can explain letters, positions, motion types, show pictographs, quiz you, and more.",
  },
];
