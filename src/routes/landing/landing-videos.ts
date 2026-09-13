/**
 * landing-videos.ts
 *
 * Static video entries for the public hero carousel. Keeping this list with the
 * page makes the poster and first video discoverable in the initial HTML and
 * avoids booting Firebase on the marketing landing path.
 *
 * To add a video, append to LANDING_VIDEOS. The component picks up changes here
 * without any other edits needed.
 */

export interface LandingVideo {
  /** Direct video URL (Firebase Storage or CDN) */
  src: string;
  /** Immediate still shown before the browser has decoded the first frame */
  poster?: string;
  /** Performer credit, e.g. "Kai M." */
  performer: string;
  /** Short category displayed in the credit line */
  label: string;
}

const SHOWCASE_BASE =
  "https://storage.googleapis.com/the-kinetic-alphabet.firebasestorage.app/showcase/instagram";

/**
 * Featured videos displayed on the landing page.
 */
export const LANDING_VIDEOS: LandingVideo[] = [
  // The smallest featured clip leads so playback can begin quickly even on a
  // cold connection. Its poster is a real frame from the same clip, which keeps
  // the hero visually complete while the browser initializes video decoding.
  {
    src: "/assets/landing/hero-video-DAME3bEvN3N.mp4",
    poster: "/images/landing/hero-poster-DAME3bEvN3N.webp",
    performer: "Adam Molski & Austen Cloud",
    label: "Composition",
  },
  {
    src: `${SHOWCASE_BASE}/C-D_VDbPxo5.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/C_wgRplNfHF.mp4`,
    performer: "Austen Cloud & Elizabeth Dziadulewicz",
    label: "Composition",
  },
  {
    src: `${SHOWCASE_BASE}/C9-lmijP6Zp.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/C-VdDgiMy3e.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/DFOnnlIRnza.mp4`,
    performer: "Flow Arts Composer Performer",
    label: "Composition",
  },
  {
    src: `${SHOWCASE_BASE}/DAelYCWvNrS.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/DAoaTPxv70h.mp4`,
    performer: "Elizabeth Dziadulewicz & Austen Cloud",
    label: "Composition",
  },
  {
    src: `${SHOWCASE_BASE}/DA_NZgnxpDJ.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/DAi6gNos3J-.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/DFYyy8RxSij.mp4`,
    performer: "Adam Molski & Austen Cloud",
    label: "Composition",
  },
  {
    src: `${SHOWCASE_BASE}/C7RizwJMhjc.mp4`,
    performer: "Sky Guys Quest",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/DFvBnkBxs7_.mp4`,
    performer: "Flow Arts Composer Performer",
    label: "Demonstration",
  },
  {
    src: `${SHOWCASE_BASE}/C7zy93bPafI.mp4`,
    performer: "Austen Cloud & Adam Molski",
    label: "Composition",
  },
  {
    src: `${SHOWCASE_BASE}/DAE98ZkN_Q_.mp4`,
    performer: "Austen Cloud",
    label: "Demonstration",
  },
];
