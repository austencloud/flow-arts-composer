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

/** The fields of each batch op that hold a time, as `ops --file` reads them. */
const BATCH_TIME_FIELDS = {
  "add-titles": ["at"],
  "add-flash": ["at"],
  trim: ["seconds"],
  music: ["startSeconds", "sourceInSeconds", "sourceOutSeconds"],
  keyframe: ["at", "to", "times"],
  move: ["to"],
};

/**
 * A batch file's ops with every time written as text ("@29.3", "1:02.5",
 * "12.5") read by the same parser as the flags. Numbers and the object form
 * {"bar": 29, "beat": 3} pass through unchanged.
 */
export function withBatchTimes(ops) {
  if (!Array.isArray(ops)) return ops;
  return ops.map((op, index) => {
    const fields = BATCH_TIME_FIELDS[op?.op];
    if (!fields) return op;
    const read = (value, name) => {
      if (typeof value !== "string") return value;
      try {
        return parseTimeArg(value, name);
      } catch (cause) {
        throw new Error(`Edit ${index + 1} (${op.op}): ${cause.message}`);
      }
    };
    const next = { ...op };
    for (const field of fields) {
      if (next[field] === undefined) continue;
      next[field] = Array.isArray(next[field])
        ? next[field].map((value) => read(value, field))
        : read(next[field], field);
    }
    return next;
  });
}
