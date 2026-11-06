/* ═══════════════════════════════════════════════════════════
   MacroSnap — Creator Agreement signing page

   The access check is server-side: this file never sees an access code it
   wasn't given, and holds the verified record in memory only, so a refresh
   means unlocking again.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var VERIFY = "/api/creator-agreement/verify";
  var SIGN = "/api/creator-agreement/sign";
  var ASSETS = "../../assets/agreement/";

  var unlock = document.getElementById("agUnlock");
  var view = document.getElementById("agView");
  var form = document.getElementById("agForm");
  var first = document.getElementById("agFirst");
  var last = document.getElementById("agLast");
  var code = document.getElementById("agCode");
  var submit = document.getElementById("agSubmit");
  var errBox = document.getElementById("agError");
  var paper = document.getElementById("agPaper");
  var bodyEl = document.getElementById("agBody");
  var dlBtn = document.getElementById("agDownload");
  var dlLabel = document.getElementById("agDownloadLabel");
  var dlNote = document.getElementById("agDownloadNote");
  var rail = document.getElementById("agRail");
  var railFill = document.getElementById("agRailFill");
  var jump = document.getElementById("agJump");

  // Verified record, in memory only.
  var session = null;      // { firstName, lastName, accessCode, terms }
  var signed = null;       // { signatureBytes, signedDateText } once signed
  var assetCache = null;
  var busy = false;

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Unlock ───────────────────────────────────────────── */

  function syncSubmit() {
    submit.disabled = busy || !first.value.trim() || !last.value.trim() || !code.value.trim();
  }
  [first, last, code].forEach(function (el) {
    el.addEventListener("input", syncSubmit);
  });
  syncSubmit();

  function showError(msg) {
    errBox.textContent = msg;
    errBox.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submit.disabled) return;

    busy = true;
    syncSubmit();
    errBox.hidden = true;
    submit.textContent = "Checking…";

    // Trimmed, but never case-folded: the match is case-sensitive by design.
    var payload = {
      firstName: first.value.trim(),
      lastName: last.value.trim(),
      accessCode: code.value.trim(),
    };

    fetch(VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) {
      if (r.status === 401) throw new Error("invalid");
      if (r.status === 429) throw new Error("rate_limited");
      if (!r.ok) throw new Error("server");
      return r.json();
    }).then(function (data) {
      session = {
        firstName: data.firstName,
        lastName: data.lastName,
        accessCode: payload.accessCode,
        terms: data.terms,
      };
      openAgreement(data.alreadySigned);
    })["catch"](function (err) {
      busy = false;
      submit.textContent = "View agreement";
      syncSubmit();
      if (err.message === "rate_limited") {
        showError("Too many attempts. Wait 15 minutes and try again.");
      } else if (err.message === "invalid") {
        showError("Those details don't match our records. Check the spelling and capital letters, or ask the MacroSnap team for help.");
      } else {
        showError("Something went wrong at our end. Try again in a moment.");
      }
    });
  });

  /* ── Agreement ────────────────────────────────────────── */

  function openAgreement(alreadySigned) {
    var blocks = MS.buildBlocks(session.terms).blocks;
    bodyEl.innerHTML = MS.toHtml(blocks, { signSlot: true });

    unlock.hidden = true;
    view.hidden = false;
    document.title = "Creator Agreement — " + session.firstName + " " + session.lastName;
    window.scrollTo(0, 0);

    mountSignature(alreadySigned);
    startRail();
  }

  function fileName() {
    var safe = function (s) { return String(s).replace(/[^A-Za-z0-9]+/g, ""); };
    return "MacroSnap-Creator-Agreement-" + safe(session.firstName) + "-" + safe(session.lastName) + ".pdf";
  }

  function loadAssets() {
    if (assetCache) return Promise.resolve(assetCache);
    var get = function (f) {
      return fetch(ASSETS + f).then(function (r) {
        if (!r.ok) throw new Error("asset " + f);
        return r.arrayBuffer();
      });
    };
    return Promise.all([get("Inter-Regular.ttf"), get("Inter-Bold.ttf"), get("icon.png")])
      .then(function (a) {
        assetCache = { regular: a[0], bold: a[1], icon: a[2] };
        return assetCache;
      });
  }

  function buildPdf() {
    return loadAssets().then(function (base) {
      var assets = {
        regular: base.regular, bold: base.bold, icon: base.icon,
        signature: signed ? signed.signatureBytes : undefined,
      };
      var input = Object.assign({}, session.terms, {
        signedDate: signed ? signed.signedDateText : "",
      });
      return MS.renderPdf(PDFLib, fontkit, assets, input);
    });
  }

  dlBtn.addEventListener("click", function () {
    dlBtn.disabled = true;
    dlNote.textContent = "Preparing…";
    buildPdf().then(function (bytes) {
      var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      var a = document.createElement("a");
      a.href = url;
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke late: Safari needs the URL to outlive the click.
      setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
      dlNote.textContent = "";
      dlBtn.disabled = false;
    })["catch"](function () {
      dlNote.textContent = "Couldn't build the PDF. Try again.";
      dlBtn.disabled = false;
    });
  });

  /* ── Right rail ───────────────────────────────────────── */

  function startRail() {
    var sigEl = document.getElementById("signatures");

    var onScroll = function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 1;
      railFill.style.height = (pct * 100).toFixed(2) + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    var toSignatures = function () {
      if (!sigEl) return;
      sigEl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    };
    jump.addEventListener("click", toSignatures);
    rail.addEventListener("click", toSignatures);

    // Hide the prompt whenever the signature block is on screen.
    if (sigEl && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        if (signed) return;                       // gone for good once signed
        jump.hidden = entries[0].isIntersecting;
      }, { threshold: 0.12 }).observe(sigEl);
    }
  }

  function hideJumpForGood() {
    jump.hidden = true;
  }

  /* ── Signature pad ────────────────────────────────────── */

  function mountSignature(alreadySigned) {
    var slot = document.getElementById("sign-slot");
    if (!slot) return;

    if (alreadySigned) {
      slot.innerHTML =
        '<div class="sign-field"><div class="val">' + escapeHtml(session.firstName + " " + session.lastName) +
        '</div><div class="line"></div><div class="lab">Printed name</div></div>' +
        '<div class="sign-done">This agreement has already been signed. A copy is on file with MacroSnap. ' +
        'Use Download PDF for your copy.</div>';
      hideJumpForGood();
      dlLabel.textContent = "Download PDF";
      return;
    }

    var today = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });

    slot.innerHTML =
      '<div class="sign-pad-wrap">' +
        '<canvas class="sign-pad" id="sigPad" aria-label="Signature pad. Draw your signature here."></canvas>' +
        '<div class="sign-pad-base"></div>' +
        '<div class="sign-pad-hint" id="sigHint">Sign here</div>' +
      '</div>' +
      '<button type="button" class="sign-clear" id="sigClear">Clear</button>' +
      '<div class="line"></div><div class="lab">Signature</div>' +
      '<div class="sign-field"><div class="val">' + escapeHtml(session.firstName + " " + session.lastName) +
        '</div><div class="line"></div><div class="lab">Printed name</div></div>' +
      '<div class="sign-field"><div class="val" id="sigDate">' + escapeHtml(today) +
        '</div><div class="line"></div><div class="lab">Date</div></div>' +
      '<label class="sign-agree"><input type="checkbox" id="sigAgree" />' +
        '<span>I have read this Agreement and agree to its terms.</span></label>' +
      '<button type="button" class="btn btn-cta sign-submit" id="sigGo" disabled>Sign agreement</button>' +
      '<div class="sign-fail" id="sigFail" role="alert" hidden></div>';

    var pad = new Pad(document.getElementById("sigPad"), document.getElementById("sigHint"));
    var agree = document.getElementById("sigAgree");
    var go = document.getElementById("sigGo");
    var fail = document.getElementById("sigFail");

    var sync = function () { go.disabled = !(pad.hasSignature() && agree.checked); };
    pad.onChange = sync;
    agree.addEventListener("change", sync);
    document.getElementById("sigClear").addEventListener("click", function () { pad.clear(); sync(); });

    go.addEventListener("click", function () {
      go.disabled = true;
      go.textContent = "Signing…";
      fail.hidden = true;

      var png = pad.toPng();
      var signedAt = new Date().toISOString();

      agreementHash().then(function (hash) {
        signed = { signatureBytes: png, signedDateText: today };
        return buildPdf().then(function (pdfBytes) {
          return fetch(SIGN, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              firstName: session.firstName,
              lastName: session.lastName,
              accessCode: session.accessCode,
              signedAt: signedAt,
              signedDateText: today,
              signaturePng: toBase64(png),
              pdf: toBase64(pdfBytes),
              agreementTextSha256: hash,
            }),
          });
        });
      }).then(function (r) {
        if (!r.ok) throw new Error("save");
        return r.json();
      }).then(function () {
        lockSigned(slot, png, today);
      })["catch"](function () {
        // Keep the drawn signature: making them sign again would be rude.
        signed = null;
        go.disabled = false;
        go.textContent = "Sign agreement";
        fail.textContent = "Couldn't save your signature. Check your connection and try again.";
        fail.hidden = false;
      });
    });
  }

  function lockSigned(slot, png, dateText) {
    signed = { signatureBytes: png, signedDateText: dateText };

    var url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
    slot.innerHTML =
      '<img class="sign-img" alt="Signature" src="' + url + '" />' +
      '<div class="line"></div><div class="lab">Signature</div>' +
      '<div class="sign-field"><div class="val">' + escapeHtml(session.firstName + " " + session.lastName) +
        '</div><div class="line"></div><div class="lab">Printed name</div></div>' +
      '<div class="sign-field"><div class="val">' + escapeHtml(dateText) +
        '</div><div class="line"></div><div class="lab">Date</div></div>' +
      '<div class="sign-done">Signed on ' + escapeHtml(dateText) + '. A copy has been saved for MacroSnap.</div>';

    hideJumpForGood();
    dlLabel.textContent = "Download signed PDF";
  }

  /* ── Helpers ──────────────────────────────────────────── */

  function escapeHtml(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function agreementHash() {
    var text = MS.toText(MS.buildBlocks(session.terms).blocks);
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  function toBase64(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = "", CH = 0x8000;                 // chunked: apply() blows up on big arrays
    for (var i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(s);
  }

  /* ── The pad itself ───────────────────────────────────── */

  function Pad(canvas, hint) {
    var self = this;
    var ctx = canvas.getContext("2d");
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var drawing = false, points = 0, lastX = 0, lastY = 0, midX = 0, midY = 0;
    var bounds = null;

    this.onChange = function () {};

    function size() {
      var r = canvas.getBoundingClientRect();
      // Preserve what is drawn across a resize rather than wiping it.
      var keep = points ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#FFFFFF";
      if (keep) ctx.putImageData(keep, 0, 0);
    }
    size();
    window.addEventListener("resize", size);

    function at(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function note(p) {
      if (!bounds) bounds = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      else {
        bounds.x0 = Math.min(bounds.x0, p.x); bounds.y0 = Math.min(bounds.y0, p.y);
        bounds.x1 = Math.max(bounds.x1, p.x); bounds.y1 = Math.max(bounds.y1, p.y);
      }
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (canvas.classList.contains("is-locked")) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      var p = at(e);
      lastX = midX = p.x; lastY = midY = p.y;
      points++; note(p);
      if (hint) hint.style.display = "none";
      // A tap with no drag should still leave a mark.
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.25, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill();
      self.onChange();
    });

    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      e.preventDefault();
      var p = at(e);
      // Quadratic through the midpoints: smoother than straight segments.
      var mx = (lastX + p.x) / 2, my = (lastY + p.y) / 2;
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.quadraticCurveTo(lastX, lastY, mx, my);
      ctx.stroke();
      midX = mx; midY = my; lastX = p.x; lastY = p.y;
      points++; note(p);
      self.onChange();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      canvas.addEventListener(ev, function () { drawing = false; });
    });

    this.hasSignature = function () { return points >= 20; };

    this.clear = function () {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = 0; bounds = null;
      if (hint) hint.style.display = "";
      self.onChange();
    };

    /* Cropped to the ink plus 8px, transparent background preserved so it
     * sits on the PDF's dark page. */
    this.toPng = function () {
      var pad = 8;
      var b = bounds || { x0: 0, y0: 0, x1: canvas.width / dpr, y1: canvas.height / dpr };
      var x = Math.max(0, (b.x0 - pad)) * dpr;
      var y = Math.max(0, (b.y0 - pad)) * dpr;
      var w = Math.min(canvas.width - x, (b.x1 - b.x0 + pad * 2) * dpr);
      var h = Math.min(canvas.height - y, (b.y1 - b.y0 + pad * 2) * dpr);

      var out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w));
      out.height = Math.max(1, Math.round(h));
      out.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);

      var url = out.toDataURL("image/png");
      var bin = atob(url.split(",")[1]);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    };
  }

  // Exposed for the test harness; harmless in the browser.
  window.__agreementPad = Pad;
})();
