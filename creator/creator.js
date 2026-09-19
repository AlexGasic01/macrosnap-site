/* ═══════════════════════════════════════════════════════════
   MacroSnap — creator dashboard

   Talks to /api/creator-stats, never to Supabase. public.referral is
   readable only by the service role, which lives on the server and must
   never reach a browser.

   The dashboard link carries a TOKEN, not a code: codes are public (creators
   post them), so a code in the URL would let anyone open anyone's numbers.
   The token is exchanged for a row server-side.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Configuration ────────────────────────────────────── */

  var ENDPOINT = "/api/creator-stats";

  var PAYOUT_EMAIL = "alex.digital200@gmail.com";
  var SHARE_URL =
    "https://apps.apple.com/us/app/macrosnap-ai-calorie-tracker/id6759880124";

  var STORE_KEY = "ms-creator-token";

  /* ── Elements ─────────────────────────────────────────── */

  var views = {
    loading: document.getElementById("crLoading"),
    dash:    document.getElementById("crDash"),
    error:   document.getElementById("crError")
  };

  var shareBtn  = document.getElementById("crShare");
  var shareNote = document.getElementById("crShareNote");
  var payoutBtn = document.getElementById("crPayout");
  var signOut   = document.getElementById("crSignOut");

  var currentCode = "";

  function show(name) {
    Object.keys(views).forEach(function (k) {
      if (views[k]) views[k].hidden = k !== name;
    });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function fail(title, body) {
    setText("crErrorTitle", title);
    setText("crErrorBody", body);
    show("error");
  }

  /* ── The token ────────────────────────────────────────────
     From the fragment, which browsers never put in a Referer header or a
     server log — so the secret survives being tapped through to the App
     Store. Both /creator/#t=<token> and /creator/#<token> work. */

  function tokenFromHash() {
    var raw = window.location.hash.replace(/^#/, "");
    if (!raw) return "";
    var viaParam = new URLSearchParams(raw).get("t");
    var token = viaParam || raw;
    return /^[a-f0-9]{32,128}$/i.test(token) ? token : "";
  }

  function remembered() {
    try { return localStorage.getItem(STORE_KEY) || ""; } catch (e) { return ""; }
  }
  function remember(token) {
    try { localStorage.setItem(STORE_KEY, token); } catch (e) {}   // private mode
  }
  function forget() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ── Fetch ────────────────────────────────────────────── */

  function loadStats(token) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ token: token })
    }).then(function (r) {
      if (r.status === 404) return null;                 // unknown or revoked
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* ── Formatting ───────────────────────────────────────── */

  function num(v) {
    return v === null || v === undefined ? "0" : Number(v).toLocaleString();
  }

  function pct(v) {
    return v === null || v === undefined ? "—" : Number(v).toFixed(1) + "%";
  }

  function money(v) {
    if (v === null || v === undefined) return "—";
    return "$" + Number(v).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  // Trailing .0 reads like false precision on a rate set by hand: 20 shows
  // as "20%", 17.5 keeps its half.
  function rate(v) {
    if (v === null || v === undefined) return "—";
    return String(Math.round(Number(v) * 10) / 10) + "%";
  }

  // "today" / "yesterday" / "3 days ago" / a date once it stops being recent.
  function when(iso) {
    if (!iso) return "never";
    var then = new Date(iso);
    if (isNaN(then.getTime())) return "never";

    var days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + " days ago";
    return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  /* ── Paint ────────────────────────────────────────────── */

  // Pre-fills the request with the code and the figures the creator is
  // looking at, so the reply doesn't start with "which code, and how much?".
  function setPayoutLink(row) {
    if (!payoutBtn) return;

    var subject = "Payout request — " + row.code;
    var body = [
      "Hi,",
      "",
      "I'd like to request a payout for code " + row.code + ".",
      "",
      "My dashboard currently shows:",
      "  Purchases: " + num(row.purchases),
      "  Earnings: " + money(row.commission_usd),
      "",
      "Preferred method (delete one): PayPal / bank transfer",
      "PayPal email or bank details:",
      "",
      "Thanks,",
      row.name || ""
    ].join("\r\n");

    payoutBtn.href = "mailto:" + PAYOUT_EMAIL
                   + "?subject=" + encodeURIComponent(subject)
                   + "&body=" + encodeURIComponent(body);
  }

  function paint(row) {
    currentCode = row.code;

    setText("crName", row.name || "there");
    setText("crCode", row.code);

    setText("crPurchasesInline", num(row.purchases));
    setText("crPurchasesWord",
            Number(row.purchases) === 1 ? "purchase" : "purchases");

    setText("crUses", num(row.code_inputs));
    setText("crPurchases", num(row.purchases));
    setText("crConversion", pct(row.conversion_pct));
    setText("crRevenue", money(row.net_revenue_usd));
    setText("crRate", rate(row.commission_pct));
    setText("crEarned", money(row.commission_usd));

    setText("crLastInput", when(row.last_input_at));
    setText("crLastPurchase", when(row.last_purchase_at));

    // A switched-off code still shows its history — the numbers it already
    // earned are unaffected — but the creator needs to know it has stopped
    // taking new signups, or they'll post it and wonder.
    var paused = document.getElementById("crPaused");
    if (paused) paused.hidden = row.active !== false;

    setPayoutLink(row);
    show("dash");
  }

  function go(token) {
    show("loading");
    loadStats(token).then(function (row) {
      if (!row) {
        forget();
        fail("This link isn't valid",
             "It may have been replaced or switched off. Ask us for a fresh dashboard link and we'll send one over.");
        return;
      }
      remember(token);
      paint(row);
    })["catch"](function () {
      fail("Couldn't load your numbers",
           "Something went wrong at our end. Try again in a minute.");
    });
  }

  /* ── Wiring ───────────────────────────────────────────── */

  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var message = "Use code " + currentCode + " at " + SHARE_URL;
      var done = function () { shareNote.textContent = "Copied."; };
      var nope = function () {
        shareNote.textContent = "Couldn't copy — select it by hand: " + message;
      };

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
      history.replaceState(null, "", window.location.pathname);
      fail("Signed out",
           "Open your dashboard link again to get back in.");
    });
  }

  /* ── Start ────────────────────────────────────────────── */

  var initial = tokenFromHash() || remembered();
  if (initial) {
    go(initial);
  } else {
    fail("You need your dashboard link",
         "Open the link we emailed you when you joined the program. It's the whole address, including the part after the #.");
  }
})();
