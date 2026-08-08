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
