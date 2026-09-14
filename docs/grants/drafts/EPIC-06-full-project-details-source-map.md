# Epic Full Project Details Source Map

## Locked prompt

**Portal question:** Full project details

**Portal placeholder:** Describe your project and the next steps you plan to
take towards development

**Limit:** 32,768 characters

**Reviewer needs inferred from the prompt and program:** Understand what the
project is, what already exists, why Unreal is the next development environment,
what the grant changes, and what concrete playable result follows.

## Current interview

**Austen, August 30, 2026:**

> I mean the accuracy of having mocap data over trying to hammer out little
> miniature corrections through an AI model is going to just skyrocket I mean
> my idea is not only will I get animations that I can just place in a scene
> which would be cool enough on its own but would genuinely require me to have
> you know one animation per scene would be very time consuming the broad idea
> is that by gathering the subtleties of human movement such as where fingers
> are in space and how wrists move and how the elbows interact with the staff
> that's passing through the negative space above or below the arm or how a reel
> goes behind the head effectively while the head dodges it would just save me
> from this hellhole that I'm in of trying to just tweak character avatars until
> they kind of do roughly what I want them to do not because I'd have a
> prerecorded thing for everything but because I could use it as actual training
> data I could tell a model like hey I want you to implement the the dodge effect
> I want you to take into consideration how this recorded version does it
> properly I mean it's just a massive workflow boost in a direction that I'm
> already moving which I think will just be hugely efficient Umm in actually
> gaining this data so not only am I trying to create this game but the whole
> broader purpose of this is to demonstrate the acquisition of the understanding
> of human movement as it relates to flow arts a very unique and novel and young
> art form that has not been totally mapped out so this is an anatomical a dance
> a choreography building goal at its heart because through the acquisition of
> this understanding we can make that data be represented in different body
> types and we can teach people more effectively through interactive 3D tools
> that allow people to see movement from all angles as opposed to just viewing 2
> dimensional Youtube videos that are 90 seconds on Instagram so that people
> have a real ability to zoom in zoom out slow down speed up and truly craft
> choreographed shows which is a huge part of the flow Arts composer system I
> mean this is going to be yeah game but it's also gonna be very linked to Flow
> Arts Composer which is a well existing web app which is possibly my biggest
> proof that I can do anything of Substance which already has a established 3D
> viewer that I can get a bunch of media packages for and a bunch of images for

## Earlier approved first-person material

Austen's approved elevator-pitch source establishes the game:

> Kinetic Archive is game set in a fictional universe where the kinetic
> alphabet is baked into the fabric of reality from the dawn of time.

It describes a museum built by a mysterious bureaucracy, a journey through
fabricated history, real instruction in the Kinetic Alphabet, historical
practitioners portrayed by friends and Flow Arts community members, and a plot
about the organization's downfall.

Austen's community-contribution interview establishes the larger purpose:

> the whole overarching goal is to in fact make it so other people can use flow
> arts in their software

It also establishes the wish to preserve captured discoveries for future
creators while retaining the option to license the complete cleaned production
library separately.

## Verified repository facts

- Flow Arts Composer is an existing SvelteKit web application, not a proposed
  app.
- The repository contains a production 3D sequence-viewer state, multiple 3D
  viewer components, independently controlled avatar performers, and a
  sequence-to-motion conversion path.
- The viewer supports user-controlled camera movement and orbiting. Its playback
  state exposes adjustable speed.
- The existing rig uses inverse kinematics to place an avatar's arms from
  notation-derived targets.
- The avatar-realism audit confirms the current limitation behind Austen's
  description: wrist orientation is not solved, the current target is the wrist
  rather than the palm, finger poses are not authored, and hand-to-prop contact
  is not guaranteed.
- The repository contains Walk Lab, Stage, avatar, environment, and museum test
  surfaces that can supply honest work samples. Their current quality must be
  reviewed before choosing media.
- The museum story bible's explicit Unreal starting scale is three rooms, each
  with one interactive exhibit and a moving avatar. This is a design target,
  not shipped behavior.
- The current project is not yet in Unreal. The truthful portal answer remains
  "No" and the grant project is a defined bridge from an existing web system to
  an Unreal museum-game slice.

## Technical and scope boundaries

- A mocap system should not be described as automatically producing a complete
  AI training set. The response can credibly promise a structured capture
  corpus for direct animation, retargeting, evaluation, and motion-synthesis or
  model experiments.
