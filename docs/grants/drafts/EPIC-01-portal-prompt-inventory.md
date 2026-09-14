# Epic MegaGrants 2026 Portal Prompt Inventory

Captured from the live application on August 30, 2026. This inventory records
the form without drafting or approving any response.

## Applicant information

- Who is applying? Required. Current selection: individual.
- How did you hear about Epic MegaGrants? Current selection: Online Search.
- Please explain how you heard about us. Required when Online Search is
  selected. Maximum 475 characters. Current text: "Found it while researching
  online."

## Personal contact information

- Country. Required. Current selection: United States.
- Phone number with country code. No required marker was visible.
- Relevant social media. No required marker was visible. Current text:
  `@tkaflowarts`.
- Team Size. Required. Current selection: fewer than five.

Austen enters and reviews personal contact information.

## Project information

- Project Name. Required. Current text: `Flow Arts Composer - 3D Motion
  Tracking Integration`.
- Project Type. Required. Options: Games, Unreal Editor for Fortnite, Other.
  Current selection: Other.
- Project Type Subcategory. Required under Other. Options: AEC, Automotive &
  Manufacturing, Ed Tech, Fashion, Film, TV, and Live Events,
  Marketing/Branding, Marketplace, Training & Simulation, Other. Current
  selection: Training & Simulation.
- Project media link. Required.
- Project build link. No required marker was visible.
- Project website. No required marker was visible.
- What phase is your project in? Required. Options: Concept, Prototype,
  Pre-Production, Production, Post Production, Marketing. Current selection:
  Pre-Production.
- Is your project currently in Unreal Engine or Unreal Editor for Fortnite?
  Required. Options: Unreal Engine, Unreal Editor for Fortnite, No. No selection
  was visible.
- Is your project open source and/or does it give back to the 3D community?
  Required. Current selection: My project is open source.
- Please explain. Required. Maximum 450 characters.

## Project prose

- Project elevator pitch. Required. Maximum 225 characters.
- Full project details. Required. Maximum 32,768 characters. Prompt placeholder:
  "Describe your project and the next steps you plan to take towards
  development."
- Please tell us about some of the unique features of your project. Required.
  Maximum 32,000 characters.

## Funding

- What funding range are you requesting? Required. Options: $5,000-$25,000,
  $25,000-$50,000, $50,000-$100,000, $100,000-$150,000. Current selection:
  $5,000-$25,000.
- How do you plan to use the funds? Required. The form asks for a high-level
  budget with dollar allocations. Maximum 15,000 characters.
- Have you secured additional funding for this project? Options: Yes, No,
  Prefer Not to Say. No selection was visible.

## Submission boundary

The portal ends with a Submit button. Austen reviews the completed form and
controls submission. No agent presses Submit.

## Decisions required before drafting

1. Decide which project Epic is funding: the existing web-based Flow Arts
   Composer, a migration of the 3D museum experience to Unreal Engine, or a
   defined bridge between them.
2. Decide whether the honest project category is Games or Other. The current
   Training & Simulation framing does not describe the museum game.
3. Identify a public media link that demonstrates the current work immediately.
4. Confirm whether the repository and the proposed Unreal deliverables are
   actually open source before keeping that selection.
5. Build the funding request from real costs and milestones before choosing a
   range.

## Repository audit

- The existing application is a working Svelte/TypeScript product with a
  Threlte/Three.js 3D runtime. It is not currently an Unreal Engine project.
- The repository is public at `github.com/austencloud/tka-platform`, but its
  licensing is mixed. Foundation and rendering-engine packages are MIT, the
  sequence data is CC BY-SA 4.0, and the full Composer application is under the
  Elastic License 2.0.
- Because the full application is not under an open-source license, "My project
  is open source" is too broad. "My project gives back to the 3D community" is
  the more accurate selection if the explanation names the public research,
  MIT packages, and shareable project outputs.
- The repository contains a working web-based museum and 3D prototypes plus
  extensive narrative development for The Kinetic Archive. That evidence fits
  a pre-production game migrating from another real-time 3D stack more closely
  than it fits Training & Simulation.

## Recommended form identity for angle approval

- Project Name: The Kinetic Archive
- Project Type: Games
- Phase: Pre-Production
- Currently in Unreal Engine or UEFN: No
- Community contribution: My project gives back to the 3D community

This recommendation is not approved portal text. Austen must first confirm that
Epic is being asked to fund the Unreal migration and a playable museum-game
milestone rather than a standalone Composer integration.

## Approved portal state

Austen approved the recommended game and Unreal-migration framing on August 30,
2026. The live form now shows:

- Project Name: The Kinetic Archive
- Project Type: Games
- Project Type Subcategory: Other
- Phase: Pre-Production

The portal's custom radio controls did not retain automated changes during live
verification. Before submission, manually verify:

- Currently in Unreal Engine or UEFN: No
- Community contribution: My project gives back to the 3D community
