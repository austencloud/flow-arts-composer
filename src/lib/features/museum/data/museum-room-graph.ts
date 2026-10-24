/**
 * Museum Room Graph
 *
 * Defines the abstract topology of the museum: rooms as nodes, connections
 * as edges. No absolute coordinates here. The layout engine computes positions
 * from this graph + the grid config.
 *
 * Each room declares four walls with ordered segment arrays. The layout engine
 * sums segment widths + margins to derive room dimensions automatically.
 */

import type { RoomNode, RoomEdge, GridConfig } from "../domain/layout-types";
import type { WallDefinition } from "../domain/wall-segment-types";

// ── Helper: empty wall with standard margin ──

const EMPTY_WALL: WallDefinition = { segments: [], minMargin: 2 };


export const MUSEUM_ROOMS: RoomNode[] = [
  {
    id: "entrance",
    name: "Entrance Lobby",
    material: "marble",
    theme: "institutional",
    minInteriorHeight: 48,
    description:
      "A long marble hallway - the grand entrance to The Kinetic Archive. " +
      "Brass letters above the double doors. A guest book podium with a warm desk lamp " +
      "sits in the center. The archway at the far end leads into darkness.",
    devNotes:
      "ENTRANCE LOBBY - GRAND HALLWAY\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "16 tiles wide × 50 tiles long (8m × 25m)\n" +
      "PURPOSE: First impression. Processional walk. Grounding moment.\n" +
      "\n" +
      "SPATIAL BEATS (south to north):\n" +
      "  Rows 44-40: Arrival - door, mat, coat rack. 'This is a real building.'\n" +
      "  Rows 39-26: Empty hallway. Footsteps echo. Podium light pulls you forward.\n" +
      "  Rows 25-22: Guest book podium. First interaction. Warm lamp pool.\n" +
      "  Rows 21-16: Bulletin board + reception window. 'Someone worked here.'\n" +
      "  Rows 15-4: Open approach to archway. Bench along wall.\n" +
      "  Rows 3-2: Stanchions, welcome plaque, K's note, archway into cave.\n" +
      "\n" +
      "TONE: Normal museum. Nothing weird yet.\n" +
      "LIGHTING: Cool fluorescent baseline + one warm desk lamp on podium.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "entrance->vulcan-cave", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: EMPTY_WALL,
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "entrance-welcome", size: "standard", facing: "west" },
          { type: "gap", minTiles: 4 },
          { type: "exhibit", refId: "entrance-reception", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "entrance-bulletin", size: "standard", facing: "east" },
          { type: "gap", minTiles: 4 },
          { type: "exhibit", refId: "entrance-guest-book", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
    furniture: [
      { role: "bench", offsetX: -0.42, offsetY: 0.1, rotationY: Math.PI / 2 },
      { role: "bench", offsetX: 0.42, offsetY: 0.1, rotationY: -Math.PI / 2 },
      { role: "bench", offsetX: -0.42, offsetY: -0.3, rotationY: Math.PI / 2 },
      { role: "pedestal", offsetX: 0, offsetY: 0.15 },
      { role: "lamp", offsetX: 0.02, offsetY: 0.15 },
      { role: "plant", offsetX: -0.35, offsetY: -0.4 },
      { role: "plant", offsetX: 0.35, offsetY: -0.4 },
      { role: "plant", offsetX: -0.35, offsetY: 0.42 },
      { role: "plant", offsetX: 0.35, offsetY: 0.42 },
    ],
  },
  {
    id: "vulcan-cave",
    name: "Vulcan Cave",
    material: "stone",
    theme: "cave",
    description:
      "The cave of ancient origins. Lascaux-style tablets line the north wall. " +
      "Cave painting panels hang on the west wall depicting early kinetic notation. " +
      "Torchlight flickers across rough stone. Two figures in animal skins " +
      "demonstrate the earliest known sequences with crude wooden clubs.",
    devNotes:
      "VULCAN CAVE\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: First 'holy shit' moment. Ancient origins, reverent.\n" +
      "\n" +
      "SPATIAL BEAT: tight - low ceiling feeling, torchlight only\n" +
      "\n" +
      "Two performers doing crude sequences with wooden clubs.\n" +
      "Lascaux tablets are the first real exhibits - set the bar.\n" +
      "House on the Rock energy: cramped, obsessive, firelit.\n" +
      "TODO: torch flicker particles, cave ambient drip audio\n" +
      "\n" +
      "TONE: Sacred. Like finding cave paintings nobody was supposed to see.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "cave-lascaux-1", size: "standard", facing: "south" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "cave-lascaux-2", size: "standard", facing: "south" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "entrance->vulcan-cave", width: 4 },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "vulcan-cave->egyptian", width: 4 },
          { type: "gap", minTiles: 4 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "cave-paintings-1", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "cave-paintings-2", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "cave-marchand", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
    performers: [
      { offsetX: -0.15, offsetY: 0.1, facing: "south", refId: "cave-performer-1" },
      { offsetX: 0.15, offsetY: 0.1, facing: "south", refId: "cave-performer-2" },
    ],
  },

  // ── Phase 2: Order-era wings ──

  {
    id: "egyptian",
    name: "Egyptian Wing",
    material: "sandstone",
    theme: "classical",
    description:
      "Warm sandstone and the soft glow of oil lamps. " +
      "This wing documents the formalization of the Type system in ancient Egypt and Greece. " +
      "Four stone pillars frame the central hall. " +
      "The first hint that access to this knowledge was deliberately restricted.",
    devNotes:
      "EGYPTIAN WING\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Formalization. Knowledge gets organized - and gatekept.\n" +
      "\n" +
      "SPATIAL BEAT: open - tall ceilings, sandstone warmth, pillared hall\n" +
      "\n" +
      "First hint of deliberate restriction. Priesthood controls access.\n" +
      "Oil lamps instead of torches - warmer, more institutional.\n" +
      "TODO: pillar props (stone columns at quarter points)\n" +
      "TODO: amphora exhibit content\n" +
      "\n" +
      "TONE: Warm but controlled. Library energy. Restricted stacks.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "egypt-karnak", size: "standard", facing: "south" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "egypt-controlled", size: "standard", facing: "north" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "egyptian->renaissance", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "egypt-amphora", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "vulcan-cave->egyptian", width: 4 },
          { type: "gap", minTiles: 4 },
          { type: "exhibit", refId: "egypt-priesthood", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
    performers: [
      { offsetX: 0.25, offsetY: -0.25, facing: "south", refId: "egypt-telekinetic-formation" },
    ],
  },
  {
    id: "renaissance",
    name: "Renaissance Wing",
    material: "wood",
    theme: "renaissance",
    description:
      "Natural light and the smell of old wood. Da Vinci's workshop, recreated from contemporary accounts. " +
      "Codex pages and rotational diagrams cover the walls. The notebooks were scattered after his death. " +
      "Someone wanted the complete system to be unrecoverable.",
    devNotes:
      "RENAISSANCE WING\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Da Vinci's workshop. Knowledge alive, then scattered.\n" +
      "\n" +
      "SPATIAL BEAT: intimate - wood and light, notebooks everywhere\n" +
      "\n" +
      "Natural light. First room that feels like a real place someone worked in.\n" +
      "Codex pages on walls are interactive (zoom on approach).\n" +
      "The 'scattered after death' reveal seeds conspiracy without naming it.\n" +
      "TODO: workshop props (desk, ink pots, quill)\n" +
      "\n" +
      "TONE: Nostalgic. A genius worked here and someone erased the evidence.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "egyptian->renaissance", width: 4 },
          { type: "gap", minTiles: 4 },
          { type: "exhibit", refId: "ren-codex", size: "standard", facing: "south" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "ren-notebooks", size: "standard", facing: "north" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "ren-workshop", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "ren-vitruvian", size: "standard", facing: "east" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "renaissance->victorian", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
  },
  {
    id: "victorian",
    name: "Victorian Wing",
    material: "marble",
    theme: "industrial",
    description:
      "Gas lamps and brass fittings. The Victorian era brought mechanization to kinetic notation - " +
      "and the first systematic suppression. Patents filed, patents recalled. " +
      "Inventors discredited by scandal. The method is never explained.",
    devNotes:
      "VICTORIAN WING\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Industrialization meets suppression. Patents recalled.\n" +
      "\n" +
      "SPATIAL BEAT: open - high ceilings, brass, gas lamps\n" +
      "\n" +
      "Hub room: connects to digital (north), construction-zone (south).\n" +
      "Portraits of discredited inventors line the east wall.\n" +
      "The method is never explained - visitor should start asking why.\n" +
      "TODO: gas lamp light effect (warmer, steadier than torches)\n" +
      "\n" +
      "TONE: Distinguished rot. Something is very wrong and everyone is polite about it.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "vic-brass", size: "standard", facing: "south" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "victorian->digital", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "vic-discredited", size: "standard", facing: "north" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "victorian->construction-zone", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "renaissance->victorian", width: 4 },
          { type: "gap", minTiles: 4 },
          { type: "exhibit", refId: "vic-portraits", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "vic-patents", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
  },

  // ── Phase 3: Digital era + Suppression ──

  {
    id: "digital",
    name: "Digital Wing",
    material: "stone",
    theme: "digital",
    description:
      "CRT glow and the hum of fluorescent tubes. The 1990s wing documents the moment " +
      "kinetic notation escaped into the digital world. A terminal sits in the corner, " +
      "still running TKA-OS v2. BBS printouts line the walls.",
    devNotes:
      "DIGITAL WING\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Knowledge escapes to digital. 3400 users. BBS era.\n" +
      "\n" +
      "SPATIAL BEAT: tight - CRT glow, fluorescent hum, server closet feel\n" +
      "\n" +
      "Tonal shift: first modern-era room. No more stone and wood.\n" +
      "Terminal is interactive (type commands, get fake BBS responses).\n" +
      "Side branch to VTG wing (west wall).\n" +
      "TODO: CRT scanline shader on terminal exhibit\n" +
      "TODO: BBS printout wall textures\n" +
      "\n" +
      "TONE: Late-night hacker den. The knowledge went underground.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "digital-crt", size: "standard", facing: "south" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "digital->suppression", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "digital-team", size: "standard", facing: "north" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "victorian->digital", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "digital-3400", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "digital-bbs", size: "standard", facing: "east" },
          { type: "gap", minTiles: 4 },
          { type: "rope", edgeId: "digital->vtg-wing", width: 6 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
  },
  {
    id: "suppression",
    name: "The Suppression",
    material: "marble",
    theme: "institutional",
    description:
      "Fluorescent flicker. Sterile institutional lighting. This is the reveal wing. " +
      "The Order of the Closed Palm is named here for the first time. " +
      "The symbol you've been seeing since the cave is everywhere now. " +
      "The air smells like old paper and bureaucratic dread.",
    devNotes:
      "THE SUPPRESSION\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: The reveal. The Order is named. Everything clicks.\n" +
      "\n" +
      "SPATIAL BEAT: open - huge room, institutional sterile, oppressive\n" +
      "\n" +
      "Biggest information-dense room. Six exhibits.\n" +
      "Closed Palm symbol appears on every surface.\n" +
      "Visitor should feel the accumulation of all the hints from earlier rooms.\n" +
      "Museum of Jurassic Technology energy: deadpan institutional, can't tell real from fake.\n" +
      "TODO: fluorescent flicker effect (random, unsettling)\n" +
      "\n" +
      "TONE: Bureaucratic dread. The worst things happen in well-lit offices.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "supp-order-1", size: "standard", facing: "south", group: "order" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "supp-order-2", size: "standard", facing: "south", group: "order" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "supp-order-3", size: "standard", facing: "south", group: "order" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "suppression->cross-reference", width: 4 },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "supp-may8", size: "standard", facing: "north" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "digital->suppression", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "supp-youve-seen", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "supp-bellweather", size: "large", facing: "west" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "supp-lethe", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
  },
  {
    id: "cross-reference",
    name: "Cross-Reference Room",
    material: "marble",
    theme: "institutional",
    minInteriorWidth: 14,
    minInteriorHeight: 12,
    description:
      "A reading room the Nomenclature Division has occupied since 1947. " +
      "One terminal, one memo, one plaque, and a tablet transcription that has " +
      "been through sixty-one revisions of the key without changing.",
    devNotes:
      "CROSS-REFERENCE ROOM\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: The OOGA payload. The Order decodes the tablet and misses the point.\n" +
      "\n" +
      "SPATIAL BEAT: medium - quiet, fluorescent, a reading room off the Suppression\n" +
      "\n" +
      "Terminal on the north wall runs the decode interaction: apply the key,\n" +
      "letters reveal one by one, connective forms dim, OOGA. K's note follows.\n" +
      "Then 'Open in the Composer' hands the real sequence to the app.\n" +
      "\n" +
      "TONE: A department that was right about everything except what it was for.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "xref-console", size: "large", facing: "south" },
          { type: "gap", minTiles: 2 },
          { type: "door", edgeId: "cross-reference->crumble", width: 4 },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "door", edgeId: "suppression->cross-reference", width: 4 },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "xref-k-sign", size: "standard", facing: "north" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "xref-memo", size: "large", facing: "west" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "xref-order", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
    furniture: [
      { role: "desk", offsetX: 0, offsetY: 0.05 },
      { role: "desk-chair", offsetX: 0, offsetY: 0.18, rotationY: Math.PI },
      { role: "bookshelf", offsetX: -0.3, offsetY: -0.3, rotationY: Math.PI / 2 },
      { role: "lamp", offsetX: 0.3, offsetY: -0.3 },
    ],
  },
  {
    id: "vtg-wing",
    name: "The Vulcan Wing",
    material: "stone",
    theme: "construction",
    description:
      "NOTICE: This exhibit has been under renovation since 2024. " +
      "Estimated completion: [DATE NOT FOUND]. " +
      "Visitors interested in the Vulcan notation tradition are encouraged " +
      "to consult external resources.",
    devNotes:
      "VTG WING\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Placeholder. Under renovation. Joke about scope creep.\n" +
      "\n" +
      "SPATIAL BEAT: tight - smallest real room, construction dust\n" +
      "\n" +
      "Side branch off digital wing. Dead end.\n" +
      "The renovation notice IS the joke. [DATE NOT FOUND] is permanent.\n" +
      "TODO: construction props (sawhorses, caution tape)\n" +
      "TODO: faded blueprint on the wall showing a massive planned wing\n" +
      "\n" +
      "TONE: Dry institutional humor. The museum can't finish anything either.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "vtg-renovation", size: "standard", facing: "south" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: EMPTY_WALL,
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "rope", edgeId: "digital->vtg-wing", width: 6 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: EMPTY_WALL,
    },
    furniture: [
      { role: "scaffolding", offsetX: -0.2, offsetY: -0.1 },
      { role: "scaffolding", offsetX: 0.25, offsetY: 0.15 },
      { role: "scaffolding", offsetX: -0.3, offsetY: 0.3 },
      { role: "scaffolding", offsetX: 0.1, offsetY: -0.3 },
      { role: "scaffolding", offsetX: 0.35, offsetY: -0.2 },
    ],
  },

  // ── Phase 4: Post-Order rooms ──

  {
    id: "crumble",
    name: "The Crumble",
    material: "dirt",
    theme: "construction",
    minInteriorWidth: 6,
    description:
      "The seam. Water-stained walls. Half-installed exhibits frozen mid-construction. " +
      "Filing cabinets left open, papers scattered. The approval loop that strangled " +
      "the Order is visible in the unfinished work. 23 years of abandonment.",
    devNotes:
      "THE CRUMBLE\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: The seam between eras. 23 years of decay.\n" +
      "\n" +
      "SPATIAL BEAT: tight - narrow corridor-room, claustrophobic\n" +
      "\n" +
      "Smallest main-path room. Narrow on purpose.\n" +
      "No exhibits - the room itself IS the exhibit.\n" +
      "Filing cabinets, scattered papers, water stains.\n" +
      "Transitional: institutional suppression → handmade gallery.\n" +
      "TODO: water drip particles, ceiling cracks\n" +
      "\n" +
      "TONE: Abandoned mid-sentence. Like finding a half-packed office after a layoff.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "crumble->gallery", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "cross-reference->crumble", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: EMPTY_WALL,
      west: EMPTY_WALL,
    },
  },
  {
    id: "gallery",
    name: "K's Gallery",
    material: "wood",
    theme: "gallery",
    description:
      "Warm wood floors, steady torchlight. Someone has been living here. " +
      "The exhibits are handmade - sticky notes evolving into proper signs. " +
      "This is where the museum stops being an archive and starts being an invitation.",
    devNotes:
      "K'S GALLERY\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: The heart. K's space. Handmade, warm, alive.\n" +
      "\n" +
      "SPATIAL BEAT: open - warm wood, torchlight, someone lives here\n" +
      "\n" +
      "Biggest emotional room. The archive becomes an invitation.\n" +
      "Sticky notes evolving into proper signs = K learning to be a curator.\n" +
      "Scribe performer in center - the first friendly NPC.\n" +
      "House on the Rock energy: obsessive personal collection.\n" +
      "TODO: K's bedroll in a corner (lived-in detail)\n" +
      "TODO: practice-wall exhibit with real sequence viewer\n" +
      "\n" +
      "TONE: Like visiting someone's apartment and realizing they're an artist.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "gallery-spiral", size: "standard", facing: "south" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "gallery->fear", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "gallery-k-note", size: "standard", facing: "north" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "crumble->gallery", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "gallery-practice", size: "standard", facing: "west" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "gallery-scribes", size: "standard", facing: "east" },
          { type: "gap", minTiles: 3 },
          { type: "torch" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
    performers: [
      { offsetX: 0, offsetY: 0.1, facing: "south", refId: "gallery-scribe" },
    ],
  },
  {
    id: "fear",
    name: "Room of Fear",
    material: "stone",
    theme: "institutional",
    description:
      "Containment warnings on every wall. Closed Palm symbols stamped on every surface. " +
      "The Order's final argument: this knowledge is a public health hazard. " +
      "Seal the archive. Walk away.",
    devNotes:
      "ROOM OF FEAR\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Containment. The Order's final argument.\n" +
      "\n" +
      "SPATIAL BEAT: tight - oppressive, walls closing in\n" +
      "\n" +
      "Three containment exhibits on north wall. Dense, aggressive.\n" +
      "Closed Palm symbols stamped everywhere.\n" +
      "After the warmth of K's Gallery, this is a cold slap.\n" +
      "TODO: red warning light ambient effect\n" +
      "TODO: containment exhibit content (Order documents)\n" +
      "\n" +
      "TONE: Government hazmat briefing. Clinical fear.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "fear-containment-1", size: "standard", facing: "south" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "fear-containment-2", size: "standard", facing: "south" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "fear-containment-3", size: "standard", facing: "south" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "gallery->fear", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "fear->isolation", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "fear-k-sign", size: "standard", facing: "east" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "fear-final-argument", size: "large", facing: "east" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
    },
  },
  {
    id: "isolation",
    name: "Room of Isolation",
    material: "marble",
    theme: "institutional",
    minInteriorWidth: 26,
    minInteriorHeight: 22,
    description:
      "Cubicle walls for flow artists. Three feet apart with walls between them. " +
      "Each person has something whole and beautiful. The problem isn't that anyone's piece " +
      "is incomplete - it's that nobody's sharing it.",
    devNotes:
      "ROOM OF ISOLATION\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Beautiful fragments kept apart. The cost of not sharing.\n" +
      "\n" +
      "SPATIAL BEAT: open - large room subdivided by cubicle walls\n" +
      "\n" +
      "Paradox room: big space that feels small because of internal walls.\n" +
      "Each cubicle has a beautiful sequence fragment.\n" +
      "Nobody can see each other's work. That's the point.\n" +
      "TODO: cubicle wall props (waist-height dividers)\n" +
      "TODO: isolated performer stations (one per cubicle)\n" +
      "\n" +
      "TONE: Office park for artists. Quietly devastating.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 4 },
          { type: "exhibit", refId: "iso-floor-plan", size: "standard", facing: "south" },
          { type: "gap", minTiles: 6 },
          { type: "exhibit", refId: "iso-solo-sign", size: "standard", facing: "south" },
          { type: "gap", minTiles: 4 },
        ],
        minMargin: 2,
      },
      south: EMPTY_WALL,
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "isolation->collaboration", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "fear->isolation", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
    },
    // Six cubicles in two rows of three. Every station faces its own
    // partition; nobody faces anybody. Bookshelves stand in for the
    // waist-height dividers until real cubicle props exist.
    performers: [
      { offsetX: -0.3, offsetY: -0.22, facing: "north", refId: "iso-1" },
      { offsetX: 0, offsetY: -0.22, facing: "north", refId: "iso-2" },
      { offsetX: 0.3, offsetY: -0.22, facing: "north", refId: "iso-3" },
      { offsetX: -0.3, offsetY: 0.22, facing: "south", refId: "iso-4" },
      { offsetX: 0, offsetY: 0.22, facing: "south", refId: "iso-5" },
      { offsetX: 0.3, offsetY: 0.22, facing: "south", refId: "iso-6" },
    ],
    furniture: [
      // Partitions between the columns of the north row
      { role: "bookshelf", offsetX: -0.15, offsetY: -0.22, rotationY: Math.PI / 2 },
      { role: "bookshelf", offsetX: 0.15, offsetY: -0.22, rotationY: Math.PI / 2 },
      // Partitions between the columns of the south row
      { role: "bookshelf", offsetX: -0.15, offsetY: 0.22, rotationY: Math.PI / 2 },
      { role: "bookshelf", offsetX: 0.15, offsetY: 0.22, rotationY: Math.PI / 2 },
      // The spine between the rows
      { role: "bookshelf", offsetX: -0.3, offsetY: 0 },
      { role: "bookshelf", offsetX: 0, offsetY: 0 },
      { role: "bookshelf", offsetX: 0.3, offsetY: 0 },
      // One chair per station, one record per chair
      { role: "desk-chair", offsetX: -0.3, offsetY: -0.3, rotationY: Math.PI },
      { role: "desk-chair", offsetX: 0, offsetY: -0.3, rotationY: Math.PI },
      { role: "desk-chair", offsetX: 0.3, offsetY: -0.3, rotationY: Math.PI },
      { role: "desk-chair", offsetX: -0.3, offsetY: 0.3 },
      { role: "desk-chair", offsetX: 0, offsetY: 0.3 },
      { role: "desk-chair", offsetX: 0.3, offsetY: 0.3 },
    ],
  },
  {
    id: "collaboration",
    name: "Room of Collaboration",
    material: "dirt",
    theme: "outdoor",
    minInteriorWidth: 60,
    minInteriorHeight: 55,
    // The village fire sits at the room's centre, and the village is turned
    // so its audience side faces west. Opened on its own
    // (?room=collaboration), start on the audience spot, 11 m west of the
    // fire on its line (the village rules' campfire.audienceDistance), so
    // the opening lesson fills a standing view.
    spawn: { offsetX: -0.24, offsetY: 0, facing: "east" },
    // The forest is this room's envelope. Tile walls and a ceiling here
    // boxed the clearing in at 21 m: the lit ground stopped at a dark wall
    // band on the horizon, with the wall top and ceiling edge as a grey
    // seam. Collision still comes from the grid.
    roomPresentation: { suppressTileGeometry: true },
    description:
      "Birds chirping. Trees. Light. Warmth. Real people spinning together. " +
      "Imperfect technique. Fully alive. The activity that 40,000 years of history " +
      "has been arguing over, just happening.",
    devNotes:
      "ROOM OF COLLABORATION\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: The payoff. Real spinning. Together. Outdoors.\n" +
      "\n" +
      "SPATIAL BEAT: open - outdoors, sky visible, birds, trees\n" +
      "\n" +
      "Four performers spinning together. Imperfect technique.\n" +
      "After fear + isolation, this is the emotional release.\n" +
      "First room with natural light and outdoor ambiance.\n" +
      "No plaques. No explanations. Just people doing the thing.\n" +
      "TODO: bird particle effects, tree props at edges\n" +
      "TODO: ambient outdoor audio (wind, birds, distant laughter)\n" +
      "\n" +
      "TONE: Relief. Like walking outside after a long meeting.",
    walls: {
      north: EMPTY_WALL,
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "collaboration->gift-shop", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: EMPTY_WALL,
      // Centred, so the walk comes in on the fire's line, behind the
      // audience spot, facing the lesson.
      west: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "isolation->collaboration", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
        alignment: "center",
      },
    },
    performers: [
      { offsetX: -0.2, offsetY: -0.15, facing: "east", refId: "collab-1" },
      { offsetX: 0.15, offsetY: -0.2, facing: "west", refId: "collab-2" },
      { offsetX: 0.25, offsetY: 0.15, facing: "north", refId: "collab-3" },
      { offsetX: -0.1, offsetY: 0.2, facing: "south", refId: "collab-4" },
      // The wax docent stands beside the gift-shop door with the pamphlet out.
      { offsetX: 0.08, offsetY: 0.42, facing: "north", refId: "wax-docent" },
    ],
  },

  // ── Phase 5: Final rooms + Easter eggs ──

  {
    id: "gift-shop",
    name: "Gift Shop",
    material: "marble",
    theme: "retail",
    description:
      "Bright commercial lighting. Dusty shelves of branded merchandise from a secret society " +
      "that no longer exists. A crumpled $20 bill on the floor near the entrance. " +
      "A mannequin in a museum uniform stands behind the register.",
    devNotes:
      "GIFT SHOP\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Commercial contrast. Dusty merch from a dead society.\n" +
      "\n" +
      "SPATIAL BEAT: open - bright, commercial, jarring after the outdoors\n" +
      "\n" +
      "Mannequin cashier is the only NPC. Does not move.\n" +
      "Crumpled $20 on the floor. Shelves of branded Closed Palm merch.\n" +
      "Links to the real merch store (physical cards, posters).\n" +
      "TODO: shelf props with merchandise thumbnails\n" +
      "TODO: register with mannequin interaction\n" +
      "\n" +
      "TONE: Airport gift shop for a conspiracy. Nobody's buying.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "collaboration->gift-shop", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "shop-exit", size: "large", facing: "north" },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      east: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "shop-shelf-1", size: "standard", facing: "west" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "shop-shelf-2", size: "standard", facing: "west" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "shop-shelf-3", size: "standard", facing: "east" },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "shop-closing-sign", size: "standard", facing: "east" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
    },
    performers: [
      { offsetX: 0.3, offsetY: -0.05, facing: "west", refId: "shop-cashier" },
    ],
    furniture: [
      // The register: a desk in front of the mannequin
      { role: "desk", offsetX: 0.18, offsetY: -0.05, rotationY: Math.PI / 2 },
      { role: "rug", offsetX: 0, offsetY: -0.3 },
      { role: "plant", offsetX: -0.35, offsetY: -0.38 },
      { role: "trashcan", offsetX: 0.36, offsetY: 0.3 },
      { role: "coat-rack", offsetX: -0.36, offsetY: 0.32 },
    ],
  },
  {
    id: "construction-zone",
    name: "Construction Zone",
    material: "dirt",
    theme: "construction",
    description:
      "Work lights. Scaffolding. Unfinished exhibits frozen mid-construction. " +
      "A hard hat on the ground. A door at the back marked MAINTENANCE.",
    devNotes:
      "CONSTRUCTION ZONE\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: Staff only. Scaffolding. The seam shows.\n" +
      "\n" +
      "SPATIAL BEAT: tight - work lights, hard hat required\n" +
      "\n" +
      "Side branch off Victorian. Feels like you're not supposed to be here.\n" +
      "Leads to janitor's closet (the meta reveal).\n" +
      "STAFF ONLY sign on the door. Player ignores it. That's the point.\n" +
      "TODO: scaffolding props, caution tape, work light effect\n" +
      "\n" +
      "TONE: Backstage at a theme park. The illusion peels.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "exhibit", refId: "cz-staff-only", size: "standard", facing: "south" },
          { type: "gap", minTiles: 4 },
          { type: "door", edgeId: "victorian->construction-zone", width: 4 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      south: EMPTY_WALL,
      east: {
        segments: [
          { type: "gap", minTiles: 3 },
          { type: "door", edgeId: "construction-zone->janitor", width: 3 },
          { type: "gap", minTiles: 3 },
        ],
        minMargin: 2,
      },
      west: EMPTY_WALL,
    },
    furniture: [
      { role: "scaffolding", offsetX: -0.25, offsetY: -0.15 },
      { role: "scaffolding", offsetX: 0.2, offsetY: 0.2 },
      { role: "scaffolding", offsetX: -0.1, offsetY: 0.35 },
      { role: "scaffolding", offsetX: 0.3, offsetY: -0.3 },
      { role: "scaffolding", offsetX: -0.35, offsetY: 0.1 },
    ],
  },
  {
    id: "janitor",
    name: "Janitor's Closet",
    material: "dirt",
    theme: "construction",
    description:
      "A single bare bulb. Hot glue guns on a shelf. Foam core scraps. " +
      "A whiteboard that reads AUSTEN'S FAKE MUSEUM IDEAS. " +
      "A mannequin with a photograph taped to its face. " +
      "No plaque. No explanation.",
    devNotes:
      "JANITOR'S CLOSET\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "PURPOSE: The meta reveal. Austen's fake museum ideas. Stanley Parable.\n" +
      "\n" +
      "SPATIAL BEAT: wtf - tiny, bare bulb, foam core scraps\n" +
      "\n" +
      "The whiteboard IS the exhibit: AUSTEN'S FAKE MUSEUM IDEAS.\n" +
      "Mannequin with photograph taped to face. No plaque.\n" +
      "Smallest room. Dead end. The reward for exploring.\n" +
      "Stanley Parable energy: the narrator's office, the developer's closet.\n" +
      "TODO: hot glue gun prop, foam core scraps on floor\n" +
      "TODO: whiteboard with handwritten text texture\n" +
      "\n" +
      "TONE: You found the room where the museum was built. Now what.",
    walls: {
      north: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "torch" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      south: EMPTY_WALL,
      east: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "janitor-whiteboard", size: "standard", facing: "west" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
      west: {
        segments: [
          { type: "gap", minTiles: 2 },
          { type: "door", edgeId: "construction-zone->janitor", width: 3 },
          { type: "gap", minTiles: 2 },
          { type: "exhibit", refId: "janitor-mannequin", size: "standard", facing: "east" },
          { type: "gap", minTiles: 2 },
        ],
        minMargin: 2,
      },
    },
  },
];


