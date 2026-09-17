/* ═══════════════════════════════════════════════════════════
   MacroSnap — creator dashboard

   Reads a creator's row straight out of the referral_counts view and paints
   it. Configuration is the values below — no SQL to run, as long as the anon
   role can select from the view.

   Note that the anon key ships in this file and is public by design, so the
   view is readable by anyone who opens the page: the code in the URL picks
   which row to show, it does not limit which rows are reachable.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Configuration ────────────────────────────────────── */

  var SUPABASE_URL  = "";                 // https://<project>.supabase.co
  var SUPABASE_ANON = "";                 // anon / publishable key
  // referral_dashboard is referral_counts with the creator's rate joined on
  // (see SETUP.md). To go back to reading referral_counts directly, set this
  // to "referral_counts" and drop commission_pct from COLUMNS below — every
  // creator then falls back to DEFAULT_COMMISSION_PCT.
  var SOURCE_VIEW = "referral_dashboard";

  // A percentage, not a fraction: 20 means 20%. Used when the row carries no
  // rate of its own.
  var DEFAULT_COMMISSION_PCT = 20;
  var APPSTORE_URL  =
    "https://apps.apple.com/us/app/macrosnap-ai-calorie-tracker/id6759880124";

  var STORE_KEY = "ms-creator-code";

  /* ── Elements ─────────────────────────────────────────── */

  var views = {
    loading: document.getElementById("crLoading"),
    gate:    document.getElementById("crGate"),
    dash:    document.getElementById("crDash"),
    error:   document.getElementById("crError")
  };

  var gateForm  = document.getElementById("crGateForm");
  var codeInput = document.getElementById("crCodeInput");
  var gateNote  = document.getElementById("crGateNote");
  var shareBtn  = document.getElementById("crShare");
  var shareNote = document.getElementById("crShareNote");
  var signOut   = document.getElementById("crSignOut");
  var retry     = document.getElementById("crRetry");

  var currentCode = "";

  function show(name) {
    Object.keys(views).forEach(function (k) {
      if (views[k]) views[k].hidden = k !== name;
    });
  }

  function fail(title, body) {
    document.getElementById("crErrorTitle").textContent = title;
    document.getElementById("crErrorBody").textContent = body;
    show("error");
  }

  /* ── Where the code comes from ────────────────────────────
     The fragment, not a query string: fragments are never sent in Referer
     headers and never reach a server log, so the link survives being tapped
     through to the App Store. Both /creator/#ALEX2509 and
     /creator/#code=ALEX2509 work — the emailed links use the short form. */

  function codeFromHash() {
    var raw = window.location.hash.replace(/^#/, "");
    if (!raw) return "";
    var viaParam = new URLSearchParams(raw).get("code");
    var code = viaParam || raw;
    return /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code.toUpperCase() : "";
  }

  function remembered() {
    try { return localStorage.getItem(STORE_KEY) || ""; } catch (e) { return ""; }
  }
  function remember(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}   // private mode
  }
  function forget() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ── Fetch ────────────────────────────────────────────── */

  // Named columns rather than *, so a column added to the view later doesn't
  // start arriving here unnoticed. ilike with no wildcards is an exact match
  // that ignores case, so a creator typing "alex2509" still lands on the row.
  var COLUMNS =
    "name,code,code_inputs,purchases,conversion_pct,revenue_usd,commission_pct";

  function loadStats(code) {
    var url = SUPABASE_URL + "/rest/v1/" + SOURCE_VIEW
            + "?select=" + encodeURIComponent(COLUMNS)
            + "&code=ilike." + encodeURIComponent(code)
            + "&limit=1";

    return fetch(url, {
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": "Bearer " + SUPABASE_ANON,
        "Accept": "application/json"
      }
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (rows) {
      return (rows && rows[0]) || null;      // null = no such code
    });
  }

  // A row with no usable rate falls back to the default rather than failing:
  // a creator seeing their numbers at the default rate beats an error page.
  function rateOf(row) {
    var raw = row.commission_pct;
    // Absent must be caught before Number(): Number(null) and Number("") are
    // both 0, which would read as a deliberate 0% and pay the creator nothing.
    if (raw === null || raw === undefined || raw === "") {
      return DEFAULT_COMMISSION_PCT;
    }
    var n = Number(raw);
    return isFinite(n) && n >= 0 ? n : DEFAULT_COMMISSION_PCT;
  }

  /* ── Paint ────────────────────────────────────────────── */

  function num(v) {
    return typeof v === "number" ? v.toLocaleString() : "0";
  }

  // conversion_pct is null whenever nobody has entered the code yet — 0/0 is
  // not 0%, it is "nothing to divide". Show a dash rather than a made-up zero.
  function pct(v) {
    return v === null || v === undefined ? "—" : Number(v).toFixed(1) + "%";
  }

  function money(v) {
    if (v === null || v === undefined) return "—";
    return "$" + Number(v).toFixed(2);
  }

  // Trailing .0 reads like false precision on a rate someone set by hand:
  // 20 shows as "20%", 17.5 keeps its half.
  function rate(pctValue) {
    return String(Math.round(pctValue * 10) / 10) + "%";
  }

  function paint(row) {
    var commissionPct = rateOf(row);
    currentCode = row.code;

    document.getElementById("crName").textContent = row.name || "there";
    document.getElementById("crCode").textContent = row.code;
    document.getElementById("crUses").textContent = num(row.code_inputs);
    document.getElementById("crUsesInline").textContent = num(row.code_inputs);
    document.getElementById("crPurchases").textContent = num(row.purchases);
    document.getElementById("crConversion").textContent = pct(row.conversion_pct);

    // Commission is worked out here, not in the database.
    var earned = row.revenue_usd === null || row.revenue_usd === undefined
               ? null
               : Number(row.revenue_usd) * (commissionPct / 100);
    document.getElementById("crEarned").textContent = money(earned);
    document.getElementById("crRateNote").textContent =
      "Your rate is " + rate(commissionPct) + " · paid monthly";

    show("dash");
  }

  function go(code) {
    show("loading");
    loadStats(code).then(function (row) {
      if (!row) {
        forget();
        fail("Code not recognised",
             "Check it against the email we sent you — codes are case-insensitive but have to match exactly.");
        return;
      }
      remember(row.code);
      paint(row);
    })["catch"](function () {
      fail("Couldn't reach the server",
           "Something went wrong loading your numbers. Try again in a minute.");
    });
  }

  /* ── Wiring ───────────────────────────────────────────── */

  if (gateForm) {
    gateForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = (codeInput.value || "").trim().toUpperCase();
      if (!code) return;
      gateNote.textContent = "";
      go(code);
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var message = "Get MacroSnap and use my code " + currentCode +
                    " when you sign up — " + APPSTORE_URL;
      var done = function () { shareNote.textContent = "Copied."; };
      var nope = function () { shareNote.textContent = "Couldn't copy — select it by hand: " + message; };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message).then(done)["catch"](nope);
      } else {
        nope();
      }
    });
  }

  if (signOut) {
    signOut.addEventListener("click", function () {
      forget();
      if (window.location.hash) {
        // Drop the code from the URL without leaving a history entry behind.
        history.replaceState(null, "", window.location.pathname);
      }
      codeInput.value = "";
      show("gate");
    });
  }

  if (retry) {
    retry.addEventListener("click", function () {
      forget();
      history.replaceState(null, "", window.location.pathname);
      codeInput.value = "";
      show("gate");
    });
  }

  /* ── Start ────────────────────────────────────────────── */

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    fail("Not configured yet",
         "SUPABASE_URL and SUPABASE_ANON still need filling in at the top of creator.js.");
    return;
  }

  var initial = codeFromHash() || remembered();
  if (initial) {
    go(initial);
  } else {
    show("gate");
  }
})();
