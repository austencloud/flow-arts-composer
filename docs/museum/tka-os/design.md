# TKA-OS: The Windows 93 Experience

**Repository status (2026-10-14):** The CRT and `/retro` or `/tka-os` route choices below are proposals, not current route guarantees. "TKA Scribe v1.0 for Windows" remains the fictional retro label; the real application handoff is Flow Arts Composer. Current spatial placement and delivery platform require reconciliation with the museum canon.

> Proposed retro operating system experience. Its Wing 5 placement is historical and belongs to the retired numbered layout.

---

## Overview

In Wing 5 (Digital Revolution), visitors encounter an old CRT monitor on a pedestal displaying "TKA Scribe v1.0 for Windows." This isn't just a static display - it's a portal to a fully functional retro-skinned version of TKA Scribe.

Click the monitor. The camera zooms in. The screen fills your view. You're IN.

---

## The Boot Sequence

### Step 1: Click to Activate

Player clicks the CRT monitor in the museum. A plaque reads:

> **TKA Scribe v1.0 for Windows**
> _Bellweather Technical Institute, 1993_
>
> This interactive exhibit allows visitors to experience the original digital implementation of kinetic notation.
>
> Click to activate.

### Step 2: The Zoom

Camera zooms into the CRT screen. The museum fades away. The URL changes to `/retro` or `/tka-os`.

### Step 3: Boot Screen

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║                      TKA-OS v1.0                           ║
║           Kinetic Notation Operating System                ║
║                                                            ║
║              Bellweather Technical Institute               ║
║                        1993                                ║
║                                                            ║
║           Starting system components...                    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### Step 4: Progress Bar

A progress bar that lies. It jumps around unpredictably:

- 0%... 1%... 2%... 47%... 48%... 12%... (what?)
- "Loading NOTATION.DLL..."
- "Initializing SPIRAL.SYS..."
- "Checking for Order surveillance... NONE DETECTED"
- "Loading user preferences..."
- 89%... 90%... 91%... 3%... (sigh)
- Eventually reaches 100%

The whole sequence takes 15-30 seconds. Long enough to build anticipation, not long enough to frustrate.

### Step 5: Desktop Appears

Classic Windows 3.1/95 hybrid desktop. Gray background. Chunky icons. System font.

---

## The Desktop

### Visual Style

- **Color palette:** Windows gray, teal accents, that specific shade of blue
- **Fonts:** MS Sans Serif, system fonts, bitmap text
- **Windows:** Thick borders, minimize/maximize/close buttons, title bars
- **Icons:** 32x32 pixel art, slightly crude
- **Resolution feel:** 640x480 / 800x600 energy (even if actually higher)

### Desktop Icons

| Icon | Name           | Function                                     |
| ---- | -------------- | -------------------------------------------- |
| 📁   | My Sequences   | Opens file browser with .SEQ files           |
| 📝   | TKA Scribe     | Opens the main notation application          |
| 🗑️   | Recycle Bin    | Contains deleted sequences with funny errors |
| 💾   | Save to Floppy | Fake "export" function                       |
| 📖   | README.TXT     | Fake readme with lore                        |
| ⚠️   | VIRUS.EXE      | Fake virus (see Easter Eggs)                 |
| 🎮   | TKA Solitaire  | Fake game (optional)                         |
| ❓   | HELP.HLP       | Fake help file                               |

### Taskbar

Bottom of screen:

- Start button (opens Start menu)
- Quick launch icons
- System tray (clock, volume, suspicious "monitoring" icon)
- Running applications

### Start Menu

```
┌─────────────────────────────┐
│ ■ Programs              ▶  │
│ ■ Documents             ▶  │
│ ■ Settings              ▶  │
│ ■ Find                  ▶  │
│ ■ Help                     │
│ ─────────────────────────  │
│ ■ Run...                   │
│ ■ Shut Down                │
└─────────────────────────────┘
```

Programs submenu includes TKA Scribe, Accessories, etc.

---

## TKA Scribe v1.0 (The App)

The main application is a retro-skinned version of the real TKA Scribe functionality. Not a toy - actually functional, just with 1993 UI.

### Main Window

```
┌─────────────────────────────────────────────────────────────┐
│ TKA Scribe v1.0                                    [_][□][X]│
├─────────────────────────────────────────────────────────────┤
│ File  Edit  View  Sequence  Generate  Help                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │           [SEQUENCE DISPLAY AREA]                   │   │
│  │                                                     │   │
│  │      Renders pictographs in retro pixel style      │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Word: [____________]  [GENERATE]                           │
│                                                             │
│  Type: ○ Level 1  ○ Level 2  ○ Level 3                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Ready                                          16 Colors    │
└─────────────────────────────────────────────────────────────┘
```

### Functional Features

| Feature                     | Works?  | Notes                                        |
| --------------------------- | ------- | -------------------------------------------- |
| Generate sequence from word | Yes     | Core functionality                           |
| View pictographs            | Yes     | Rendered in pixel/retro style                |
| Export/Save                 | Fake    | "Saved to A:\\" message, downloads real file |
| Print                       | Fake    | "Printer not found" or prints to PDF         |
| Browse library              | Limited | Shows a few pre-made sequences               |
| Type selection              | Yes     | Level 1/2/3 as in real app                   |

### Retro Pictograph Rendering

Pictographs are rendered in a deliberately retro style:

- Limited color palette (16 colors max)
- Pixelated edges
- Simpler geometry
- CRT scanline overlay option
- Slight screen flicker

---

## My Sequences (File Browser)

Opening "My Sequences" shows a file browser:

