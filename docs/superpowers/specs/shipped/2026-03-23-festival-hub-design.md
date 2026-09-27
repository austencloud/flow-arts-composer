---
status: backlog
value: 2
effort: XL
remaining: "Real data pipeline, map population, social attendance layer"
depends_on: ""
plan_path: plans/backlog/2026-03-23-festival-hub.md
tags: []
last_triaged: 2026-04-26
---
# Festival Hub Design Spec

## Problem

Austen applies to teach and perform at flow arts festivals but the process is fragmented: discovery is overwhelming, deadlines sneak up, application materials are scattered across old emails, and there's no single view of what's out there globally. The result is procrastination and missed opportunities.

## Solution

A Festival Hub inside the Connect module with three peer views (Discover feed, Map, Calendar) plus a private teaching portfolio. The feed makes discovery exciting, the map shows global reach, the calendar tracks personal deadlines, and the portfolio keeps application materials ready to copy-paste.

## Scope

- Flow arts festivals only: fire, workshops, performances, educational events
- Performers and instructors (not vendors)
- Data sourced by web scraping + manual curation + user submissions with moderation
- Private application tracker per user (alpha: Austen only, scalable to all users)
- Light social layer: attendance badges ("4 TKA users going")

## Non-Goals

- Auto-filling external application forms
- Push notifications (visual countdown badges only)
- Festival chat/threads/coordination beyond attendance visibility
- Vendor tracking

---

## Data Model

### Festival

The core directory entity. Populated by scraping, curation, and moderated user submissions.

