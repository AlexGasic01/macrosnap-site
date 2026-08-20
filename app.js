/* ═══════════════════════════════════════════════════════════
   MacroSnap — client-side navigation
   Mirrors the Almondy reference: single-page tab switching,
   pushState/popstate history, scroll reset, staggered fadeUp
   entrance on every page change.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var PAGES = ["home"];
  var MOBILE_BP = 768;

  // Support used to be an in-page tab reached via #support. It has its own
  // URL now, so forward the old links before anything else runs. The target
  // comes from the document (data-support-href) rather than being hardcoded,
  // so a copy of the page in a sub-directory resolves it correctly.
  var legacySupport = document.documentElement.getAttribute("data-support-href");
  if (legacySupport && /^#\/?support$/.test(window.location.hash)) {
    window.location.replace(legacySupport);
    return;
  }

  var pages      = document.querySelectorAll(".page");
  var navLinks   = document.querySelectorAll(".nav-link");
  var drawerLnks = document.querySelectorAll(".drawer-link");
  var burger     = document.getElementById("burger");
  var drawer     = document.getElementById("drawer");
  var overlay    = document.getElementById("overlay");

  var current = "home";
  var menuOpen = false;

  // Only the homepage is routed in-page now; support and privacy are real
  // documents with their own URLs. Every link between pages is relative, so
  // the site still works static-hosted from any sub-path — GitHub Pages
  // project sites, a plain file:// open, whatever.

  /* ── Page switching ───────────────────────────────────── */

  function paint(id) {
    pages.forEach(function (p) {
      p.hidden = p.dataset.page !== id;
    });

    // Standalone pages (support, privacy) mark their own nav link active and
    // link out with a plain href — skip those, or this would strip the class.
    navLinks.forEach(function (b) {
      if (b.dataset.link) b.classList.toggle("active", b.dataset.link === id);
    });
    drawerLnks.forEach(function (b) {
      if (b.dataset.link) b.classList.toggle("active", b.dataset.link === id);
    });

    document.documentElement.setAttribute("data-page", id);

    // Re-run the entrance animation: strip the class, force a
    // reflow so the browser drops the old animation, then re-add.
    var active = document.querySelector('.page[data-page="' + id + '"]');
    if (active) {
      active.classList.remove("is-entering");
      void active.offsetWidth; // reflow
      active.classList.add("is-entering");
    }

    current = id;
  }

  function setPage(id, push) {
    if (PAGES.indexOf(id) === -1) id = "home";

    paint(id);
    window.scrollTo(0, 0);
    closeMenu();

    if (push !== false) {
      window.history.pushState({ page: id }, "", slugFor(id));
    }
  }

  // Home drops the hash entirely; everything else gets "#<id>". Both are
  // relative, so the current directory is preserved either way.
  function slugFor(id) {
    return id === "home"
      ? window.location.pathname + window.location.search
      : "#" + id;
  }

  // Resolve a page from the URL alone — used on boot and whenever we get a
  // history entry with no state (e.g. the user edits the hash by hand).
  function pageFromUrl() {
    var hash  = window.location.hash.replace(/^#\/?/, "");
    var param = new URLSearchParams(window.location.search).get("page");

    if (param && PAGES.indexOf(param) !== -1) return param;
    if (PAGES.indexOf(hash) !== -1) return hash;
    return "home";
  }

  /* ── Mobile drawer ────────────────────────────────────── */

  function openMenu() {
    menuOpen = true;
    drawer.hidden = false;
    overlay.hidden = false;
    burger.classList.add("open");
    burger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    drawer.hidden = true;
    overlay.hidden = true;
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  burger.addEventListener("click", function () {
    menuOpen ? closeMenu() : openMenu();
  });
  overlay.addEventListener("click", closeMenu);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  // Drawer only exists below the mobile breakpoint — close it if
  // the viewport grows past it while open.
  window.addEventListener("resize", function () {
    if (window.innerWidth >= MOBILE_BP) closeMenu();
  });

  /* ── Delegated link handling ──────────────────────────── */

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-link]");
    if (!el) return;
    e.preventDefault();
    setPage(el.dataset.link, true);
  });

  /* ── "What's included" tabs: card N swaps to screenshot N ─ */

  var incCards = document.querySelectorAll(".inc-card");
  var shots    = document.querySelectorAll(".shot");
  var dots     = document.querySelectorAll(".dot");
  var phone    = document.querySelector(".include-visual .phone");

  // Swipe left = next, swipe right = back — content tracks the finger, like
  // dragging the current card off to the left to reveal the next one.
  var SWIPE_LEFT_DELTA = 1;

  // Deliberately not named `current` — that's already taken by the page
  // tracker at the top of this IIFE.
  var shotIndex = 0;

  function selectShot(n) {
    var total = shots.length;
    shotIndex = ((n % total) + total) % total; // wraps at both ends
    var id = String(shotIndex);

    incCards.forEach(function (c) {
      var on = c.dataset.shot === id;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
    });
    shots.forEach(function (s) { s.classList.toggle("is-active", s.dataset.shot === id); });
    dots.forEach(function (d) { d.classList.toggle("is-active", d.dataset.shot === id); });
  }

  incCards.forEach(function (card) {
    card.addEventListener("click", function () { selectShot(Number(card.dataset.shot)); });
  });

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () { selectShot(Number(dot.dataset.shot)); });
  });

  if (phone) {
    var startX = null, startY = null;

    phone.addEventListener("touchstart", function (e) {
      var t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });

    phone.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var t  = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      startX = null;

      // Ignore taps and anything more vertical than horizontal, so the
      // gesture never fights the page scroll.
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;

      selectShot(shotIndex + (dx < 0 ? SWIPE_LEFT_DELTA : -SWIPE_LEFT_DELTA));
    }, { passive: true });
  }

  /* ── History ──────────────────────────────────────────── */

  window.addEventListener("popstate", function (e) {
    var p = (e.state && e.state.page) || pageFromUrl();
    paint(p);
    window.scrollTo(0, 0);
    closeMenu();
  });

  /* ── Boot: resolve the page from the URL ──────────────── */

  (function boot() {
    var start = pageFromUrl();
    paint(start);
    window.history.replaceState({ page: start }, "", slugFor(start));
  })();
})();