```
┌─────────────────────────────────────────────────────────────┐
│ My Sequences                                       [_][□][X]│
├─────────────────────────────────────────────────────────────┤
│ File  Edit  View  Help                                      │
├─────────────────────────────────────────────────────────────┤
│ 📁 A:\                                                      │
│ ├── 📄 OOGA.SEQ         128 bytes    03/15/93              │
│ ├── 📄 UG.SEQ            64 bytes    03/15/93              │
│ ├── 📄 FIRE_DANCE.SEQ   256 bytes    04/22/93              │
│ ├── 📄 SPIN_TEST.SEQ    192 bytes    05/01/93              │
│ └── 📄 LEAKED.SEQ         0 bytes    05/08/94   [CORRUPT]  │
│                                                             │
│ 5 file(s)        640 bytes                                  │
└─────────────────────────────────────────────────────────────┘
```

Pre-loaded sequences visitors can open and view:

- OOGA.SEQ - The famous paleolithic sequence
- UG.SEQ - Simple alpha-to-alpha
- FIRE_DANCE.SEQ - A longer demonstration sequence
- SPIN_TEST.SEQ - Developer test file
- LEAKED.SEQ - Corrupted, cannot be opened ("File corrupted during Protocol Lethe")

---

## Easter Eggs & Fake Problems

### Blue Screen of Death

Certain actions trigger a BSOD:

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  A fatal exception 0E has occurred at 0028:C0011E36        ║
║  in NOTATION.DLL + 00001E36.                               ║
║                                                            ║
║  The current application will be terminated.               ║
║                                                            ║
║  *  Press any key to return to TKA-OS.                     ║
║  *  Press CTRL+ALT+DEL to restart your computer.           ║
║     You will lose any unsaved sequences.                   ║
║                                                            ║
║  Error: KINETIC_OVERFLOW - Too much spin detected          ║
║                                                            ║
║  Press any key to continue _                               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

Triggers:

- Trying to generate a sequence longer than 10 letters
- Clicking certain hidden elements
- Opening VIRUS.EXE
- Random chance (rare)

### VIRUS.EXE

A suspicious executable on the desktop. If clicked:

1. Warning dialog: "Are you sure you want to run VIRUS.EXE?"
2. If YES: Fake virus animation - screen fills with spirals, colors invert, text scrambles
3. Then: "Just kidding. The Scribes protect their own."
4. Desktop returns to normal (maybe with a small spiral added somewhere)

### Recycle Bin

Contains:

- DELETED_MOVE.SEQ - "Cannot restore: Motion has been forgotten"
- ORDER_MEMO.DOC - "Access denied: Clearance level insufficient"
- BACKUP.ZIP - "File corrupted during suppression event"

### README.TXT

```
═══════════════════════════════════════════════════════════════
                    TKA SCRIBE v1.0 README
═══════════════════════════════════════════════════════════════

Thank you for installing TKA Scribe!

SYSTEM REQUIREMENTS:
- 386 processor or higher
- 4MB RAM (8MB recommended)
- VGA display (256 colors recommended)
- 10MB hard disk space
- Mouse

KNOWN ISSUES:
- Program may crash if exposed to psychic suppression fields
- Some users report memory loss after extended use
- Do not distribute this software without authorization

For support, contact Bellweather Technical Institute
Department of Movement Sciences
[CONTACT INFORMATION REDACTED]

═══════════════════════════════════════════════════════════════
            WARNING: UNAUTHORIZED DISTRIBUTION IS
                  MONITORED AND WILL BE ADDRESSED
═══════════════════════════════════════════════════════════════
```

### HELP.HLP

Fake help file with bizarre entries:

```
HELP TOPICS:
- Getting Started
- Creating Your First Sequence
- Understanding Types 1-6
- What To Do If You Forget Everything
- Dealing With The Order (DO NOT READ)
- Contacting Support (DISCONNECTED)
```

Clicking "Dealing With The Order" shows: "This help topic has been removed."

### Error Dialogs

Random error messages that can appear:

- "Not enough memory to remember this sequence"
- "Error: Motion type not recognized by current reality"
- "Warning: Surveillance detected. Proceeding anyway."
- "Cannot save: The future is uncertain"
- "File locked by another user (WHO?)"

---

## Exiting TKA-OS

### Shut Down

Selecting "Shut Down" from Start menu:

```
┌─────────────────────────────────────────────┐
│                                             │
│  Are you sure you want to shut down?        │
│                                             │
│  ○ Shut down                                │
│  ○ Restart                                  │
│  ○ Return to Museum                         │
│                                             │
│         [OK]      [Cancel]                  │
│                                             │
└─────────────────────────────────────────────┘
```

"Return to Museum" zooms back out to Wing 5.
"Shut down" does the same (it's all the same universe).
"Restart" just does a fake reboot and returns to desktop.

### Exit Button

A small "EXIT" button in corner of screen for players who don't want to navigate menus.

---

## Technical Implementation Notes

### URL Handling

When entering TKA-OS:

- URL changes to `/retro` or `/tka-os`
- Session state preserved
- Can potentially be accessed directly (easter egg URL?)

### Saving Work

If player generates a sequence in TKA-OS:

- "Saved to A:\\" message
- Actually downloads as image file (with retro styling)
- Or saves to their Flow Arts Composer account if logged in

### Performance

The retro aesthetic should be performant - it's simpler graphics, not more complex. CRT effects should be optional for low-end devices.

---

## Reference: Windows 93.net

Primary inspiration: https://www.windows93.net/

Study their:

- Boot sequence timing
- Error message humor
- Desktop icon design
- Window behavior
- Easter egg density

TKA-OS should feel like it belongs in that universe while being specifically about kinetic notation.

---

_Last updated: 2026-01-27_
