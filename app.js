/* ═══════════════════════════════════════════════════════════
   MacroSnap — client-side navigation
   Mirrors the Almondy reference: single-page tab switching,
   pushState/popstate history, scroll reset, staggered fadeUp
   entrance on every page change.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var PAGES = ["home", "support"];
  var MOBILE_BP = 768;

  var pages      = document.querySelectorAll(".page");
  var navLinks   = document.querySelectorAll(".nav-link");
  var drawerLnks = document.querySelectorAll(".drawer-link");
  var burger     = document.getElementById("burger");
  var drawer     = document.getElementById("drawer");
  var overlay    = document.getElementById("overlay");

  var current = "home";
  var menuOpen = false;

  // Hash routing (#support) rather than paths (/support): the hash never
  // reaches the server, so deep links and refreshes work when the site is
  // static-hosted from any sub-path — GitHub Pages project sites, a plain
  // file:// open, whatever. No rewrite rules needed.

  /* ── Page switching ───────────────────────────────────── */

  function paint(id) {
    pages.forEach(function (p) {
      p.hidden = p.dataset.page !== id;
    });

    navLinks.forEach(function (b) {
      b.classList.toggle("active", b.dataset.link === id);
    });
    drawerLnks.forEach(function (b) {
      b.classList.toggle("active", b.dataset.link === id);
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

  incCards.forEach(function (card) {
    card.addEventListener("click", function () {
      var i = card.dataset.shot;

      incCards.forEach(function (c) {
        var on = c === card;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-selected", on ? "true" : "false");
      });
      shots.forEach(function (s) {
        s.classList.toggle("is-active", s.dataset.shot === i);
      });
    });
  });

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

  // The redirect itself now fires from the inline script at the top of
  // <head>, before this file has even downloaded. What's left here is the
  // fallback layer for when the webview blocks that: a working tap target
  // and the manual "Open in Browser" hint.
  var BANNER_DELAY = 2500;

  var ua = navigator.userAgent || "";

  function isInAppBrowser() {
    return /Instagram/i.test(ua) || /\bFBAN\b|\bFBAV\b/i.test(ua);
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

  function init() {
    // Point every store button at the right platform's store.
    var links = document.querySelectorAll(".appstore");
    var url = storeUrl();
    var inApp = isInAppBrowser();
    var harden = inApp || isTouch();

    Array.prototype.forEach.call(links, function (link) {
      link.setAttribute("href", url);
      if (!harden) return;

      // In a webview, _blank tends to open yet another webview (or nothing).
      // Navigating in place is far more likely to reach the store.
      link.removeAttribute("target");

      // A webview will often swallow the anchor's default activation, so the
      // tap looks dead while long-press still offers "Open in new tab". Drive
      // the navigation ourselves from inside the gesture instead.
      link.addEventListener("click", function (e) {
        e.preventDefault();
        window.location.replace(storeUrl());
      });
    });

    maybeDebug();

    if (!inApp) return;

    var note  = document.getElementById("iabNote");
    var close = document.getElementById("iabClose");
    if (!note) return;

    window.setTimeout(function () { note.hidden = false; }, BANNER_DELAY);

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
