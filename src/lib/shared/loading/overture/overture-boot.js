// The Overture's main-thread half: a classic script the server inlines into
// src/app.html right after the boot script (overture-inline.ts), and the lab
// route runs against a fake boot. It hands the boot screen's canvas to the
// worker (overture.worker.ts) with what the boot already knows, relays
// milestones, visibility and resizes, and shows the canvas once the worker
// draws. It never holds or delays the boot; any failure removes the canvas
// and leaves today's screen. Budget: about 1 ms on the main thread.
// Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
(function (root) {
  root.__tkaStartOverture = function (config) {
    var worker = null;
    var canvas = null;
    // When the boot started, on the page's clock: its load, or the lab's
    // fake boot. The worker's times, and the profile's, count from here.
    var zero = config.zero || 0;
    var handle = {
      send: function (type, name) {
        // A route that draws its own screen ends the trace without a finish,
        // so its moment is not learned as a boot length.
        if (type === "abort") return handle.stop();
        try {
          if (worker) {
            worker.postMessage({
              type: type,
              name: name,
              at: performance.now() - zero,
            });
          }
        } catch (e) {}
      },
      stop: function () {
        try {
          if (worker) worker.terminate();
          worker = null;
          document.removeEventListener("visibilitychange", onVisibility);
          root.removeEventListener("resize", onResize);
        } catch (e) {}
      },
    };
    function drop() {
      handle.stop();
      try {
        canvas.remove();
      } catch (e) {}
    }
    function read(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    function size() {
      return config.canvas
        ? [canvas.clientWidth, canvas.clientHeight]
        : [root.innerWidth, root.innerHeight];
    }
    function onVisibility() {
      handle.send(document.hidden ? "hidden" : "visible");
    }
    function onResize() {
      try {
        var s = size();
        worker.postMessage({
          type: "resize",
          width: s[0],
          height: s[1],
          dpr: root.devicePixelRatio || 1,
        });
      } catch (e) {}
    }
    function show() {
      canvas.classList.add("on");
    }
    try {
      var screen = config.screen || document.getElementById("app-loading");
      canvas = config.canvas || document.getElementById("boot-overture");
      if (!screen || !canvas) return handle;
      // `tka-overture-off` = "1" in localStorage turns it off on this
      // device: today's screen, for measuring the boot without it.
      if (
        screen.style.display === "none" ||
        (!config.canvas && read("tka-overture-off") === "1") ||
        typeof Worker !== "function" ||
        typeof OffscreenCanvas !== "function" ||
        !canvas.transferControlToOffscreen
      ) {
        drop();
        return handle;
      }
      var bar = root.__tkaBootBar || {};
      var boots = parseInt(read("tka-overture-boots"), 10) || 0;
      try {
        localStorage.setItem("tka-overture-boots", String(boots + 1));
      } catch (e) {}
      var fly = parseFloat(config.fly || read("tka-overture-fly"));
      if (!(fly >= 1 && fly <= 3)) fly = 1.6;
      var offscreen = canvas.transferControlToOffscreen();
      worker = new Worker(config.worker, { type: "module" });
      worker.onerror = drop;
      worker.onmessage = function (event) {
        var type = event.data && event.data.type;
        if (type === "drawing") screen.setAttribute("data-overture", "on");
        else if (type === "unavailable") drop();
        else if (type === "done") handle.stop();
        else if (type === "stats") root.__tkaOvertureStats = event.data;
        else if (type === "pace" && !config.canvas) {
          // This boot's length, for the next boot's pace.
          try {
            localStorage.setItem("tka-overture-pace", event.data.value);
          } catch (e) {}
        }
      };
      var s = size();
      worker.postMessage(
        {
          type: "init",
          canvas: offscreen,
          width: s[0],
          height: s[1],
          dpr: root.devicePixelRatio || 1,
          surface:
            config.surface ||
            (screen.getAttribute("data-surface") === "light"
              ? "light"
              : "dark"),
          reduced:
            config.reduced !== undefined
              ? Boolean(config.reduced)
              : Boolean(root.__tkaReduceMotion),
          profile: config.profile || bar.profile || null,
          milestones: (config.milestones || bar.milestones || []).map(
            function (m) {
              return { name: m.name, t: m.t };
            }
          ),
          origin: performance.timeOrigin + zero,
          snapshot:
            config.snapshot !== undefined
              ? config.snapshot
              : read("tka-overture"),
          pool: config.pool,
          font: config.font,
          boots: boots,
          flyScale: fly,
          // The lab paces by its own fake boot alone.
          pace: config.canvas ? null : read("tka-overture-pace"),
          hidden: Boolean(document.hidden),
          // `tka-overture-tier` ("full" or "low") forces a tier on this
          // device, for measuring; the worker treats anything else as auto.
          tier: config.tier || read("tka-overture-tier") || "auto",
        },
        [offscreen]
      );
      document.addEventListener("visibilitychange", onVisibility);
      root.addEventListener("resize", onResize);

      // Entrance: after a Composer-button handoff lands on the capsule,
      // otherwise at once. The handoff script records the arrival in
      // sessionStorage and turns it into __tkaHandoff on pagereveal.
      var arriving = false;
      try {
        arriving =
          !config.canvas &&
          Boolean(sessionStorage.getItem("tka-composer-handoff"));
      } catch (e) {}
      var landed = function () {
        var done = root.__tkaHandoff && root.__tkaHandoff.done;
        if (done && done.then) {
          done.then(show, show);
          setTimeout(show, 1500);
        } else {
          show();
        }
      };
      if (root.__tkaHandoff) landed();
      else if (arriving) {
        root.addEventListener("pagereveal", landed, { once: true });
        setTimeout(show, 1500);
      } else show();
    } catch (e) {
      drop();
    }
    if (!config.canvas) root.__tkaOverture = handle.send;
    return handle;
  };
})(typeof window !== "undefined" ? window : globalThis);