```typescript
interface Festival {
  id: string;
  name: string;                    // "FireDrums 2026"
  organizationId: string;           // Stable ID grouping annual editions (e.g., "firedrums")
  organization: string;            // Display name: "FireDrums"
  location: {
    venue?: string;                // "Camp Winnarainbow"
    city: string;
    state?: string;
    country: string;
    coordinates: { lat: number; lng: number };
  };
  dates: {
    start: Timestamp;
    end: Timestamp;
  };
  applicationDeadline?: Timestamp;
  applicationUrl?: string;         // Direct link to their form/portal
  applicationContact?: string;     // Email fallback
  seekingInstructors: boolean;
  seekingPerformers: boolean;
  description: string;
  websiteUrl?: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
  };
  estimatedSize?: "intimate" | "medium" | "large";
  region: "north-america" | "europe" | "oceania" | "asia" | "south-america" | "africa";
  // region is hand-assigned for filter performance. Assignment follows continent boundaries.
  // Ambiguous cases (e.g., Turkey) use the festival's cultural context.
  status: "upcoming" | "past";     // Past festivals kept for history, filtered from default view
  tags: string[];                  // ["fire", "flow", "workshops", "camping"]
  source: "scraped" | "user-submitted" | "curated";
  moderationStatus: "pending" | "approved";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### UserFestivalTracker

Private per-user tracking layer. One document per user-festival pair.

```typescript
interface UserFestivalTracker {
  userId: string;
  festivalId: string;
  status: "interested" | "applying" | "applied" | "accepted" | "declined" | "attending";
  appliedAs: ("instructor" | "performer")[];
  workshopsSubmitted: string[];    // Client-generated IDs matching WorkshopTemplate.id
  stipendRequested?: number;
  notes: string;                   // Private notes
  applicationDate?: Timestamp;
  responseDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### WorkshopTemplate

Reusable class definitions inside the teaching portfolio.

Workshop IDs are client-generated UUIDs, stored as an array inside the TeachingPortfolio document. `UserFestivalTracker.workshopsSubmitted` references these IDs.

```typescript
interface WorkshopTemplate {
  id: string;                      // Client-generated UUID
  title: string;                   // "TKA 1: Learning Letters"
  level: "introductory" | "beginner" | "intermediate" | "advanced" | "mixed";
  props: string[];                 // ["double-staves", "clubs"]
  description: string;             // Public description (≤500 chars typical)
  themes: string[];                // ["doubles", "mixed-prop-concepts"]
  solo: boolean;
}
```

### TeachingPortfolio

Single document per user containing all reusable application materials.

```typescript
interface TeachingPortfolio {
  userId: string;
  classes: WorkshopTemplate[];
  bios: BioVersion[];
  performanceCredits: string[];
  performanceVideos: string[];     // YouTube URLs
  socialLinks: {
    website?: string;
    instagram?: string;
    facebook?: string;
    youtube?: string;
    tiktok?: string;
  };
  insuranceInfo?: {
    provider: string;
    policyExpiration?: Timestamp;
  };
  homeCity: string;
  homeCountry: string;
  yearsTeaching: number;
  yearsPerforming: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface BioVersion {
  id: string;
  label: string;                   // "teaching bio", "performing bio"
  text: string;
  // charCount derived from text.length at render time — not stored
}
```

### FestivalAttendance

Public social layer. Queryable per festival to show badge counts.

```typescript
interface FestivalAttendance {
  festivalId: string;
  userId: string;
  status: "interested" | "going";
  role?: "attendee" | "instructor" | "performer";
  createdAt: Timestamp;
}
```

---

## Firestore Collections

```
festivals/{festivalId}                      — Directory entries
festivals/{festivalId}/attendance/{uid}     — Public attendance badges
userFestivalTracking/{uid}/tracked/{fid}    — Private tracking data
userProfiles/{uid}/workshopPortfolio        — Teaching portfolio (single doc)
festivalSubmissions/{submissionId}          — Moderation queue
```

---

## Module Structure

Festival Hub is a **standalone top-level module** (id: `"festivals"`). The original plan was to nest it inside the Connect module, but Connect was consolidated into Lab in Feb 2026. A standalone module is cleaner and avoids coupling to dead infrastructure.

Four tabs:

### Tab 1: Discover (default)

Scrollable feed of festival cards. Each card shows:
- Festival name, location (city, country), dates
- "Applications Open" badge when deadline hasn't passed and seeking instructors/performers
- Deadline countdown ("12 days left to apply")
- Attendance badge ("4 TKA users going")
- Personal status chip if tracking ("Applied", "Interested", etc.)

**Filter bar** at top:
- Region: All / North America / Europe / Oceania / Asia / South America / Africa
- Time: Upcoming / Next 3 months / Next 6 months / This year
- Status: All / Applications Open / Seeking Instructors / Seeking Performers
- My status: All / Interested / Applied / Accepted

Tapping a card opens a **detail view** with:
- Full festival info (description, venue, dates, website, social links)
- Application link + contact email
- "My Materials" panel showing workshop templates and bios (copyable)
- Tracker controls (status buttons, notes field, stipend amount)
- Attendance list (which TKA users are interested/going)

### Tab 2: Map

Google Maps with festival pins using the existing `GlobalUserMap.svelte` pattern.
- `@googlemaps/markerclusterer` wired up for world-view clustering
- Cluster labels show count ("12 festivals")
- Zoom in → individual pins with festival name labels
- Tap pin → same detail view as card tap
- Festival pins styled differently from user pins (distinct color/icon)

### Tab 3: Calendar

Adapted from Ringmaster's MonthView/DayCell pattern.
- Shows only festivals the user is tracking (interested through attending)
- Two entry types with distinct styling:
  - Festival dates (the event itself)
  - Application deadlines
- Color-coded by tracking status
- Tap an entry → same detail view

### Tab 4: My Workshops

Private teaching portfolio editor. Not visible to other users.
- Workshop template list with add/edit/delete
- Bio versions with character counters
- Performance credits and video links
- Social links and contact info
- Insurance info
- "Copy" button on every field for quick paste into external forms

---

## Application Flow

Designed to reduce procrastination through low-friction progressive commitment:

1. **Browsing feed** → tap bookmark icon → **"Interested"** (one tap)
2. **Interested** → shows in calendar, deadline countdown visible → tap "I'm Applying" → **"Applying"**
3. **Applying** → materials panel available, application link prominent → submit externally → tap "I Applied" → **"Applied"** (add notes: workshops submitted, stipend requested)
4. **Applied** → hear back → tap **"Accepted"** or **"Declined"**
5. **Accepted** → buy tickets, arrange travel → tap **"Attending"**

No push notifications. Deadline urgency communicated through:
- Countdown badges on cards in the feed
- Calendar entries colored by urgency
- "Applications closing soon" filter/sort option

---

## Data Pipeline

### Source 1: Web Scraping (primary)

CLI tool or Cloud Function that scrapes known sources:
- FlowFests.com (worldwide flow arts festival calendar)
- Individual festival websites (FireDrums, Kinetic Fire, FLAME, etc.)
- FlowArts.org calendar
- Fund the Flow Arts event listings

Outputs structured JSON for review. Not fully automated — Austen curates before publishing.

### Source 2: User Submissions

Any TKA user can submit a festival via a short form:
- Name, location, dates, website, what they're seeking
- Goes into `festivalSubmissions` collection with `moderationStatus: "pending"`
- Austen reviews and approves/rejects
- Approved entries get `source: "curated"` and move to `festivals` collection

### Source 3: Manual Curation

Austen can add/edit festivals directly through an admin-level editor in the detail view.

### Submission Validation

User-submitted festivals require: name, city, country, dates, websiteUrl. Coordinates are geocoded from city+country via the existing GeocodingService. Optional: venue, applicationUrl, description, tags.

### Annual Refresh

Festivals are annual. Each year's edition is a new document linked by `organizationId`. When a new cycle starts, the previous year's data informs the new entry (same org, similar dates, updated deadlines).

---

## Seed Data

### Austen's Teaching Portfolio

Extracted from Gmail application history (2019-2026):

**Workshop Templates:**

1. **TKA 1: Learning Letters** (Beginner, double-staves + clubs)
   Foundations of antispins and isolations using negative space and body turns. Strict focus on thumb and prop orientation without finger-spinning. Letters A-B-C comprising split-same 1:1 motions. First three TKA words tunneled into 6 partner patterns.

2. **TKA 2: Writing Words** (Intermediate, mixed/static props)
   Dive into The Kinetic Alphabet pictographs to create and communicate sequences. Students receive laminated sheets of pictograph sequences to practice and share. Construct 19 unique starter sequences using letters A-V.

3. **TKA 3: Speaking Sentences** (Advanced, double-staves + mixed)
   Builds on previous classes with complex variations using turns at different points. Integrates dash and static motions with 3 new sequences. Construct circular words using higher-level sequence cards for intermediate and advanced practitioners.

4. **Intro to Contact Juggling: The Walking Halfpipe** (Beginner, contact ball)
   Three steps to unlocking a balance point using the cradle. Palm transfers and simple forearm rolls. Expand the folding line on both sides: lotus, waterfall, butterfly.

5. **Balloon Animal Funtime Hour** (Beginner, balloons)
   Balloon sculpting fundamentals: dog, cat, flower, hat, sword, giraffe, rhino, bear, monkey, tiger. Materials and pumps provided. MOOP cleanup encouraged.

6. **Intro to Club Passing** (Beginner, clubs)
   Target practice drills progressing to 4-count, 3-count, 2-count, doubles, doctors, tomahawks, and intermediate trick throws.

7. **Letting Go Of Your Poi** (Mixed, poi)
   Toss and catch points: grabbing poi head, under-leg/behind-back tosses, sideways, no beats. Combine tosses into two-poi sequences through different spinning modes.

**Bio Versions:**

Teaching: "Austen Cloud is a Chicago-based flow artist, juggler, and performer. He began his flow arts journey in 2014 and has been teaching classes at flow arts festivals and in his local Chicago community since 2017. His greatest passion is The Kinetic Alphabet, a notation and choreography transcription system designed to facilitate group choreography and large-scale synchronized performances that celebrate the complexity and beauty of flow arts."

Performing: "Austen has been an avid lover of all flow arts since 2014 and is deeply passionate about teaching and performing. His biggest passion is The Kinetic Alphabet, a notation system designed to make choreography more accessible and communicable. He hopes to foster a culture of group collaboration so that flow arts techniques can expand and reach a higher level of appreciation and widespread involvement."

**Performance Credits:**
Black Circle, Pyrotechniq, Red Mink, Stage Factor, Cirque Aflame (own troupe since 2020)

**Teaching History:**
Campfire 2018, Carpe Diem 2022, Equilibrium 2019, Flashepoint 2017, Flame 2023/2024, GLFF 2018/2024, Kinetic Fire 2019/2023, SoFlow 2017, Taco Tuesday Flow Jam (weekly 2017-2024), FMJ Winter Workshop 2025, FireDrums 2025

**Performance Videos:**
- https://youtu.be/aTV3rtOIshU
- https://youtu.be/5k-aGn0nxLY
- https://youtu.be/c1AzCYasT-g?si=johN0ahBg41Xpa1E&t=378

**Social Links:**
- Website: tkaflowarts.com
- Instagram: @thekineticalphabet, @austencloud
- Facebook: facebook.com/TheKineticAlphabet, facebook.com/austencloud

**Insurance:** Specialty Insurance Agency (performer insurance, renewed annually)

### Application History Seed Data

| Festival | Year | Role | Status | Stipend |
|----------|------|------|--------|---------|
| FireDrums | 2025 | Sponsored Instructor + Flowcase Performer | Accepted | $300 |
| FireDrums | 2026 | Instructor | Applied | — |
| Kinetic Fire | 2026 | Instructor | Declined | — |
| Kinetic Fire | 2025 | Instructor | Declined (alternate) | — |
| FLAME Festival | 2024 | Instructor | Accepted | $200 |
| Midwest Flow Fest | 2023 | Instructor | Accepted | promo codes |
| FMJ Winter Workshop | 2024 | Instructor | Accepted | $150 |
| GLFF | 2019 | Instructor | Accepted | — |
| Passout | 2026 | Attendee | Registered | — |

---

## Technical Architecture

### Services (DI-registered)

| Service | Job |
|---------|-----|
| `FestivalLoader` | Fetch festivals from Firestore, apply filters/sorting |
| `FestivalRepository` | CRUD for festival documents |
| `FestivalTrackerRepository` | CRUD for user's private tracking data |
| `FestivalAttendanceRepository` | Read/write public attendance badges |
| `WorkshopPortfolioRepository` | CRUD for teaching portfolio |
| `FestivalSubmissionReviewer` | Review/approve/reject user-submitted festivals |

### DI Container

New `connect-festival-container.ts` in `src/lib/shared/di/containers/`, wired into the composition root.

### State Management

Factory + context pattern:

```
ConnectFestivalModule.svelte
  → createFestivalState(loader, trackerRepo, attendanceRepo, portfolioRepo)
  → setFestivalContext({ state })

// Any descendant:
  → const { state } = getFestivalContext()
```

### Reused Infrastructure

| Component | Source | Adaptation |
|-----------|--------|------------|
| Google Maps rendering | `community/GlobalUserMap.svelte` | Swap user pins for festival pins |
| MarkerClusterer | `@googlemaps/markerclusterer` (installed, not wired) | Wire up for festival clustering |
| Calendar views | Ringmaster `MonthView/DayCell` pattern | Adapt data types for festivals/deadlines |
| GeocodingService | `community-container.ts` | Reuse as-is (legacy name, renaming out of scope) |
| UserLocationRepository pattern | `community/services` | Pattern reference for new repositories |

### New Components

| Component | Purpose |
|-----------|---------|
| `FestivalCard.svelte` | Card in the discover feed |
| `FestivalDetailView.svelte` | Full info + tracker + materials panel |
| `FestivalFilterBar.svelte` | Region/time/status filters |
| `FestivalMap.svelte` | Google Maps adapted for festivals |
| `FestivalCalendar.svelte` | MonthView adapted for tracked festivals |
| `FestivalCalendarEntry.svelte` | Individual calendar entry (replaces DayCell items) |
| `WorkshopPortfolioEditor.svelte` | Teaching portfolio CRUD |
| `WorkshopTemplateCard.svelte` | Individual class display with copy button |
| `BioEditor.svelte` | Bio versions with char counter |
| `TrackerControls.svelte` | Status buttons + notes + stipend field |
| `AttendanceBadge.svelte` | "4 TKA users going" display |
| `FestivalSubmissionForm.svelte` | User submission for new festivals |
| `FestivalMaterialsPanel.svelte` | "My Materials" panel in detail view (bios + workshops) |
| `ModerationQueue.svelte` | Admin view for approving submissions |

---

## Firestore Security Rules

```
festivals/{festivalId}:
  read: authenticated
  write: admin only (Austen's UID)

festivals/{festivalId}/attendance/{uid}:
  read: authenticated
  write: request.auth.uid == uid

userFestivalTracking/{uid}/tracked/{fid}:
  read: request.auth.uid == uid
  write: request.auth.uid == uid

userProfiles/{uid}/workshopPortfolio:
  read: request.auth.uid == uid
  write: request.auth.uid == uid

festivalSubmissions/{submissionId}:
  create: authenticated
  read: admin only
  update/delete: admin only
```

---

## Pagination

The Discover feed loads festivals in pages of 20, ordered by `applicationDeadline` (soonest first for "Applications Open" filter) or `dates.start` (soonest first for default). Firestore cursor-based pagination using `startAfter`. Initial load is one page; infinite scroll triggers next page.

The Map and Calendar views load all tracked festivals (typically <50) in a single query — no pagination needed.

---

## Offline Behavior

Festival discovery requires network access. If offline:
- **Discover tab**: Shows cached data from last load, or "No connection" empty state
- **Calendar tab**: Works from cached tracked festivals (personal data)
- **My Workshops tab**: Works fully offline (single document, cached locally)
- **Map tab**: Google Maps handles its own offline tile caching; pins require data

No explicit offline-first architecture. Firestore's built-in persistence handles caching for recently viewed data.

---

## Module Placement

Festivals is a standalone top-level module using the factory + context state pattern. No coexistence concerns with other modules.
