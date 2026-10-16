/*
 * The self-timing progress bar: one engine for every loading bar that should
 * feel like real progress even when the work reports little of it.
 *
 * A load reports named milestones in a fixed order. Each load stores when
 * they arrived (the caller persists `profile()`), and the next load replays
 * that profile: between two milestones the fill moves at the pace the last
 * load took, and a step that runs late keeps creeping but never claims the
 * next milestone before it arrives. Each segment, late tail included, is one
 * transform animation, which the compositor keeps running while the main
 * thread is blocked; a ticker only reports the value and pauses in hidden
 * tabs.
 *
 * Classic-script compatible on purpose: src/app.html runs this before any
 * bundle (the server inlines it, see self-timing-bar-inline.ts), and the app
 * imports the same file through self-timing-bar.ts. No imports, no exports;
 * it defines `__tkaCreateSelfTimingBar` on the global object.
 *
 * Design and measurements: docs/superpowers/specs/2026-10-14-boot-bar-*.md
 * and docs/superpowers/specs/2026-10-15-shared-loading-bar.md
 */
(function (root) {
  "use strict";

  // The tail's ease-out, settling at 0.98 of the segment. Of the
  // decelerating curves, the plain CSS one spreads the tail's few pixels
  // most evenly, so a long tail still visibly moves near its end.
  var TAIL_EASE = "ease-out";

  // Linear to 85% of a segment, then an asymptote short of the next one.
  // Reduced motion places the fill by it, tick by tick.
  function segmentEase(x) {
    if (x <= 0.85) return x < 0 ? 0 : x;
    return 0.85 + 0.13 * (1 - Math.exp(-(x - 0.85) * 1.5));
  }

  // The tail easing at x (0 to 1): ease-out, cubic-bezier(0, 0, 0.58, 1),
  // solved for its time parameter by bisection.
  function tailEaseAt(x) {
    var lo = 0;
    var hi = 1;
    var s = x;
    for (var i = 0; i < 30; i++) {
      s = (lo + hi) / 2;
      var r = 1 - s;
      if (3 * r * s * s * 0.58 + s * s * s < x) {
        lo = s;
      } else {
        hi = s;
      }
    }
    return 3 * (1 - s) * s * s + s * s * s;
  }

  function scale(percent) {
    return "scaleX(" + (percent / 100).toFixed(4) + ")";
  }

  function finite(value) {
    return typeof value === "number" && isFinite(value) && value >= 0;
  }

  // Expected arrival per rank, from a profile ({ t: { name: ms } }, ms from
  // the bar's origin). Milestones the profile lacks sit between their
  // neighbours by rank; times never run backwards or past the end. The end
  // (the last rank) sits at least 50 ms past `endAfter` (default: the rank
  // before it), so the fill never claims 100% while that last step is open;
  // a profile without the end gets it 500 ms later.
  function profileTimes(ranks, profile, endAfter) {
    var last = ranks.length - 1;
    var t = (profile && profile.t) || {};
    var before = t[endAfter || ranks[last - 1]];
    if (!finite(before)) {
      before = 0;
      for (var k = 0; k < last; k++) {
        if (finite(t[ranks[k]])) before = Math.max(before, t[ranks[k]]);
      }
    }
    var end = t[ranks[last]];
    if (!finite(end) || end < before) end = before + 500;
    end = Math.max(end, before + 50);
    var times = [];
    var profiled = [];
    for (var i = 0; i <= last; i++) {
      var value = t[ranks[i]];
      var known = finite(value);
      profiled.push(known);
      times.push(known ? Math.min(value, end) : null);
    }
    times[last] = end;
    if (times[0] === null) times[0] = 0;
    profiled[0] = true;
    profiled[last] = true;
    for (i = 1; i < last; i++) {
      if (times[i] !== null) continue;
      var next = i + 1;
      while (times[next] === null) next++;
      times[i] = times[i - 1] + (times[next] - times[i - 1]) / (next - i + 1);
    }
    for (i = 1; i <= last; i++) {
      if (times[i] < times[i - 1]) times[i] = times[i - 1];
    }
    return { times: times, profiled: profiled };
  }

  /**
   * options:
   *   fill       the element scaled from the left (scaleX); required
   *   ranks      milestone names in arrival order; the last one is "done"
   *   profile    { t: { name: ms from origin } } to replay (a default for a
   *              first visit is the caller's to choose)
   *   endAfter   the rank the end must trail (default: the one before it)
   *   origin     performance.now() at the bar's zero (default 0)
   *   shown      the percent the fill shows now (default: floor)
   *   floor      the percent at fraction 0 (default 4)
   *   still      reduced motion: no animations, placed per tick
   *   tickMs     ticker period (default 80)
   *   log        an array milestone entries are pushed onto
   *   onSample   (now, percentOnScreen, percentTarget) per tick and move
   */
  function createSelfTimingBar(options) {
    var ranks = options.ranks;
    var last = ranks.length - 1;
    var origin = options.origin || 0;
    var floor = typeof options.floor === "number" ? options.floor : 4;
    var tickMs = options.tickMs || 80;
    var log = options.log || [];
    var onSample = options.onSample || null;
    var fill = options.fill;
    var still =
      Boolean(options.still) || !fill || typeof fill.animate !== "function";
    var plan = profileTimes(ranks, options.profile, options.endAfter);
    var times = plan.times;
    var profiled = plan.profiled;

    var arrived = {}; // name -> ms, every first arrival
    var top = -1; // highest rank that has arrived in order
    var topAt = 0;
    var finished = false;
    var shown = typeof options.shown === "number" ? options.shown : floor;
    // The fill's position, in percent. The last move written, as stops
    // (percent) at offsets of its duration with the easing that leaves each
    // stop, so the position can be modelled when the computed transform lags
    // the compositor or cannot be read. `to` is the last stop.
    var move = {
      at: 0,
      ms: 0,
      stops: [shown],
      offsets: [0],
      eases: [],
      to: shown,
    };
    var anim = null; // the running move's Animation
    var tailAt = 0; // when the running segment's linear part ends
    var endAt = 0; // when its tail ends, at 0.98 of the segment
    var ticker = null;
    // Segments start on an animation frame, for the time left. Before the
    // first frame the browser has no rendered style to start a move from,
    // so one written then can jump to its end (cold and dev boots showed
    // the fill at the first segment's target in their first frame). Later,
    // a pin written between frames can reach the screen a frame or more
    // after it was read, while the compositor kept moving the fill, and a
    // busy page showed that as a step back; a pin read inside a frame is
    // committed in that same frame.
    var frames = typeof requestAnimationFrame === "function";
    var waiting = false;
    var frameAsked = false;

    function share(rank) {
      return times[rank] / times[last];
    }

    // The segment the fill is in: from the highest arrived rank to the next
    // milestone the profile recorded. One it only interpolated (the last
    // load never saw it) still anchors the fill if it arrives, but is never
    // waited for.
    function segment() {
      var next = top + 1;
      while (next < last && !profiled[next]) next++;
      return {
        from: share(top),
        to: share(next),
        span: Math.max(times[next] - times[top], 50),
      };
    }

    function expectedFraction(now) {
      if (top >= last) return 1;
      var seg = segment();
      return (
        seg.from + (seg.to - seg.from) * segmentEase((now - topAt) / seg.span)
      );
    }

    function percent(fraction) {
      return Math.min(100, floor + (100 - floor) * fraction);
    }

    // Where the last move has the fill at `now`. A running animation's own
    // start time is the compositor's; one still waiting for its first
    // frame counts from when it was written, which can only overstate it.
    function planned(now) {
      if (move.ms <= 0) return move.to;
      var start = move.at;
      try {
        if (anim && anim.startTime !== null) start = anim.startTime;
      } catch (e) {}
      var x = (now - start) / move.ms;
      if (x <= 0) return move.stops[0];
      for (var i = 1; i < move.stops.length; i++) {
        if (x < move.offsets[i]) {
          var f =
            (x - move.offsets[i - 1]) / (move.offsets[i] - move.offsets[i - 1]);
          // Segments use only these two; the finishing glide is never read.
          if (move.eases[i - 1] === TAIL_EASE) f = tailEaseAt(f);
          return move.stops[i - 1] + (move.stops[i] - move.stops[i - 1]) * f;
        }
      }
      return move.to;
    }

    // Where the fill is on screen, in percent: its computed scale. While an
    // animation runs on the compositor, the computed value can lag it: the
    // main thread's animation clock only moves per rendered frame, so in a
    // long task it shows the fill where it was. The larger of that and the
    // move's own schedule is used, so pinning the fill never pulls it
    // backwards on screen.
    function at(now) {
      var computed = null;
      try {
        var matrix = getComputedStyle(fill).transform;
        var value = parseFloat(
          matrix.slice(matrix.indexOf("(") + 1).split(",")[0]
        );
        // "none" is a style not resolved yet (seen on a cold boot under
        // reduced motion): the CSS always gives the fill a transform.
        if (matrix !== "none" && isFinite(value)) computed = 100 * value;
      } catch (e) {}
      var estimate = planned(now);
      // The fill only ever moves toward the last stop written, so it is
      // never past it: a computed value beyond it (a style not resolved
      // yet, or another animation on the element) is not the screen.
      return Math.min(
        move.to,
        computed === null ? estimate : Math.max(computed, estimate)
      );
    }

    // Place the fill with no animation. Positions are written to 0.01%, and
    // remembered as written.
    function place(value, now) {
      value = Math.round(value * 100) / 100;
      move = {
        at: now,
        ms: 0,
        stops: [value],
        offsets: [0],
        eases: [],
        to: value,
      };
      fill.style.transform = scale(value);
    }

    // One compositor animation through the stops, from where the fill is on
    // screen (the first stop). That value is written inline before the
    // previous animation is cancelled, in the same task, so the fill never
    // shows an older position in between, and rounded up, so writing it to
    // 0.01% never steps back. Never backwards: a move whose end is at or
    // behind the fill is not started.
    function animateTo(stops, offsets, eases, ms, now) {
      stops[0] = Math.ceil(stops[0] * 100) / 100;
      if (stops[stops.length - 1] <= stops[0]) return;
      var old = anim;
      anim = null;
      place(stops[0], now);
      if (old) old.cancel();
      var keyframes = [];
      var kept = [];
      for (var i = 0; i < stops.length; i++) {
        kept.push(Math.round(stops[i] * 100) / 100);
        keyframes.push({
          transform: scale(kept[i]),
          offset: offsets[i],
          easing: eases[i] || "linear",
        });
      }
      anim = fill.animate(keyframes, { duration: ms, fill: "forwards" });
      move = {
        at: now,
        ms: ms,
        stops: kept,
        offsets: offsets,
        eases: eases,
        to: kept[kept.length - 1],
      };
    }

    function sample(now, value) {
      if (onSample) onSample(now, value, move.to);
    }

    // Reduced motion: the fill where the profile expects it now.
    function placeExpected(now, value) {
      var expected = percent(expectedFraction(now));
      if (expected > value) place(expected, now);
    }

    // The segment's move, for the time left until its tail ends. A frame
    // that comes after the linear part should have ended (a blocked page)
    // starts straight on the tail.
    function runSegment(now) {
      if (finished || top >= last) return;
      var value = at(now);
      if (still) {
        placeExpected(now, value);
      } else {
        var seg = segment();
        var gap = seg.to - seg.from;
        var linear = percent(seg.from + 0.85 * gap);
        var tail = percent(seg.from + 0.98 * gap);
        var ms = Math.max(endAt - now, 200);
        var split = (tailAt - now) / ms;
        if (split > 0 && linear > value) {
          animateTo(
            [value, linear, tail],
            [0, split, 1],
            ["linear", TAIL_EASE],
            ms,
            now
          );
        } else {
          animateTo([value, tail], [0, 1], [TAIL_EASE], ms, now);
        }
      }
      sample(now, value);
    }

    function onFrame() {
      frameAsked = false;
      if (!waiting) return;
      waiting = false;
      try {
        runSegment(performance.now());
      } catch (e) {}
    }

    function askFrame() {
      if (frameAsked) return;
      frameAsked = true;
      try {
        requestAnimationFrame(onFrame);
      } catch (e) {
        frames = false;
        onFrame();
      }
    }

    // A milestone starts its segment as one animation from wherever the
    // fill is: linear to 0.85 of the way to the next share, ending at 0.85
    // of the time the profile expects, then an ease-out tail to 0.98 of the
    // way over max(3 segments, 1.5 s), where it holds until the milestone
    // arrives. The compositor runs all of it with no main-thread help. An
    // early milestone just makes the linear slope steeper. Reduced motion
    // places the fill at the expected position instead.
    function startSegment(now) {
      if (finished || top >= last) return;
      var span = segment().span;
      tailAt = now + 0.85 * span;
      endAt = tailAt + Math.max(3 * span, 1500);
      if (frames && !still) {
        waiting = true;
        sample(now, at(now));
        askFrame();
        return;
      }
      runSegment(now);
    }

    // The ticker writes no fill: the segment's animation carries it, tail
    // included. It reports the value; under reduced motion it places the
    // fill outright.
    function tick() {
      try {
        if (finished) return;
        var now = performance.now();
        var value = at(now);
        if (still) placeExpected(now, value);
        sample(now, value);
      } catch (e) {}
    }

    function stopTicker() {
      if (ticker === null) return;
      clearInterval(ticker);
      ticker = null;
    }

    function startTicker() {
      if (ticker !== null || finished) return;
      if (typeof document !== "undefined" && document.hidden) return;
      ticker = setInterval(tick, tickMs);
      tick();
    }

    /**
     * Records a milestone's first arrival. Returns its log entry, or null
     * for an unknown or repeated name. A late lower rank keeps its entry
     * (marked ignored) but not the bar. `segment: false` anchors the fill
     * without starting the next segment (the caller is about to finish).
     */
    function milestone(name, opts) {
      var rank = ranks.indexOf(name);
      if (rank === -1 || arrived.hasOwnProperty(name)) return null;
      var now = performance.now();
      arrived[name] = now;
      var entry = { name: name, t: Math.round(now - origin) };
      log.push(entry);
      if (rank < top) {
        entry.ignored = true;
        return entry;
      }
      top = rank;
      topAt = now;
      if (rank === last) return entry;
      if (opts && opts.segment === false) return entry;
      startSegment(now);
      return entry;
    }

    /** Runs the fill to full over `ms` and stops; the last word on it. */
    function finish(ms, easing) {
      if (finished) return;
      finished = true;
      waiting = false;
      stopTicker();
      var now = performance.now();
      if (still || !(ms > 0)) {
        place(100, now);
      } else {
        animateTo([at(now), 100], [0, 1], [easing || "ease"], ms, now);
      }
    }

    /**
     * Moves the bar onto another fill element (a surface remounted mid-load)
     * at the position the old one showed, and continues the segment there.
     */
    function attach(next) {
      if (!next || next === fill) return;
      var now = performance.now();
      var value = at(now);
      var old = anim;
      anim = null;
      if (old) {
        try {
          old.cancel();
        } catch (e) {}
      }
      fill = next;
      still = Boolean(options.still) || typeof fill.animate !== "function";
      place(finished ? 100 : value, now);
      if (finished || top < 0 || top >= last) return;
      if (frames && !still) {
        waiting = true;
        askFrame();
        return;
      }
      runSegment(now);
    }

    /** The in-order arrivals, as a profile to store for the next load. */
    function profile() {
      var t = {};
      for (var i = 0; i < log.length; i++) {
        if (!log[i].ignored) t[log[i].name] = log[i].t;
      }
      return { v: 1, at: Date.now(), t: t };
    }

    return {
      ranks: ranks,
      times: times,
      log: log,
      milestone: milestone,
      finish: finish,
      attach: attach,
      at: function (now) {
        return at(now === undefined ? performance.now() : now);
      },
      expected: function (now) {
        return percent(
          expectedFraction(now === undefined ? performance.now() : now)
        );
      },
      top: function () {
        return top < 0 ? null : ranks[top];
      },
      arrived: function (name) {
        return arrived.hasOwnProperty(name);
      },
      finished: function () {
        return finished;
      },
      profile: profile,
      startTicker: startTicker,
      stopTicker: stopTicker,
      /** Cancels the running animation and the ticker; the fill stays put. */
      destroy: function () {
        finished = true;
        waiting = false;
        stopTicker();
        if (anim) {
          try {
            anim.cancel();
          } catch (e) {}
          anim = null;
        }
      },
    };
  }

  createSelfTimingBar.profileTimes = profileTimes;
  root.__tkaCreateSelfTimingBar = createSelfTimingBar;
})(typeof window !== "undefined" ? window : globalThis);
