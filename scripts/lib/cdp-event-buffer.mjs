/**
 * A bounded buffer of Chrome DevTools Protocol events, each numbered, so a
 * reader can ask for everything after the last event it saw and be told when
 * the buffer dropped events it never read.
 *
 * The chrome-cdp client drops events by default. A recording needs
 * `Page.screencastFrame`, so `connect` keeps the event names it is asked to
 * keep in one of these.
 */

export function createEventBuffer({ capacity = 300 } = {}) {
  const events = [];
  const waiters = new Set();
  let last = 0;

  function push(method, params) {
    events.push({ sequence: ++last, method, params });
    if (events.length > capacity) events.shift();
    for (const wake of [...waiters]) wake();
  }

  function collect(methods, afterSequence, limit) {
    const oldest = events.length > 0 ? events[0].sequence : last + 1;
    const matching = events.filter(
      (event) =>
        event.sequence > afterSequence &&
        (!methods || methods.includes(event.method))
    );
    const batch = matching.slice(0, limit);
    const hasMore = matching.length > batch.length;
    return {
      cursor: hasMore ? batch[batch.length - 1].sequence : last,
      events: batch,
      hasMore,
      truncated: afterSequence + 1 < oldest,
    };
  }

  /**
   * With no `afterSequence`, returns no events and a cursor at the present,
   * so the next read sees only what happens from here. With one, returns up
   * to `limit` matching events after it. When there are none and `timeoutMs`
   * is above 0, waits that long for one to arrive.
   */
  async function read({
    methods,
    afterSequence,
    limit = 100,
    timeoutMs = 0,
  } = {}) {
    if (afterSequence === undefined) {
      return { cursor: last, events: [], hasMore: false, truncated: false };
    }
    const now = collect(methods, afterSequence, limit);
    if (now.events.length > 0 || timeoutMs <= 0) return now;
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiters.delete(wake);
        resolve();
      };
      const wake = () => {
        if (collect(methods, afterSequence, 1).events.length > 0) done();
      };
      const timer = setTimeout(done, timeoutMs);
      waiters.add(wake);
    });
    return collect(methods, afterSequence, limit);
  }

  return { push, read };
}
