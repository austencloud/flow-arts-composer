/**
 * Museum Room Content - Phase 1
 *
 * Exhibit plaque text, performer definitions, and trigger definitions
 * for each room. Keyed by room ID, then by refId within each category.
 *
 * This file contains the "meat" - the writing, the lore, the references.
 * The room graph defines where things go. This file defines what they say.
 */

import type {
  ExhibitInteraction,
  MuseumDocument,
  PlaqueContent,
} from "../domain/museum-grid-types";

export interface ExhibitContent {
  plaque: PlaqueContent;
  sequenceId?: string;
  /** Multi-page readable behind the plaque (reports, memos, the pamphlet). */
  document?: MuseumDocument;
  /** What pressing E does beyond reading (decode, terminal, exit). */
  interaction?: ExhibitInteraction;
}

export interface PerformerContent {
  sequenceId?: string;
  autoPlay: boolean;
  label?: string;
  description?: string;
  handout?: MuseumDocument;
  /**
   * Not placed at all (no figure, collider or examine prompt) until the
   * figure has a pose of its own. A station with no sequence stands in its
   * bind pose, a pink T: worse than an empty corner.
   */
  withheld?: boolean;
}

export interface RoomContentMap {
  exhibits?: Record<string, ExhibitContent>;
  performers?: Record<string, PerformerContent>;
}

/**
 * All room content, keyed by room ID.
 */
