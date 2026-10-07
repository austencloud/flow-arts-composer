---
status: active
value: null
effort: null
remaining: "Obtain Austen review of the four publishing moments in this brief after the workspace implementation and Meta gates are known."
depends_on: "external: Austen review of four publishing moments before approval"
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: blocked
---
# Instagram Publishing: Austen Review Brief

Read this instead of the engineering contract. The
[full specification](./2026-08-14-instagram-publishing-workspace-design.md)
still governs the build, gates, failure handling, and verification.

## The product you are approving

TKA will let you build an Instagram post, see what Instagram will receive,
publish it now or later, and check what happened afterward.

You will get:

1. **An honest final review.** See the media, crop, cover, caption, destination
   account, format, and warnings before anything leaves TKA.
2. **The useful Instagram formats.** Publish images, Reels, carousels of up to
   ten items, Stories, and Trial Reels when the connected account supports
   them.
3. **Real Reel controls.** Choose a cover, decide whether the Reel also appears
   in Feed, manage sound, and use tags, collaborators, locations, and required
   disclosures where Meta permits them.
4. **Music choices that tell the truth.** Keep original sound, use a TKA-owned
   track, choose authorized Instagram audio when the API exposes it, or finish
   with Instagram's full music picker.
5. **Reusable post recipes.** Save the layout, timing, and delivery defaults for
   things like a performance breakdown, swipe lesson, Story, or Trial Reel.
6. **Reliable delivery.** Post now, schedule it, or hand it to Instagram without
   creating duplicates when a request is retried.
7. **A record after publishing.** Open the live post, see its status, manage
   comments, and review available results such as views, saves, shares, watch
   time, and skip rate.
8. **A useful path for every account.** Professional accounts get direct
   publishing after Meta approves the app. Personal accounts get a clean
   Instagram handoff instead of a broken Connect button.

## What remains inside Instagram

Instagram does not expose its entire creation screen to third-party apps. These
parts stay in Instagram:

- the complete licensed and trending music catalog with its exact clip picker;
- Instagram filters, camera effects, and native text tools;
- Story stickers such as polls, questions, and link stickers;
- manual decisions such as graduating a successful Trial Reel to everyone.

TKA will preview what it can guarantee and label the handoff when Instagram has
the final controls.

## The path through it

The normal route stays short:

`Share` -> `Review for Instagram` -> `Post now`

Only open more controls when they are useful:

- `Edit composition` for layout, timing, video, animation, card, and fades.
- `Instagram options` for cover, Feed placement, tags, collaborators, location,
  disclosures, and music.
- `Schedule` to publish later.
- `Finish in Instagram` when native music, effects, or stickers are needed.

## Gates stay; the reading burden does not

| Gates | What becomes real                                                        | Austen needed?                       |
| ----- | ------------------------------------------------------------------------ | ------------------------------------ |
| 0-1   | Current Meta contract, account detection, and the final Instagram review | One visual pass                      |
| 2     | Reel cover, Feed placement, metadata, and disclosure controls            | Included in that pass                |
| 3-4   | Carousel, Story, and Trial Reel workflows                                | One visual pass                      |
| 5-6   | Facebook-linked options and available Instagram audio                    | One visual pass for music and timing |
| 7     | Scheduling, retries, and duplicate prevention                            | No, unless Meta asks for login       |
| 8     | Published-post history, comments, and results                            | One visual pass                      |
| 9     | Meta review, account matrix, viewport sweep, and user release            | Authentication or consent only       |

Engineering gates do not advance on appearance alone. Each gate keeps its own
contract tests, account-capability tests, failure proof, and browser evidence.

## Four moments need your eyes

Everything else can proceed without interrupting you. Visual review matters at
these four checkpoints:

1. **Instagram Review:** Does the final post feel obvious and trustworthy?
2. **Carousel and Story setup:** Is arranging and checking each item intuitive?
3. **Music and timing:** Can you tell what will line up before publishing?
4. **Published Posts:** Does the history and results view show what you care
   about without becoming a dashboard swamp?

Meta may also require you to complete a password, consent, account-linking, or
app-review step. Those are authentication checkpoints, not design meetings.

## Done means this

- A personal account never hits a dead Connect flow.
- A professional account can publish a real post and open its permalink.
- Unsupported controls never appear as if they will work.
- Scheduled jobs and retries cannot create duplicate posts.
- The rendered preview and delivered media match within Instagram's documented
  processing limits.
- Every major state is proven at desktop, 4K, tablet, and phone sizes.
- The four visual checkpoints receive human review before their gates close.

The target is a TKA-native post builder and publisher, not a copy of Instagram.
TKA owns the choreography-specific composition. Instagram keeps the tools that
only Instagram can provide.