/* ═══════════════════════════════════════════════════════════
   In-app browser bypass (Instagram / Facebook webviews)

   Instagram and Facebook open links in their own embedded webview,
   which frequently refuses the hand-off to the App Store. Detect that
   case, attempt a direct navigation, and surface a manual escape hatch
   if the webview blocks it.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var APP_STORE_URL =
    "https://apps.apple.com/us/app/macrosnap-ai-calorie-tracker/id6759880124";

  // No Android build exists yet, so this is intentionally empty and Android
  // falls back to the App Store. Paste the Play Store URL here when there
  // is one — nothing else needs to change.
  var PLAY_STORE_URL = "";

  // The "may block this link" banner is disabled for now — flip to true to
  // bring it back. Everything else (markup, dismiss button, app-name
  // detection) is untouched; this is the only line that gates it.
  var SHOW_IAB_BANNER = false;

  var ua = navigator.userAgent || "";

  function isInAppBrowser() {
    return /Instagram/i.test(ua) || /\bFBAN\b|\bFBAV\b/i.test(ua);
  }

  function isInstagram() {
    return /Instagram/i.test(ua);
  }

  function isAndroid() {
    return /Android/i.test(ua);
  }

  // iPadOS 13+ reports a Mac user agent, so fall back to touch points.
  function isIOS() {
    return /iPad|iPhone|iPod/i.test(ua) ||
           (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  }

  // Not every webview advertises itself in the UA, so the button fix can't
  // depend on isInAppBrowser(). Any touch device gets it: opening a store
  // link in a new tab buys nothing on mobile, and _blank is precisely what
  // webviews swallow.
  function isTouch() {
    return navigator.maxTouchPoints > 0 ||
           (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  }

  function storeUrl() {
    if (isIOS())     return APP_STORE_URL;
    if (isAndroid()) return PLAY_STORE_URL || APP_STORE_URL;
    return APP_STORE_URL; // undetected → App Store, the primary platform
  }

  // Add ?debug=1 to the URL to see what the detector actually saw. Needed
  // because some webviews don't identify themselves in the user agent —
  // if inApp reads false inside Instagram, the UA below says why.
  function maybeDebug() {
    if (!/[?&]debug=1/.test(window.location.search)) return;

    var d = document.createElement("div");
    d.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;" +
      "background:#000;color:#3DD38A;font:11px/1.6 ui-monospace,Menlo,monospace;" +
      "padding:12px;word-break:break-all;max-height:50vh;overflow:auto";
    d.textContent =
      "inApp=" + isInAppBrowser() +
      "  iOS=" + isIOS() +
      "  android=" + isAndroid() +
      "  touch=" + isTouch() +
      "\nstore=" + storeUrl() +
      "\n\nUA=" + ua;
    document.body.appendChild(d);
  }

  // Same escape cascade the /get page's "download on the App Store" link
  // uses: try the App Store app directly, then bounce to Chrome as a last
  // resort. NOTE: unlike /get's original version, this points straight at
  // the App Store URL rather than routing through /get — /get is now just
  // a copy of this homepage, so a bounce there would land back on this same
  // page instead of the store.
  var STORE_SCHEMES = [
    "itms-appss://apps.apple.com/us/app/id6759880124",
    "itms-apps://apps.apple.com/us/app/id6759880124"
  ];
  var CHROME_STORE = "googlechromes://apps.apple.com/us/app/id6759880124";
  var STORE_CASCADE = STORE_SCHEMES.concat([CHROME_STORE]);

  function cascade(list) {
    var i = 0;
    (function step() {
      if (document.hidden) return; // something launched — stop here
      if (i >= list.length) return; // out of options; iabNote is already up
      window.location.href = list[i++];
      window.setTimeout(step, 450);
    })();
  }

  function init() {
    // Point every store button at the right platform's store.
    var links = document.querySelectorAll(".appstore");
    var url = storeUrl();
    var inApp = isInAppBrowser();
    var harden = inApp || isTouch();

    Array.prototype.forEach.call(links, function (link) {
      link.setAttribute("href", url);
      if (!harden) return;

      // Strip _blank either way — opening a store link in a new tab buys
      // nothing on mobile, and _blank is precisely what webviews swallow.
      link.removeAttribute("target");

      if (!inApp) return;

      // Instagram specifically gets the regular function — no cascade, no
      // preventDefault. Target is already stripped above, so this is just
      // a plain native tap on a plain <a href>, same as any other visitor.
      if (isInstagram()) return;

      // Other in-app browsers (Facebook etc.): same cascade as the /get
      // store link. No ?to=store bookmark here — that only mattered when
      // /get contained its own redirect script, which it no longer does.
      link.addEventListener("click", function (e) {
        e.preventDefault();
        cascade(STORE_CASCADE);

        // Give the cascade a moment to actually work before showing the
        // escape-hatch banner. If a scheme succeeded, the page is already
        // backgrounded by then and there's nobody left to show it to.
        window.setTimeout(function () {
          if (!SHOW_IAB_BANNER) return;
          if (document.hidden) return;
          var note = document.getElementById("iabNote");
          if (note) note.hidden = false;
        }, 600);
      });
    });

    maybeDebug();

    if (!inApp) return;

    var note  = document.getElementById("iabNote");
    var close = document.getElementById("iabClose");
    if (!note) return;

    // Name the actual app doing the blocking — more actionable than a
    // generic warning.
    var slot = document.getElementById("iabApp");
    if (slot) {
      slot.textContent = /Instagram/i.test(ua)                   ? "Instagram"
                       : /FBAN|FBAV|FB_IAB/i.test(ua)            ? "Facebook"
                       : /musical_ly|Bytedance|TikTok/i.test(ua) ? "TikTok"
                       : "This app";
    }

    // Not shown here — only after a tap on the App Store button fails to
    // go anywhere (see the click handler above). Showing it unconditionally
    // on page load read as a warning before the user had tried anything.

    if (close) {
      close.addEventListener("click", function () { note.hidden = true; });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