export const ROOM_CONTENT: Record<string, RoomContentMap> = {
  entrance: {
    exhibits: {
      "entrance-welcome": {
        plaque: {
          title: "Welcome to The Kinetic Archive",
          body:
            "Department of Rotational Affairs, Facility 7. " +
            "Please proceed through the exhibits in order. " +
            "Do not touch the artifacts. " +
            "Do not attempt to replicate what you see.",
          barter: "Visiting hours: 24/7",
        },
      },
      "entrance-guest-book": {
        plaque: {
          title: "Guest Book",
          subtitle: "Please sign in",
          body:
            "All visitors must register with the front desk. " +
            "A valid government-issued ID is required for access " +
            "beyond the main gallery. Bags will be searched.",
          barter: "Form 7741-A: Visitor Registration",
        },
      },
      "entrance-bulletin": {
        plaque: {
          title: "Staff Notice Board",
          body:
            "ALL STAFF: Badge access updated effective 11/14/1998. " +
            "Please collect new credentials from Room 114. " +
            "Fire drill scheduled for Friday. Attendance mandatory.",
          barter: "- Facilities Management",
        },
      },
      "entrance-reception": {
        plaque: {
          title: "Reception",
          subtitle: "Visitor Hours: By Appointment Only",
          body:
            "Please check in with the front desk before proceeding. " +
            "Unauthorized access beyond the lobby is prohibited. " +
            "All personal effects must be declared.",
          barter: "Department of Rotational Affairs",
        },
      },
    },
  },

  lobby: {
    exhibits: {
      "lobby-first-pictograph": {
        plaque: {
          title: "Primary Kinetic Notation",
          subtitle: "Orientation Plate 01",
          body:
            "This diagram is the standard visual unit used throughout the archive. " +
            "Visitors are asked to observe the indicated positions without imitating them. " +
            "Repeated exposure may produce an inaccurate sense that the movement can be " +
            "performed safely. It cannot. Continue to the historical galleries for " +
            "documented examples.",
          barter: "Department of Rotational Affairs · Reference 1-A",
        },
        sequenceId: "gallery-spiral-seq",
      },
      "lobby-reception": {
        plaque: {
          title: "Reception",
          subtitle: "Visitor Hours: By Appointment Only",
          body:
            "Please check in with the front desk before proceeding. " +
            "Unauthorized access beyond the lobby is prohibited. " +
            "All personal effects must be declared.",
          barter: "Department of Rotational Affairs",
        },
      },
      "lobby-gift-shop-frontage": {
        plaque: {
          title: "Museum Shop",
          subtitle: "Closed",
          body:
            "Catalog orders may be submitted at reception. Items displayed behind the " +
            "glass remain property of the Department until a numbered receipt has been " +
            "issued. Visitors returning from the galleries must present all carried " +
            "objects for comparison before departure.",
          barter: "Inventory review in progress",
        },
      },
      "lobby-bulletin": {
        plaque: {
          title: "Staff Notice Board",
          body:
            "ALL STAFF: Badge access updated effective 11/14/1998. " +
            "Please collect new credentials from Room 114. " +
            "Fire drill scheduled for Friday. Attendance mandatory.",
          barter: "- Facilities Management",
        },
      },
      "lobby-guest-book": {
        plaque: {
          title: "Guest Book",
          subtitle: "Please sign in",
          body:
            "All visitors must register with the front desk. " +
            "A valid government-issued ID is required for access " +
            "beyond the main gallery. Bags will be searched.",
          barter: "Form 7741-A: Visitor Registration",
        },
      },
    },
    performers: {
      "lobby-telekinetic-formation": {
        autoPlay: true,
        sequenceId: "gallery-spiral-seq",
      },
    },
  },

  "vulcan-cave": {
    exhibits: {
      "cave-lascaux-1": {
        plaque: {
          title: "Lascaux Tablets - Panel A",
          subtitle: "c. 15,000 BCE (estimated)",
          body:
            "Recovered from a secondary chamber at Lascaux in 1942. " +
            "The tablets depict a series of hand positions " +
            "arranged in a repeating sequence. Carbon dating places " +
            "them among the oldest known artifacts in this collection. " +
            "The notation system is immediately recognizable to modern analysts.",
          barter: "Acquisition: Order Field Team, Dordogne, 1942. Filing: KA-CAVE-001.",
        },
      },
      "cave-lascaux-2": {
        plaque: {
          title: "Lascaux Tablets - Panel B",
          subtitle: "c. 15,000 BCE (estimated)",
          body:
            "The second panel extends the sequence from Panel A into " +
            "what appears to be a complete choreographic phrase. " +
            "Note the reversal glyph at position 4. " +
            "The artist was describing a LOOP before the concept had a name.",
          barter: "Cross-reference: KA-CAVE-001b. See also: Wing 4, Patent 7741.",
        },
      },
      "cave-paintings-1": {
        plaque: {
          title: "Cave Wall Fragment - Kinetic Figures",
          subtitle: "Unknown date, pre-agricultural",
          body:
            "Silhouettes of two figures facing each other, each holding " +
            "elongated objects. The figures are drawn in four successive positions, " +
            "suggesting movement over time. " +
            "The objects are staves. The motion is unmistakable.",
          barter: "Recovered: North Africa, 1937. Classification: GRIPPED-BILATERAL.",
        },
      },
      "cave-paintings-2": {
        plaque: {
          title: "Cave Wall Fragment - Audience",
          subtitle: "Same site as adjacent panel",
          body:
            "A semicircle of smaller figures surrounds the two performers. " +
            "Several are seated. One appears to be drawing on the cave wall. " +
            "The first known depiction of someone watching flow arts " +
            "and taking notes.",
        },
      },
      "cave-marchand": {
        plaque: {
          title: "Dr. Henri Marchand",
          subtitle: "1889-1953. Order Archivist, First Class.",
          body:
            "Marchand spent 27 years cataloging pre-agricultural kinetic " +
            "artifacts across four continents. His field journals document " +
            "identical notation patterns appearing independently in " +
            "communities with no known contact. Marchand's conclusion: " +
            '"The sequences arrive. We merely record them." ' +
            "He was reassigned to Filing in 1951.",
          barter: "Personnel file: MARCHAND-H. Status: INACTIVE.",
        },
      },
    },
    performers: {
      "cave-performer-1": {
        autoPlay: true,
        sequenceId: "performer-cave-seq",
      },
      "cave-performer-2": {
        autoPlay: true,
        sequenceId: "performer-cave-seq",
      },
    },
  },

  // The Drowned Gallery's three waterline alcoves, west → east.
  "cave-water": {
    performers: {
      "cave-water-a": { autoPlay: true, sequenceId: "cave-water-seq-a" },
      "cave-water-b": { autoPlay: true, sequenceId: "cave-water-seq-b" },
      "cave-water-c": { autoPlay: true, sequenceId: "cave-water-seq-c" },
    },
  },

  // The First Fire's three fire-pit stations across the fissure, west → east.
  "cave-fire": {
    performers: {
      "cave-fire-automaton-dj": { autoPlay: true, sequenceId: "cave-fire-seq-dj" },
      "cave-fire-automaton-ek": { autoPlay: true, sequenceId: "cave-fire-seq-ek" },
      "cave-fire-automaton-fl": { autoPlay: true, sequenceId: "cave-fire-seq-fl" },
    },
  },

  // The Canyon Overlook's three bosses on the floor disc, west → east.
  "cave-earth": {
    performers: {
      "cave-earth-automaton-g": { autoPlay: true, sequenceId: "cave-earth-seq-g" },
      "cave-earth-automaton-h": { autoPlay: true, sequenceId: "cave-earth-seq-h" },
      "cave-earth-automaton-i": { autoPlay: true, sequenceId: "cave-earth-seq-i" },
    },
  },

  // Fire's three pairs met again, one per ledge, low → high. Fire runs
  // JDJD/KEKE/LFLF; Air runs the same partnerships phase-swapped.
  "cave-air": {
    performers: {
      "cave-air-automaton-dj": { autoPlay: true, sequenceId: "cave-air-seq-dj" },
      "cave-air-automaton-ek": { autoPlay: true, sequenceId: "cave-air-seq-ek" },
      "cave-air-automaton-fl": { autoPlay: true, sequenceId: "cave-air-seq-fl" },
    },
  },

  // The Sundial's four Quarter-Same stations, ringing the collapse ring at the
  // compass points. U opposite V puts the leader/follower inversion on one axis;
  // S and T take the cross axis.
  "cave-sun": {
    performers: {
      "cave-sun-automaton-u": { autoPlay: true, sequenceId: "cave-sun-seq-u" },
      "cave-sun-automaton-s": { autoPlay: true, sequenceId: "cave-sun-seq-s" },
      "cave-sun-automaton-v": { autoPlay: true, sequenceId: "cave-sun-seq-v" },
      "cave-sun-automaton-t": { autoPlay: true, sequenceId: "cave-sun-seq-t" },
    },
  },

  // The Moon's three Quarter-Opposite stations: MP north, NQ east, OR south.
  // The west point is the arrival hole, which is why there are three and not
  // four — the plan is mirrored about the axis the visitor surfaces on.
  "cave-moon": {
    performers: {
      "cave-moon-automaton-mp": { autoPlay: true, sequenceId: "cave-moon-seq-mp" },
      "cave-moon-automaton-nq": { autoPlay: true, sequenceId: "cave-moon-seq-nq" },
      "cave-moon-automaton-or": { autoPlay: true, sequenceId: "cave-moon-seq-or" },
    },
  },

  // ── Phase 2: Order-era wings ──

  egyptian: {
    exhibits: {
      "egypt-karnak": {
        plaque: {
          title: "The Karnak Scrolls",
          subtitle: "c. 1470 BCE",
          body:
            "Hieroglyphic scrolls documenting the first formal Type classification system. " +
            "Six categories of movement, organized by hand path. " +
            "The priesthood controlled access to advanced notation.",
          barter: "Translated by the Cairo Institute, 1923",
        },
      },
      "egypt-priesthood": {
        plaque: {
          title: "Priesthood Display",
          body:
            "Temple scene: priests notating ceremonial movements on papyrus. " +
            "Access to the complete Type system required initiation into the inner circle. " +
            "Knowledge was power. Power was controlled.",
        },
      },
      "egypt-amphora": {
        plaque: {
          title: "Greek Amphora",
          subtitle: "c. 500 BCE",
          body:
            "Decorated pottery showing spinning figures. The Greeks inherited the system from Egypt " +
            "and applied mathematical rigor. Pythagoras recognized the relationships. " +
            "He founded a secret cult to study them.",
        },
      },
      "egypt-controlled": {
        plaque: {
          title: "Controlled Knowledge",
          body:
            "First evidence that access was deliberately restricted. " +
            "Temple records show notation scrolls stored separately from other documents, " +
            "with specialized access protocols.",
          barter: "NILE BUREAU - Classification: RESTRICTED",
        },
      },
    },
    performers: {
      "egypt-telekinetic-formation": {
        autoPlay: true,
        sequenceId: "gallery-spiral-seq",
      },
    },
  },

  renaissance: {
    exhibits: {
      "ren-codex": {
        plaque: {
          title: "Codex Pages",
          subtitle: "c. 1500 CE",
          body:
            "Da Vinci's notebooks contain rotational diagrams that precisely match " +
            "the Kinetic Alphabet's position system. He decoded the Egyptian scrolls " +
            "and recast them as geometry.",
          barter: "Reproductions. Originals: scattered across seven collections.",
        },
      },
      "ren-vitruvian": {
        plaque: {
          title: "Vitruvian Man Analysis",
          body:
            "The famous image reinterpreted as a position diagram. " +
            "Arms and legs map to the eight cardinal and intercardinal points. " +
            "Da Vinci embedded the grid in the most famous drawing in history.",
        },
      },
      "ren-workshop": {
        plaque: {
          title: "Workshop Recreation",
          body:
            "Da Vinci's studio with scattered notes. " +
            "The notebooks were deliberately dispersed after his death. " +
            "By whom, and why, remains a matter of institutional record.",
        },
      },
      "ren-notebooks": {
        plaque: {
          title: "Notebooks Scattered",
          body:
            "After Leonardo's death in 1519, his notebooks were dispersed " +
            "across seven collections in five countries. The dispersal pattern matches " +
            "no known inheritance or sale. Someone wanted the complete system " +
            "to be unrecoverable.",
        },
      },
    },
  },

  victorian: {
    exhibits: {
      "vic-brass": {
        plaque: {
          title: "The Brass Notation Device",
          subtitle: "1871, London",
          body:
            "The only surviving prototype. A mechanical calculator that could " +
            "enumerate all possible four-step sequences for a given starting position. " +
            "Patent recalled by the Home Office within six months of filing.",
          barter: "Inventor: [NAME REDACTED]",
        },
        sequenceId: "vic-brass-seq",
      },
      "vic-patents": {
        plaque: {
          title: "Patent Documents",
          body:
            "Seven patent applications related to kinetic notation, filed between 1868 and 1891. " +
            "Three marked RECALLED. Two marked APPLICATION DENIED. " +
            "One stamped with a symbol not yet catalogued by this archive.",
        },
      },
      "vic-portraits": {
        plaque: {
          title: "Inventor Portraits",
          body:
            "Several portraits of notable kinetic researchers. " +
            "One portrait has the nameplate replaced with NAME REDACTED. " +
            "The subject appears undisturbed by this.",
        },
      },
      "vic-discredited": {
        plaque: {
          title: "Discredited",
          body:
            "Key inventors were ruined by scandal. Anonymous complaints, funding reviews, " +
            "paper retractions. No violence. Just process. " +
            "The method is never explained in this archive.",
          barter: "See also: Containment Protocol 4-C (discrediting)",
        },
      },
    },
  },

  // ── Phase 3: Digital + Suppression ──

  digital: {
    exhibits: {
      "digital-crt": {
        plaque: {
          title: "The CRT",
          subtitle: "1993",
          body:
            "The original terminal running TKA-OS v2. One of an estimated 3,400 copies " +
            "distributed before the Bureau detected the breach. " +
            "Press E to boot the system.",
          barter: "Serial: BKC-ASSET-7741",
        },
        sequenceId: "digital-crt-seq",
        interaction: {
          kind: "terminal",
          route: "/1989",
          label: "Boot TKA-OS",
        },
      },
      "digital-bbs": {
        plaque: {
          title: "BBS Printouts",
          body:
            "Forum posts from 1993-1994. Users sharing sequences, asking questions, " +
            "building on each other's work. The Bureau monitored these forums for eleven months " +
            "before requesting emergency powers.",
        },
      },
      "digital-3400": {
        plaque: {
          title: "3,400 Users",
          body:
            "The number that triggered the crisis. Internal memo: 'Distribution has exceeded " +
            "containment threshold. Recommend immediate execution of Protocol Lethe. " +
            "See attached requisition.'",
        },
      },
      "digital-team": {
        plaque: {
          title: "Development Team",
          body:
            "Grainy photograph. Faces obscured. One circled in red marker - added later, " +
            "not original to the print. The handwriting on the circle matches " +
            "no known Bureau personnel.",
        },
      },
    },
  },

  suppression: {
    exhibits: {
      "supp-order-1": {
        plaque: {
          title: "The Order of the Closed Palm",
          body:
            "Founded before recorded history. A hand with fingers curled inward - " +
            "not a fist, more like recoiling. The hand that refuses to grip. " +
            "The hand that will not hold a prop.",
        },
      },
      "supp-order-2": {
        plaque: {
          title: "Bureau of Kinetic Containment",
          body:
            "The modern name. American, 1940s. The transition from ancient mystic guardians " +
            "to government bureaucracy was gradual - decades of absorption, not a founding date. " +
            "Eventually: a budget line item and reporting requirements.",
          barter: "Department of Rotational Affairs, Facility 7",
        },
      },
      "supp-order-3": {
        plaque: {
          title: "Three Eras, One Mission",
          body:
            "Prehistoric: nameless, just a symbol repeated on cave walls. " +
            "Classical: Order of the Closed Palm, a named secret society. " +
            "Modern: Bureau of Kinetic Containment. " +
            "Observe. Archive. Revere. But never practice.",
        },
      },
      "supp-lethe": {
        plaque: {
          title: "Protocol Lethe Documentation",
          body:
            "Named for the Greek river of forgetting. An ancient bureaucratic procedure. " +
            "Requisition 7741-B submitted to three departments: Media Degaussing, " +
            "Cognitive Reclassification, Digital Archive Redaction. " +
            "Each processes independently. The Order follows a checklist they can barely read.",
        },
      },
      "supp-youve-seen": {
        plaque: {
          title: "You've Seen This Before",
          body:
            "The symbol in the cave ceiling. The wax seal on the Renaissance letter. " +
            "The stamp on the Victorian patent. The username in the BBS thread. " +
            "It was here the whole time. You just didn't know what you were looking at.",
        },
      },
      "supp-may8": {
        plaque: {
          title: "May 8, 1994",
          body:
            "Date of the final Protocol Lethe execution. The protocol was designed for " +
            "villages and monasteries. It cannot scale to eight billion people with broadband. " +
            "Ancient containment procedure versus YouTube.",
          barter: "Status: PARTIAL FAILURE - See Addendum 7741-F",
        },
      },
      // DRAFT (2026-09-04, pending Austen's pass). The Bellweather payload:
      // the report that names K in two roles. Order plaque + readable report.
      "supp-bellweather": {
        plaque: {
          style: "document",
          draft: true,
          title: "The Bellweather Report",
          subtitle: "Internal Review 7741-BW · Office of Internal Consistency",
          body:
            "Prepared following the events of May 8, 1994. The review reconciles " +
            "personnel records across three divisions of the Bureau of Kinetic " +
            "Containment. Reproduced under the Archive's open-records obligation. " +
            "Names are unredacted per Directive 12. The Bureau notes that the " +
            "report's conclusions were never adopted.",
          barter: "Press E to read the full report",
        },
        document: {
          kind: "report",
          draft: true,
          heading: "INTERNAL REVIEW 7741-BW · PERSONNEL CROSS-REFERENCE",
          meta: [
            "Office of Internal Consistency",
            "Distribution: Director · Facility 7 · Archive (copy)",
            "Status: FILED — NOT ADOPTED",
          ],
          pages: [
            "SUMMARY. On review of the Facility 7 access ledger for the period " +
              "1989–1994, this office identified one individual appearing in two " +
              "incompatible capacities: (a) as Archive Narrator, credited on " +
              "forty-one recorded audio guides under the initial K; and (b) as " +
              "Clerk II, Media Degaussing, Department of Rotational Affairs, under " +
              "the same initial and a matching badge number.\n\n" +
              "Standard practice treats these as distinct roles. The ledger does not.",
            "FINDINGS.\n" +
              "1. The narrator recordings describe exhibits that the clerk's " +
              "requisitions were, in the same quarter, scheduled to erase.\n" +
              "2. Seventeen items listed for degaussing on Requisition 7741-B remain " +
              "in the Archive in playable condition.\n" +
              "3. The clerk's signature on the requisition and the narrator's " +
              "signature in the guest book are the same signature.\n" +
              "4. No disciplinary action is on file.\n" +
              "5. No one appears to have asked.",
            "RECOMMENDATION. That the individual be interviewed. That the " +
              "seventeen items be located. That the recordings be reviewed for " +
              "content.\n\n" +
              "ADDENDUM (undated, different hand). Interview declined. Items not " +
              "located. Recordings reviewed and found to be accurate. Report filed.",
          ],
        },
      },
    },
  },

  // DRAFT (2026-09-04, pending Austen's pass). The second payload: the
  // Nomenclature Division's key applied to tablet OOGA-1.
  "cross-reference": {
    exhibits: {
      "xref-order": {
        plaque: {
          style: "order",
          draft: true,
          title: "Cross-Reference Room",
          subtitle: "Nomenclature Division · Est. 1947",
          body:
            "Analysis ongoing. Tablet OOGA-1 was transcribed in 1947 and assigned " +
            "a provisional nomenclature key. Positions are mapped to a letter index " +
            "per Division standard. No coherent message detected.",
          barter: "Budget request for continued analysis: APPROVED (annually since 1947)",
        },
      },
      "xref-memo": {
        plaque: {
          style: "document",
          draft: true,
          title: "Memorandum: Provisional Key, Revision 61",
          subtitle: "Nomenclature Division · Internal",
          body:
            "Revision 61 corrects Revision 60, which corrected Revision 59. " +
            "The tablet has not changed. Connective forms are to be indexed but " +
            "dimmed in transcription, as they carry no lexical value.",
          barter: "Press E to read the memorandum",
        },
        document: {
          kind: "memo",
          draft: true,
          heading: "MEMORANDUM · PROVISIONAL NOMENCLATURE KEY · REV. 61",
          meta: [
            "From: Nomenclature Division",
            "To: All terminals, Cross-Reference Room",
            "Re: Transcription standard for Tablet OOGA-1",
          ],
          pages: [
            "1. Each primary hand position on the tablet is assigned a letter per " +
              "the Division index. Six primary forms have been identified on " +
              "OOGA-1. This count has been stable since Revision 4.\n\n" +
              "2. Connective forms — the transitional positions between primary " +
              "forms — are to be indexed but dimmed in transcription, as they " +
              "carry no lexical value. Two connective forms occur on OOGA-1.\n\n" +
              "3. With connective forms dimmed, the tablet reads as a four-letter " +
              "string. The string does not correspond to any entry in the " +
              "Division lexicon. This office notes that dimming the connective " +
              "forms has not, to date, produced a message.",
            "4. Terminal operators are reminded that the key describes the " +
              "tablet. It does not explain it. Requests for explanation should be " +
              "routed to the Interpretation Desk, which was consolidated into this " +
              "Division in 1961 and has no staff.\n\n" +
              "5. Revision 62 is scheduled. Budget approved.",
          ],
        },
      },
      "xref-console": {
        plaque: {
          style: "console",
          draft: true,
          title: "NOMENCLATURE KEY · TERMINAL 3",
          subtitle: "Apply key to Tablet OOGA-1",
          body:
            "POSITION INDEX LOADED\n" +
            "PRIMARY FORMS DETECTED: 6\n" +
            "CONNECTIVE FORMS DETECTED: 2\n" +
            "KEY REVISION: 61\n\n" +
            "PRESS E TO APPLY THE PROVISIONAL KEY",
        },
        sequenceId: "codex-ooga-seq",
        interaction: {
          kind: "decode",
          sequenceId: "codex-ooga-seq",
          reveal: "OOGA",
          annotation:
            "It's not a message. It's a sequence. Read it with your hands. — K",
        },
      },
      "xref-k-sign": {
        plaque: {
          style: "k-sign",
          draft: true,
          title: "READ THIS ONE",
          body:
            "The terminal will tell you what the tablet says. It's right. " +
            "It's been right since 1947. Then go back to the cave and watch " +
            "the figure do it. That's what it is.",
          barter: "— K",
        },
      },
    },
  },

  "vtg-wing": {
    exhibits: {
      "vtg-renovation": {
        plaque: {
          title: "THE VULCAN WING",
          subtitle: "Documenting the Oakland School, 1990s–Present",
          body:
            "NOTICE: This exhibit has been under renovation since 2024. " +
            "We appreciate your patience. Estimated completion: [DATE NOT FOUND]. " +
            "Visitors interested in the Vulcan notation tradition are encouraged " +
            "to consult external resources.",
        },
      },
    },
  },

  // ── Phase 4: Post-Order rooms ──

  gallery: {
    exhibits: {
      "gallery-spiral": {
        plaque: {
          title: "The Spiral",
          body:
            "You've seen it throughout the museum. On floor tiles, in frame corners, " +
            "woven into decoration. Every spin is a spiral through time. " +
            "The Scribes didn't choose it. It chose them.",
          barter: "- K",
        },
        sequenceId: "gallery-spiral-seq",
      },
      "gallery-scribes": {
        plaque: {
          title: "The Scribes",
          body:
            "Not an organization. A pattern. People who picked up the thing and did it. " +
            "Sometimes they cluster into groups. Sometimes they're alone. " +
            "The Order documents them all.",
        },
        sequenceId: "gallery-scribes-seq",
      },
      "gallery-practice": {
        plaque: {
          title: "Practice",
          body:
            "The gap between 'I can see this is beautiful' and 'I can do this myself' " +
            "is the whole story. Forty thousand years of it.",
          barter: "- K",
        },
        sequenceId: "gallery-practice-seq",
      },
      "gallery-k-note": {
        plaque: {
          title: "Curator's Note",
          body:
            "This is my favorite room. I built it from what the Order left behind. " +
            "They had everything right except the padlock.",
          barter: "- K",
        },
      },
    },
    performers: {
      "gallery-scribe": { autoPlay: true, sequenceId: "gallery-spiral-seq" },
    },
  },

  fear: {
    exhibits: {
      "fear-containment-1": {
        plaque: {
          title: "CONTAINMENT PROTOCOL ACTIVE",
          body:
            "This knowledge is a public health hazard. Seal the archive. Walk away. " +
            "Authorized handling personnel only.",
          barter: "Bureau of Kinetic Containment - Form 7741-C",
        },
      },
      "fear-containment-2": {
        plaque: {
          title: "DO NOT ATTEMPT REPLICATION",
          body:
            "Exposure to kinetic notation has been classified as a Category 3 " +
            "cognitive hazard. Report symptoms immediately: temporal dissociation, " +
            "compulsive repetition, inability to release the object.",
        },
      },
      "fear-containment-3": {
        plaque: {
          title: "REPORT EXPOSURE",
          body:
            "If you have observed synchronized movement, gripped a prop-like object, " +
            "or experienced loss of time awareness during repetitive motion, " +
            "contact your regional monitor immediately.",
          barter: "Hotline: [NUMBER DISCONNECTED]",
        },
      },
      // DRAFT (2026-09-04, pending Austen's pass). The Order's closing position.
      "fear-final-argument": {
        plaque: {
          style: "document",
          draft: true,
          title: "The Final Argument",
          subtitle: "Bureau of Kinetic Containment · Position Paper 7741-Z",
          body:
            "The Bureau's closing position, entered into the record on May 7, " +
            "1994, one day before the final execution of Protocol Lethe. " +
            "Reproduced in full. The Bureau maintains that the position was " +
            "correct and that the outcome does not bear on its correctness.",
          barter: "Press E to read the position paper",
        },
        document: {
          kind: "filing",
          draft: true,
          heading: "POSITION PAPER 7741-Z · ON THE EASE OF THE PRACTICE",
          meta: [
            "Bureau of Kinetic Containment",
            "Entered into the record: May 7, 1994",
            "Status: FINAL",
          ],
          pages: [
            "POSITION. The material in this Archive is not dangerous because it " +
              "is secret. It is dangerous because it is easy. A child can hold two " +
              "objects. A child can turn. The barrier to beginning is nothing, and " +
              "the barrier to stopping, once begun, is everything.\n\n" +
              "Containment has never sought to hide the practice. It has sought to " +
              "keep the practice difficult. Every plaque in this building is a " +
              "small difficulty. Every glass case is a small difficulty. Remove " +
              "them and there is no Archive. There is only a room where people do " +
              "the thing.",
            "ASSESSMENT. The Bureau accepts that on May 8 the difficulties will be " +
              "removed. The Bureau does not accept responsibility for what people " +
              "do in an easy room.\n\n" +
              "The Bureau's recommendation, for the record, is the same as it has " +
              "been since 1947: observe, archive, revere. The Bureau notes that " +
              "this recommendation has been ignored in each of those years by " +
              "people who had not read it, and is now to be ignored by people " +
              "who have.",
          ],
        },
      },
      "fear-k-sign": {
        plaque: {
          style: "k-sign",
          draft: true,
          title: "BEFORE YOU GO IN",
          body:
            "Three rooms ahead. This one, then the cubicles, then the one with " +
            "the grass. You can stop at any of them. Most people did.",
          barter: "— K",
        },
      },
    },
  },

  // DRAFT (2026-09-04, pending Austen's pass). Six people, six cubicles,
  // every one of them whole. The sign carries the solo-practice clause.
  isolation: {
    exhibits: {
      "iso-solo-sign": {
        plaque: {
          style: "k-sign",
          draft: true,
          title: "ON PRACTICING ALONE",
          body:
            "Nothing wrong with a cubicle. Some of the best work in this " +
            "building was made by one person in a room with the door shut. " +
            "The wall isn't the problem. The wall with no door is.",
          barter: "— K",
        },
      },
      "iso-floor-plan": {
        plaque: {
          style: "order",
          draft: true,
          title: "Practice Floor Plan (Proposed)",
          subtitle: "Facility 7 · Facilities Division · 1991",
          body:
            "Six stations at regulation spacing. Partitions at 1.4 m prevent " +
            "line-of-sight between stations, satisfying Directive 9 (No " +
            "Observation of Practice by Practitioners). Each station is " +
            "supplied with one record and one chair.",
          barter: "Filed under: IDEAL",
        },
      },
    },
    performers: {
      "iso-1": { autoPlay: true, sequenceId: "gallery-spiral-seq", label: "Station 1" },
      "iso-2": { autoPlay: true, sequenceId: "vic-brass-seq", label: "Station 2" },
      "iso-3": { autoPlay: true, sequenceId: "gallery-practice-seq", label: "Station 3" },
      "iso-4": { autoPlay: true, sequenceId: "digital-crt-seq", label: "Station 4" },
      "iso-5": { autoPlay: true, sequenceId: "gallery-scribes-seq", label: "Station 5" },
      "iso-6": { autoPlay: true, sequenceId: "performer-cave-seq", label: "Station 6" },
    },
  },

  collaboration: {
    performers: {
      "collab-1": { autoPlay: true, sequenceId: "performer-cave-seq" },
      "collab-2": { autoPlay: true, sequenceId: "gallery-spiral-seq" },
      "collab-3": { autoPlay: true, sequenceId: "gallery-scribes-seq" },
      "collab-4": { autoPlay: true, sequenceId: "gallery-practice-seq" },
      // DRAFT (2026-09-04, pending Austen's pass). The wax docent by the exit,
      // holding the pamphlet out. It has held it out since 1989.
      "wax-docent": {
        // Withheld until it can hold the pamphlet out: with no pose it stood
        // in the Room of Collaboration as a pink T-posed mannequin.
        withheld: true,
        autoPlay: false,
        label: "Wax Figure · Archive Docent (1989)",
        description:
          "A wax figure in a 1989 docent's uniform, one arm extended, holding a " +
          "folded pamphlet. The wax has softened on the side that faces the door. " +
          "The pamphlet is real. Take one.",
        handout: {
          kind: "pamphlet",
          draft: true,
          heading: "THE KINETIC ARCHIVE · VISITOR PAMPHLET",
          meta: [
            "Open 24 hours · 7 days · admission free",
            "Printed 1989 · reprinted 2008 by the curator",
            "[QR · donation link on reverse]",
          ],
          pages: [
            "WELCOME. The Kinetic Archive holds forty thousand years of records " +
              "of people doing one thing with two objects. It was assembled by an " +
              "institution that believed the records should be kept and the thing " +
              "should not be done. Half of that turned out to be right.",
            "HOW TO VISIT. Walk the wings in order. Read what you like. The " +
              "figures in the cases are performing real sequences; every one of " +
              "them can be read from the card beside it and done by you.\n\n" +
              "There are three rooms at the end. You may leave from any of them.\n\n" +
              "If you learn something on the way, bring it to the fire. " +
              "If you made something of your own, bring that too.",
            "AFTER YOUR VISIT. The gift shop is past the grass. The practice " +
              "staffs on the west shelf are free. The door past the register " +
              "opens onto the Composer with a sequence from this building already " +
              "loaded.\n\n" +
              "Tell someone what you saw.",
          ],
        },
      },
    },
  },

  // ── Phase 5: Final rooms ──

  // DRAFT (2026-09-04, pending Austen's pass). Order-built retail, 1993, never
  // restocked. Nobody's buying. The staffs are free.
  "gift-shop": {
    exhibits: {
      "shop-shelf-1": {
        plaque: {
          style: "shelf",
          draft: true,
          title: "Closed Palm Enamel Pin",
          subtitle: "$4.00 · 3 remaining",
          body:
            "Official Bureau of Kinetic Containment insignia. Butterfly clutch. " +
            "Do not wear while practicing.",
          barter: "Dust: original",
        },
      },
      "shop-shelf-2": {
        plaque: {
          style: "shelf",
          draft: true,
          title: "\"I OBSERVED, ARCHIVED & REVERED\" Tee",
          subtitle: "$18.00 · size L only",
          body:
            "100% cotton. Screen-printed 1993. Unsold since. The Bureau's " +
            "marketing division was one person, and he chose the slogan himself.",
          barter: "No returns",
        },
      },
      "shop-shelf-3": {
        plaque: {
          style: "shelf",
          draft: true,
          title: "Practice Staffs (Pair)",
          subtitle: "$0.00 · take them",
          body:
            "Not Bureau merchandise. Left here in 2008 by the curator. " +
            "Restocked weekly. The only item in this shop that has ever sold out.",
          barter: "Restocked: this morning",
        },
      },
      "shop-exit": {
        plaque: {
          style: "console",
          draft: true,
          title: "EXIT",
          subtitle: "Through the gift shop, into the jam",
          body:
            "THE EXHIBITS ARE CLOSING.\n\n" +
            "The door ahead opens into the Composer with what you carry, or a " +
            "sequence from the Archive, already loaded.\n\n" +
            "PRESS E TO LEAVE",
        },
        sequenceId: "gallery-spiral-seq",
        interaction: {
          kind: "exit",
          sequenceId: "gallery-spiral-seq",
          label: "Go make something",
        },
      },
      "shop-closing-sign": {
        plaque: {
          style: "k-sign",
          draft: true,
          title: "LAST ONE",
          body:
            "Everything you need is already in your hands. " +
            "Tell someone what you saw.",
          barter: "— K",
        },
      },
    },
    performers: {
      "shop-cashier": {
        autoPlay: false,
        label: "Mannequin · Register",
        description:
          "A department-store mannequin in a Bureau uniform. Name tag: STAFF. " +
          "It has not rung anything up since 1994. The register drawer is open. " +
          "There is a crumpled twenty on the floor that nobody has picked up.",
      },
    },
  },

  "construction-zone": {
    exhibits: {
      "cz-staff-only": {
        plaque: {
          title: "STAFF ONLY - EXHIBIT PREPARATION",
          body:
            "Authorized personnel beyond this point. Hard hat required. " +
            "Estimated completion of Wing 9: [DATE NOT FOUND].",
        },
      },
    },
  },

  janitor: {
    exhibits: {
      "janitor-whiteboard": {
        plaque: {
          title: "AUSTEN'S FAKE MUSEUM IDEAS",
          body:
            "- Cave wing with fake tablets (DONE)\n" +
            "- Egyptian wing (TODO: need more hieroglyphs)\n" +
            "- Gift shop w/ fake money mechanic\n" +
            "- Statues of myself?? (too much?)\n" +
            "- VTG wing (ask Noel first)\n" +
            "- Three endings like Scrooge\n" +
            "- Janitor's closet reveal (you are here)",
        },
      },
      "janitor-mannequin": {
        plaque: {
          title: "Mannequin",
          body:
            "A department store mannequin with a photograph of a face taped to it. " +
            "The photograph is slightly askew. The wig is worse.",
        },
      },
    },
  },
};
