/**
 * A time on the command line: seconds (12.5), a clock (1:02.5), or a bar of
 * the post's music, @9 for bar 9 or @9.3 for bar 9, beat 3. A bar stays a bar
 * here; the edit places it on the music's beat grid.
 */
const BAR = /^@(-?\d+)(?:\.(\d+))?$/;
const CLOCK = /^(?:(\d+):)?(\d+(?:\.\d*)?|\.\d+)$/;

export function parseTimeArg(text, name) {
  const value = String(text ?? "").trim();
  const bar = BAR.exec(value);
  if (bar)
    return bar[2] === undefined
      ? { bar: Number(bar[1]) }
      : { bar: Number(bar[1]), beat: Number(bar[2]) };
  const clock = CLOCK.exec(value);
  if (clock) {
    const seconds = Number(clock[2]);
    if (clock[1] === undefined) return seconds;
    if (seconds < 60) return Number(clock[1]) * 60 + seconds;
  }
  throw new Error(
    `--${name} must be seconds (12.5), a clock (1:02.5), or a bar like @9 or @9.3.`
  );
}