export const MUSEUM_EDGES: RoomEdge[] = [
  {
    from: "entrance",
    to: "vulcan-cave",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "vulcan-cave",
    to: "egyptian",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
  {
    from: "egyptian",
    to: "renaissance",
    type: "main-path",
    fromWall: "south",
    toWall: "north",
    corridorWidth: 4,
  },
  {
    from: "renaissance",
    to: "victorian",
    type: "main-path",
    fromWall: "west",
    toWall: "east",
    corridorWidth: 4,
  },
  // Phase 3
  {
    from: "victorian",
    to: "digital",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "digital",
    to: "suppression",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "digital",
    to: "vtg-wing",
    type: "side-branch",
    fromWall: "west",
    toWall: "east",
    corridorWidth: 4,
  },
  // Phase 4
  {
    from: "suppression",
    to: "cross-reference",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "cross-reference",
    to: "crumble",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "crumble",
    to: "gallery",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "gallery",
    to: "fear",
    type: "main-path",
    fromWall: "north",
    toWall: "south",
    corridorWidth: 4,
  },
  {
    from: "fear",
    to: "isolation",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
  {
    from: "isolation",
    to: "collaboration",
    type: "main-path",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 4,
  },
  // Phase 5
  {
    from: "collaboration",
    to: "gift-shop",
    type: "main-path",
    fromWall: "south",
    toWall: "north",
    corridorWidth: 4,
  },
  {
    from: "victorian",
    to: "construction-zone",
    type: "side-branch",
    fromWall: "south",
    toWall: "north",
    corridorWidth: 4,
  },
  {
    from: "construction-zone",
    to: "janitor",
    type: "side-branch",
    fromWall: "east",
    toWall: "west",
    corridorWidth: 3,
  },
];


export const GRID_CONFIG: GridConfig = {
  cellWidth: 40,
  cellHeight: 40,
  padding: 2,
};
