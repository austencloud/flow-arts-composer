---
status: backlog
value: 2
effort: L
remaining: Current source has no LessonMediaRequest or video inventory; design and implement the VIDEO-001 media production contract before lesson integration.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: ready
---

# VIDEO-001: TKA Video Production System

**Date:** 2026-07-27  
**Status:** Dependency stub; full program deliberately not designed here  
**Program type:** Content production and media operations  
**First consumer:** [Staff Choreography First Lesson](./2026-07-27-staff-choreography-first-lesson-design.md)

## Purpose

TKA needs a repeatable way to turn a lesson media request into an approved,
versioned delivery package.

This is an operational content-production program. It is not a public page, an
app module, or a side task inside a landing-page implementation. It needs its
own research, decisions, skills, specification, production workflow, review
rubric, asset system, and pilot.

This document defines the border around that future program. It does not
attempt to write the book while scoping the first page that will consume it.

## Non-negotiable boundary

The app may submit a `LessonMediaRequest`. VIDEO-001 owns everything required
to return an `ApprovedLessonMediaPackage`.

```text
learning experience
        |
        | LessonMediaRequest
        v
VIDEO-001 production system
        |
        | ApprovedLessonMediaPackage
        v
learning experience
```

The learning experience may declare:

- the learning objective;
- the exact sequence or movement that must be demonstrated;
- the point in the interaction where the asset appears;
- the synchronization and accessibility data it must consume;
- technical acceptance constraints required by the app.

The learning experience may not prescribe or perform:

- source-footage selection;
- reuse or reshoot;
- script and shot construction;
- performance direction;
- capture;
- post-production;
- caption production;
- encoding and delivery exports;
- production review;
- raw-media storage or archival.

VIDEO-001 may reject or return an underspecified request. It may not redesign
the consuming page without a separate product decision.

## Current evidence, not a production system

The repository already contains valuable source material:

- [`docs/tutorial-video-voiceover/HANDOFF.md`](../../tutorial-video-voiceover/HANDOFF.md)
  records that scripts exist, media is local to the Windows production
  machine, and production/editing has not started.
- [`Voiceover-Scripts.md`](../../tutorial-video-voiceover/Voiceover-Scripts.md)
  contains scripts for the first tutorial series, including A, B, and C.
- [`Master-Video-Index.csv`](../../tutorial-video-voiceover/Master-Video-Index.csv)
  inventories existing video files.
- `src/lib/features/video`, `src/lib/shared/video-record`, and
  `src/lib/shared/video-collaboration` contain user-facing app features and
  reusable playback data.

These materials do not form one approved production workflow. The app's video
features are not a substitute for editorial operations. Existing scripts and
footage are candidates, not approved lesson packages.

No reuse-or-reshoot decision is made by this stub.

## Program contract

The full VIDEO-001 spec must make the handoff machine-checkable. The following
shape is the minimum boundary required by the first consumer. Field names may
change when the JSON schema is written, but the responsibilities may not move
back into the page.

### Request into VIDEO-001

```ts
interface LessonMediaRequest {
  schemaVersion: 1;
  requestId: string;
  consumerRoute: string;
  lessonId: string;
  learningObjective: string;
  demonstrations: Array<{
    slotId: string;
    sequenceRef: {
      sequenceId: string;
      revision: string;
    };
    learnerAction: string;
  }>;
  playbackNeeds: {
    notationSync: boolean;
    variableSpeed: boolean;
    stepSeeking: boolean;
  };
  accessibilityNeeds: {
    captions: boolean;
    descriptiveTranscript: true;
  };
}
```

This is a media brief, not a shot list.

### Package returned to the app

```ts
interface ApprovedLessonMediaPackage {
  schemaVersion: 1;
  packageId: string;
  lessonId: string;
  revision: string;
  review: {
    status: "approved";
    reviewedBy: string;
    reviewedAt: string;
  };
  clips: Array<{
    slotId: string;
    sequenceRef: {
      sequenceId: string;
      revision: string;
    };
    media: {
      contentUrl: string;
      contentHash: string;
      posterUrl: string;
      captionsUrl?: string;
      descriptiveTranscriptUrl: string;
      mimeType: string;
      width: number;
      height: number;
      durationSeconds: number;
      uploadDate: string;
    };
    stepMap: {
      beatTimestamps: number[];
      stepCount: number;
      source: "manual" | "auto-detected" | "hybrid";
    };
  }>;
}
```

The app accepts only immutable approved revisions. Draft, rejected, superseded,
or incomplete packages are not production inputs.

The `stepMap` must remain compatible with
[`StepMap`](../../../src/lib/shared/video-collaboration/domain/collaborative-video.ts).
The final schema must state units explicitly and validate timestamp order,
duration bounds, step count, URL policy, content hashes, and required
accessibility assets.

## Workflow boundary

The future production state machine must cover at least:

```text
requested
  -> accepted
  -> inventory decision
  -> pre-production
  -> capture or source acquisition
  -> post-production
  -> accessibility package
  -> domain and editorial review
  -> approved
  -> published package
  -> superseded or withdrawn
```

