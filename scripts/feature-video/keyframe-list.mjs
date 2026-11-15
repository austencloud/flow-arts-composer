import {
  barBeatAt,
  channelKeyframeSeconds,
  channelsOf,
  hasGrid,
} from "@austencloud/video-editor/core";

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * An item's keyframes by channel, as `keyframe --action list` prints them:
 * each with its seconds from the item's start, its post time, and the bar and
 * beat when the post has a beat grid. Only keyframes inside the clip count,
 * as in the editor.
 */
export function keyframeListing(project, itemId, channel) {
  const item = project.tracks
    .flatMap((track) => track.items)
    .find((entry) => entry.id === itemId);
  if (!item) throw new Error(`No item "${itemId}" in this post.`);
  const known = channelsOf(item);
  if (channel !== undefined && !known.includes(channel))
    throw new Error(
      `${item.id} (${item.kind}) has no channel "${channel}". Its channels: ${known.join(", ")}.`
    );
  const gridded = project.music && hasGrid(project.music);
  const channels = {};
  for (const name of channel ? [channel] : known) {
    const keys = channelKeyframeSeconds(item, name).map((post) => ({
      own: round(post - item.start),
      post: round(post),
      ...(gridded ? barBeatAt(project.music, post) : {}),
    }));
    if (keys.length > 0 || channel) channels[name] = keys;
  }
  return { item: item.id, start: round(item.start), channels };
}

/** The listing as lines of text. */
export function keyframeListingText(listing) {
  const rows = [`${listing.item}, starts at ${listing.start} s`];
  const names = Object.keys(listing.channels);
  if (names.length === 0) rows.push("  no keyframes");
  for (const name of names) {
    rows.push(`  ${name}`);
    for (const key of listing.channels[name])
      rows.push(
        `    +${key.own} s  (post ${key.post} s${key.bar !== undefined ? `, bar ${key.bar} beat ${key.beat}` : ""})`
      );
  }
  return rows.join("\n");
}
