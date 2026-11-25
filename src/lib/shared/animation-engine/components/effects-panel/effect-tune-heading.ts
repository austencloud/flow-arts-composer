/**
 * What a phone dock's own header row shows while an effect is being tuned:
 * the way back to the roster, the effect's name and the power button.
 *
 * The dock body is about 245px tall on a phone, and the tune view's controls
 * need about 224px of it. A heading row inside the body would push the last
 * slider out of view, so a host whose dock already has a header row (Shape
 * Engine's "Effects" + Done) takes these three over in place of its title.
 * A host that does not listen gets the same row inside the body instead.
 */
export interface EffectTuneHeading {
  /** The effect being tuned, for a host that draws its picture. */
  effectId: string;
  /** The effect's display name, already localised. */
  label: string;
  /** Font Awesome class for the effect, e.g. "fa-route". */
  icon: string;
  /** The effect's ink, readable on the current theme. */
  accent: string;
  /** "All effects", localised, for the back button. */
  backLabel: string;
  /** "Turn off <effect>", localised, for the power button's name. */
  turnOffLabel: string;
  /** Back to the roster ("All effects"). */
  back: () => void;
  /** Turn the effect off, which also returns to the roster. */
  turnOff: () => void;
}