Rejection and revision can return work to the appropriate earlier state. An
approved package never changes in place. A correction creates a new revision.

This state list defines coverage only. It does not choose software, storage,
camera practices, review roles, or production techniques.

## What the full program spec must decide

The full VIDEO-001 program cannot start implementation until it answers these
questions with evidence:

1. **Governance:** Who owns a request, who can approve domain accuracy, who can
   approve instruction, who can approve accessibility, and who can publish?
2. **Media source of truth:** Where raw footage, project files, masters,
   delivery files, captions, posters, transcripts, manifests, and backups live.
3. **Inventory:** How existing footage is identified, previewed, tagged,
   deduplicated, hydrated from cloud placeholders, and marked usable or
   unusable.
4. **Reuse or reshoot:** The review rubric that decides between an existing
   take, a new edit, pickup footage, or a new shoot.
5. **Brief intake:** How a `LessonMediaRequest` becomes a production brief
   without allowing page code to dictate production.
6. **Pre-production:** Script review, movement review, shot planning, rehearsal,
   safety, releases, continuity, and production readiness.
7. **Capture:** Camera, lighting, sound, performance, monitoring, slate,
   transfer, and on-set verification practices.
8. **Post-production:** Edit, pacing, audio, color, graphics, notation
   reference, review exports, and change tracking.
9. **Accessibility:** Captions, descriptive transcripts, visual descriptions,
   language, timing, and final checks.
10. **Delivery:** Master format, web derivatives, posters, content hashes,
    immutable URLs, upload verification, and rollback.
11. **Review and versioning:** Rubrics, reviewers, status transitions,
    rejection notes, revision identity, supersession, and withdrawal.
12. **Catalog and reuse:** Searchable asset metadata, sequence references,
    licensing, provenance, and downstream consumers.
13. **Operations:** Time estimates, equipment readiness, failure recovery,
    observability, and maintenance.
14. **Security and privacy:** Access to raw files, unpublished media, personal
    data, credentials, and release documentation.

Each decision must separate a requirement from a preference. Hardware, editing
software, codecs, storage vendors, and hosting remain undecided until that
research is complete.

## Required skill family

VIDEO-001 is expected to produce a dedicated skill family. The names below are
working boundaries, not skill files created by this stub.

| Working skill     | Responsibility                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `video-inventory` | Find, fingerprint, preview, classify, and report candidate source media without editing it                 |
| `video-brief`     | Turn an accepted lesson media request into a production brief and review checklist                         |
| `video-shoot`     | Prepare and execute capture with safety, continuity, transfer, and verification steps                      |
| `video-post`      | Edit, mix, grade, caption, describe, export, and version a review candidate                                |
| `video-qc`        | Check domain accuracy, teaching clarity, accessibility, sync, delivery integrity, and package completeness |
| `video-publish`   | Publish an approved immutable revision, verify delivery, update the catalog, and support supersession      |

The full program spec must decide whether any responsibility needs further
separation. Skills must share one contract and status model rather than passing
unstructured prose between them.

Creating these skills is a separate task. It should use the repository's skill
creation and audit process after VIDEO-001 is approved.

## First media request

The first planned consumer is:

```text
Request: STAFF-ABC-001
Consumer: /learn/staff-spinning-choreography
Need: one approved, notation-synchronized demonstration package for A, B, and C
```

The request must pin the exact sequence revision used for each clip. VIDEO-001
then decides whether existing material, a new edit, pickup footage, or a new
shoot can satisfy the brief.

The staff page may be built with synthetic fixture media while this request is
unfulfilled. It remains gated.

## Program-level quality bars

The eventual system must make these statements provable:

- Every published clip came from an approved package revision.
- Every package points to the exact sequence revision it demonstrates.
- Every step map was checked against the final encoded delivery file.
- Every public clip has the required poster and text alternatives.
- Every file can be traced back to its source assets and review record.
- A revised clip receives a new immutable revision.
- A withdrawn clip can be removed from consumers without erasing its history.
- Raw media and project files have a documented backup and recovery path.
- The app can validate a package without knowing how it was produced.

## Explicit non-goals of this stub

This document does not:

- inspect or modify any video file;
- run an editor, transcoder, or upload;
- choose old footage or request a new shoot;
- write or approve a script;
- prescribe camera, lighting, audio, or editing practices;
- select a storage provider, CDN, codec, container, or naming convention;
- create the production skills;
- build a production dashboard;
- publish a package;
- remove the staff page gate.

Those actions begin only under an approved full VIDEO-001 spec or a separately
authorized, tightly scoped production task that follows the same boundary.

## Exit criteria for the future full program

VIDEO-001 can move from dependency stub to operating program when:

- the full specification is reviewed and approved;
- the asset source of truth and backup policy are proven;
- the request and package schemas have validators and fixtures;
- the workflow states and review authority are named;
- the skill family is implemented and audited;
- a pilot package completes the entire workflow;
- the consuming page validates and plays that package;
- supersession and withdrawal are tested;
- the pilot receives final human approval.

Until then, `VIDEO-001` is an explicit dependency, not hidden labor inside an
app ticket.
