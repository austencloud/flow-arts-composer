(() => {
  const results = (window.__startupObservation = {
    milestones: {},
    longTasks: [],
  });
  performance.setResourceTimingBufferSize(5000);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (results.longTasks.length < 1000)
          results.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  const mark = (name) => {
    if (results.milestones[name] === undefined)
      results.milestones[name] = performance.now();
  };
  let sawSplash = false;
  const observe = () => {
    const splash = document.getElementById("app-loading");
    if (
      splash &&
      getComputedStyle(splash).display !== "none" &&
      !splash.classList.contains("loaded")
    ) {
      sawSplash = true;
      mark("splash-visible");
    }
    if (sawSplash && !splash) mark("splash-removed");
    if (document.querySelector(".module-content")) mark("module-container");
    const cards = [
      ...document.querySelectorAll('[data-ghost-kind="start-position"]'),
    ];
    for (const el of cards) {
      if (!el.querySelector("svg")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      let hidden = false;
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (
          s.display === "none" ||
          s.visibility === "hidden" ||
          Number(s.opacity) < 0.95
        ) {
          hidden = true;
          break;
        }
      }
      if (hidden) continue;
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      if (top && el.contains(top)) {
        mark("first-start-choice-unoccluded");
        break;
      }
    }
    if (performance.now() < 45000) requestAnimationFrame(observe);
  };
  requestAnimationFrame(observe);
})();

(() => {
  const observeChoices = (event) => {
    if (!event.target.closest?.('[data-ghost-kind="start-position"]')) return;
    const result = { start: performance.now(), ready: null, count: 0 };
    (window.__startupObservation.interactions ??= []).push(result);
    const poll = () => {
      const choices = [
        ...document.querySelectorAll('[data-ghost-kind="option"]'),
      ];
      for (const el of choices) {
        if (!el.querySelector("svg")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) continue;
        let hidden = false;
        for (let p = el; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (
            s.display === "none" ||
            s.visibility === "hidden" ||
            Number(s.opacity) < 0.95
          ) {
            hidden = true;
            break;
          }
        }
        if (hidden) continue;
        const top = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2
        );
        if (top && el.contains(top)) {
          result.ready = performance.now();
          result.duration = result.ready - result.start;
          result.count = choices.length;
          return;
        }
      }
      if (performance.now() - result.start < 15000) requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  };
  document.addEventListener("click", observeChoices, true);
})();