- Body and glove capture alone will not recover the staff's exact world-space
  trajectory. Credible acquisition requires tracked props or an equivalent
  positional reference, synchronization, calibration, and contact labels.
- Representing the same movement accurately on different body types requires
  retargeting tests and, ideally, performers with different proportions. One
  performer does not prove universal anatomical transfer.
- "Flow Arts movement" is broad. The first corpus should name a bounded prop and
  vocabulary, likely double staff and the body-routing cases Austen identified,
  rather than claim coverage of every Flow Art.
- Motion capture does not replace the notation or procedural system. It supplies
  anatomical examples and constraints that the existing mathematical system
  lacks.
- The grant response should not promise a finished full museum. A funded,
  playable proof should be bounded enough for a solo developer to deliver and
  strong enough to demonstrate the complete bridge.

## Proposed full-details angle

1. **Open with the working proof.** Austen has already built Flow Arts Composer,
   a browser application that turns Kinetic Alphabet sequences into controllable
   3D avatar performances. The current 3D viewer is evidence of execution and
   also exposes the next problem.
2. **Name the problem physically.** The software knows where a hand or staff
   should arrive, but not how a trained body gets it there. The missing data is
   visible in wrists, elbows, fingers, head dodges, negative-space routes, and
   prop contact. Frame this as the boundary between geometric notation and
   anatomical performance.
3. **Explain the capture system, not merely the purchase.** Record synchronized
   body, hand, and prop motion; label contacts and named routing choices; clean
   and retarget the captures; connect each example to the notation and movement
   vocabulary that produced it.
4. **Give the data two jobs.** Use selected captures directly as authored
   animation, and use the larger structured corpus as reference and evaluation
   data for procedural or model-assisted motion generation. This preserves
   Austen's real goal without claiming that one capture session trains a solved
   general-purpose model.
5. **Name a concrete Unreal result.** The strongest proposed milestone is a
   three-room playable Unreal museum slice, matching the story bible's existing
   starting scale. Each room would contain one interactive exhibit and a moving
   avatar, with at least one encounter demonstrating mocap-informed staff
   movement rather than the current idealized IK approximation.
6. **Close on the shared system.** The game is the dramatic proof, while Flow
   Arts Composer remains the working choreography tool. Captured anatomical
   knowledge should improve both: museum characters move credibly, and creators
   can inspect movement from different views and playback speeds while building
   choreography.

## Decisions embedded in this angle for approval

- Treat the Epic project as the bridge between Flow Arts Composer and a playable
  Unreal version of The Kinetic Archive, not as two unrelated products.
- Use a three-room playable Unreal slice as the funded milestone.
- Make double staff and named body-routing cases the first bounded capture
  corpus unless a different prop should lead.
- Describe model use as motion-generation experiments supported by structured
  reference and evaluation data, not as a guaranteed trained AI animation
  system.
- Budget for tracked props, synchronization, calibration, cleanup, and
  retargeting in addition to the suit and gloves.

## Approved cold-reader revision

After reviewing the first draft as a reader with no Flow Arts background,
Austen approved these revisions on August 30, 2026:

- define the relationship among the Kinetic Alphabet, Flow Arts Composer, and
  The Kinetic Archive before using the three names freely;
- translate double staff as one short staff in each hand and describe body
  routing in ordinary anatomical language instead of relying on terms such as
  reel or negative space;
- explain inverse kinematics, retargeting, contact labels, and the organized
  motion library when they first appear;
- make Unreal's animation system part of the development argument rather than
  naming Unreal only as the destination;
- use Unreal Motion Matching and its Pose Search database as the funded
  captured-data implementation, with Control Rig for contact corrections and
  IK Retargeting for differently proportioned characters;
- retain model-assisted motion generation as later research after the capture
  library is large and varied enough;
- make the three-room milestone tangible through the story bible's existing
  four-beat matching interaction: the player can move around and slow down a
  performing avatar, then match a notated sequence to the movement.

Current official Unreal references supporting this implementation direction:

- https://www.unrealengine.com/megagrants
- https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/how-to-create-control-rigs-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-ik-rig

## Gate status

Austen approved the original angle and the cold-reader revision on August 30,
2026. The final response passed authorship review, and Austen explicitly
authorized saving and entering the approved wording on August 30, 2026. The
saved response is `EPIC-07-full-project-details.md`. Final application submission
remains under Austen's control after Fable's review.
